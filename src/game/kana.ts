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

import { ifPressed } from './joypad';
import { playMusic, playSfx } from './sound';
import { compare, dispatch, doWhile, ifEquals, ifNotEquals, ifThen } from '../asm/flow';
import { HW, JOY } from '../asm/hardware';
import { MEM } from './ram';
import {
  countDownOrReturn,
  decByte,
  incByte,
  loadPointer,
  storeByte,
  storePointer,
  switchCases,
  zeroBytes,
} from '../asm/macros';
import {
  add,
  and,
  call,
  cp,
  dec,
  inc,
  jp,
  jr,
  label,
  ld,
  ldh,
  ret,
  or,
  srl,
  sub,
  invoke,
} from '../asm/sm83';
import { type Op, type TileIndex, Label, routine } from '../asm/types';
import { at } from '../asm/util';
import type { NonEmpty, Quad, Triple, TupleIndex } from './fixed';
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
import {
  KANA_DRAW_HUD,
  FILL_TILES,
  CAT_REACT,
  CAT_REST,
  CHART_SEEN,
  CHART_UNMISS,
  CHART_MISSED,
  KANA_START,
  KANA_UPDATE,
} from './labels';
import { gameModule } from '../asm/program';
const KANA_DRAW_CLOCK = routine('kana_draw_clock', { clobbers: ['a', 'hl'] });
const KANA_STREAK = new Label('kana_streak');
const KANA_SHOW_PROMPT = routine('kana_show_prompt', { clobbers: ['a', 'hl'] });
const KANA_REVEAL = routine('kana_reveal', { clobbers: ['a', 'hl'], keepsFlags: true });

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
  return face === 'neutral' ? catFace(CAT_REST, 'neutral') : catFace(CAT_REACT, face);
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
    ld('hl', tilemapAddr(pos)),
    ld('a', tile),
    ld(['hl+'], 'a'),
  ];
  const horizontal = (row: number, l: string, edge: string, r: string): Op[] => [
    ld('hl', tilemapAddr(row, left)),
    ld('a', requireTile(l)),
    ld(['hl+'], 'a'),
    ...invoke(FILL_TILES, { a: requireTile(edge), b: innerWidth, hl: 'hl' }),
    ld('a', requireTile(r)),
    ld(['hl+'], 'a'),
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
    return [ld('a', [MEM.KANA_SHUFFLE.at(shuffleSlot)]), ...buildDrawTileAt(position, 'from_a')];
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
function addAToHL(): Op[] {
  const done = new Label();
  return [add('l'), ld('l', 'a'), jr('nc', done), inc('h'), label(done)];
}

/** Switch to a feedback state and start its countdown. */
function enterFeedback(state: (typeof KanaState)['ADVANCE_FEEDBACK' | 'RETRY_FEEDBACK']): Op[] {
  return [
    ...storeByte(MEM.KANA_STATE, state),
    ...storeByte(MEM.KANA_FEEDBACK_TIMER, FEEDBACK_FRAMES),
  ];
}

/** Map the newly pressed d-pad direction to its index in A, or RET if none was pressed. */
function readDirection(gotAnswer: Label): Op[] {
  const checks = DPAD_BY_DIRECTION.map(() => new Label());
  const check = (i: number): Label => at(checks, i);
  return [
    ld('a', [MEM.JOYPAD_NEW]),
    ld('b', 'a'),
    ...DPAD_BY_DIRECTION.flatMap((button, dir) => {
      const isLast = dir === DPAD_BY_DIRECTION.length - 1;
      return [
        ...(dir > 0 ? [label(check(dir)), ld('a', 'b')] : []),
        and(button),
        isLast ? ret('z') : jr('z', check(dir + 1)),
        ld('a', dir),
        ...(isLast ? [] : [jr(gotAnswer)]),
      ];
    }),
    label(gotAnswer),
  ];
}

function buildKanaEngine(): Op[] {
  const chanceMiss = new Label('kana_chance_miss');
  const noScore = new Label('kana_score_none');
  const correctDone = new Label('kana_correct_done');
  const practiceWin = new Label('kana_practice_win');
  const redeemWin = new Label('kana_redeem_win');
  const wrongAnswer = new Label('kana_wrong');
  const wrongFeedback = new Label('kana_wrong_fb');
  const correctFeedback = new Label('kana_correct_fb');
  const allDone = new Label('kana_all_done');
  const loadQuestion = new Label('kana_load_question');
  return [
    // =================================================================
    // kana_start — DE = question data pointer.
    // =================================================================
    label(KANA_START),
    ...playMusic('quiz'),
    ...storePointer('de', MEM.KANA_DATA),

    // Score persists across scenes — initialized at game start only.
    // Restock 1 life so the player can attempt kana even after dying in dialogue.
    ...zeroBytes(MEM.KANA_Q_IDX, MEM.KANA_ATTEMPTS),
    ...buildClearDelta(), // don't carry a dialogue flash into the round
    ...ifEquals(MEM.KANA_LIVES, 0, [...storeByte(MEM.KANA_LIVES, 1)]),
    ...catFace(CAT_REST, 'neutral'),

    jp(loadQuestion),

    // =================================================================
    // kana_load_question — Read question from ROM, shuffle, draw.
    // =================================================================
    label(loadQuestion),
    // Out of questions? End the round with the last question still on screen.
    ...loadPointer('hl', MEM.KANA_DATA),
    ld('a', ['hl']),
    cp(0),
    jp('z', allDone),

    // The round's first question gets a fresh screen; later ones keep the frame and
    // redraw only the word, the answers, and the prompt, with the LCD on
    ld('a', [MEM.KANA_Q_IDX]),
    or('a'),
    ...ifThen('z', [
      ...fadeOut(),
      ...screenOff(),
      ...clearScreen(),
      call(KANA_DRAW_HUD),
      ...buildRoundFrame(),
    ]),
    ...drawTiles(WORD_INNER_ADDR, Array<number>(WORD_BOX.innerWidth).fill(0)), // empty word box

    ...loadPointer('de', MEM.KANA_DATA),

    // Read word_length; 0 = end of the question list
    ld('a', ['de']),
    inc('de'),
    cp(0),
    jp('z', allDone),
    ld('c', 'a'),
    and(MATCH_FLAG),
    ld([MEM.KANA_PROMPT], 'a'),
    ld('a', 'c'),
    and(0xff ^ MATCH_FLAG),
    ld('c', 'a'), // C = word length
    call(KANA_SHOW_PROMPT),

    // HL = start of the word, centered in the box: inner + (width - length) / 2
    ld('a', WORD_BOX.innerWidth),
    sub('c'),
    srl('a'),
    ld('hl', WORD_INNER_ADDR),
    ...addAToHL(),
    ...storePointer('hl', MEM.KANA_BLANK), // word start, for now

    // Copy the word's tiles
    ...doWhile('nz', [ld('a', ['de']), inc('de'), ...vramPut(), dec('c')]),

    // Read blank_position; remember that cell and cover it with BLANK_TILE
    ld('a', ['de']),
    inc('de'),
    ld('b', 'a'),
    ...loadPointer('hl', MEM.KANA_BLANK),
    ld('a', 'b'),
    ...addAToHL(),
    ...storePointer('hl', MEM.KANA_BLANK),
    ld('a', BLANK_TILE),
    ...vramPut(),

    // Copy [correct, d1, d2, d3] into the KANA_SHUFFLE buffer
    ld('hl', MEM.KANA_SHUFFLE.address),
    ...ANSWER_SLOT_ORDER.flatMap(() => [ld('a', ['de']), inc('de'), ld(['hl+'], 'a')]),

    ...storePointer('de', MEM.KANA_DATA),

    // === RANDOMIZE: DIV & 3 picks the direction that holds the correct answer ===
    ldh('a', [HW.DIV]),
    and(3),
    ld([MEM.KANA_CORRECT_POS], 'a'),
    ld('a', [MEM.KANA_CORRECT_POS]),
    ...switchCases(ANSWER_LAYOUTS.map(buildAnswerLayout)),

    // A fresh screen fades in, with the cat beside it
    ld('a', [MEM.KANA_Q_IDX]),
    or('a'),
    ...ifThen('z', [...fadeInCurrent(), ...placeCat(CAT_SPOTS.quiz)]),

    // Reset attempts and wait for input
    ...zeroBytes(MEM.KANA_ATTEMPTS),
    ...storeByte(MEM.KANA_STATE, KanaState.AWAITING),
    ...storeByte(MEM.KANA_FEEDBACK_TIMER, FEEDBACK_FRAMES),
    // Speed round: start the clock
    ...compare(MEM.KANA_MODE, KanaMode.SPEED),
    ret('nz'),
    ...storeByte(MEM.KANA_CLOCK_FRAMES, FRAMES_PER_SECOND),
    ...storeByte(MEM.KANA_CLOCK_SECS, SPEED_SECONDS),
    jp(KANA_DRAW_CLOCK),

    // kana_draw_clock — show the seconds left (LCD on)
    label(KANA_DRAW_CLOCK),
    ld('hl', tilemapAddr(CLOCK_POSITION)),
    ld('a', [MEM.KANA_CLOCK_SECS]),
    add(requireTile('0')),
    ...vramPut(),
    ret(),

    // =================================================================
    // kana_update — Dispatch on state.
    // =================================================================
    label(KANA_UPDATE),
    ...dispatch(MEM.KANA_STATE, KanaState, {
      IDLE: 'ret',
      AWAITING: 'continue',
      ADVANCE_FEEDBACK: correctFeedback,
      RETRY_FEEDBACK: wrongFeedback,
    }),
    // Practice: B quits (see practice.ts)
    ...ifEquals(MEM.KANA_MODE, KanaMode.PRACTICE, [
      ...ifPressed(JOY.B, [...storeByte(MEM.PRACTICE_QUIT, 1), jp(allDone)]),
    ]),
    // Speed round: tick the clock; running out counts as a miss
    ...ifEquals(MEM.KANA_MODE, KanaMode.SPEED, [
      ...decByte(MEM.KANA_CLOCK_FRAMES),
      ...ifThen('z', [
        ...storeByte(MEM.KANA_CLOCK_FRAMES, FRAMES_PER_SECOND),
        ...decByte(MEM.KANA_CLOCK_SECS),
        ...playSfx('tick'),
        call(KANA_DRAW_CLOCK),
        ld('a', [MEM.KANA_CLOCK_SECS]),
        or('a'),
        jp('z', wrongAnswer),
      ]),
    ]),
    ...readDirection(new Label('kana_got_answer')),
    ld([MEM.KANA_ANSWER], 'a'),

    ld('b', 'a'),
    ld('a', [MEM.KANA_CORRECT_POS]),
    cp('b'),
    jp('nz', wrongAnswer),

    // === CORRECT: a won-back life, or a score that depends on the attempt number ===
    call(CHART_SEEN),
    ...dispatch(MEM.KANA_MODE, KanaMode, {
      NORMAL: 'continue',
      SAY_IT: 'continue',
      REDEEM: redeemWin,
      SPEED: 'continue',
      PRACTICE: practiceWin,
    }),
    ...ifEquals(MEM.KANA_ATTEMPTS, 0, [
      ...buildAddScore(SCORE_FIRST_TRY),
      ...buildSetDelta(DELTA_PLUS_100),
      ld('a', [MEM.KANA_STREAK]),
      inc('a'),
      cp(STREAK_LENGTH),
      jp('z', KANA_STREAK),
      ld([MEM.KANA_STREAK], 'a'),
      jr(correctDone),
    ]),
    cp(1),
    jr('nz', noScore),
    ...buildAddScore(SCORE_SECOND_TRY),
    ...buildSetDelta(DELTA_PLUS_10),
    jr(correctDone),

    label(practiceWin), // practiced right: no longer a missed kana, no points
    call(CHART_UNMISS),
    label(noScore), // attempt 2: +0
    ...buildClearDelta(),

    label(correctDone),
    ...playSfx('correct'), // (a streak's fanfare outranks it)
    ...showMessage(KANA_MESSAGES.correct),
    ...showFace('happy'),
    call(KANA_REVEAL),
    ...enterFeedback(KanaState.ADVANCE_FEEDBACK),
    ret(),

    // === WRONG ===
    label(wrongAnswer),
    call(CHART_MISSED),
    ...playSfx('wrong'),
    ...zeroBytes(MEM.KANA_STREAK),
    ...compare(MEM.KANA_MODE, KanaMode.NORMAL),
    jp('nz', chanceMiss), // one-try rounds just show the answer
    ...ifNotEquals(MEM.KANA_ATTEMPTS, MAX_ATTEMPTS, [
      inc('a'),
      ld([MEM.KANA_ATTEMPTS], 'a'),
      ...buildClearDelta(),
      ...showMessage(KANA_MESSAGES.retry),
      ...showFace('sad'),
      ...enterFeedback(KanaState.RETRY_FEEDBACK),
      ret(),
    ]),
    ...buildSubScore(SCORE_DEATH_PENALTY),
    ...buildSetDelta(DELTA_MINUS_100),
    ...showMessage(KANA_MESSAGES.reveal),
    ...showFace('sad'),
    call(KANA_REVEAL), // show the answer before moving on

    ...decByte(MEM.KANA_LIVES),
    cp(0),
    jp('z', allDone), // no lives left: end the round now

    // Show feedback, then move on to the next question
    ...enterFeedback(KanaState.ADVANCE_FEEDBACK),
    ret(),

    // === Streak: bonus points and a cheer instead of the usual message ===
    label(KANA_STREAK),
    ...playSfx('streak'),
    ...zeroBytes(MEM.KANA_STREAK),
    ...buildAddScore(STREAK_BONUS),
    ...buildSetDelta(DELTA_PLUS_150),
    ...showMessage(KANA_MESSAGES.streak),
    ...showFace('happy'),
    call(KANA_REVEAL),
    ...enterFeedback(KanaState.ADVANCE_FEEDBACK),
    ret(),

    // === One-try rounds ===
    label(redeemWin), // the life lost to a bad answer comes back
    ...compare(MEM.KANA_LIVES, MAX_LIVES),
    ...ifThen('c', [inc('a'), ld([MEM.KANA_LIVES], 'a')]),
    ...buildClearDelta(),
    jp(correctDone),

    label(chanceMiss), // no penalty: reveal and move on
    ...buildClearDelta(),
    ...showMessage(KANA_MESSAGES.reveal),
    ...showFace('sad'),
    call(KANA_REVEAL),
    ...enterFeedback(KanaState.ADVANCE_FEEDBACK),
    ret(),

    // =================================================================
    // kana_correct_fb — Feedback countdown, then next question.
    // =================================================================
    label(correctFeedback),
    ...countDownOrReturn(MEM.KANA_FEEDBACK_TIMER),
    ...incByte(MEM.KANA_Q_IDX),
    jp(loadQuestion),

    // =================================================================
    // kana_wrong_fb — Feedback countdown, then re-prompt the same question.
    // =================================================================
    label(wrongFeedback),
    ...countDownOrReturn(MEM.KANA_FEEDBACK_TIMER),
    call(KANA_SHOW_PROMPT),
    ...showFace('neutral'),
    ...storeByte(MEM.KANA_STATE, KanaState.AWAITING),
    ret(),

    // =================================================================
    // kana_show_prompt — The question's prompt: hurry in the speed round, katakana for
    // match questions, the usual one otherwise. Safe with the LCD on.
    // =================================================================
    label(KANA_SHOW_PROMPT),
    ...ifNotEquals(MEM.KANA_MODE, KanaMode.SPEED, [
      ld('a', [MEM.KANA_PROMPT]),
      or('a'),
      ...ifThen('z', [...showMessage(KANA_MESSAGES.prompt), ret()]),
      ...showMessage(KANA_MESSAGES.katakana),
      ret(),
    ]),
    ...showMessage(KANA_MESSAGES.hurry),
    ret(),

    // =================================================================
    // kana_reveal — Put the correct kana into the word's blank cell.
    // =================================================================
    label(KANA_REVEAL),
    ...loadPointer('hl', MEM.KANA_BLANK),
    ld('a', [MEM.KANA_SHUFFLE.at(0)]), // shuffle slot 0 always holds the correct tile
    ...vramPut(),
    ret(),

    // =================================================================
    // kana_all_done — Round finished (all questions answered or out of lives).
    // =================================================================
    label(allDone),
    ...zeroBytes(MEM.KANA_STATE),
    ret(),
  ];
}

export const kanaModule = gameModule({ name: 'kana', code: buildKanaEngine });
