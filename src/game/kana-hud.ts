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

import { playSfx } from './sound';
import { type Op, type TileIndex, type U16, u8, u16, Label } from '../asm/types';
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
  jp,
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
import { at, hi, lo } from '../asm/util';
import { requireTile, requireTiles } from './font';
import { CAT_TILES } from './font-data';
import type { Quad } from './fixed';
import { MAX_LIVES } from './state';
import { tilemapAddr, type TilePosition } from './tilemap';
import { vramPut } from './video';
import { SCORE_DIGITS, HUD_UPDATE, KANA_DRAW_HUD } from './labels';

// Labels placed in this module
const SCORE_ADD = new Label('score_add');
const SCORE_CAP = new Label('score_cap');
const SCORE_SUB = new Label('score_sub');
const HUD_DELTA_TICKED = new Label('hud_delta_ticked');
const HUD_DELTA_KNOWN = new Label('hud_delta_known');
const HUD_HEART_UP = new Label('hud_heart_up');
const HUD_LIVES_SAME = new Label('hud_lives_same');
const HUD_REDRAW = new Label('hud_redraw');
const HUD_SHADOW_DELTA = new Label('hud_shadow_delta');
const DELTA_CLEAR = new Label('delta_clear');

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
export const DELTA_PLUS_150 = 5;

/**
 * Jump to hud_redraw if what the HUD shows (`shownAddr`) differs from the current
 * value (register B or a memory address). Clobbers A and C.
 */
function redrawIfChanged(shownAddr: U16, current: U16 | 'b'): Op[] {
  const load = current === 'b' ? [ld_r_r('c', 'b')] : [ld_a_nn(current), ld_r_r('c', 'a')];
  return [...load, ld_a_nn(shownAddr), cp_r('c'), jp_cc('nz', HUD_REDRAW)];
}

/** Dispatch order for the delta flash; the last entry is the fallback */
const DELTA_TYPES = [
  DELTA_PLUS_100,
  DELTA_PLUS_10,
  DELTA_MINUS_5,
  DELTA_PLUS_150,
  DELTA_MINUS_100,
] as const;

export type DeltaType = (typeof DELTA_TYPES)[number];

export type ScoreDelta = 5 | 10 | 50 | 100;

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
  [DELTA_PLUS_150]: [PLUS_TILE, d1, d5, d0],
};

// ---------------------------------------------------------------------------
// Score arithmetic helpers
// ---------------------------------------------------------------------------

/** Highest score (the HUD shows SCORE_DIGIT_COUNT digits) */
export const MAX_SCORE = 50_000; // well past a perfect run; adding at most 255 can't wrap 16 bits

/** Add to the score, capped at MAX_SCORE (clobbers A, B). */
export function buildAddScore(delta: ScoreDelta): Op[] {
  return [ld_r_n('a', u8(delta)), call(SCORE_ADD)];
}

/** Generate 16-bit score subtract: SCORE -= delta */
/** Subtract from the score, stopping at zero (clobbers A, B). */
export function buildSubScore(delta: ScoreDelta): Op[] {
  return [ld_r_n('a', u8(delta)), call(SCORE_SUB)];
}

/** Decimal places converted by score_digits (the ones digit is what remains) */
const DIGIT_PLACES = [10_000, 1000, 100, 10] as const;
export const SCORE_DIGIT_COUNT = DIGIT_PLACES.length + 1;

function scoreDigitAddr(i: number): U16 {
  return u16(MEM.SCORE_DIGITS + i);
}

/**
 * Subroutine score_digits: convert the score into SCORE_DIGIT_COUNT digit tiles at
 * MEM.SCORE_DIGITS by repeated 16-bit subtraction. Clobbers A, C, DE, L.
 */
export function buildScoreDigits(): Op[] {
  return [
    label(SCORE_DIGITS),
    ld_a_nn(MEM.KANA_SCORE_HI),
    ld_r_r('d', 'a'),
    ld_a_nn(MEM.KANA_SCORE_LO),
    ld_r_r('e', 'a'),
    ...DIGIT_PLACES.flatMap((place, i) => {
      const loop = new Label(`score_digit${String(place)}`);
      const done = new Label(`${loop.name}_done`);
      return [
        ld_r_n('c', u8(0)),
        label(loop),
        // DE -= place, keeping the old value if that would go negative
        ld_r_r('a', 'e'),
        sub_n(lo(place)),
        ld_r_r('l', 'a'),
        ld_r_r('a', 'd'),
        sbc_n(hi(place)),
        jr_cc('c', done),
        ld_r_r('d', 'a'),
        ld_r_r('e', 'l'),
        inc_r('c'),
        jr(loop),
        label(done),
        ld_r_r('a', 'c'),
        add_n(u8(d0)),
        ld_nn_a(scoreDigitAddr(i)),
      ];
    }),
    ld_r_r('a', 'e'),
    add_n(u8(d0)),
    ld_nn_a(scoreDigitAddr(DIGIT_PLACES.length)),
    ret(),
  ];
}

