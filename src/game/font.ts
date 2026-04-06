/**
 * 8x8 monochrome font for the Game Boy.
 * Glyph pixel art is defined in font-data.ts.
 * This module handles tile encoding, character mapping, and data building.
 */

import { ALL_GLYPHS, type Glyph } from './font-data';

function glyphToTile(glyph: Glyph): Uint8Array {
  const tile = new Uint8Array(16);
  for (let row = 0 as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; row < 8; row++) {
    let byte = 0;
    const line = glyph[row];
    for (let col = 0; col < 8; col++) {
      if (line[col] === '#') {
        byte |= 0x80 >> col;
      }
    }
    // 2bpp: both planes identical = color 3 (darkest)
    tile[row * 2] = byte;
    tile[row * 2 + 1] = byte;
  }
  return tile;
}

// Build CHAR_ORDER from all defined glyphs (deterministic order)
const CHAR_ORDER = Object.keys(ALL_GLYPHS);

/** Map from character to tile index. Tile 0 = blank (space). */
export const CHAR_MAP: Record<string, number> = { ' ': 0 };
CHAR_ORDER.forEach((ch, i) => {
  CHAR_MAP[ch] = i + 1;
});

/** Number of character tiles (excluding blank) */
export const TILE_COUNT = CHAR_ORDER.length;

/** All tile data as a flat byte array, starting with tile 0 (blank) */
export function buildTileData(): Uint8Array {
  const blank = new Uint8Array(16); // tile 0: all zeros
  const tiles = [
    blank,
    ...CHAR_ORDER.map((ch) => {
      const glyph = ALL_GLYPHS[ch];
      if (glyph === undefined) {
        throw new Error(`Missing glyph for character: ${ch}`);
      }
      return glyphToTile(glyph);
    }),
  ];
  const data = new Uint8Array(tiles.length * 16);
  tiles.forEach((tile, i) => {
    data.set(tile, i * 16);
  });
  return data;
}

/** Convert a text string to an array of tile indices */
export function textToTiles(text: string): number[] {
  return Array.from(text).map((ch) => CHAR_MAP[ch] ?? 0);
}
