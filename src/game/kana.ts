/**
 * Kana mini-game engine with randomized answers and lives/scoring.
 *
 * Shows a word with one kana blanked out. Four options appear at screen
 * edges mapped to d-pad directions — positions shuffled each question
 * using the DIV register as entropy source.
 *
 * Scoring: +100 first try, +10 second, +0 third correct, -100 death.
 * Three wrong on one question = lose a life.
 *
 * ROM format per question:
 *   [word_length: u8]
 *   [tile_indices...]        (full word, no blank marker)
 *   [blank_position: u8]     (which tile to blank, 0-indexed)
 *   [correct_tile: u8]       (the right answer)
 *   [distractor1: u8]
 *   [distractor2: u8]
 *   [distractor3: u8]
 *   ...
 *   0x00 sentinel (word_length = 0)
 */

import { HW, JOY, MEM } from '../asm/hardware';
import {
  countDownOrReturn,
  loadPointer,
  storeByte,
  storePointer,
  switchCases,
  zeroBytes,
} from '../asm/macros';
import {
  add_r,
  and_n,
  call,
  cp_n,
  cp_r,
  dec_r,
  inc_r,
  inc_rr,
  jp,
  jp_cc,
  jr,
  jr_cc,
  label,
  ld_a_de,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldh_a_n,
  ldi_hl_a,
  ret,
  ret_cc,
} from '../asm/ops';
import { type Op, type TileIndex, ref, u8, u16 } from '../asm/types';
import { type NonEmpty, type Quad, type Triple, type TupleIndex } from './fixed';
import { requireTile, textToTiles } from './font';
import { CAT_TILES } from './font-data';
import {
  DELTA_MINUS_100,
  DELTA_PLUS_10,
  DELTA_PLUS_100,
  buildAddScore,
  buildDrawTileAt,
  buildSetDelta,
  buildSubScore,
} from './kana-hud';
import { KanaState } from './state';
import { tilePos, tilemapAddr } from './tilemap';
import { clearTilemap, screenOff, screenOn } from './video';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single kana character string (hiragana or katakana) */
export type Kana = string;

export interface KanaQuestion {
  /** The full word to display */
  readonly word: string;
  /** Index of the kana to blank out (0-based) */
  readonly blankIndex: number;
  /** The correct kana for the blank */
  readonly correct: Kana;
  /** Three wrong kana (should be visually similar distractors) */
  readonly distractors: Triple<Kana>;
}

