/**
 * Kana mini-game engine.
 *
 * Shows a word with one kana blanked out. Four options appear at screen
 * edges mapped to d-pad directions. Player presses the correct direction.
 *
 * Question data format in ROM (per question):
 *   [word_length: u8]
 *   [tile_indices...] (0xFF marks the blank position)
 *   [correct_dir: u8]  (0=up, 1=down, 2=left, 3=right)
 *   [option_up: u8]    (tile index for UP choice)
 *   [option_down: u8]
 *   [option_left: u8]
 *   [option_right: u8]
 *
 * Followed by 0x00 sentinel after the last question.
 */

import { type Op, ref, u8, u16 } from '../asm/types';
import {
  label,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ld_a_nn,
  ld_nn_a,
  ldi_hl_a,
  ldi_a_hl,
  ldh_a_n,
  ldh_n_a,
  xor_r,
  and_n,
  cp_n,
  cp_r,
  inc_r,
  dec_r,
  add_n,
  jr,
  jr_cc,
  jp,
  jp_cc,
  ret,
  ret_cc,
} from '../asm/ops';
import { HW, JOY, LCDC, MEM } from '../asm/hardware';
import { requireTile, textToTiles } from './font';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const MAP_COLS = 32;

// Word display: centered on row 6
const WORD_ROW = 6;

// Option positions (single tile each)
const OPT_UP_ROW = 3;
const OPT_UP_COL = 10;
const OPT_DOWN_ROW = 9;
const OPT_DOWN_COL = 10;
const OPT_LEFT_ROW = 6;
const OPT_LEFT_COL = 2;
const OPT_RIGHT_ROW = 6;
const OPT_RIGHT_COL = 17;

const FEEDBACK_FRAMES = 30; // frames to show correct/wrong feedback
const SCORE_PER_CORRECT = 4;
const BLANK_MARKER = 0xff;

function tilemapAddr(row: number, col: number): number {
  return 0x9800 + row * MAP_COLS + col;
}

const UNDERSCORE_TILE = requireTile('-');

// ---------------------------------------------------------------------------
// Question type & data encoder
// ---------------------------------------------------------------------------

export type KanaDir = 'up' | 'down' | 'left' | 'right';

export interface KanaQuestion {
  /** The full word */
  word: string;
  /** Index of the kana to blank out */
  blankIndex: number;
  /** The four options (one correct, three distractors) */
  options: { up: string; down: string; left: string; right: string };
  /** Which direction is correct */
  correctDir: KanaDir;
}

const DIR_MAP: Record<KanaDir, number> = { up: 0, down: 1, left: 2, right: 3 };

function charToTile(ch: string): number {
  return requireTile(ch);
}

export function buildKanaData(questions: KanaQuestion[]): Uint8Array {
  const bytes: number[] = [];

  for (const q of questions) {
    const tiles = textToTiles(q.word);
    bytes.push(tiles.length); // word length

    // Tile indices with blank marker at blankIndex
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile === undefined) {
        throw new Error(`Tile index out of bounds at position ${String(i)} in word "${q.word}"`);
      }
      bytes.push(i === q.blankIndex ? BLANK_MARKER : tile);
    }

    bytes.push(DIR_MAP[q.correctDir]); // correct direction
    bytes.push(charToTile(q.options.up));
    bytes.push(charToTile(q.options.down));
    bytes.push(charToTile(q.options.left));
    bytes.push(charToTile(q.options.right));
  }

  bytes.push(0x00); // end sentinel (word_length = 0)
  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Game content — starter questions
// ---------------------------------------------------------------------------

export const KANA_QUESTIONS: KanaQuestion[] = [
  // Hiragana practice
  {
    word: 'こんにちは',
    blankIndex: 0,
    options: { up: 'こ', down: 'か', left: 'く', right: 'き' },
    correctDir: 'up',
  },
  {
    word: 'ありがとう',
    blankIndex: 2,
    options: { up: 'き', down: 'が', left: 'ぎ', right: 'ぐ' },
    correctDir: 'down',
  },
  {
    word: 'すみません',
    blankIndex: 1,
    options: { up: 'む', down: 'ま', left: 'み', right: 'め' },
    correctDir: 'left',
  },
  {
    word: 'おはよう',
    blankIndex: 0,
    options: { up: 'あ', down: 'い', left: 'う', right: 'お' },
    correctDir: 'right',
  },
  {
    word: 'さようなら',
    blankIndex: 3,
    options: { up: 'な', down: 'に', left: 'ぬ', right: 'ね' },
    correctDir: 'up',
  },
  // Katakana practice
  {
    word: 'ラーメン',
    blankIndex: 0,
    options: { up: 'リ', down: 'ラ', left: 'ル', right: 'レ' },
    correctDir: 'down',
  },
  {
    word: 'コンビニ',
    blankIndex: 0,
    options: { up: 'カ', down: 'キ', left: 'コ', right: 'ク' },
    correctDir: 'left',
  },
  {
    word: 'レストラン',
    blankIndex: 4,
    options: { up: 'ナ', down: 'ニ', left: 'ヌ', right: 'ン' },
    correctDir: 'right',
  },
];

