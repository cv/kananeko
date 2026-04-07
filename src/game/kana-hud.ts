/**
 * Kana mini-game HUD: hearts + centered score + delta flash.
 *
 * Row 0 layout (20 visible cols):
 *   Cols 1-3:   ♥♥♥ (hearts)
 *   Cols 8-11:  0000 (4-digit score, centered)
 *   Cols 15-18: +100 / -005 (delta flash, right side)
 *
 * Provides:
 *   kana_draw_hud  — full HUD redraw (call with VRAM accessible)
 *   hud_update     — VBlank-safe: waits for VBlank then calls kana_draw_hud
 *   buildAddScore / buildSubScore — 16-bit score arithmetic
 *   buildSetDelta  — set delta type + timer after score changes
 */

import { type Op, type TileIndex, ref, u8, u16 } from '../asm/types';
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
  dec_r,
  inc_r,
  jr,
  jr_cc,
  jp,
  ret,
} from '../asm/ops';
import { MEM } from '../asm/hardware';
import { requireTile, requireTiles } from './font';
import { CAT_TILES } from './font-data';

// ---------------------------------------------------------------------------
// Layout & tile constants
// ---------------------------------------------------------------------------

const MAP_COLS = 32;

// Row 0 column positions
const HEART_COL = 1; // Hearts at cols 1, 2, 3
const SCORE_COL = 8; // Score at cols 8, 9, 10, 11
const DELTA_COL = 15; // Delta at cols 15, 16, 17, 18

const DELTA_FRAMES = 30; // How long the delta flash shows

// Delta type enum values (stored in DELTA_TYPE WRAM)
export const DELTA_PLUS_100 = 1;
export const DELTA_PLUS_10 = 2;
export const DELTA_MINUS_5 = 3;
export const DELTA_MINUS_100 = 4;

export type DeltaType =
  | typeof DELTA_PLUS_100
  | typeof DELTA_PLUS_10
  | typeof DELTA_MINUS_5
  | typeof DELTA_MINUS_100;

export type ScoreDelta = 5 | 10 | 100;

type HudTileExpr = TileIndex | 'from_a';
type HudTileRun = readonly [TileIndex, TileIndex, TileIndex, TileIndex];

const HEART_FULL: TileIndex = requireTile(CAT_TILES.HEART_FULL);
const HEART_EMPTY: TileIndex = requireTile(CAT_TILES.HEART_EMPTY);
const DIGIT_TILES = requireTiles(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const);
const PLUS_TILE: TileIndex = requireTile('+');
const MINUS_TILE: TileIndex = requireTile('-');
const SPACE_TILE: TileIndex = requireTile(' ');

const [d0, d1, , , , d5] = DIGIT_TILES;
const SCORE_ZERO_TILES: HudTileRun = [d0, d0, d0, d0];
const DELTA_CLEAR_TILES: HudTileRun = [SPACE_TILE, SPACE_TILE, SPACE_TILE, SPACE_TILE];
const DELTA_TILE_RUNS: Record<DeltaType, HudTileRun> = {
  [DELTA_PLUS_100]: [PLUS_TILE, d1, d0, d0],
  [DELTA_PLUS_10]: [SPACE_TILE, PLUS_TILE, d1, d0],
  [DELTA_MINUS_5]: [SPACE_TILE, SPACE_TILE, MINUS_TILE, d5],
  [DELTA_MINUS_100]: [MINUS_TILE, d1, d0, d0],
};

function tilemapAddr(row: number, col: number): number {
  return 0x9800 + row * MAP_COLS + col;
}

// ---------------------------------------------------------------------------
// Score arithmetic helpers
// ---------------------------------------------------------------------------

