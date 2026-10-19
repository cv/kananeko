/**
 * Scene backdrops: a 20x8 tile illustration above the dialogue box, written
 * as a character map (see scenery.ts for what each character draws) so scenes
 * can be laid out and reviewed as text. Backdrop tiles aren't part of the global
 * font: each scene loads the ones it uses.
 */

import {
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
import { type Op, ref, u8 } from '../asm/types';
import { at } from '../asm/util';
import { sliceArt } from './art';
import { TILE_COUNT, encodeGlyph } from './font';
import { type Glyph } from './font-data';
import { type Prop, SCENERY, isProp } from './scenery';
import { SCREEN_COLS } from './tilemap';

/** Where backdrops sit: rows 1-8, between the HUD and the dialogue box */
export const BACKDROP = { top: 1, rows: 8, cols: SCREEN_COLS } as const;

/** The global blank tile (paper) */
const BLANK_TILE = 0;

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
  /** BG tile index of each texture (single-tile) map character the scene uses */
  readonly tileOfCell: ReadonlyMap<string, number>;
}

/** The 8x8 piece of a prop at (row, col) of the map, counting from the start of its run */
function propTile(
  prop: Prop,
  grid: readonly (readonly string[])[],
  row: number,
  col: number,
): Glyph {
  const cellAt = (r: number, c: number): string => at(at(grid, r), c);
  const ch = cellAt(row, col);
  let firstCol = col;
  while (firstCol > 0 && cellAt(row, firstCol - 1) === ch) firstCol--;
  let firstRow = row;
  while (firstRow > 0 && cellAt(firstRow - 1, col) === ch) firstRow--;
  const tiles = sliceArt(prop.art);
  const cols = at(prop.art, 0).length / 8;
  const rows = prop.art.length / 8;
  const index = ((row - firstRow) % rows) * cols + ((col - firstCol) % cols);
  return at(tiles, index);
}

/**
 * Encode a backdrop map. Its scenery (scenery.ts) gets slots in the scene's tile
 * block, identical tiles sharing one; blank cells use the global blank tile.
 */
export function buildSceneArt(map: Backdrop, capacity = SCENE_TILE_CAPACITY): SceneArt {
  if (map.length !== BACKDROP.rows) {
    throw new RangeError(`Backdrop needs ${String(BACKDROP.rows)} rows, got ${String(map.length)}`);
  }
  const tiles: Glyph[] = [];
  const slots = new Map<string, number>();
  const tileOfCell = new Map<string, number>();
  const place = (glyph: Glyph): number => {
    const key = glyph.join('/');
    let slot = slots.get(key);
    if (slot === undefined) {
      slot = tiles.length;
      slots.set(key, slot);
      tiles.push(glyph);
    }
    return SCENE_TILE_BASE + slot;
  };
  const grid = map.map((row) => Array.from(row));
  const backdrop = grid.flatMap((cells, r) => {
    const row = cells.join('');
    if (cells.length !== BACKDROP.cols) {
      throw new RangeError(
        `Backdrop row ${String(r)} must be ${String(BACKDROP.cols)} wide: "${row}"`,
      );
    }
    return cells.map((cell, c) => {
      if (cell === ' ') return BLANK_TILE;
      const scenery = SCENERY[cell];
      if (scenery === undefined)
        throw new Error(`Unknown backdrop cell "${cell}" in row ${String(r)}`);
      if (isProp(scenery)) return place(propTile(scenery, grid, r, c));
      const index = place(scenery);
      tileOfCell.set(cell, index);
      return index;
    });
  });
  if (tiles.length > capacity) {
    throw new RangeError(
      `A backdrop needs ${String(tiles.length)} tiles, more than the ${String(capacity)} free`,
    );
  }
  return {
    backdrop: Uint8Array.from(backdrop),
    tileOfCell,
    tileData: Uint8Array.from(tiles.flatMap((glyph) => Array.from(encodeGlyph(glyph)))),
  };
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
