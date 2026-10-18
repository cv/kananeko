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

import { type Op, type TileIndex, type U16, ref, u8, u16 } from '../asm/types';
import {
  adc_n,
  add_n,
  add_r,
  call,
  cp_n,
  cp_r,
  dec_r,
  inc_r,
  jp_cc,
  jr,
  jr_cc,
  label,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ret,
  ret_cc,
  sbc_n,
  sub_n,
  sub_r,
} from '../asm/ops';
import { MEM } from '../asm/hardware';
import { switchCases, zeroBytes } from '../asm/macros';
import { at } from '../asm/util';
import { requireTile, requireTiles } from './font';
import { CAT_TILES } from './font-data';
import { type Quad } from './fixed';
import { MAX_LIVES } from './state';
import { tilemapAddr, type TilePosition } from './tilemap';
import { vramPut } from './video';

// ---------------------------------------------------------------------------
// Layout & tile constants
// ---------------------------------------------------------------------------

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

/** Dispatch order for the delta flash; the last entry is the fallback */
/**
 * Jump to hud_redraw if what the HUD shows (`shownAddr`) differs from the current
 * value (register B or a memory address). Clobbers A and C.
 */
function redrawIfChanged(shownAddr: U16, current: U16 | 'b'): Op[] {
  const load = current === 'b' ? [ld_r_r('c', 'b')] : [ld_a_nn(current), ld_r_r('c', 'a')];
  return [...load, ld_a_nn(shownAddr), cp_r('c'), jp_cc('nz', ref('hud_redraw'))];
}

const DELTA_TYPES = [DELTA_PLUS_100, DELTA_PLUS_10, DELTA_MINUS_5, DELTA_MINUS_100] as const;

export type DeltaType =
  typeof DELTA_PLUS_100 | typeof DELTA_PLUS_10 | typeof DELTA_MINUS_5 | typeof DELTA_MINUS_100;

export type ScoreDelta = 5 | 10 | 100;

type HudTileExpr = TileIndex | 'from_a';
type HudTileRun = Quad<TileIndex>;

const HEART_FULL: TileIndex = requireTile(CAT_TILES.HEART_FULL);
const HEART_EMPTY: TileIndex = requireTile(CAT_TILES.HEART_EMPTY);
const DIGIT_TILES = requireTiles(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const);
const PLUS_TILE: TileIndex = requireTile('+');
const MINUS_TILE: TileIndex = requireTile('-');
const SPACE_TILE: TileIndex = requireTile(' ');

const [d0, d1, , , , d5] = DIGIT_TILES;
const DELTA_CLEAR_TILES: HudTileRun = [SPACE_TILE, SPACE_TILE, SPACE_TILE, SPACE_TILE];
const DELTA_TILE_RUNS: Record<DeltaType, HudTileRun> = {
  [DELTA_PLUS_100]: [PLUS_TILE, d1, d0, d0],
  [DELTA_PLUS_10]: [SPACE_TILE, PLUS_TILE, d1, d0],
  [DELTA_MINUS_5]: [SPACE_TILE, SPACE_TILE, MINUS_TILE, d5],
  [DELTA_MINUS_100]: [MINUS_TILE, d1, d0, d0],
};

// ---------------------------------------------------------------------------
// Score arithmetic helpers
// ---------------------------------------------------------------------------

/** Generate 16-bit score add: SCORE += delta */
/** Highest score the 4-digit HUD can show */
export const MAX_SCORE = 9999;

/** Add to the score, capped at MAX_SCORE (clobbers A, B). */
export function buildAddScore(delta: ScoreDelta): Op[] {
  return [ld_r_n('a', u8(delta)), call(ref('score_add'))];
}

/** Generate 16-bit score subtract: SCORE -= delta */
/** Subtract from the score, stopping at zero (clobbers A, B). */
export function buildSubScore(delta: ScoreDelta): Op[] {
  return [ld_r_n('a', u8(delta)), call(ref('score_sub'))];
}

/** Subroutines score_add / score_sub: A = amount; the score stays within 0..MAX_SCORE. */
export function buildScoreRoutines(): Op[] {
  return [
    label('score_add'),
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.KANA_SCORE_LO),
    add_r('b'),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_a_nn(MEM.KANA_SCORE_HI),
    adc_n(u8(0)),
    ld_nn_a(MEM.KANA_SCORE_HI),
    // Cap: HI > hi(MAX) or (HI == hi(MAX) and LO > lo(MAX))
    cp_n(u8(MAX_SCORE >> 8)),
    ret_cc('c'),
    jr_cc('nz', ref('score_cap')),
    ld_a_nn(MEM.KANA_SCORE_LO),
    cp_n(u8((MAX_SCORE & 0xff) + 1)),
    ret_cc('c'),
    label('score_cap'),
    ld_r_n('a', u8(MAX_SCORE & 0xff)),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_r_n('a', u8(MAX_SCORE >> 8)),
    ld_nn_a(MEM.KANA_SCORE_HI),
    ret(),

    label('score_sub'),
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.KANA_SCORE_LO),
    sub_r('b'),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_a_nn(MEM.KANA_SCORE_HI),
    sbc_n(u8(0)),
    ld_nn_a(MEM.KANA_SCORE_HI),
    ret_cc('nc'),
    ...zeroBytes(MEM.KANA_SCORE_LO, MEM.KANA_SCORE_HI), // went below zero
    ret(),
  ];
}