export function defineKanaQuestion<const Chars extends NonEmpty<Kana>>(
  chars: Chars,
  blankIndex: TupleIndex<Chars>,
  ...distractors: Triple<Kana>
): KanaQuestion {
  const correct = chars[blankIndex];
  if (correct === undefined) {
    throw new RangeError(`Kana blank index out of range: ${String(blankIndex)}`);
  }

  return {
    word: chars.join(''),
    blankIndex,
    correct,
    distractors,
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const WORD_ROW = 6;

const OPT_UP = tilePos(3, 10);
const OPT_DOWN = tilePos(9, 10);
const OPT_LEFT = tilePos(6, 2);
const OPT_RIGHT = tilePos(6, 17);
const OPTION_POSITIONS = [OPT_UP, OPT_DOWN, OPT_LEFT, OPT_RIGHT] as const;
// Positions ordered: 0=UP, 1=DOWN, 2=LEFT, 3=RIGHT (matches direction encoding)

// Game constants
const FEEDBACK_FRAMES = 30;
const SCORE_FIRST_TRY = 100;
const SCORE_SECOND_TRY = 10;
const SCORE_DEATH_PENALTY = 100;
const MAX_ATTEMPTS = 2; // 0-indexed: attempt 0, 1, 2 = 3 tries
const WORD_COL = 7;

// D-pad buttons in direction-index order (0=UP, 1=DOWN, 2=LEFT, 3=RIGHT),
// matching OPTION_POSITIONS and MEM.KANA_CORRECT_POS.
const DPAD_BY_DIRECTION = [JOY.UP, JOY.DOWN, JOY.LEFT, JOY.RIGHT] as const;

type ShuffleSlot = 0 | 1 | 2 | 3;
type AnswerLayout = Quad<ShuffleSlot>;

const SHUFFLE_MEM = [
  MEM.KANA_SHUFFLE,
  MEM.KANA_SHUFFLE1,
  MEM.KANA_SHUFFLE2,
  MEM.KANA_SHUFFLE3,
] as const;
const ANSWER_SLOT_ORDER = [0, 1, 2, 3] as const;
const ANSWER_LAYOUTS = [
  [0, 1, 2, 3],
  [3, 0, 1, 2],
  [2, 3, 0, 1],
  [1, 2, 3, 0],
] as const satisfies readonly [AnswerLayout, AnswerLayout, AnswerLayout, AnswerLayout];

// Tile constants
const BLANK_TILE: TileIndex = requireTile(CAT_TILES.BLANK);

function buildAnswerLayout(layout: AnswerLayout): Op[] {
  return ANSWER_SLOT_ORDER.flatMap((optionIndex) => {
    const position = OPTION_POSITIONS[optionIndex];
    const shuffleSlot = layout[optionIndex];
    return [ld_a_nn(SHUFFLE_MEM[shuffleSlot]), ...buildDrawTileAt(position, 'from_a')];
  });
}

// ---------------------------------------------------------------------------
// Data encoder
// ---------------------------------------------------------------------------

export function buildKanaData(questions: readonly KanaQuestion[]): Uint8Array {
  const bytes: number[] = [];

  for (const q of questions) {
    const tiles = textToTiles(q.word);
    bytes.push(tiles.length);

    for (const tile of tiles) {
      bytes.push(tile);
    }

    bytes.push(q.blankIndex);
    bytes.push(requireTile(q.correct));
    bytes.push(requireTile(q.distractors[0]));
    bytes.push(requireTile(q.distractors[1]));
    bytes.push(requireTile(q.distractors[2]));
  }

  bytes.push(0x00); // end sentinel
  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Assembly: kana engine
// ---------------------------------------------------------------------------

const WORD_ADDR = tilemapAddr(WORD_ROW, WORD_COL);

/** Switch to a feedback state and start its countdown. */
function enterFeedback(state: (typeof KanaState)['ADVANCE_FEEDBACK' | 'RETRY_FEEDBACK']): Op[] {
  return [
    ...storeByte(MEM.KANA_STATE, state),
    ...storeByte(MEM.KANA_FEEDBACK_TIMER, FEEDBACK_FRAMES),
  ];
}

/** Map the newly pressed d-pad direction to its index in A, or RET if none was pressed. */
function readDirection(gotAnswer: string): Op[] {
  const check = (i: number): string => `kana_chk_dir${String(i)}`;
  return [
    ld_a_nn(MEM.JOYPAD_NEW),
    ld_r_r('b', 'a'),
    ...DPAD_BY_DIRECTION.flatMap((button, dir) => {
      const isLast = dir === DPAD_BY_DIRECTION.length - 1;
      return [
        ...(dir > 0 ? [label(check(dir)), ld_r_r('a', 'b')] : []),
        and_n(u8(button)),
        isLast ? ret_cc('z') : jr_cc('z', ref(check(dir + 1))),
        ld_r_n('a', u8(dir)),
        ...(isLast ? [] : [jr(ref(gotAnswer))]),
      ];
    }),
    label(gotAnswer),
  ];
}

export function buildKanaEngine(): Op[] {
  return [
    // =================================================================
    // kana_start — DE = question data pointer.
    // =================================================================
    label('kana_start'),
    ...storePointer('de', MEM.KANA_DATA_LO, MEM.KANA_DATA_HI),

    // Score persists across scenes — initialized at game start only.
    // Restock 1 life so the player can attempt kana even after dying in dialogue.
    ...zeroBytes(MEM.KANA_Q_IDX, MEM.KANA_ATTEMPTS),
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(0)),
    jr_cc('nz', ref('kana_lives_ok')),
    ...storeByte(MEM.KANA_LIVES, 1),
    label('kana_lives_ok'),

    jp(ref('kana_load_question')),

    // =================================================================
    // kana_load_question — Read question from ROM, shuffle, draw.
    // =================================================================
    label('kana_load_question'),
    ...screenOff('kana_vblank'),
    ...clearTilemap('kana_clear'),
    call(ref('kana_draw_hud')),

    ...loadPointer('de', MEM.KANA_DATA_LO, MEM.KANA_DATA_HI),

    // Read word_length; 0 = end of the question list
    ld_a_de(),
    inc_rr('de'),
    cp_n(u8(0)),
    jp_cc('z', ref('kana_all_done')),
    ld_r_r('c', 'a'), // C = word length

    // Copy the word's tiles to the word row
    ld_rr_nn('hl', u16(WORD_ADDR)),
    ld_r_n('b', u8(0)), // B = tile counter
    label('kana_draw_word'),
    ld_a_de(),
    inc_rr('de'),
    ldi_hl_a(),
    inc_r('b'),
    dec_r('c'),
    jr_cc('nz', ref('kana_draw_word')),

    // Read blank_position and overwrite that tile with BLANK_TILE
    ld_a_de(),
    inc_rr('de'),
    ld_r_r('b', 'a'), // B = blank_position
    ld_rr_nn('hl', u16(WORD_ADDR)),
    // HL += B (8-bit add with carry into H)
    ld_r_r('c', 'b'),
    ld_r_r('a', 'l'),
    add_r('c'),
    ld_r_r('l', 'a'),
    jr_cc('nc', ref('kana_no_carry')),
    inc_r('h'),
    label('kana_no_carry'),
    ld_r_n('a', u8(BLANK_TILE)),
    ldi_hl_a(),

    // Copy [correct, d1, d2, d3] into the KANA_SHUFFLE buffer
    ld_rr_nn('hl', MEM.KANA_SHUFFLE),
    ...SHUFFLE_MEM.flatMap(() => [ld_a_de(), inc_rr('de'), ldi_hl_a()]),

    ...storePointer('de', MEM.KANA_DATA_LO, MEM.KANA_DATA_HI),

    // === RANDOMIZE: DIV & 3 picks the direction that holds the correct answer ===
    ldh_a_n(HW.DIV),
    and_n(u8(3)),
    ld_nn_a(MEM.KANA_CORRECT_POS),
    ld_a_nn(MEM.KANA_CORRECT_POS),
    ...switchCases(ANSWER_LAYOUTS.map(buildAnswerLayout), {
      name: 'kana_layout',
      branch: 'jr',
      exit: 'jp',
    }),

    ...screenOn(),

    // Reset attempts and wait for input
    ...zeroBytes(MEM.KANA_ATTEMPTS),
    ...storeByte(MEM.KANA_STATE, KanaState.AWAITING),
    ...storeByte(MEM.KANA_FEEDBACK_TIMER, FEEDBACK_FRAMES),
    ret(),

    // =================================================================
    // kana_update — Dispatch on state.
    // =================================================================
    label('kana_update'),
    ld_a_nn(MEM.KANA_STATE),
    cp_n(u8(KanaState.IDLE)),
    ret_cc('z'),
    cp_n(u8(KanaState.AWAITING)),
    jp_cc('z', ref('kana_await_input')),
    cp_n(u8(KanaState.ADVANCE_FEEDBACK)),
    jp_cc('z', ref('kana_correct_fb')),
    cp_n(u8(KanaState.RETRY_FEEDBACK)),
    jp_cc('z', ref('kana_wrong_fb')),
    ret(),

    // =================================================================
    // kana_await_input — Check d-pad, compare with correct position.
    // =================================================================
    label('kana_await_input'),
    ...readDirection('kana_got_answer'),
    ld_nn_a(MEM.KANA_ANSWER),

    ld_r_r('b', 'a'),
    ld_a_nn(MEM.KANA_CORRECT_POS),
    cp_r('b'),
    jr_cc('nz', ref('kana_wrong')),

    // === CORRECT: score depends on the attempt number ===
    ld_a_nn(MEM.KANA_ATTEMPTS),
    cp_n(u8(0)),
    jr_cc('nz', ref('kana_score_attempt1')),
    ...buildAddScore(SCORE_FIRST_TRY),
    ...buildSetDelta(DELTA_PLUS_100),
    jr(ref('kana_correct_done')),

    label('kana_score_attempt1'),
    cp_n(u8(1)),
    jr_cc('nz', ref('kana_correct_done')),
    ...buildAddScore(SCORE_SECOND_TRY),
    ...buildSetDelta(DELTA_PLUS_10),
    // Attempt 2: +0 (fall through)

    label('kana_correct_done'),
    ...enterFeedback(KanaState.ADVANCE_FEEDBACK),
    ret(),

    // === WRONG ===
    label('kana_wrong'),
    ld_a_nn(MEM.KANA_ATTEMPTS),
    cp_n(u8(MAX_ATTEMPTS)),
    jr_cc('z', ref('kana_death')),

    // Not dead yet — count the attempt and re-prompt after feedback
    inc_r('a'),
    ld_nn_a(MEM.KANA_ATTEMPTS),
    ...enterFeedback(KanaState.RETRY_FEEDBACK),
    ret(),

    // === DEATH (3rd wrong) ===
    label('kana_death'),
    ...buildSubScore(SCORE_DEATH_PENALTY),
    ...buildSetDelta(DELTA_MINUS_100),

    ld_a_nn(MEM.KANA_LIVES),
    dec_r('a'),
    ld_nn_a(MEM.KANA_LIVES),
    cp_n(u8(0)),
    jp_cc('z', ref('kana_all_done')), // no lives left: end the round now

    // Show feedback, then move on to the next question
    ...enterFeedback(KanaState.ADVANCE_FEEDBACK),
    ret(),

    // =================================================================
    // kana_correct_fb — Feedback countdown, then next question.
    // =================================================================
    label('kana_correct_fb'),
    ...countDownOrReturn(MEM.KANA_FEEDBACK_TIMER),
    ld_a_nn(MEM.KANA_Q_IDX),
    inc_r('a'),
    ld_nn_a(MEM.KANA_Q_IDX),
    jp(ref('kana_load_question')),

    // =================================================================
    // kana_wrong_fb — Feedback countdown, then re-prompt the same question.
    // =================================================================
    label('kana_wrong_fb'),
    ...countDownOrReturn(MEM.KANA_FEEDBACK_TIMER),
    ...storeByte(MEM.KANA_STATE, KanaState.AWAITING),
    ret(),

    // =================================================================
    // kana_all_done — Round finished (all questions answered or out of lives).
    // =================================================================
    label('kana_all_done'),
    ...screenOn(),
    ...zeroBytes(MEM.KANA_STATE),
    ret(),
  ];
}
