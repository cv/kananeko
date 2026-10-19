/** Structured control flow, run in the emulator. */

import { describe, expect, it } from 'vitest';
import { ifElse, ifThen, loop, repeat } from '@asm/flow';
import { cp, dec, inc, jr, ld, ret } from '@asm/sm83';
import { u16 } from '@asm/types';
import { SCRATCH, runProgram } from '../helpers/run-program';

const OUT = u16(SCRATCH);

describe('ifThen', () => {
  it.each([
    [3, 1],
    [4, 0],
  ])('runs its body only when the condition holds (A = %i)', (a, expected) => {
    const memory = runProgram([
      ld('a', a),
      ld('b', 0),
      cp(3),
      ...ifThen('z', [inc('b')]),
      ld('a', 'b'),
      ld([OUT], 'a'),
    ]);
    expect(memory[SCRATCH]).toBe(expected);
  });
});

describe('ifElse', () => {
  it.each([
    [1, 0xaa],
    [5, 0xbb],
  ])('picks one branch (A = %i)', (a, expected) => {
    const memory = runProgram([
      ld('a', a),
      cp(3),
      ...ifElse('c', [ld('a', 0xaa)], [ld('a', 0xbb)]),
      ld([OUT], 'a'),
    ]);
    expect(memory[SCRATCH]).toBe(expected);
  });

  it('leaves out the jump past the else branch when the then branch returns', () => {
    const ops = ifElse('z', [ret()], [inc('a')]);
    expect(ops.filter((op) => op.kind === 'jump')).toHaveLength(1);
  });
});

describe('repeat', () => {
  it.each([1, 7, 256])('runs its body %i times', (count) => {
    const memory = runProgram([
      ld('c', 0),
      ld('d', 0),
      ...repeat(count, [inc('c'), ...ifThen('z', [inc('d')])]),
      ld('a', 'c'),
      ld([OUT], 'a'),
      ld('a', 'd'),
      ld([u16(SCRATCH + 1)], 'a'),
    ]);
    expect((memory[SCRATCH] ?? 0) + 256 * (memory[SCRATCH + 1] ?? 0)).toBe(count);
  });

  it('rejects counts outside 1-256', () => {
    expect(() => repeat(0, [])).toThrow(RangeError);
    expect(() => repeat(257, [])).toThrow(RangeError);
  });
});

describe('loop', () => {
  it('goes round until the body jumps to done', () => {
    const memory = runProgram([
      ld('a', 5),
      ld('b', 0),
      ...loop((again, done) => [cp(0), jr('z', done), dec('a'), inc('b'), jr(again)]),
      ld('a', 'b'),
      ld([OUT], 'a'),
    ]);
    expect(memory[SCRATCH]).toBe(5);
  });
});
