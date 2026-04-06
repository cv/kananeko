/**
 * Kana mini-game engine with randomized answers and lives/scoring.
 *
 * Shows a word with one kana blanked out. Four options appear at screen
 * edges mapped to d-pad directions — positions shuffled each question
 * using the DIV register as entropy source.
 *
 * Scoring: +100 first try, +10 second, +0 third correct, -100 death.
 * Lives: 3 per round. Three wrong on one question = lose a life.
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

import { type Op, type TileIndex, ref, u8, u16 } from '../asm/types';
import {
  label,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ld_a_nn,
  ld_nn_a,
  ld_a_de,
  ldi_hl_a,
  ldh_a_n,
  ldh_n_a,
  xor_r,
  and_n,
  cp_n,
  cp_r,
  add_r,
  add_n,
  adc_n,
  sub_n,
  sbc_n,
  inc_r,
  inc_rr,
  dec_r,
  jr,
  jr_cc,
  jp,
  jp_cc,
  call,
  ret,
  ret_cc,
} from '../asm/ops';
import { HW, JOY, LCDC, MEM } from '../asm/hardware';
import { requireTile, textToTiles } from './font';
import { CAT_TILES } from './font-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single kana character string (hiragana or katakana) */
export type Kana = string;

export interface KanaQuestion {
  /** The full word to display */
  word: string;
  /** Index of the kana to blank out (0-based) */
  blankIndex: number;
  /** The correct kana for the blank */
  correct: Kana;
  /** Three wrong kana (should be visually similar distractors) */
  distractors: [Kana, Kana, Kana];
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const MAP_COLS = 32;
const WORD_ROW = 6;

const OPT_UP = { row: 3, col: 10 };
const OPT_DOWN = { row: 9, col: 10 };
const OPT_LEFT = { row: 6, col: 2 };
const OPT_RIGHT = { row: 6, col: 17 };
// Positions ordered: 0=UP, 1=DOWN, 2=LEFT, 3=RIGHT (matches direction encoding)

// Game constants
const FEEDBACK_FRAMES = 30;
const INITIAL_LIVES = 3;
const SCORE_FIRST_TRY = 100;
const SCORE_SECOND_TRY = 10;
const SCORE_DEATH_PENALTY = 100;
const MAX_ATTEMPTS = 2; // 0-indexed: attempt 0, 1, 2 = 3 tries

// State machine values
const STATE_IDLE = 0;
const STATE_AWAITING = 2;
const STATE_CORRECT_FB = 3;
const STATE_WRONG_FB = 4;

// Direction encoding (matches d-pad bit order)
const DIR_UP = 0;
const DIR_DOWN = 1;
const DIR_LEFT = 2;
const DIR_RIGHT = 3;

function tilemapAddr(row: number, col: number): number {
  return 0x9800 + row * MAP_COLS + col;
}

// Tile constants
const BLANK_TILE: TileIndex = requireTile(CAT_TILES.BLANK);
const HEART_FULL: TileIndex = requireTile(CAT_TILES.HEART_FULL);
const HEART_EMPTY: TileIndex = requireTile(CAT_TILES.HEART_EMPTY);
const DIGIT_TILES: TileIndex[] = '0123456789'.split('').map((ch) => requireTile(ch));

// ---------------------------------------------------------------------------
// Data encoder
// ---------------------------------------------------------------------------

export function buildKanaData(questions: KanaQuestion[]): Uint8Array {
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
// Assembly: draw helpers (generated at build time, no register conflicts)
// ---------------------------------------------------------------------------

/** Generate 16-bit score add: SCORE += delta */
function buildAddScore(delta: number): Op[] {
  return [
    ld_a_nn(MEM.KANA_SCORE_LO),
    add_n(u8(delta)),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_a_nn(MEM.KANA_SCORE_HI),
    adc_n(u8(0)),
    ld_nn_a(MEM.KANA_SCORE_HI),
  ];
}

/** Generate 16-bit score subtract: SCORE -= delta */
function buildSubScore(delta: number): Op[] {
  return [
    ld_a_nn(MEM.KANA_SCORE_LO),
    sub_n(u8(delta)),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_a_nn(MEM.KANA_SCORE_HI),
    sbc_n(u8(0)),
    ld_nn_a(MEM.KANA_SCORE_HI),
  ];
}

let heartLabelCounter = 0;

/** Generate assembly to draw a heart (full/empty) based on lives threshold */
function buildHeartAtCol(col: number, minLives: number): Op[] {
  const id = String(heartLabelCounter++);
  return [
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(minLives)),
    jr_cc('c', ref(`kana_h${id}_empty`)),
    ld_r_n('a', u8(HEART_FULL)),
    jr(ref(`kana_h${id}_draw`)),
    label(`kana_h${id}_empty`),
    ld_r_n('a', u8(HEART_EMPTY)),
    label(`kana_h${id}_draw`),
    ...buildDrawTileAt(0, col, 'from_a'),
  ];
}

/** Draw a single tile at a fixed tilemap address (LCD must be off) */
function buildDrawTileAt(row: number, col: number, tileExpr: 'from_a' | number): Op[] {
  const ops: Op[] = [ld_rr_nn('hl', u16(tilemapAddr(row, col)))];
  if (tileExpr !== 'from_a') {
    ops.push(ld_r_n('a', u8(tileExpr)));
  }
  ops.push(ldi_hl_a());
  return ops;
}

/**
 * Build the HUD drawing subroutine (called with LCD off).
 * Row 0: ♥♥♥ followed by 4-digit score display.
 *
 * Hearts: read KANA_LIVES, draw full/empty hearts at cols 1-3.
 * Score: read KANA_SCORE_LO (low byte only, 0-255), convert to
 * 3 decimal digits and draw at cols 15-18. Shows "000"-"255".
 * For negative scores (death penalty), shows "000".
 */
function buildDrawHudOps(): Op[] {
  // Digit tile lookup: DIGIT_TILES[0] through DIGIT_TILES[9]
  // We need these as immediate values in assembly.
  const d0 = DIGIT_TILES[0];
  if (d0 === undefined) throw new Error('Missing digit 0 tile');

  return [
    label('kana_draw_hud'),

    // === Draw 3 hearts at row 0, cols 1-3 ===
    ...buildHeartAtCol(1, 1),
    ...buildHeartAtCol(2, 2),
    ...buildHeartAtCol(3, 3),

    // === Draw 4-digit score at row 0, cols 14-17 ===
    // Score is 16-bit (SCORE_HI:SCORE_LO). Max 2500. If negative, show 0000.
    ld_a_nn(MEM.KANA_SCORE_HI),
    and_n(u8(0x80)),
    jr_cc('z', ref('kana_score_positive')),
    // Negative: draw "0000"
    ...buildDrawTileAt(0, 14, d0),
    ...buildDrawTileAt(0, 15, d0),
    ...buildDrawTileAt(0, 16, d0),
    ...buildDrawTileAt(0, 17, d0),
    jr(ref('kana_hud_done')),

    label('kana_score_positive'),
    // Load 16-bit score into D:E (D=hi, E=lo)
    ld_a_nn(MEM.KANA_SCORE_HI),
    ld_r_r('d', 'a'),
    ld_a_nn(MEM.KANA_SCORE_LO),
    ld_r_r('e', 'a'),

    // Thousands: subtract 1000 (0x03E8) repeatedly
    // 1000 = hi:0x03 lo:0xE8
    ld_r_n('c', u8(0)),
    label('kana_thousands'),
    // Compare DE >= 1000: check D > 3, or D == 3 and E >= 0xE8
    ld_r_r('a', 'd'),
    cp_n(u8(4)), // if D >= 4, definitely >= 1000
    jr_cc('nc', ref('kana_th_sub')),
    cp_n(u8(3)),
    jr_cc('c', ref('kana_thousands_done')), // D < 3, done
    // D == 3, check E >= 0xE8
    ld_r_r('a', 'e'),
    cp_n(u8(0xe8)),
    jr_cc('c', ref('kana_thousands_done')),
    label('kana_th_sub'),
    // DE -= 1000: E -= 0xE8 with borrow into D
    ld_r_r('a', 'e'),
    sub_n(u8(0xe8)),
    ld_r_r('e', 'a'),
    ld_r_r('a', 'd'),
    sbc_n(u8(3)),
    ld_r_r('d', 'a'),
    inc_r('c'),
    jr(ref('kana_thousands')),
    label('kana_thousands_done'),
    ld_r_r('a', 'c'),
    add_n(u8(d0)),
    ...buildDrawTileAt(0, 14, 'from_a'),

    // Now DE < 1000. D is 0-3, E is 0-255. Combine to single byte for hundreds.
    // Value = D*256 + E. Since D <= 3, max = 999.
    // Hundreds: D tells us how many 256s. 256 = 2*100 + 56.
    // Simpler: just do 8-bit hundreds on E, adding D*2 to hundreds count (plus leftover).
    // Actually simplest: convert DE to a single value.
    // Since D <= 3: if D=0, val=E. If D=1, val=E+256. Etc.
    // For hundreds digit extraction, just subtract 100 in a loop that handles the borrow.

    // Hundreds: subtract 100 (0x64) from DE repeatedly
    ld_r_n('c', u8(0)),
    label('kana_hundreds'),
    // Check DE >= 100
    ld_r_r('a', 'd'),
    cp_n(u8(1)), // D >= 1 means >= 256 > 100
    jr_cc('nc', ref('kana_h_sub')),
    // D == 0, check E >= 100
    ld_r_r('a', 'e'),
    cp_n(u8(100)),
    jr_cc('c', ref('kana_hundreds_done')),
    label('kana_h_sub'),
    ld_r_r('a', 'e'),
    sub_n(u8(100)),
    ld_r_r('e', 'a'),
    ld_r_r('a', 'd'),
    sbc_n(u8(0)),
    ld_r_r('d', 'a'),
    inc_r('c'),
    jr(ref('kana_hundreds')),
    label('kana_hundreds_done'),
    ld_r_r('a', 'c'),
    add_n(u8(d0)),
    ...buildDrawTileAt(0, 15, 'from_a'),

    // Now D=0, E < 100. Standard 8-bit tens/ones on E.
    ld_r_r('b', 'e'),

    // Tens
    ld_r_n('c', u8(0)),
    label('kana_tens'),
    ld_r_r('a', 'b'),
    cp_n(u8(10)),
    jr_cc('c', ref('kana_tens_done')),
    sub_n(u8(10)),
    ld_r_r('b', 'a'),
    inc_r('c'),
    jr(ref('kana_tens')),
    label('kana_tens_done'),
    ld_r_r('a', 'c'),
    add_n(u8(d0)),
    ...buildDrawTileAt(0, 16, 'from_a'),

    // Ones
    ld_r_r('a', 'b'),
    add_n(u8(d0)),
    ...buildDrawTileAt(0, 17, 'from_a'),

    label('kana_hud_done'),
    ret(),
  ];
}

// ---------------------------------------------------------------------------
// Assembly: kana engine
// ---------------------------------------------------------------------------

export function buildKanaEngine(): Op[] {
  return [
    // =================================================================
    // kana_start — DE = question data pointer. Init lives/score.
    // =================================================================
    label('kana_start'),
    ld_r_r('a', 'e'),
    ld_nn_a(MEM.DLG_STR_LO),
    ld_r_r('a', 'd'),
    ld_nn_a(MEM.DLG_STR_HI),

    // Score persists across scenes — don't reset it here.
    // Lives reset each scene (3 fresh lives per kana round).
    xor_r('a'),
    ld_nn_a(MEM.KANA_Q_IDX),
    ld_nn_a(MEM.KANA_ATTEMPTS),

    ld_r_n('a', u8(INITIAL_LIVES)),
    ld_nn_a(MEM.KANA_LIVES),

    jp(ref('kana_load_question')),

    // =================================================================
    // kana_load_question — Read question from ROM, shuffle, draw.
    // =================================================================
    label('kana_load_question'),

    // VBlank + LCD off
    label('kana_vblank'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('kana_vblank')),
    xor_r('a'),
    ldh_n_a(HW.LCDC),

    // Clear tilemap
    ld_rr_nn('hl', u16(0x9800)),
    xor_r('a'),
    ld_r_n('b', u8(4)),
    ld_r_n('c', u8(0)),
    label('kana_clear'),
    ldi_hl_a(),
    dec_r('c'),
    jr_cc('nz', ref('kana_clear')),
    dec_r('b'),
    jr_cc('nz', ref('kana_clear')),

    // Draw HUD (hearts + score) on row 0
    call(ref('kana_draw_hud')),

    // Load ROM pointer into DE
    ld_a_nn(MEM.DLG_STR_LO),
    ld_r_r('e', 'a'),
    ld_a_nn(MEM.DLG_STR_HI),
    ld_r_r('d', 'a'),

    // Read word_length (first byte)
    ld_a_de(),
    inc_rr('de'),
    cp_n(u8(0)),
    jp_cc('z', ref('kana_all_done')),

    ld_r_r('c', 'a'), // C = word length

    // Draw word tiles: read from [DE++], write to VRAM at WORD_ROW, col 7
    ld_rr_nn('hl', u16(tilemapAddr(WORD_ROW, 7))),
    ld_r_n('b', u8(0)), // B = tile counter

    label('kana_draw_word'),
    ld_a_de(), // read tile from ROM
    inc_rr('de'),
    ldi_hl_a(), // write to VRAM
    inc_r('b'),
    dec_r('c'),
    jr_cc('nz', ref('kana_draw_word')),

    // DE now points to blank_position byte
    // Read blank_position
    ld_a_de(),
    inc_rr('de'),
    ld_r_r('b', 'a'), // B = blank_position

    // Overwrite the blanked tile in VRAM with BLANK_TILE
    // VRAM address = tilemapAddr(WORD_ROW, 7) + blank_position
    ld_rr_nn('hl', u16(tilemapAddr(WORD_ROW, 7))),
    // Add blank_position (B) to HL: A = L + B, carry into H
    ld_r_r('c', 'b'),
    ld_r_r('a', 'l'),
    add_r('c'),
    ld_r_r('l', 'a'),
    jr_cc('nc', ref('kana_no_carry')),
    inc_r('h'),
    label('kana_no_carry'),
    ld_r_n('a', u8(BLANK_TILE)),
    ldi_hl_a(),

    // Read correct_tile and 3 distractors into KANA_SHUFFLE buffer
    // DE points to correct_tile
    ld_rr_nn('hl', u16(MEM.KANA_SHUFFLE)),
    ld_a_de(), // correct
    inc_rr('de'),
    ldi_hl_a(),
    ld_a_de(), // distractor 1
    inc_rr('de'),
    ldi_hl_a(),
    ld_a_de(), // distractor 2
    inc_rr('de'),
    ldi_hl_a(),
    ld_a_de(), // distractor 3
    inc_rr('de'),
    ldi_hl_a(),

    // Save updated ROM pointer
    ld_r_r('a', 'e'),
    ld_nn_a(MEM.DLG_STR_LO),
    ld_r_r('a', 'd'),
    ld_nn_a(MEM.DLG_STR_HI),

    // === RANDOMIZE: use DIV register to pick which position gets the correct answer ===
    // buffer = [correct, d1, d2, d3]. DIV & 3 determines correct's position.
    ldh_a_n(HW.DIV),
    and_n(u8(3)),
    ld_nn_a(MEM.KANA_CORRECT_POS),

    // Dispatch on correct_pos to draw tiles in rotated order
    ld_a_nn(MEM.KANA_CORRECT_POS),

    // Dispatch: 4 orderings
    cp_n(u8(0)),
    jr_cc('nz', ref('kana_layout_1')),
    // correct_pos=0: UP=buf[0], DOWN=buf[1], LEFT=buf[2], RIGHT=buf[3]
    ld_a_nn(MEM.KANA_SHUFFLE),
    ...buildDrawTileAt(OPT_UP.row, OPT_UP.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE1),
    ...buildDrawTileAt(OPT_DOWN.row, OPT_DOWN.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE2),
    ...buildDrawTileAt(OPT_LEFT.row, OPT_LEFT.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE3),
    ...buildDrawTileAt(OPT_RIGHT.row, OPT_RIGHT.col, 'from_a'),
    jp(ref('kana_layout_done')),

    label('kana_layout_1'),
    cp_n(u8(1)),
    jr_cc('nz', ref('kana_layout_2')),
    // correct_pos=1: UP=buf[3], DOWN=buf[0], LEFT=buf[1], RIGHT=buf[2]
    ld_a_nn(MEM.KANA_SHUFFLE3),
    ...buildDrawTileAt(OPT_UP.row, OPT_UP.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE),
    ...buildDrawTileAt(OPT_DOWN.row, OPT_DOWN.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE1),
    ...buildDrawTileAt(OPT_LEFT.row, OPT_LEFT.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE2),
    ...buildDrawTileAt(OPT_RIGHT.row, OPT_RIGHT.col, 'from_a'),
    jp(ref('kana_layout_done')),

    label('kana_layout_2'),
    cp_n(u8(2)),
    jr_cc('nz', ref('kana_layout_3')),
    // correct_pos=2: UP=buf[2], DOWN=buf[3], LEFT=buf[0], RIGHT=buf[1]
    ld_a_nn(MEM.KANA_SHUFFLE2),
    ...buildDrawTileAt(OPT_UP.row, OPT_UP.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE3),
    ...buildDrawTileAt(OPT_DOWN.row, OPT_DOWN.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE),
    ...buildDrawTileAt(OPT_LEFT.row, OPT_LEFT.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE1),
    ...buildDrawTileAt(OPT_RIGHT.row, OPT_RIGHT.col, 'from_a'),
    jp(ref('kana_layout_done')),

    label('kana_layout_3'),
    // correct_pos=3: UP=buf[1], DOWN=buf[2], LEFT=buf[3], RIGHT=buf[0]
    ld_a_nn(MEM.KANA_SHUFFLE1),
    ...buildDrawTileAt(OPT_UP.row, OPT_UP.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE2),
    ...buildDrawTileAt(OPT_DOWN.row, OPT_DOWN.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE3),
    ...buildDrawTileAt(OPT_LEFT.row, OPT_LEFT.col, 'from_a'),
    ld_a_nn(MEM.KANA_SHUFFLE),
    ...buildDrawTileAt(OPT_RIGHT.row, OPT_RIGHT.col, 'from_a'),

    label('kana_layout_done'),

    // LCD on
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    // Reset attempts, set state to awaiting
    xor_r('a'),
    ld_nn_a(MEM.KANA_ATTEMPTS),
    ld_r_n('a', u8(STATE_AWAITING)),
    ld_nn_a(MEM.KANA_STATE),

    ld_r_n('a', u8(FEEDBACK_FRAMES)),
    ld_nn_a(MEM.DLG_DELAY),

    ret(),

    // =================================================================
    // kana_update — Dispatch on state.
    // =================================================================
    label('kana_update'),
    ld_a_nn(MEM.KANA_STATE),
    cp_n(u8(STATE_IDLE)),
    ret_cc('z'),

    cp_n(u8(STATE_AWAITING)),
    jp_cc('z', ref('kana_await_input')),

    cp_n(u8(STATE_CORRECT_FB)),
    jp_cc('z', ref('kana_correct_fb')),

    cp_n(u8(STATE_WRONG_FB)),
    jp_cc('z', ref('kana_wrong_fb')),

    ret(),

    // =================================================================
    // kana_await_input — Check d-pad, compare with correct position.
    // =================================================================
    label('kana_await_input'),
    ld_a_nn(MEM.JOYPAD_NEW),
    ld_r_r('b', 'a'),

    // Map d-pad to direction index
    and_n(u8(JOY.UP)),
    jr_cc('z', ref('kana_chk_down')),
    ld_r_n('a', u8(DIR_UP)),
    jr(ref('kana_got_answer')),

    label('kana_chk_down'),
    ld_r_r('a', 'b'),
    and_n(u8(JOY.DOWN)),
    jr_cc('z', ref('kana_chk_left')),
    ld_r_n('a', u8(DIR_DOWN)),
    jr(ref('kana_got_answer')),

    label('kana_chk_left'),
    ld_r_r('a', 'b'),
    and_n(u8(JOY.LEFT)),
    jr_cc('z', ref('kana_chk_right')),
    ld_r_n('a', u8(DIR_LEFT)),
    jr(ref('kana_got_answer')),

    label('kana_chk_right'),
    ld_r_r('a', 'b'),
    and_n(u8(JOY.RIGHT)),
    ret_cc('z'), // no d-pad input
    ld_r_n('a', u8(DIR_RIGHT)),

    label('kana_got_answer'),
    ld_nn_a(MEM.KANA_ANSWER),

    // Compare with KANA_CORRECT_POS
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.KANA_CORRECT_POS),
    cp_r('b'),
    jr_cc('nz', ref('kana_wrong')),

    // === CORRECT ===
    // Score based on attempt number
    ld_a_nn(MEM.KANA_ATTEMPTS),
    cp_n(u8(0)),
    jr_cc('nz', ref('kana_score_attempt1')),
    ...buildAddScore(SCORE_FIRST_TRY),
    jr(ref('kana_correct_done')),

    label('kana_score_attempt1'),
    cp_n(u8(1)),
    jr_cc('nz', ref('kana_correct_done')),
    ...buildAddScore(SCORE_SECOND_TRY),
    // Attempt 2: +0 (fall through)

    label('kana_correct_done'),
    ld_r_n('a', u8(3)), // state = correct feedback
    ld_nn_a(MEM.KANA_STATE),
    ld_r_n('a', u8(FEEDBACK_FRAMES)),
    ld_nn_a(MEM.DLG_DELAY),
    ret(),

    // === WRONG ===
    label('kana_wrong'),
    ld_a_nn(MEM.KANA_ATTEMPTS),
    cp_n(u8(MAX_ATTEMPTS)),
    jr_cc('z', ref('kana_death')),

    // Not dead yet — increment attempts, show wrong feedback, re-prompt
    inc_r('a'),
    ld_nn_a(MEM.KANA_ATTEMPTS),
    ld_r_n('a', u8(STATE_WRONG_FB)), // state = wrong feedback (re-prompt)
    ld_nn_a(MEM.KANA_STATE),
    ld_r_n('a', u8(FEEDBACK_FRAMES)),
    ld_nn_a(MEM.DLG_DELAY),
    ret(),

    // === DEATH (3rd wrong) ===
    label('kana_death'),
    ...buildSubScore(SCORE_DEATH_PENALTY),

    // Lose a life
    ld_a_nn(MEM.KANA_LIVES),
    dec_r('a'),
    ld_nn_a(MEM.KANA_LIVES),

    // Show wrong feedback then advance (don't re-prompt)
    ld_r_n('a', u8(STATE_CORRECT_FB)),
    ld_nn_a(MEM.KANA_STATE),
    ld_r_n('a', u8(FEEDBACK_FRAMES)),
    ld_nn_a(MEM.DLG_DELAY),
    ret(),

    // =================================================================
    // kana_correct_fb — Correct/death feedback countdown, then next Q.
    // =================================================================
    label('kana_correct_fb'),
    ld_a_nn(MEM.DLG_DELAY),
    dec_r('a'),
    ld_nn_a(MEM.DLG_DELAY),
    ret_cc('nz'),

    // Advance to next question
    ld_a_nn(MEM.KANA_Q_IDX),
    inc_r('a'),
    ld_nn_a(MEM.KANA_Q_IDX),

    jp(ref('kana_load_question')),

    // =================================================================
    // kana_wrong_fb — Wrong feedback countdown, then re-prompt same Q.
    // =================================================================
    label('kana_wrong_fb'),
    ld_a_nn(MEM.DLG_DELAY),
    dec_r('a'),
    ld_nn_a(MEM.DLG_DELAY),
    ret_cc('nz'),

    // Return to awaiting input (same question, don't advance)
    ld_r_n('a', u8(STATE_AWAITING)),
    ld_nn_a(MEM.KANA_STATE),
    ret(),

    // =================================================================
    // kana_all_done — All questions finished.
    // =================================================================
    label('kana_all_done'),
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    xor_r('a'),
    ld_nn_a(MEM.KANA_STATE),
    ret(),

    // =================================================================
    // kana_draw_hud — Draw hearts + score on row 0 (LCD must be off).
    // =================================================================
    ...buildDrawHudOps(),
  ];
}
