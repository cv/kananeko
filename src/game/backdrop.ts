/**
 * Scene backdrops: a 20x8 tile illustration above the dialogue box, written
 * as a character map so scenes can be drawn (and reviewed) as text. Backdrop
 * tiles aren't part of the global font: each scene loads the ones it uses.
 */

import {
  call,
  dec_r,
  inc_r,
  inc_rr,
  jr_cc,
  label,
  ld_a_de,
  ld_r_n,
  ld_r_r,
  ldi_hl_a,
  add_n,
  ret,
} from '../asm/ops';
import { ld_rr_nn } from '../asm/ops';
import { type Op, ref, u8, u16 } from '../asm/types';
import { copyBlock } from '../asm/macros';
import { TILE_COUNT, encodeGlyph, requireTile } from './font';
import { type Glyph, SCENE_ICON_TILES } from './font-data';
import { BACKDROP_GLYPHS } from './glyphs-backdrop';
import { SCREEN_COLS, tilemapAddr } from './tilemap';
import { bgTileAddr } from './video';

/** Where backdrops sit: rows 1-8, between the HUD and the dialogue box */
export const BACKDROP = { top: 1, rows: 8, cols: SCREEN_COLS } as const;

/** Map character → font character of the tile it draws */
export const BACKDROP_LEGEND: Readonly<Record<string, string>> = {
  ' ': ' ', // paper
  '.': '\uE040', // sky texture
  '(': '\uE041', // cloud (left)
  ')': '\uE042', // cloud (right)
  o: '\uE043', // sun / moon
  '^': '\uE044', // rooftop
  B: '\uE045', // building wall
  '=': '\uE046', // railway track
  _: '\uE047', // ground edge
  '#': '\uE048', // ground
  g: '\uE049', // grass edge
  f: '\uE04A', // fence
  n: '\uE04B', // counter / table
  L: '\uE04C', // paper lantern
  E: '\uE04D', // store shelf
  '|': '\uE04E', // wallpaper
  F: '\uE04F', // wooden floor
  k: '\uE054', // tiled floor
  K: '\uE055', // kitchen wall tiles
  r: '\uE050', // road
  N: '\uE051', // noren curtain
  T: SCENE_ICON_TILES.TRAIN[0],
  t: SCENE_ICON_TILES.TRAIN[1],
  H: SCENE_ICON_TILES.HOUSE[0],
  h: SCENE_ICON_TILES.HOUSE[1],
  W: SCENE_ICON_TILES.BOWL[0],
  w: SCENE_ICON_TILES.BOWL[1],
  S: SCENE_ICON_TILES.SHOP[0],
  s: SCENE_ICON_TILES.SHOP[1],
  Y: SCENE_ICON_TILES.TREE[0],
  y: SCENE_ICON_TILES.TREE[1],
};

export type Backdrop = readonly string[];

/** First BG tile index after the global font: each scene loads its own art from here */
export const SCENE_TILE_BASE = TILE_COUNT + 1;
/** BG tile slots available to one scene's art */
export const SCENE_TILE_CAPACITY = 256 - SCENE_TILE_BASE;

export interface SceneArt {
  /** Tilemap indices for the backdrop, row by row */
  readonly backdrop: Uint8Array;
  /** Pixel data for the scene's own tiles, loaded at SCENE_TILE_BASE */
  readonly tileData: Uint8Array;
  /** BG tile index of each kit tile the scene uses, by backdrop map character */
  readonly tileOfCell: ReadonlyMap<string, number>;
}

/**
 * Encode a backdrop map. Kit tiles (glyphs-backdrop.ts) get slots in the scene's
 * tile block in order of first use; everything else (blank, scene icons) is global.
 */
export function buildSceneArt(map: Backdrop): SceneArt {
  // Fits by construction while the whole kit fits SCENE_TILE_CAPACITY (checked by tests)
  const local = new Map<string, Glyph>();
  const tileOf = (ch: string): number => {
    const glyph = BACKDROP_GLYPHS[ch];
    if (glyph === undefined) return requireTile(ch);
    if (!local.has(ch)) local.set(ch, glyph);
    return SCENE_TILE_BASE + [...local.keys()].indexOf(ch);
  };
  const backdrop = encodeBackdrop(map, tileOf);
  const tileOfCell = new Map(
    Object.entries(BACKDROP_LEGEND)
      .filter(([, ch]) => local.has(ch))
      .map(([cell, ch]) => [cell, SCENE_TILE_BASE + [...local.keys()].indexOf(ch)] as const),
  );
  return {
    backdrop,
    tileOfCell,
    tileData: Uint8Array.from(
      [...local.values()].flatMap((glyph) => Array.from(encodeGlyph(glyph))),
    ),
  };
}

/** Encode a backdrop map as tile indices, row by row. */
function encodeBackdrop(map: Backdrop, tileOf: (ch: string) => number): Uint8Array {
  if (map.length !== BACKDROP.rows) {
    throw new RangeError(`Backdrop needs ${String(BACKDROP.rows)} rows, got ${String(map.length)}`);
  }
  return Uint8Array.from(
    map.flatMap((row, r) => {
      const cells = Array.from(row);
      if (cells.length !== BACKDROP.cols) {
        throw new RangeError(
          `Backdrop row ${String(r)} must be ${String(BACKDROP.cols)} wide: "${row}"`,
        );
      }
      return cells.map((cell) => {
        const ch = BACKDROP_LEGEND[cell];
        if (ch === undefined)
          throw new Error(`Unknown backdrop cell "${cell}" in row ${String(r)}`);
        return tileOf(ch);
      });
    }),
  );
}

/** Tilemap row stride minus the visible width */
const ROW_SKIP = 32 - SCREEN_COLS;

/**
 * Subroutine copy_rows: copy B rows of SCREEN_COLS tiles from [DE] to the
 * tilemap at HL (LCD off). Clobbers A, BC, DE, HL.
 */
export function buildCopyRows(): Op[] {
  return [
    label('copy_rows'),
    ld_r_n('c', u8(SCREEN_COLS)),
    label('copy_rows_col'),
    ld_a_de(),
    inc_rr('de'),
    ldi_hl_a(),
    dec_r('c'),
    jr_cc('nz', ref('copy_rows_col')),
    // HL += ROW_SKIP to reach the next tilemap row
    ld_r_r('a', 'l'),
    add_n(u8(ROW_SKIP)),
    ld_r_r('l', 'a'),
    jr_cc('nc', ref('copy_rows_nc')),
    inc_r('h'),
    label('copy_rows_nc'),
    dec_r('b'),
    jr_cc('nz', ref('copy_rows')),
    ret(),
  ];
}

/** Load a scene's own tiles (LCD off). */
export function loadSceneTiles(name: string, dataLabel: string, bytes: number): Op[] {
  return copyBlock(name, u16(bgTileAddr(SCENE_TILE_BASE)), ref(dataLabel), bytes);
}

/** Draw the backdrop stored at `dataLabel` (LCD off). */
export function drawBackdrop(dataLabel: string): Op[] {
  return [
    ld_rr_nn('de', ref(dataLabel)),
    ld_rr_nn('hl', u16(tilemapAddr(BACKDROP.top, 0))),
    ld_r_n('b', u8(BACKDROP.rows)),
    call(ref('copy_rows')),
  ];
}
