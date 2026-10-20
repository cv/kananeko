/** Score arithmetic subroutines, run in the emulator. */

import { storeByte } from '@asm/macros';
import { call } from '@asm/sm83';
import {} from '@asm/types';
import { textToTiles } from '@game/font';
import {
  buildAddScore,
  buildScoreDigits,
  buildScoreRoutines,
  buildSubScore,
  MAX_SCORE,
} from '@game/kana-hud';
import { SCORE_DIGITS } from '@game/labels';
import { MEM } from '@game/ram';
import { describe, expect, it } from 'vitest';

import { runProgram } from './helpers/run-program';

function scoreAfter(start: number, ops: ReturnType<typeof buildAddScore>): number {
  const mem = runProgram(
    [
      ...storeByte(MEM.KANA_SCORE.lo, start & 0xff),
      ...storeByte(MEM.KANA_SCORE.hi, start >> 8),
      ...ops,
    ],
    buildScoreRoutines(),
  );
  return (mem[MEM.KANA_SCORE.lo] ?? 0) | ((mem[MEM.KANA_SCORE.hi] ?? 0) << 8);
}

describe('score_digits', () => {
  it.each([0, 7, 10, 99, 100, 255, 256, 1000, 1009, 4860, 9990, 10_000, 12_345, MAX_SCORE])(
    'converts %i into five digit tiles',
    (score) => {
      const mem = runProgram(
        [
          ...storeByte(MEM.KANA_SCORE.lo, score & 0xff),
          ...storeByte(MEM.KANA_SCORE.hi, score >> 8),
          call(SCORE_DIGITS),
        ],
        buildScoreDigits(),
      );
      expect(Array.from(mem.slice(MEM.SCORE_DIGITS.address, MEM.SCORE_DIGITS.address + 5))).toEqual(
        textToTiles(String(score).padStart(5, '0')),
      );
    },
  );
});

describe('score arithmetic', () => {
  it.each([
    [0, 10, 10],
    [250, 10, 260], // carries into the high byte
    [520, 100, 620],
    [9990, 100, 10_090], // past the old four-digit cap
    [MAX_SCORE - 50, 100, MAX_SCORE],
    [MAX_SCORE, 5, MAX_SCORE],
  ] as const)('%i + %i = %i', (start, amount, expected) => {
    expect(scoreAfter(start, buildAddScore(amount))).toBe(expected);
  });

  it.each([
    [520, 100, 420],
    [256, 5, 251], // borrows from the high byte
    [100, 100, 0],
    [3, 5, 0],
    [0, 100, 0],
  ] as const)('%i - %i = %i (never below zero)', (start, amount, expected) => {
    expect(scoreAfter(start, buildSubScore(amount))).toBe(expected);
  });
});