// ---------------------------------------------------------------------------
// Assembly: kana engine subroutines
// ---------------------------------------------------------------------------

/**
 * Build the kana mini-game assembly subroutines.
 * Call kana_start with DE = pointer to kana question data in ROM.
 * Call kana_update each frame. When kana_state returns to 0, game is done.
 */
export function buildKanaEngine(): Op[] {
  return [
    // =================================================================
    // kana_start — Initialize the kana game. DE = question data pointer.
    // Stores the pointer and loads the first question.
    // =================================================================
    label('kana_start'),

    // Save data pointer in DLG_STR (reusing for simplicity)
    ld_r_r('a', 'e'),
    ld_nn_a(MEM.DLG_STR_LO),
    ld_r_r('a', 'd'),
    ld_nn_a(MEM.DLG_STR_HI),

    // Reset score and question index
    xor_r('a'),
    ld_nn_a(MEM.KANA_SCORE),
    ld_nn_a(MEM.KANA_Q_IDX),

    // Load first question
    jp(ref('kana_load_question')),

    // =================================================================
    // kana_load_question — Read current question from ROM and draw it.
    // Expects data pointer in DLG_STR_LO/HI.
    // =================================================================
    label('kana_load_question'),

    // Wait for VBlank, turn LCD off for drawing
    label('kana_vblank'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('kana_vblank')),
    xor_r('a'),
    ldh_n_a(HW.LCDC),

    // Clear screen (rows 0-17)
    ld_rr_nn('hl', u16(0x9800)),
    xor_r('a'),
    ld_r_n('b', u8(4)), // 1024 bytes
    ld_r_n('c', u8(0)),
    label('kana_clear'),
    ldi_hl_a(),
    dec_r('c'),
    jr_cc('nz', ref('kana_clear')),
    dec_r('b'),
    jr_cc('nz', ref('kana_clear')),

    // Load data pointer
    ld_a_nn(MEM.DLG_STR_LO),
    ld_r_r('l', 'a'),
    ld_a_nn(MEM.DLG_STR_HI),
    ld_r_r('h', 'a'),

    // Read word_length
    ldi_a_hl(),
    cp_n(u8(0)),
    jp_cc('z', ref('kana_all_done')), // 0 = no more questions

    ld_r_r('c', 'a'), // C = word length

    // Calculate centered column: (20 - length) / 2
    // We'll just use column 7 for simplicity (works for 4-6 char words)
    ld_rr_nn('de', u16(tilemapAddr(WORD_ROW, 7))),

    // Draw word tiles, replacing BLANK_MARKER with underscore
    label('kana_draw_word'),
    ldi_a_hl(), // read tile
    cp_n(u8(BLANK_MARKER)),
    jr_cc('nz', ref('kana_draw_normal')),
    // Blank position — draw underscore
    ld_r_n('a', u8(UNDERSCORE_TILE)),
    label('kana_draw_normal'),
    // Write tile to VRAM at DE
    ld_r_r('b', 'a'), // save tile
    ld_r_r('a', 'b'),
    // Need to write to [DE]. No LD [DE],A with immediate tile. Use push/pop.
    // Actually: swap DE↔HL, write, swap back
    // Save HL (ROM pointer)
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_VRAM_HI), // temp storage
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_VRAM_LO), // temp storage

    // HL = VRAM dest
    ld_r_r('h', 'd'),
    ld_r_r('l', 'e'),
    ld_r_r('a', 'b'), // tile
    ldi_hl_a(),
    // Save updated VRAM dest back to DE
    ld_r_r('d', 'h'),
    ld_r_r('e', 'l'),

    // Restore ROM pointer to HL
    ld_a_nn(MEM.DLG_VRAM_HI),
    ld_r_r('h', 'a'),
    ld_a_nn(MEM.DLG_VRAM_LO),
    ld_r_r('l', 'a'),

    dec_r('c'),
    jr_cc('nz', ref('kana_draw_word')),

    // Read correct direction and four options
    ldi_a_hl(), // correct_dir
    ld_nn_a(MEM.KANA_CORRECT),

    // Option UP
    ldi_a_hl(),
    ld_r_r('b', 'a'),
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_VRAM_HI), // save HL
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_VRAM_LO),
    ld_rr_nn('hl', u16(tilemapAddr(OPT_UP_ROW, OPT_UP_COL))),
    ld_r_r('a', 'b'),
    ldi_hl_a(),
    ld_a_nn(MEM.DLG_VRAM_HI),
    ld_r_r('h', 'a'),
    ld_a_nn(MEM.DLG_VRAM_LO),
    ld_r_r('l', 'a'),

    // Option DOWN
    ldi_a_hl(),
    ld_r_r('b', 'a'),
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_VRAM_HI),
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_VRAM_LO),
    ld_rr_nn('hl', u16(tilemapAddr(OPT_DOWN_ROW, OPT_DOWN_COL))),
    ld_r_r('a', 'b'),
    ldi_hl_a(),
    ld_a_nn(MEM.DLG_VRAM_HI),
    ld_r_r('h', 'a'),
    ld_a_nn(MEM.DLG_VRAM_LO),
    ld_r_r('l', 'a'),

    // Option LEFT
    ldi_a_hl(),
    ld_r_r('b', 'a'),
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_VRAM_HI),
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_VRAM_LO),
    ld_rr_nn('hl', u16(tilemapAddr(OPT_LEFT_ROW, OPT_LEFT_COL))),
    ld_r_r('a', 'b'),
    ldi_hl_a(),
    ld_a_nn(MEM.DLG_VRAM_HI),
    ld_r_r('h', 'a'),
    ld_a_nn(MEM.DLG_VRAM_LO),
    ld_r_r('l', 'a'),

    // Option RIGHT
    ldi_a_hl(),
    ld_r_r('b', 'a'),
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_VRAM_HI),
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_VRAM_LO),
    ld_rr_nn('hl', u16(tilemapAddr(OPT_RIGHT_ROW, OPT_RIGHT_COL))),
    ld_r_r('a', 'b'),
    ldi_hl_a(),
    ld_a_nn(MEM.DLG_VRAM_HI),
    ld_r_r('h', 'a'),
    ld_a_nn(MEM.DLG_VRAM_LO),
    ld_r_r('l', 'a'),

    // Save updated data pointer
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_STR_LO),
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_STR_HI),

    // Turn LCD back on
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    // Set state to awaiting input
    ld_r_n('a', u8(2)),
    ld_nn_a(MEM.KANA_STATE),

    // Set feedback counter for later
    ld_r_n('a', u8(FEEDBACK_FRAMES)),
    ld_nn_a(MEM.DLG_DELAY), // reuse delay counter

    ret(),

    // =================================================================
    // kana_update — Called each frame. Dispatches on kana_state.
    // =================================================================
    label('kana_update'),
    ld_a_nn(MEM.KANA_STATE),
    cp_n(u8(0)),
    ret_cc('z'), // idle

    cp_n(u8(2)),
    jp_cc('z', ref('kana_await_input')),

    cp_n(u8(3)),
    jp_cc('z', ref('kana_feedback')),

    ret(),

    // =================================================================
    // kana_await_input — Check d-pad for answer
    // =================================================================
    label('kana_await_input'),
    ld_a_nn(MEM.JOYPAD_NEW),
    ld_r_r('b', 'a'),

    // Check UP (dir 0)
    and_n(u8(JOY.UP)),
    jr_cc('z', ref('kana_check_down')),
    ld_r_n('a', u8(0)),
    jr(ref('kana_got_answer')),

    label('kana_check_down'),
    ld_r_r('a', 'b'),
    and_n(u8(JOY.DOWN)),
    jr_cc('z', ref('kana_check_left')),
    ld_r_n('a', u8(1)),
    jr(ref('kana_got_answer')),

    label('kana_check_left'),
    ld_r_r('a', 'b'),
    and_n(u8(JOY.LEFT)),
    jr_cc('z', ref('kana_check_right')),
    ld_r_n('a', u8(2)),
    jr(ref('kana_got_answer')),

    label('kana_check_right'),
    ld_r_r('a', 'b'),
    and_n(u8(JOY.RIGHT)),
    ret_cc('z'), // no d-pad input
    ld_r_n('a', u8(3)),

    label('kana_got_answer'),
    ld_nn_a(MEM.KANA_ANSWER),

    // Compare with correct
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.KANA_CORRECT),
    cp_r('b'),
    jr_cc('nz', ref('kana_wrong')),

    // Correct! Add score
    ld_a_nn(MEM.KANA_SCORE),
    add_n(u8(SCORE_PER_CORRECT)),
    jr_cc('nc', ref('kana_score_ok')), // no carry = no overflow
    ld_r_n('a', u8(255)), // cap at 255
    label('kana_score_ok'),
    ld_nn_a(MEM.KANA_SCORE),

    label('kana_wrong'),
    // Enter feedback state
    ld_r_n('a', u8(3)),
    ld_nn_a(MEM.KANA_STATE),
    ld_r_n('a', u8(FEEDBACK_FRAMES)),
    ld_nn_a(MEM.DLG_DELAY),

    ret(),

    // =================================================================
    // kana_feedback — Countdown then load next question or finish
    // =================================================================
    label('kana_feedback'),
    ld_a_nn(MEM.DLG_DELAY),
    dec_r('a'),
    ld_nn_a(MEM.DLG_DELAY),
    ret_cc('nz'), // still counting down

    // Advance question index
    ld_a_nn(MEM.KANA_Q_IDX),
    inc_r('a'),
    ld_nn_a(MEM.KANA_Q_IDX),

    // Load next question (kana_load_question checks for end sentinel)
    jp(ref('kana_load_question')),

    // =================================================================
    // kana_all_done — All questions answered. Set state to idle.
    // =================================================================
    label('kana_all_done'),

    // Turn LCD back on (kana_load_question turned it off)
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    xor_r('a'),
    ld_nn_a(MEM.KANA_STATE), // idle
    ret(),
  ];
}