/** Set DELTA_TYPE and DELTA_TIMER after a score change */
/** Hide the delta flash (for actions that change the score by nothing). */
export function buildClearDelta(): Op[] {
  return zeroBytes(MEM.DELTA_TIMER);
}

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

/** Draw the heart for life `n` (1-based): full if KANA_LIVES >= n, else empty */
function buildHeart(n: number): Op[] {
  const empty = `hud_heart${String(n)}_empty`;
  const draw = `hud_heart${String(n)}_draw`;
  return [
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(n)),
    jr_cc('c', ref(empty)),
    ld_r_n('a', u8(HEART_FULL)),
    jr(ref(draw)),
    label(empty),
    ld_r_n('a', u8(HEART_EMPTY)),
    label(draw),
    ...buildDrawTileAt(0, HEART_COL + n - 1, 'from_a'),
  ];
}

/** Draw a single tile at a fixed tilemap address (VRAM must be accessible) */
export function buildDrawTileAt(position: TilePosition, tileExpr: HudTileExpr): Op[];
export function buildDrawTileAt(row: number, col: number, tileExpr: HudTileExpr): Op[];
export function buildDrawTileAt(
  rowOrPosition: number | TilePosition,
  colOrTileExpr: number | HudTileExpr,
  maybeTileExpr?: HudTileExpr,
): Op[] {
  const position =
    typeof rowOrPosition === 'number'
      ? tilemapAddr(rowOrPosition, colOrTileExpr as number)
      : tilemapAddr(rowOrPosition);
  const tileExpr =
    typeof rowOrPosition === 'number' ? maybeTileExpr : (colOrTileExpr as HudTileExpr);
  if (tileExpr === undefined) {
    throw new TypeError('buildDrawTileAt(row, col, tile) requires a tile expression');
  }

  const ops: Op[] = [ld_rr_nn('hl', u16(position))];
  if (tileExpr !== 'from_a') {
    ops.push(ld_r_n('a', u8(tileExpr)));
  }
  ops.push(...vramPut());
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
    // === hud_update: called once per frame from the game loops ===
    // Ticks the delta flash, then redraws only if what the HUD shows changed.
    label('hud_update'),
    ld_a_nn(MEM.DELTA_TIMER),
    cp_n(u8(0)),
    jr_cc('z', ref('hud_delta_ticked')),
    dec_r('a'),
    ld_nn_a(MEM.DELTA_TIMER),
    label('hud_delta_ticked'),

    // B = visible delta type (0 once the flash has expired)
    ld_r_n('b', u8(0)),
    ld_a_nn(MEM.DELTA_TIMER),
    cp_n(u8(0)),
    jr_cc('z', ref('hud_delta_known')),
    ld_a_nn(MEM.DELTA_TYPE),
    ld_r_r('b', 'a'),
    label('hud_delta_known'),

    ...redrawIfChanged(MEM.HUD_SHOWN_DELTA, 'b'),
    ...redrawIfChanged(MEM.HUD_SHOWN_LIVES, MEM.KANA_LIVES),
    ...redrawIfChanged(MEM.HUD_SHOWN_SCORE_LO, MEM.KANA_SCORE_LO),
    ...redrawIfChanged(MEM.HUD_SHOWN_SCORE_HI, MEM.KANA_SCORE_HI),
    ret(), // nothing changed

    // === kana_draw_hud: full HUD redraw; safe with the LCD on or off ===
    label('hud_redraw'),
    label('kana_draw_hud'),
    ld_r_n('b', u8(0)),
    ld_a_nn(MEM.DELTA_TIMER),
    cp_n(u8(0)),
    jr_cc('z', ref('hud_shadow_delta')),
    ld_a_nn(MEM.DELTA_TYPE),
    ld_r_r('b', 'a'),
    label('hud_shadow_delta'),
    ld_r_r('a', 'b'),
    ld_nn_a(MEM.HUD_SHOWN_DELTA),
    ld_a_nn(MEM.KANA_LIVES),
    ld_nn_a(MEM.HUD_SHOWN_LIVES),
    ld_a_nn(MEM.KANA_SCORE_LO),
    ld_nn_a(MEM.HUD_SHOWN_SCORE_LO),
    ld_a_nn(MEM.KANA_SCORE_HI),
    ld_nn_a(MEM.HUD_SHOWN_SCORE_HI),

    // --- Hearts at cols 1-3 ---
    ...Array.from({ length: MAX_LIVES }, (_, i) => buildHeart(i + 1)).flat(),

    // --- Score at cols 8-11 (centered) ---
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

    // --- Delta flash at cols 15-18 (timer ticks in hud_update) ---
    ld_a_nn(MEM.DELTA_TIMER),
    cp_n(u8(0)),
    jp_cc('z', ref('delta_clear')),

    // Dispatch on delta type (the last case is the default)
    ld_a_nn(MEM.DELTA_TYPE),
    ...switchCases(
      DELTA_TYPES.map((type) => [...buildDrawTilesAt(0, DELTA_COL, DELTA_TILE_RUNS[type]), ret()]),
      { name: 'delta_type', compare: (i) => [cp_n(u8(at(DELTA_TYPES, i)))], exit: 'none' },
    ),

    // Clear delta area (timer expired or type=0)
    label('delta_clear'),
    ...buildDrawTilesAt(0, DELTA_COL, DELTA_CLEAR_TILES),
    ret(),
  ];
}