/** Draw the digit tiles computed by score_digits at (row, col); safe with the LCD on. */
export function buildDrawScoreDigits(row: number, col: number): Op[] {
  return [
    ld_rr_nn('hl', u16(tilemapAddr(row, col))),
    ...Array.from({ length: SCORE_DIGIT_COUNT }, (_, i) => [
      ld_a_nn(scoreDigitAddr(i)),
      ...vramPut(),
    ]).flat(),
  ];
}

/** Subroutines score_add / score_sub: A = amount; the score stays within 0..MAX_SCORE. */
export function buildScoreRoutines(): Op[] {
  return [
    label(SCORE_ADD),
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.KANA_SCORE_LO),
    add_r('b'),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_a_nn(MEM.KANA_SCORE_HI),
    adc_n(u8(0)),
    ld_nn_a(MEM.KANA_SCORE_HI),
    // Cap: HI > hi(MAX) or (HI == hi(MAX) and LO > lo(MAX))
    cp_n(hi(MAX_SCORE)),
    ret_cc('c'),
    jr_cc('nz', SCORE_CAP),
    ld_a_nn(MEM.KANA_SCORE_LO),
    cp_n(u8(lo(MAX_SCORE) + 1)),
    ret_cc('c'),
    label(SCORE_CAP),
    ld_r_n('a', lo(MAX_SCORE)),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_r_n('a', hi(MAX_SCORE)),
    ld_nn_a(MEM.KANA_SCORE_HI),
    ret(),

    label(SCORE_SUB),
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
  const empty = new Label(`hud_heart${String(n)}_empty`);
  const draw = new Label(`hud_heart${String(n)}_draw`);
  return [
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(n)),
    jr_cc('c', empty),
    ld_r_n('a', u8(HEART_FULL)),
    jr(draw),
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
    label(HUD_UPDATE),
    ld_a_nn(MEM.DELTA_TIMER),
    cp_n(u8(0)),
    jr_cc('z', HUD_DELTA_TICKED),
    dec_r('a'),
    ld_nn_a(MEM.DELTA_TIMER),
    label(HUD_DELTA_TICKED),

    // B = visible delta type (0 once the flash has expired)
    ld_r_n('b', u8(0)),
    ld_a_nn(MEM.DELTA_TIMER),
    cp_n(u8(0)),
    jr_cc('z', HUD_DELTA_KNOWN),
    ld_a_nn(MEM.DELTA_TYPE),
    ld_r_r('b', 'a'),
    label(HUD_DELTA_KNOWN),

    // A heart won or lost: its sound, then the redraw (checked before the delta,
    // which usually changes on the same frame and would redraw the hearts silently)
    ld_a_nn(MEM.KANA_LIVES),
    ld_r_r('c', 'a'),
    ld_a_nn(MEM.HUD_SHOWN_LIVES),
    cp_r('c'),
    jr_cc('z', HUD_LIVES_SAME),
    jr_cc('c', HUD_HEART_UP),
    ...playSfx('heartDown'),
    jp(HUD_REDRAW),
    label(HUD_HEART_UP),
    ...playSfx('heartUp'),
    jp(HUD_REDRAW),
    label(HUD_LIVES_SAME),
    ...redrawIfChanged(MEM.HUD_SHOWN_DELTA, 'b'),

    ...redrawIfChanged(MEM.HUD_SHOWN_SCORE_LO, MEM.KANA_SCORE_LO),
    ...redrawIfChanged(MEM.HUD_SHOWN_SCORE_HI, MEM.KANA_SCORE_HI),
    ret(), // nothing changed

    // === kana_draw_hud: full HUD redraw; safe with the LCD on or off ===
    label(HUD_REDRAW),
    label(KANA_DRAW_HUD),
    ld_r_n('b', u8(0)),
    ld_a_nn(MEM.DELTA_TIMER),
    cp_n(u8(0)),
    jr_cc('z', HUD_SHADOW_DELTA),
    ld_a_nn(MEM.DELTA_TYPE),
    ld_r_r('b', 'a'),
    label(HUD_SHADOW_DELTA),
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
    call(SCORE_DIGITS),
    ...buildDrawScoreDigits(0, SCORE_COL),

    // --- Delta flash at cols 15-18 (timer ticks in hud_update) ---
    ld_a_nn(MEM.DELTA_TIMER),
    cp_n(u8(0)),
    jp_cc('z', DELTA_CLEAR),

    // Dispatch on delta type (the last case is the default)
    ld_a_nn(MEM.DELTA_TYPE),
    ...switchCases(
      DELTA_TYPES.map((type) => [...buildDrawTilesAt(0, DELTA_COL, DELTA_TILE_RUNS[type]), ret()]),
      { name: 'delta_type', compare: (i) => [cp_n(u8(at(DELTA_TYPES, i)))], exit: 'none' },
    ),

    // Clear delta area (timer expired or type=0)
    label(DELTA_CLEAR),
    ...buildDrawTilesAt(0, DELTA_COL, DELTA_CLEAR_TILES),
    ret(),
  ];
}
