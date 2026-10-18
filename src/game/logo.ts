/**
 * The カナネコ logo: the font's katakana, doubled to 16x16 and drawn chunky
 * (2-pixel ginger strokes with a highlight along their tops, outlined in ink).
 * Built at build time from the glyphs, so it always matches the font.
 */

import { artChar, sliceArt } from './art';
import type { Glyph } from './font-data';
import { KATAKANA } from './glyphs-katakana';

export const LOGO_TEXT = 'カナネコ';
const FIRST_CODEPOINT = 0xe080;
const SIZE = 16;

/** One character as 16x16 art: '#' outline, '+' stroke, '-' highlight */
export function logoArt(glyph: Glyph): string[] {
  const strokes = new Set<string>();
  glyph.forEach((row, gy) => {
    Array.from(row).forEach((ch, gx) => {
      if (ch === '#') strokes.add(`${String(gx)},${String(gy)}`);
    });
  });
  // Pixel (x, y) is stroke if its glyph pixel is ink (the art is offset by 1 for the outline)
  const stroke = (x: number, y: number): boolean =>
    x >= 1 && y >= 1 && strokes.has(`${String((x - 1) >> 1)},${String((y - 1) >> 1)}`);
  return Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      if (stroke(x, y)) return stroke(x, y - 1) ? '+' : '-';
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (stroke(x + dx, y + dy)) return '#';
      }
      return '.';
    }).join(''),
  );
}

export interface Logo {
  readonly glyphs: Record<string, Glyph>;
  /** Two rows of characters: top halves, then bottom halves */
  readonly rows: readonly [string, string];
}

/** Build a logo for katakana text, with tile characters from FIRST_CODEPOINT */
export function buildLogo(text: string): Logo {
  const glyphs: Record<string, Glyph> = {};
  // Each letter is 2x2 tiles: TL, TR, BL, BR from its first codepoint
  const firsts = Array.from(text).map((ch, i) => {
    const glyph = KATAKANA[ch];
    if (glyph === undefined) throw new Error(`No katakana glyph for ${ch}`);
    const first = FIRST_CODEPOINT + i * 4;
    sliceArt(logoArt(glyph)).forEach((tile, t) => {
      glyphs[artChar(first + t)] = tile;
    });
    return first;
  });
  return {
    glyphs,
    rows: [
      firsts.map((f) => artChar(f) + artChar(f + 1)).join(''),
      firsts.map((f) => artChar(f + 2) + artChar(f + 3)).join(''),
    ],
  };
}

const LOGO = buildLogo(LOGO_TEXT);
export const LOGO_GLYPHS = LOGO.glyphs;
export const LOGO_ROWS = LOGO.rows;
