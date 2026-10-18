/** Score arithmetic subroutines, run in the emulator. */

import { describe, expect, it } from 'vitest';
import { MEM } from '@asm/hardware';
import { storeByte } from '@asm/macros';
import { MAX_SCORE, buildAddScore, buildScoreRoutines, buildSubScore } from '@game/kana-hud';
import { runProgram } from './helpers/run-program';

function scoreAfter(start: number, ops: ReturnType<typeof buildAddScore>): number {
  const mem = runProgram(
    [
      ...storeByte(MEM.KANA_SCORE_LO, start & 0xff),
      ...storeByte(MEM.KANA_SCORE_HI, start >> 8),
      ...ops,
    ],
    buildScoreRoutines(),
  );
  return (mem[MEM.KANA_SCORE_LO] ?? 0) | ((mem[MEM.KANA_SCORE_HI] ?? 0) << 8);
}

describe('score arithmetic', () => {
  it.each([
    [0, 10, 10],
    [250, 10, 260], // carries into the high byte
    [520, 100, 620],
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
