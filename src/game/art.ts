/**
 * Multi-tile pixel art: draw a picture as text, then slice it into 8x8 glyphs.
 * Shades: '.' paper, '-' light, '+' mid, '#' ink.
 */

import { at } from '../asm/util';
import type { Glyph } from './font-data';

const TILE = 8;

/** Complete each row with its mirror image (for symmetric art drawn as a left half). */
export function mirrorHalf(left: readonly string[]): string[] {
  return left.map((row) => row + Array.from(row).reverse().join(''));
}

/** Split art into 8x8 glyphs, row-major. */
export function sliceArt(rows: readonly string[]): Glyph[] {
  const height = rows.length;
  const width = height > 0 ? at(rows, 0).length : 0;
  if (
    height === 0 ||
    height % TILE !== 0 ||
    width % TILE !== 0 ||
    rows.some((r) => r.length !== width)
  ) {
    throw new RangeError(
      `Art must be a multiple of 8 in both directions, got ${String(width)}x${String(height)}`,
    );
  }
  const glyphs: Glyph[] = [];
  for (let ty = 0; ty < height / TILE; ty++) {
    for (let tx = 0; tx < width / TILE; tx++) {
      glyphs.push(
        rows
          .slice(ty * TILE, (ty + 1) * TILE)
          .map((row) => row.slice(tx * TILE, (tx + 1) * TILE)) as Glyph,
      );
    }
  }
  return glyphs;
}

/** Private-use character for a tile */
export function artChar(codepoint: number): string {
  return String.fromCodePoint(codepoint);
}

interface ArtVariant {
  /** Glyphs for tiles that differ from the base art, keyed by their characters */
  readonly glyphs: Record<string, Glyph>;
  /** Character for every tile of the variant, row-major (base characters where unchanged) */
  readonly chars: string[];
}

/**
 * Describe a variant of a picture that reuses the base picture's tiles wherever
 * they are identical, allocating new characters from `firstCodepoint` for the rest.
 */
export function artVariant(
  baseChars: readonly string[],
  base: readonly string[],
  variant: readonly string[],
  firstCodepoint: number,
): ArtVariant {
  const baseGlyphs = sliceArt(base);
  const variantGlyphs = sliceArt(variant);
  if (variantGlyphs.length !== baseGlyphs.length || baseChars.length !== baseGlyphs.length) {
    throw new RangeError('A variant must have the same size as its base art');
  }
  const glyphs: Record<string, Glyph> = {};
  let next = firstCodepoint;
  const chars = variantGlyphs.map((glyph, i) => {
    if (glyph.join() === at(baseGlyphs, i).join()) return at(baseChars, i);
    const ch = artChar(next++);
    glyphs[ch] = glyph;
    return ch;
  });
  return { glyphs, chars };
}
