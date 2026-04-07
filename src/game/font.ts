/**
 * 8x8 monochrome font for the Game Boy.
 * Glyph pixel art is defined in font-data.ts.
 * This module handles tile encoding, character mapping, and data building.
 */

import { type TileIndex } from '../asm/types';
import { ALL_GLYPHS, type Glyph } from './font-data';

type TileTuple<T extends readonly string[]> = { [K in keyof T]: TileIndex };

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
    tile[row * 2] = byte;
    tile[row * 2 + 1] = byte;
  }
  return tile;
}

// Build CHAR_ORDER from all defined glyphs (deterministic order)
const CHAR_ORDER = Object.keys(ALL_GLYPHS);

// Validate: tile indices must not collide with sentinels
if (CHAR_ORDER.length + 1 > 0xfe) {
  throw new Error(
    `Too many glyphs (${String(CHAR_ORDER.length)}): tile indices would collide with sentinels 0xFE/0xFF`,
  );
}

/** Map from character to tile index. Tile 0 = blank (space). */
export const CHAR_MAP: Record<string, TileIndex> = { ' ': 0 as TileIndex };
CHAR_ORDER.forEach((ch, i) => {
  CHAR_MAP[ch] = (i + 1) as TileIndex;
});

/** Number of character tiles (excluding blank) */
export const TILE_COUNT = CHAR_ORDER.length;

/**
 * Look up a tile index for a character, throwing if it's not in the font.
 * Returns a TileIndex — guaranteed to never be a sentinel value.
 */
export function requireTile(ch: string): TileIndex {
  const idx = CHAR_MAP[ch];
  if (idx === undefined) {
    throw new Error(
      `Character not in font: "${ch}" (U+${String(ch.codePointAt(0)?.toString(16))})`,
    );
  }
  return idx;
}

/** All tile data as a flat byte array, starting with tile 0 (blank) */
export function buildTileData(): Uint8Array {
  const blank = new Uint8Array(16);
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

/** Convert a text string to an array of tile indices. Throws on unknown characters. */
export function textToTiles(text: string): TileIndex[] {
  return Array.from(text).map((ch) => requireTile(ch));
}

/** Convert a tuple of characters into a tuple of tile indices. */
export function requireTiles<const T extends readonly string[]>(chars: T): TileTuple<T> {
  return chars.map((ch) => requireTile(ch)) as TileTuple<T>;
}
