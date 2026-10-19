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
 *   [word_length: u8]       (| MATCH_FLAG: ask for katakana)
 *   [tile_indices...]        (full word, no blank marker)
 *   [blank_position: u8]     (which tile to blank, 0-indexed)
 *   [correct_tile: u8]       (the right answer)
 *   [distractor1: u8]
 *   [distractor2: u8]
 *   [distractor3: u8]
 *   ...
 *   0x00 sentinel (word_length = 0)
 */

import { playSfx } from './sound';
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
  add_n,
  or_r,
  ret_cc,
  srl,
  sub_r,
} from '../asm/ops';
import { type Op, type TileIndex, ref, u8, u16 } from '../asm/types';
import { at } from '../asm/util';
import { type NonEmpty, type Quad, type Triple, type TupleIndex } from './fixed';
import { requireTile, requireTiles, textToTiles } from './font';
import { CAT_TILES, UI_TILES } from './font-data';
import {
  DELTA_MINUS_100,
  DELTA_PLUS_10,
  DELTA_PLUS_150,
  DELTA_PLUS_100,
  buildAddScore,
  buildClearDelta,
  buildDrawTileAt,
  buildSetDelta,
  buildSubScore,
} from './kana-hud';
import { KanaMode, KanaState, MAX_LIVES } from './state';
import { type TilePosition, tilePos, tilemapAddr } from './tilemap';
import {
  clearScreen,
  drawTiles,
  fadeInCurrent,
  fadeOut,
  screenOff,
  vramPut,
  writeCenteredRow,
} from './video';
import { CAT_SPOTS, catFace, placeCat } from './cat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single kana character string (hiragana or katakana) */
export type Kana = string;

/** Bit of the encoded word length marking a question that asks for katakana */
export const MATCH_FLAG = 0x80;