/** Generate 16-bit score add: SCORE += delta */
export function buildAddScore(delta: ScoreDelta): Op[] {
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
export function buildSubScore(delta: ScoreDelta): Op[] {
  return [
    ld_a_nn(MEM.KANA_SCORE_LO),
    sub_n(u8(delta)),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_a_nn(MEM.KANA_SCORE_HI),
    sbc_n(u8(0)),
    ld_nn_a(MEM.KANA_SCORE_HI),
  ];
}

/** Set DELTA_TYPE and DELTA_TIMER after a score change */
export function buildSetDelta(deltaType: DeltaType): Op[] {
  return [
    ld_r_n('a', u8(deltaType)),
    ld_nn_a(MEM.DELTA_TYPE),
    ld_r_n('a', u8(DELTA_FRAMES)),
    ld_nn_a(MEM.DELTA_TIMER),
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

/** Draw a single tile at a fixed tilemap address (VRAM must be accessible) */
export function buildDrawTileAt(row: number, col: number, tileExpr: HudTileExpr): Op[] {
  const ops: Op[] = [ld_rr_nn('hl', u16(tilemapAddr(row, col)))];
  if (tileExpr !== 'from_a') {
    ops.push(ld_r_n('a', u8(tileExpr)));
  }
  ops.push(ldi_hl_a());
  return ops;
}

function buildDrawTilesAt(row: number, startCol: number, tiles: readonly HudTileExpr[]): Op[] {
  return tiles.flatMap((tile, offset) => buildDrawTileAt(row, startCol + offset, tile));
}

// ---------------------------------------------------------------------------
// HUD subroutines
// ---------------------------------------------------------------------------

/**
 * Build both HUD subroutines:
 *   kana_draw_hud — full redraw (hearts + score + delta). VRAM must be accessible.
 *   hud_update    — waits for VBlank, then calls kana_draw_hud. Safe from game loops.
 */
export function buildDrawHudOps(): Op[] {
  return [
    // === hud_update: called from game loops after HALT (VBlank) ===
    // Falls through to kana_draw_hud to refresh score + delta.
    label('hud_update'),

    // === kana_draw_hud: full HUD redraw (VRAM must be accessible) ===
    label('kana_draw_hud'),

    // --- Hearts at cols 1-3 ---
    ...buildHeartAtCol(HEART_COL, 1),
    ...buildHeartAtCol(HEART_COL + 1, 2),
    ...buildHeartAtCol(HEART_COL + 2, 3),

    // --- Score at cols 8-11 (centered) ---
    // If negative, show 0000
    ld_a_nn(MEM.KANA_SCORE_HI),
    and_n(u8(0x80)),
    jr_cc('z', ref('kana_score_positive')),
    ...buildDrawTilesAt(0, SCORE_COL, SCORE_ZERO_TILES),
    jp(ref('kana_score_done')),

    label('kana_score_positive'),
    ld_a_nn(MEM.KANA_SCORE_HI),
    ld_r_r('d', 'a'),
    ld_a_nn(MEM.KANA_SCORE_LO),
    ld_r_r('e', 'a'),

    // Thousands
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
    ...buildDrawTileAt(0, SCORE_COL, 'from_a'),

    // Hundreds
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
    ...buildDrawTileAt(0, SCORE_COL + 1, 'from_a'),

    // Tens
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
    ...buildDrawTileAt(0, SCORE_COL + 2, 'from_a'),

    // Ones
    ld_r_r('a', 'b'),
    add_n(u8(d0)),
    ...buildDrawTileAt(0, SCORE_COL + 3, 'from_a'),

    label('kana_score_done'),

    // --- Delta flash at cols 15-18 ---
    ld_a_nn(MEM.DELTA_TIMER),
    cp_n(u8(0)),
    jr_cc('z', ref('delta_clear')),

    // Decrement timer
    dec_r('a'),
    ld_nn_a(MEM.DELTA_TIMER),

    // Dispatch on delta type
    ld_a_nn(MEM.DELTA_TYPE),

    cp_n(u8(DELTA_PLUS_100)),
    jr_cc('nz', ref('delta_not_p100')),
    ...buildDrawTilesAt(0, DELTA_COL, DELTA_TILE_RUNS[DELTA_PLUS_100]),
    ret(),

    label('delta_not_p100'),
    cp_n(u8(DELTA_PLUS_10)),
    jr_cc('nz', ref('delta_not_p10')),
    ...buildDrawTilesAt(0, DELTA_COL, DELTA_TILE_RUNS[DELTA_PLUS_10]),
    ret(),

    label('delta_not_p10'),
    cp_n(u8(DELTA_MINUS_5)),
    jr_cc('nz', ref('delta_not_m5')),
    ...buildDrawTilesAt(0, DELTA_COL, DELTA_TILE_RUNS[DELTA_MINUS_5]),
    ret(),

    label('delta_not_m5'),
    // Must be DELTA_MINUS_100
    ...buildDrawTilesAt(0, DELTA_COL, DELTA_TILE_RUNS[DELTA_MINUS_100]),
    ret(),

    // Clear delta area (timer expired or type=0)
    label('delta_clear'),
    ...buildDrawTilesAt(0, DELTA_COL, DELTA_CLEAR_TILES),
    ret(),
  ];
}
