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
import {
  buildAddScore,
  buildSubScore,
  buildSetDelta,
  buildDrawTileAt,
  buildDrawHudOps,
  DELTA_PLUS_100,
  DELTA_PLUS_10,
  DELTA_MINUS_100,
} from './kana-hud';

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

// HUD drawing, score arithmetic, and tile helpers are in kana-hud.ts

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

    // Score persists across scenes — initialized at game start only.
    // Restock 1 life so the player can attempt kana even after dying in dialogue.
    xor_r('a'),
    ld_nn_a(MEM.KANA_Q_IDX),
    ld_nn_a(MEM.KANA_ATTEMPTS),
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(0)),
    jr_cc('nz', ref('kana_lives_ok')),
    ld_r_n('a', u8(1)),
    ld_nn_a(MEM.KANA_LIVES),
    label('kana_lives_ok'),

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
    ...buildSetDelta(DELTA_PLUS_100),
    jr(ref('kana_correct_done')),

    label('kana_score_attempt1'),
    cp_n(u8(1)),
    jr_cc('nz', ref('kana_correct_done')),
    ...buildAddScore(SCORE_SECOND_TRY),
    ...buildSetDelta(DELTA_PLUS_10),
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
    ...buildSetDelta(DELTA_MINUS_100),

    // Lose a life
    ld_a_nn(MEM.KANA_LIVES),
    dec_r('a'),
    ld_nn_a(MEM.KANA_LIVES),

    // If no lives left, end kana round immediately
    cp_n(u8(0)),
    jp_cc('z', ref('kana_all_done')),

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