export interface KanaQuestion {
  /** The full word to display */
  readonly word: string;
  /** Index of the kana to blank out (0-based) */
  readonly blankIndex: number;
  /** The correct kana for the blank */
  readonly correct: Kana;
  /** Three wrong kana (should be visually similar distractors) */
  readonly distractors: Triple<Kana>;
  /** Ask for katakana (the word shows a hiragana phrase and its katakana) */
  readonly prompt?: 'katakana';
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

//  row 2     どれ かな?          prompt / feedback message
//  rows 4-6  ┌────────┐
//            │ こ□にちは │        word, centered in the box
//            └────────┘
//  row 9          ▲
//  row 10         X             UP option
//  row 12     ◀ X 🐱 X ▷         LEFT option, cat, RIGHT option
//  row 14         X             DOWN option
//  row 15         ▼

const PROMPT_ROW = 2;
const WORD_BOX = { top: 4, left: 5, innerWidth: 8 } as const;
const WORD_ROW = WORD_BOX.top + 1;
const WORD_INNER_COL = WORD_BOX.left + 1;
/** Longest word the box can hold */
export const MAX_KANA_WORD_LENGTH = WORD_BOX.innerWidth;

const DPAD_ROW = 12;
const DPAD_COL = 13; // right of the cat
// Ordered by direction index: 0=UP, 1=DOWN, 2=LEFT, 3=RIGHT
const OPTION_POSITIONS = [
  tilePos(DPAD_ROW - 2, DPAD_COL),
  tilePos(DPAD_ROW + 2, DPAD_COL),
  tilePos(DPAD_ROW, DPAD_COL - 2),
  tilePos(DPAD_ROW, DPAD_COL + 2),
] as const;
const ARROW_POSITIONS = [
  tilePos(DPAD_ROW - 3, DPAD_COL),
  tilePos(DPAD_ROW + 3, DPAD_COL),
  tilePos(DPAD_ROW, DPAD_COL - 3),
  tilePos(DPAD_ROW, DPAD_COL + 3),
] as const;
const DPAD_CENTER = tilePos(DPAD_ROW, DPAD_COL);

/** Screen positions for tests and tools */
export const KANA_LAYOUT = {
  promptRow: PROMPT_ROW,
  word: { row: WORD_ROW, col: WORD_INNER_COL, width: WORD_BOX.innerWidth },
  options: OPTION_POSITIONS,
  center: DPAD_CENTER,
} as const;

/** Messages shown on the prompt row, all padded to the same width */
export const KANA_MESSAGES = {
  prompt: 'どれ かな?',
  correct: 'せいかい!',
  retry: 'もう いちど!',
  reveal: 'ざんねん...',
  streak: 'れんぞく!',
  katakana: 'カタカナで?',
  hurry: 'はやく!',
} as const;
const MESSAGE_WIDTH = Math.max(...Object.values(KANA_MESSAGES).map((m) => Array.from(m).length));

// Game constants
/** Frames the feedback (せいかい!, ざんねん...) shows before the round moves on */
export const FEEDBACK_FRAMES = 40;
const SCORE_FIRST_TRY = 100;
const SCORE_SECOND_TRY = 10;
const SCORE_DEATH_PENALTY = 100;
/** Seconds to answer each speed-round question */
export const SPEED_SECONDS = 5;
const FRAMES_PER_SECOND = 60;
/** Where the speed round's countdown digit sits: just right of the prompt */
export const CLOCK_POSITION = tilePos(PROMPT_ROW, 14);

/** Every STREAK_LENGTH-th first-try answer in a row earns STREAK_BONUS more */
export const STREAK_LENGTH = 3;
export const STREAK_BONUS = 50;
const MAX_ATTEMPTS = 2; // 0-indexed: attempt 0, 1, 2 = 3 tries

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
/** The cat beside the answers cheers or sulks for a moment, or settles back to neutral */
function showFace(face: 'neutral' | 'happy' | 'sad'): Op[] {
  return face === 'neutral' ? catFace('cat_rest', 'neutral') : catFace('cat_react', face);
}
const ARROW_TILES = requireTiles(UI_TILES.ARROWS);

/** Prompt-row message, centered and padded so every message fully replaces the last */
function messageTiles(text: string): number[] {
  const tiles = textToTiles(text);
  const left = Math.floor((MESSAGE_WIDTH - tiles.length) / 2);
  return [
    ...Array<number>(left).fill(0),
    ...tiles,
    ...Array<number>(MESSAGE_WIDTH - tiles.length - left).fill(0),
  ];
}

function showMessage(text: string): Op[] {
  return writeCenteredRow(PROMPT_ROW, messageTiles(text));
}

/** The parts of the round screen that don't change between questions (LCD off) */
function buildRoundFrame(): Op[] {
  const { top, left, innerWidth } = WORD_BOX;
  const right = left + innerWidth + 1;
  const tileAt = (pos: TilePosition, tile: number): Op[] => [
    ld_rr_nn('hl', u16(tilemapAddr(pos))),
    ld_r_n('a', u8(tile)),
    ldi_hl_a(),
  ];
  const horizontal = (row: number, l: string, edge: string, r: string): Op[] => [
    ld_rr_nn('hl', u16(tilemapAddr(row, left))),
    ld_r_n('a', u8(requireTile(l))),
    ldi_hl_a(),
    ld_r_n('a', u8(requireTile(edge))),
    ld_r_n('b', u8(innerWidth)),
    call(ref('fill_tiles')),
    ld_r_n('a', u8(requireTile(r))),
    ldi_hl_a(),
  ];
  return [
    ...horizontal(top, '┌', '─', '┐'),
    ...tileAt(tilePos(top + 1, left), requireTile('│')),
    ...tileAt(tilePos(top + 1, right), requireTile('▕')),
    ...horizontal(top + 2, '└', '▁', '┘'),
    ...ARROW_POSITIONS.flatMap((pos, dir) => tileAt(pos, at(ARROW_TILES, dir))),
    ...tileAt(DPAD_CENTER, requireTile(UI_TILES.PAW)),
  ];
}

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
    if (tiles.length > MAX_KANA_WORD_LENGTH) {
      throw new RangeError(`Kana word too long for the box: ${q.word}`);
    }
    bytes.push(tiles.length | (q.prompt === 'katakana' ? MATCH_FLAG : 0));

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

const WORD_INNER_ADDR = tilemapAddr(WORD_ROW, WORD_INNER_COL);

/** HL += A (clobbers A) */
function addAToHL(name: string): Op[] {
  return [add_r('l'), ld_r_r('l', 'a'), jr_cc('nc', ref(name)), inc_r('h'), label(name)];
}

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
    ...buildClearDelta(), // don't carry a dialogue flash into the round
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(0)),
    jr_cc('nz', ref('kana_lives_ok')),
    ...storeByte(MEM.KANA_LIVES, 1),
    label('kana_lives_ok'),
    ...catFace('cat_rest', 'neutral'),

    jp(ref('kana_load_question')),

    // =================================================================
    // kana_load_question — Read question from ROM, shuffle, draw.
    // =================================================================
    label('kana_load_question'),
    // Out of questions? End the round with the last question still on screen.
    ...loadPointer('hl', MEM.KANA_DATA_LO, MEM.KANA_DATA_HI),
    ld_r_r('a', 'hl_ptr'),
    cp_n(u8(0)),
    jp_cc('z', ref('kana_all_done')),

    // The round's first question gets a fresh screen; later ones keep the frame and
    // redraw only the word, the answers, and the prompt, with the LCD on
    ld_a_nn(MEM.KANA_Q_IDX),
    or_r('a'),
    jr_cc('nz', ref('kana_next_question')),
    ...fadeOut(),
    ...screenOff('kana_vblank'),
    ...clearScreen(),
    call(ref('kana_draw_hud')),
    ...buildRoundFrame(),
    label('kana_next_question'),
    ...drawTiles(WORD_INNER_ADDR, Array<number>(WORD_BOX.innerWidth).fill(0)), // empty word box

    ...loadPointer('de', MEM.KANA_DATA_LO, MEM.KANA_DATA_HI),

    // Read word_length; 0 = end of the question list
    ld_a_de(),
    inc_rr('de'),
    cp_n(u8(0)),
    jp_cc('z', ref('kana_all_done')),
    ld_r_r('c', 'a'),
    and_n(u8(MATCH_FLAG)),
    ld_nn_a(MEM.KANA_PROMPT),
    ld_r_r('a', 'c'),
    and_n(u8(0xff ^ MATCH_FLAG)),
    ld_r_r('c', 'a'), // C = word length
    call(ref('kana_show_prompt')),

    // HL = start of the word, centered in the box: inner + (width - length) / 2
    ld_r_n('a', u8(WORD_BOX.innerWidth)),
    sub_r('c'),
    srl('a'),
    ld_rr_nn('hl', u16(WORD_INNER_ADDR)),
    ...addAToHL('kana_word_centered'),
    ...storePointer('hl', MEM.KANA_BLANK_LO, MEM.KANA_BLANK_HI), // word start, for now

    // Copy the word's tiles
    label('kana_draw_word'),
    ld_a_de(),
    inc_rr('de'),
    ...vramPut(),
    dec_r('c'),
    jr_cc('nz', ref('kana_draw_word')),

    // Read blank_position; remember that cell and cover it with BLANK_TILE
    ld_a_de(),
    inc_rr('de'),
    ld_r_r('b', 'a'),
    ...loadPointer('hl', MEM.KANA_BLANK_LO, MEM.KANA_BLANK_HI),
    ld_r_r('a', 'b'),
    ...addAToHL('kana_blank_found'),
    ...storePointer('hl', MEM.KANA_BLANK_LO, MEM.KANA_BLANK_HI),
    ld_r_n('a', u8(BLANK_TILE)),
    ...vramPut(),

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

    // A fresh screen fades in, with the cat beside it
    ld_a_nn(MEM.KANA_Q_IDX),
    or_r('a'),
    jr_cc('nz', ref('kana_question_shown')),
    ...fadeInCurrent(),
    ...placeCat(CAT_SPOTS.quiz),
    label('kana_question_shown'),

    // Reset attempts and wait for input
    ...zeroBytes(MEM.KANA_ATTEMPTS),
    ...storeByte(MEM.KANA_STATE, KanaState.AWAITING),
    ...storeByte(MEM.KANA_FEEDBACK_TIMER, FEEDBACK_FRAMES),
    // Speed round: start the clock
    ld_a_nn(MEM.KANA_MODE),
    cp_n(u8(KanaMode.SPEED)),
    ret_cc('nz'),
    ...storeByte(MEM.KANA_CLOCK_FRAMES, FRAMES_PER_SECOND),
    ...storeByte(MEM.KANA_CLOCK_SECS, SPEED_SECONDS),
    jp(ref('kana_draw_clock')),

    // kana_draw_clock — show the seconds left (LCD on)
    label('kana_draw_clock'),
    ld_rr_nn('hl', u16(tilemapAddr(CLOCK_POSITION))),
    ld_a_nn(MEM.KANA_CLOCK_SECS),
    add_n(u8(requireTile('0'))),
    ...vramPut(),
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
    // Speed round: tick the clock; running out counts as a miss
    ld_a_nn(MEM.KANA_MODE),
    cp_n(u8(KanaMode.SPEED)),
    jr_cc('nz', ref('kana_clock_done')),
    ld_a_nn(MEM.KANA_CLOCK_FRAMES),
    dec_r('a'),
    ld_nn_a(MEM.KANA_CLOCK_FRAMES),
    jr_cc('nz', ref('kana_clock_done')),
    ...storeByte(MEM.KANA_CLOCK_FRAMES, FRAMES_PER_SECOND),
    ld_a_nn(MEM.KANA_CLOCK_SECS),
    dec_r('a'),
    ld_nn_a(MEM.KANA_CLOCK_SECS),
    ...playSfx('tick'),
    call(ref('kana_draw_clock')),
    ld_a_nn(MEM.KANA_CLOCK_SECS),
    or_r('a'),
    jp_cc('z', ref('kana_wrong')),
    label('kana_clock_done'),
    ...readDirection('kana_got_answer'),
    ld_nn_a(MEM.KANA_ANSWER),

    ld_r_r('b', 'a'),
    ld_a_nn(MEM.KANA_CORRECT_POS),
    cp_r('b'),
    jp_cc('nz', ref('kana_wrong')),

    // === CORRECT: a won-back life, or a score that depends on the attempt number ===
    ld_a_nn(MEM.KANA_MODE),
    cp_n(u8(KanaMode.REDEEM)),
    jp_cc('z', ref('kana_redeem_win')),
    ld_a_nn(MEM.KANA_ATTEMPTS),
    cp_n(u8(0)),
    jr_cc('nz', ref('kana_score_attempt1')),
    ...buildAddScore(SCORE_FIRST_TRY),
    ...buildSetDelta(DELTA_PLUS_100),
    ld_a_nn(MEM.KANA_STREAK),
    inc_r('a'),
    cp_n(u8(STREAK_LENGTH)),
    jp_cc('z', ref('kana_streak')),
    ld_nn_a(MEM.KANA_STREAK),
    jr(ref('kana_correct_done')),

    label('kana_score_attempt1'),
    cp_n(u8(1)),
    jr_cc('nz', ref('kana_score_none')),
    ...buildAddScore(SCORE_SECOND_TRY),
    ...buildSetDelta(DELTA_PLUS_10),
    jr(ref('kana_correct_done')),

    label('kana_score_none'), // attempt 2: +0
    ...buildClearDelta(),

    label('kana_correct_done'),
    ...playSfx('correct'), // (a streak's fanfare outranks it)
    ...showMessage(KANA_MESSAGES.correct),
    ...showFace('happy'),
    call(ref('kana_reveal')),
    ...enterFeedback(KanaState.ADVANCE_FEEDBACK),
    ret(),

    // === WRONG ===
    label('kana_wrong'),
    ...playSfx('wrong'),
    ...zeroBytes(MEM.KANA_STREAK),
    ld_a_nn(MEM.KANA_MODE),
    cp_n(u8(KanaMode.NORMAL)),
    jp_cc('nz', ref('kana_chance_miss')), // one-try rounds just show the answer
    ld_a_nn(MEM.KANA_ATTEMPTS),
    cp_n(u8(MAX_ATTEMPTS)),
    jr_cc('z', ref('kana_death')),

    // Not dead yet — count the attempt and re-prompt after feedback
    inc_r('a'),
    ld_nn_a(MEM.KANA_ATTEMPTS),
    ...buildClearDelta(),
    ...showMessage(KANA_MESSAGES.retry),
    ...showFace('sad'),
    ...enterFeedback(KanaState.RETRY_FEEDBACK),
    ret(),

    // === DEATH (3rd wrong) ===
    label('kana_death'),
    ...buildSubScore(SCORE_DEATH_PENALTY),
    ...buildSetDelta(DELTA_MINUS_100),
    ...showMessage(KANA_MESSAGES.reveal),
    ...showFace('sad'),
    call(ref('kana_reveal')), // show the answer before moving on

    ld_a_nn(MEM.KANA_LIVES),
    dec_r('a'),
    ld_nn_a(MEM.KANA_LIVES),
    cp_n(u8(0)),
    jp_cc('z', ref('kana_all_done')), // no lives left: end the round now

    // Show feedback, then move on to the next question
    ...enterFeedback(KanaState.ADVANCE_FEEDBACK),
    ret(),

    // === Streak: bonus points and a cheer instead of the usual message ===
    label('kana_streak'),
    ...playSfx('streak'),
    ...zeroBytes(MEM.KANA_STREAK),
    ...buildAddScore(STREAK_BONUS),
    ...buildSetDelta(DELTA_PLUS_150),
    ...showMessage(KANA_MESSAGES.streak),
    ...showFace('happy'),
    call(ref('kana_reveal')),
    ...enterFeedback(KanaState.ADVANCE_FEEDBACK),
    ret(),

    // === One-try rounds ===
    label('kana_redeem_win'), // the life lost to a bad answer comes back
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(MAX_LIVES)),
    jr_cc('nc', ref('kana_redeem_full')),
    inc_r('a'),
    ld_nn_a(MEM.KANA_LIVES),
    label('kana_redeem_full'),
    ...buildClearDelta(),
    jp(ref('kana_correct_done')),

    label('kana_chance_miss'), // no penalty: reveal and move on
    ...buildClearDelta(),
    ...showMessage(KANA_MESSAGES.reveal),
    ...showFace('sad'),
    call(ref('kana_reveal')),
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
    call(ref('kana_show_prompt')),
    ...showFace('neutral'),
    ...storeByte(MEM.KANA_STATE, KanaState.AWAITING),
    ret(),

    // =================================================================
    // kana_show_prompt — The question's prompt: hurry in the speed round, katakana for
    // match questions, the usual one otherwise. Safe with the LCD on.
    // =================================================================
    label('kana_show_prompt'),
    ld_a_nn(MEM.KANA_MODE),
    cp_n(u8(KanaMode.SPEED)),
    jr_cc('z', ref('kana_show_hurry')), // the speed round hurries you along
    ld_a_nn(MEM.KANA_PROMPT),
    or_r('a'),
    jr_cc('nz', ref('kana_show_katakana')), // match questions ask for katakana
    ...showMessage(KANA_MESSAGES.prompt),
    ret(),
    label('kana_show_katakana'),
    ...showMessage(KANA_MESSAGES.katakana),
    ret(),
    label('kana_show_hurry'),
    ...showMessage(KANA_MESSAGES.hurry),
    ret(),

    // =================================================================
    // kana_reveal — Put the correct kana into the word's blank cell.
    // =================================================================
    label('kana_reveal'),
    ...loadPointer('hl', MEM.KANA_BLANK_LO, MEM.KANA_BLANK_HI),
    ld_a_nn(MEM.KANA_SHUFFLE), // shuffle slot 0 always holds the correct tile
    ...vramPut(),
    ret(),

    // =================================================================
    // kana_all_done — Round finished (all questions answered or out of lives).
    // =================================================================
    label('kana_all_done'),
    ...zeroBytes(MEM.KANA_STATE),
    ret(),
  ];
}
