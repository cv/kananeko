/**
 * 8x8 font and art tiles for the Game Boy (four shades).
 * Glyph pixel art is defined in font-data.ts.
 * This module handles tile encoding, character mapping, and data building.
 */

import type { TileIndex } from '../asm/types';
import { ALL_GLYPHS, CAT_TILES, type Glyph } from './font-data';

type TileTuple<T extends readonly string[]> = { [K in keyof T]: TileIndex };

/** Glyph pixel characters → palette color index (0 = paper ... 3 = ink) */
export const SHADES: Readonly<Record<string, number>> = { '.': 0, '-': 1, '+': 2, '#': 3 };

/** Encode an 8x8 glyph as a 2bpp Game Boy tile (16 bytes: low plane, high plane per row). */
export function encodeGlyph(glyph: Glyph): Uint8Array {
  const tile = new Uint8Array(16);
  glyph.forEach((line, row) => {
    let low = 0;
    let high = 0;
    Array.from(line).forEach((pixel, col) => {
      const shade = SHADES[pixel];
      if (shade === undefined) throw new Error(`Invalid glyph pixel "${pixel}" in "${line}"`);
      if (shade & 1) low |= 0x80 >> col;
      if (shade & 2) high |= 0x80 >> col;
    });
    tile[row * 2] = low;
    tile[row * 2 + 1] = high;
  });
  return tile;
}

/** Whether a glyph uses only paper and ink, so it can be stored at 1 bit per pixel */
export function isOneBit(glyph: readonly string[]): boolean {
  return glyph.every((row) => /^[.#]*$/u.test(row));
}

// Tile order: the 1-bit glyphs first (after the blank tile), then the rest; stable otherwise
const ONE_BIT_CHARS = Object.entries(ALL_GLYPHS)
  .filter(([, glyph]) => isOneBit(glyph))
  .map(([ch]) => ch);
// The quiz blank is the one 2-bit tile dialogue uses (fill-in replies): first after the
// 1-bit tiles, so text tiles end low and leave more codes for compression (text-codec.ts)
const CHAR_ORDER = [
  ...ONE_BIT_CHARS,
  CAT_TILES.BLANK,
  ...Object.entries(ALL_GLYPHS)
    .filter(([ch, glyph]) => !isOneBit(glyph) && ch !== CAT_TILES.BLANK)
    .map(([ch]) => ch),
];

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

/** The pixel art for a character, throwing if it isn't in the font. */
export function glyphOf(ch: string): Glyph {
  const glyph = ALL_GLYPHS[ch];
  if (glyph === undefined) throw new Error(`Character not in font: "${ch}"`);
  return glyph;
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
      return encodeGlyph(glyph);
    }),
  ];
  const data = new Uint8Array(tiles.length * 16);
  tiles.forEach((tile, i) => {
    data.set(tile, i * 16);
  });
  return data;
}

/** Tiles stored at 1 bit per pixel: the blank tile 0 and every two-shade glyph */
export const ONE_BIT_TILES = 1 + ONE_BIT_CHARS.length;

/**
 * The font as stored in ROM: tiles 0 to ONE_BIT_TILES - 1 at 8 bytes each (one plane;
 * copied to both, so set pixels are ink), then the rest as normal 2bpp tiles.
 */
export function buildPackedTileData(): { oneBit: Uint8Array; twoBit: Uint8Array } {
  const full = buildTileData();
  // A 1-bit tile's two planes are equal: keep the first byte of each pair
  const oneBit = full.slice(0, ONE_BIT_TILES * 16).filter((_, i) => i % 2 === 0);
  return { oneBit, twoBit: full.slice(ONE_BIT_TILES * 16) };
}

/** Convert a text string to an array of tile indices. Throws on unknown characters. */
export function textToTiles(text: string): TileIndex[] {
  return Array.from(text).map((ch) => requireTile(ch));
}

/** Convert a tuple of characters into a tuple of tile indices. */
export function requireTiles<const T extends readonly string[]>(chars: T): TileTuple<T> {
  return chars.map((ch) => requireTile(ch)) as TileTuple<T>;
}
