/**
 * Helpers for asserting on what the LCD actually shows.
 */

import { ALL_GLYPHS } from '@game/font-data';
import { type GameRunner } from './game-runner';

export const SCREEN_W = 160;
export const SCREEN_H = 144;
const TILE = 8;

/** Luminance of the darkest pixel on screen */
export function darkestLuma(runner: GameRunner): number {
  const screen = runner.getScreen();
  let min = 255;
  for (let i = 0; i < screen.length; i += 4) {
    min = Math.min(min, luma(screen, (i / 4) % SCREEN_W, Math.floor(i / 4 / SCREEN_W)));
  }
  return min;
}

/** Whether the last frame was a single flat color (the LCD renders blank while off) */
export function isBlank(runner: GameRunner): boolean {
  const screen = runner.getScreen();
  return screen.every((value, i) => value === screen[i % 4]);
}

/** Advance until the LCD shows something. */
export function waitForPicture(runner: GameRunner): GameRunner {
  return runner.waitUntil(() => !isBlank(runner), 'a non-blank screen');
}

/** Luminance of the pixel at (x, y) */
function luma(screen: readonly number[], x: number, y: number): number {
  const i = (y * SCREEN_W + x) * 4;
  return 0.299 * (screen[i] ?? 0) + 0.587 * (screen[i + 1] ?? 0) + 0.114 * (screen[i + 2] ?? 0);
}

export interface InkBounds {
  readonly left: number;
  readonly right: number;
}

/**
 * Horizontal extent of "ink" (pixels darker than the row's lightest color) on a tile row,
 * or undefined if the row is blank.
 */
export function inkBounds(
  runner: GameRunner,
  tileRow: number,
  { fromX = 0, toX = SCREEN_W }: { fromX?: number; toX?: number } = {},
): InkBounds | undefined {
  const screen = runner.getScreen();
  const ys = Array.from({ length: TILE }, (_, i) => tileRow * TILE + i);
  let paper = 0;
  for (const y of ys)
    for (let x = 0; x < SCREEN_W; x++) paper = Math.max(paper, luma(screen, x, y));

  let left = SCREEN_W;
  let right = -1;
  for (const y of ys) {
    for (let x = fromX; x < toX; x++) {
      if (luma(screen, x, y) < paper - 1) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  return right < 0 ? undefined : { left, right };
}

/**
 * Canonical shade pattern of a cell: each pixel replaced by the order in which its
 * value first appears ("0" for the first value seen, "1" for the next, ...). Two cells
 * match exactly when they are the same picture up to the choice of palette.
 */
function pattern(values: readonly (string | number)[]): string {
  const seen = new Map<string | number, number>();
  return values
    .map((v) => {
      if (!seen.has(v)) seen.set(v, seen.size);
      return String(seen.get(v));
    })
    .join('');
}

const BLANK_PATTERN = '0'.repeat(64);

/** Glyph shade patterns → character (earlier definitions win; solid tiles read as spaces) */
const GLYPH_BY_PATTERN = new Map<string, string>(
  Object.entries(ALL_GLYPHS)
    .reverse()
    .map(([ch, glyph]) => [pattern(Array.from(glyph.join(''))), ch]),
);

/**
 * The text readText() reports for these characters: glyphs that are identical
 * pictures (e.g. both halves of the train icon) read as the same character.
 */
export function asSeenOnScreen(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const glyph = ALL_GLYPHS[ch];
      return glyph === undefined
        ? ch
        : (GLYPH_BY_PATTERN.get(pattern(Array.from(glyph.join('')))) ?? ch);
    })
    .join('');
}

/**
 * Read characters back from the screen by matching each 8x8 cell against the font
 * (shades included). Blank cells read as spaces and unrecognized cells as "?".
 */
export function readText(
  runner: GameRunner,
  tileRow: number,
  tileCol: number,
  length: number,
): string {
  const screen = runner.getScreen();
  let out = '';
  for (let c = 0; c < length; c++) {
    const x0 = (tileCol + c) * TILE;
    const y0 = tileRow * TILE;
    const colors: number[] = [];
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const i = ((y0 + y) * SCREEN_W + x0 + x) * 4;
        colors.push(((screen[i] ?? 0) << 16) | ((screen[i + 1] ?? 0) << 8) | (screen[i + 2] ?? 0));
      }
    }
    const p = pattern(colors);
    out += p === BLANK_PATTERN ? ' ' : (GLYPH_BY_PATTERN.get(p) ?? '?');
  }
  return out;
}

/** Number of ink pixels on a tile row */
export function inkCount(runner: GameRunner, tileRow: number): number {
  const screen = runner.getScreen();
  let paper = 0;
  let count = 0;
  for (let y = tileRow * TILE; y < (tileRow + 1) * TILE; y++)
    for (let x = 0; x < SCREEN_W; x++) paper = Math.max(paper, luma(screen, x, y));
  for (let y = tileRow * TILE; y < (tileRow + 1) * TILE; y++)
    for (let x = 0; x < SCREEN_W; x++) if (luma(screen, x, y) < paper - 1) count++;
  return count;
}
