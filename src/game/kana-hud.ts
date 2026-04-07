/**
 * Kana mini-game HUD: hearts display + 4-digit score.
 *
 * Generates the assembly subroutine `kana_draw_hud` which draws
 * 3 life hearts and a 4-digit BCD score on tilemap row 0.
 * Also provides score arithmetic helpers used by the kana engine.
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
  and_n,
  cp_n,
  add_n,
  adc_n,
  sub_n,
  sbc_n,
  inc_r,
  jr,
  jr_cc,
  ret,
} from '../asm/ops';
import { MEM } from '../asm/hardware';
import { type TileIndex } from '../asm/types';
import { requireTile } from './font';
import { CAT_TILES } from './font-data';

// ---------------------------------------------------------------------------
// Tile constants
// ---------------------------------------------------------------------------

const MAP_COLS = 32;

const HEART_FULL: TileIndex = requireTile(CAT_TILES.HEART_FULL);
const HEART_EMPTY: TileIndex = requireTile(CAT_TILES.HEART_EMPTY);
const DIGIT_TILES: TileIndex[] = '0123456789'.split('').map((ch) => requireTile(ch));

function tilemapAddr(row: number, col: number): number {
  return 0x9800 + row * MAP_COLS + col;
}

// ---------------------------------------------------------------------------
// Score arithmetic helpers
// ---------------------------------------------------------------------------

/** Generate 16-bit score add: SCORE += delta */
export function buildAddScore(delta: number): Op[] {
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
export function buildSubScore(delta: number): Op[] {
  return [
    ld_a_nn(MEM.KANA_SCORE_LO),
    sub_n(u8(delta)),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_a_nn(MEM.KANA_SCORE_HI),
    sbc_n(u8(0)),
    ld_nn_a(MEM.KANA_SCORE_HI),
  ];
}

// ---------------------------------------------------------------------------
// Heart drawing
// ---------------------------------------------------------------------------

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
export function buildDrawTileAt(row: number, col: number, tileExpr: 'from_a' | number): Op[] {
  const ops: Op[] = [ld_rr_nn('hl', u16(tilemapAddr(row, col)))];
  if (tileExpr !== 'from_a') {
    ops.push(ld_r_n('a', u8(tileExpr)));
  }
  ops.push(ldi_hl_a());
  return ops;
}

// ---------------------------------------------------------------------------
// HUD subroutine
// ---------------------------------------------------------------------------

/**
 * Build the HUD drawing subroutine (called with LCD off).
 * Row 0: ♥♥♥ followed by 4-digit score display.
 *
 * Hearts: read KANA_LIVES, draw full/empty hearts at cols 1-3.
 * Score: read 16-bit KANA_SCORE, convert to 4 decimal digits via
 * repeated subtraction (BCD), draw at cols 14-17.
 */
export function buildDrawHudOps(): Op[] {
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
    ld_r_n('c', u8(0)),
    label('kana_thousands'),
    ld_r_r('a', 'd'),
    cp_n(u8(4)),
    jr_cc('nc', ref('kana_th_sub')),
    cp_n(u8(3)),
    jr_cc('c', ref('kana_thousands_done')),
    ld_r_r('a', 'e'),
    cp_n(u8(0xe8)),
    jr_cc('c', ref('kana_thousands_done')),
    label('kana_th_sub'),
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

    // Hundreds: subtract 100 (0x64) from DE repeatedly
    ld_r_n('c', u8(0)),
    label('kana_hundreds'),
    ld_r_r('a', 'd'),
    cp_n(u8(1)),
    jr_cc('nc', ref('kana_h_sub')),
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

    // Tens: E < 100, standard 8-bit
    ld_r_r('b', 'e'),
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
