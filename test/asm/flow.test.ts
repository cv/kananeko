/** Structured control flow, run in the emulator. */

import { describe, expect, it } from 'vitest';
import { ifElse, ifThen, loop, repeat } from '@asm/flow';
import { cp_n, dec_r, inc_r, jr, jr_cc, ld_nn_a, ld_r_n, ld_r_r, ret } from '@asm/ops';
import { u8, u16 } from '@asm/types';
import { SCRATCH, runProgram } from '../helpers/run-program';

const OUT = u16(SCRATCH);

describe('ifThen', () => {
  it.each([
    [3, 1],
    [4, 0],
  ])('runs its body only when the condition holds (A = %i)', (a, expected) => {
    const memory = runProgram([
      ld_r_n('a', u8(a)),
      ld_r_n('b', u8(0)),
      cp_n(u8(3)),
      ...ifThen('z', [inc_r('b')]),
      ld_r_r('a', 'b'),
      ld_nn_a(OUT),
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
      ld_r_n('a', u8(a)),
      cp_n(u8(3)),
      ...ifElse('c', [ld_r_n('a', u8(0xaa))], [ld_r_n('a', u8(0xbb))]),
      ld_nn_a(OUT),
    ]);
    expect(memory[SCRATCH]).toBe(expected);
  });

  it('leaves out the jump past the else branch when the then branch returns', () => {
    const ops = ifElse('z', [ret()], [inc_r('a')]);
    expect(ops.filter((op) => op.kind === 'jump')).toHaveLength(1);
  });
});

describe('repeat', () => {
  it.each([1, 7, 256])('runs its body %i times', (count) => {
    const memory = runProgram([
      ld_r_n('c', u8(0)),
      ld_r_n('d', u8(0)),
      ...repeat(count, [inc_r('c'), ...ifThen('z', [inc_r('d')])]),
      ld_r_r('a', 'c'),
      ld_nn_a(OUT),
      ld_r_r('a', 'd'),
      ld_nn_a(u16(SCRATCH + 1)),
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
      ld_r_n('a', u8(5)),
      ld_r_n('b', u8(0)),
      ...loop((again, done) => [cp_n(u8(0)), jr_cc('z', done), dec_r('a'), inc_r('b'), jr(again)]),
      ld_r_r('a', 'b'),
      ld_nn_a(OUT),
    ]);
    expect(memory[SCRATCH]).toBe(5);
  });
});
