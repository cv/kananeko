/**
 * Helpers for asserting on what the LCD actually shows.
 */

import { type GameRunner } from './game-runner';

export const SCREEN_W = 160;
export const SCREEN_H = 144;
const TILE = 8;

/** Advance until the LCD shows something (it renders blank while switched off). */
export function waitForPicture(runner: GameRunner): GameRunner {
  return runner.waitUntil(() => {
    const screen = runner.getScreen();
    return screen.some((value, i) => value !== screen[i % 4]);
  }, 'a non-blank screen');
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
export function inkBounds(runner: GameRunner, tileRow: number): InkBounds | undefined {
  const screen = runner.getScreen();
  const ys = Array.from({ length: TILE }, (_, i) => tileRow * TILE + i);
  let paper = 0;
  for (const y of ys)
    for (let x = 0; x < SCREEN_W; x++) paper = Math.max(paper, luma(screen, x, y));

  let left = SCREEN_W;
  let right = -1;
  for (const y of ys) {
    for (let x = 0; x < SCREEN_W; x++) {
      if (luma(screen, x, y) < paper - 1) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  return right < 0 ? undefined : { left, right };
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
