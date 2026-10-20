/** Structured control flow, run in the emulator. */

import { describe, expect, it } from 'vitest';
import {
  block,
  compare,
  dispatch,
  doWhile,
  ifElse,
  ifEquals,
  ifNotEquals,
  ifThen,
  loop,
  repeat,
} from '@asm/flow';
import type { ByteVar } from '@asm/ram';
import { call, cp, dec, inc, jr, label, ld, ret } from '@asm/sm83';
import { Label, u16 } from '@asm/types';
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

describe('block', () => {
  it.each([
    [1, 1],
    [2, 2],
    [9, 3],
  ])('jumping to done skips the rest (A = %i)', (a, expected) => {
    const memory = runProgram([
      ld('a', a),
      ld('b', 1),
      ...block((done) => [cp(1), jr('z', done), inc('b'), cp(2), jr('z', done), inc('b')]),
      ld('a', 'b'),
      ld([OUT], 'a'),
    ]);
    expect(memory[SCRATCH]).toBe(expected);
  });
});

describe('doWhile', () => {
  it('runs its body once, then again while the condition holds', () => {
    const memory = runProgram([
      ld('a', 0),
      ld('c', 4),
      ...doWhile('nz', [inc('a'), inc('a'), dec('c')]),
      ld([OUT], 'a'),
    ]);
    expect(memory[SCRATCH]).toBe(8);
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

const Light = { OFF: 0, ON: 1, BLINK: 2, BROKEN: 3 } as const;
const Mood = { CALM: 0, CROSS: 1 } as const;
const LIGHT = u16(SCRATCH + 8) as ByteVar<(typeof Light)[keyof typeof Light]>;

describe('compare, ifEquals and ifNotEquals', () => {
  it.each([
    [Light.ON, 1, 0],
    [Light.BLINK, 0, 1],
  ])('test a variable against a value (%i)', (value, equal, notEqual) => {
    const memory = runProgram([
      ld('a', value),
      ld([LIGHT], 'a'),
      ld('b', 0),
      ld('c', 0),
      ...ifEquals(LIGHT, Light.ON, [inc('b')]),
      ...ifNotEquals(LIGHT, Light.ON, [inc('c')]),
      ld('a', 'b'),
      ld([OUT], 'a'),
      ld('a', 'c'),
      ld([u16(SCRATCH + 1)], 'a'),
    ]);
    expect([memory[SCRATCH], memory[SCRATCH + 1]]).toEqual([equal, notEqual]);
  });

  it('only takes values of the variable’s own kind', () => {
    // @ts-expect-error: a Mood isn't a Light
    compare(LIGHT, Mood.CROSS + 4);
    expect(compare(LIGHT, Light.BROKEN)).toHaveLength(2);
  });
});

describe('dispatch', () => {
  const ROUTINE = new Label('light_routine');
  const blink = new Label();
  const broken = new Label();
  const routine = [
    label(ROUTINE),
    ld('b', 0xee),
    ...dispatch(LIGHT, Light, { OFF: 'ret', ON: 'continue', BLINK: blink, BROKEN: broken }),
    ld('b', 1),
    ret(),
    label(blink),
    ld('b', 2),
    ret(),
    label(broken),
    ld('b', 3),
    ret(),
  ];

  it.each([
    [Light.OFF, 0xee],
    [Light.ON, 1],
    [Light.BLINK, 2],
    [Light.BROKEN, 3],
  ])('takes the case for %i', (value, expected) => {
    const memory = runProgram(
      [ld('a', value), ld([LIGHT], 'a'), call(ROUTINE), ld('a', 'b'), ld([OUT], 'a')],
      routine,
    );
    expect(memory[SCRATCH]).toBe(expected);
  });

  it('needs no test for the last case when none continues', () => {
    const ops = dispatch(LIGHT, Light, {
      OFF: 'ret',
      ON: 'ret',
      BLINK: 'ret',
      BROKEN: new Label(),
    });
    expect(ops.filter((op) => op.kind === 'inst' && op.bytes[0] === 0xfe)).toHaveLength(3); // CP n
  });

  it('needs a case for every value, from the variable’s own enum', () => {
    // @ts-expect-error: BROKEN has no case
    expect(() => dispatch(LIGHT, Light, { OFF: 'ret', ON: 'continue', BLINK: 'ret' })).toThrow(
      /BROKEN/,
    );
    // @ts-expect-error: a Mood isn't a Light
    dispatch(LIGHT, Mood, { CALM: 'ret', CROSS: 'continue' });
    expect(() =>
      dispatch(LIGHT, Light, {
        OFF: 'continue',
        ON: 'continue',
        BLINK: 'continue',
        BROKEN: 'continue',
      }),
    ).toThrow();
  });
});
