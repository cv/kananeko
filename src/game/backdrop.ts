/**
 * Scene backdrops: a 20x9 tile illustration above the dialogue box, written
 * as a character map so scenes can be drawn (and reviewed) as text.
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
import { requireTile } from './font';
import { SCENE_ICON_TILES } from './font-data';
import { SCREEN_COLS, tilemapAddr } from './tilemap';

/** Where backdrops sit: rows 2-10, between the scene name and the dialogue box */
export const BACKDROP = { top: 2, rows: 9, cols: SCREEN_COLS } as const;

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

/** Encode a backdrop map as tile indices, row by row. */
export function encodeBackdrop(map: Backdrop): Uint8Array {
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
        return requireTile(ch);
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

/** Draw the backdrop stored at `dataLabel` (LCD off). */
export function drawBackdrop(dataLabel: string): Op[] {
  return [
    ld_rr_nn('de', ref(dataLabel)),
    ld_rr_nn('hl', u16(tilemapAddr(BACKDROP.top, 0))),
    ld_r_n('b', u8(BACKDROP.rows)),
    call(ref('copy_rows')),
  ];
}
