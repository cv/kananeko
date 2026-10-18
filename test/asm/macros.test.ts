/** Assembler macros, verified by running them in the emulator. */

import { describe, expect, it } from 'vitest';
import {
  copyBlock,
  copyBytes,
  copyPages,
  countDownOrReturn,
  loadPointer,
  storeByte,
  storePointer,
  switchCases,
  zeroBytes,
  zeroPages,
} from '@asm/macros';
import { add_r, call, cp_r, db, label, ld_a_nn, ld_nn_a, ld_r_n, ld_r_r, ret } from '@asm/ops';
import { type Op, ref, u8, u16 } from '@asm/types';
import { SCRATCH, runProgram } from '../helpers/run-program';

const at = (offset: number): ReturnType<typeof u16> => u16(SCRATCH + offset);

describe('storeByte / zeroBytes', () => {
  it('writes immediates and zeroes', () => {
    const mem = runProgram([
      ...storeByte(at(0), 0x12),
      ...storeByte(at(1), 0x34),
      ...storeByte(at(2), 0x56),
      ...zeroBytes(at(1), at(2)),
    ]);
    expect([mem[SCRATCH], mem[SCRATCH + 1], mem[SCRATCH + 2]]).toEqual([0x12, 0, 0]);
  });
});

describe('loadPointer / storePointer', () => {
  it.each(['bc', 'de', 'hl'] as const)('round-trips %s through a lo/hi pair', (rr) => {
    const mem = runProgram([
      ...storeByte(at(0), 0xcd),
      ...storeByte(at(1), 0xab),
      ...loadPointer(rr, at(0), at(1)),
      ...storePointer(rr, at(2), at(3)),
    ]);
    expect([mem[SCRATCH + 2], mem[SCRATCH + 3]]).toEqual([0xcd, 0xab]);
  });

  it('loads the low byte into the low register', () => {
    const mem = runProgram([
      ...storeByte(at(0), 0x11),
      ...storeByte(at(1), 0x22),
      ...loadPointer('de', at(0), at(1)),
      ld_r_r('a', 'e'),
      ld_nn_a(at(2)),
      ld_r_r('a', 'd'),
      ld_nn_a(at(3)),
    ]);
    expect([mem[SCRATCH + 2], mem[SCRATCH + 3]]).toEqual([0x11, 0x22]);
  });
});

describe('countDownOrReturn', () => {
  it('returns early until the counter reaches zero', () => {
    const tick: Op[] = [
      label('tick'),
      ...countDownOrReturn(at(0)),
      ...storeByte(at(1), 0xff), // only reached when the counter hits zero
      ret(),
    ];
    const mem = runProgram(
      [
        ...storeByte(at(0), 3),
        call(ref('tick')),
        call(ref('tick')),
        ld_a_nn(at(1)),
        ld_nn_a(at(2)), // snapshot after two ticks
        call(ref('tick')),
      ],
      tick,
    );
    expect(mem[SCRATCH + 2]).toBe(0);
    expect(mem[SCRATCH]).toBe(0);
    expect(mem[SCRATCH + 1]).toBe(0xff);
  });
});

describe('block operations', () => {
  it('copies whole pages and zeroes them again', () => {
    const source = Array.from({ length: 256 }, (_, i) => (i * 7 + 1) & 0xff);
    const copy = runProgram(
      [...copyPages('copy', at(0), ref('source'), 1)],
      [label('source'), db(source)],
    );
    expect(Array.from(copy.slice(SCRATCH, SCRATCH + 256))).toEqual(source);

    const zeroed = runProgram(
      [...copyPages('copy', at(0), ref('source'), 1), ...zeroPages('zero', at(0), 1)],
      [label('source'), db(source)],
    );
    expect(zeroed.slice(SCRATCH, SCRATCH + 256).every((b) => b === 0)).toBe(true);
  });
});

describe('copyBytes', () => {
  it('copies an exact number of bytes, including a full 256', () => {
    const source = Array.from({ length: 256 }, (_, i) => (255 - i) & 0xff);
    const mem = runProgram(
      [...copyBytes('cb', at(0), ref('src'), 256), ...copyBytes('cb3', at(0x200), ref('src'), 3)],
      [label('src'), db(source)],
    );
    expect(Array.from(mem.slice(SCRATCH, SCRATCH + 256))).toEqual(source);
    expect(Array.from(mem.slice(SCRATCH + 0x200, SCRATCH + 0x204))).toEqual([255, 254, 253, 0]);
  });

  it('rejects counts outside 1-256', () => {
    expect(() => copyBytes('x', at(0), ref('src'), 0)).toThrow(RangeError);
    expect(() => copyBytes('x', at(0), ref('src'), 257)).toThrow(RangeError);
  });
});

describe('copyBlock', () => {
  it('copies exactly the requested number of bytes, past 256', () => {
    const source = Array.from({ length: 300 }, (_, i) => (i * 3 + 1) & 0xff);
    const mem = runProgram(
      [...copyBlock('blk', at(0), ref('src'), 300)],
      [label('src'), db(source), db([0xee])],
    );
    expect(Array.from(mem.slice(SCRATCH, SCRATCH + 300))).toEqual(source);
    expect(mem[SCRATCH + 300]).not.toBe(0xee);
    expect(() => copyBlock('x', at(0), ref('src'), 0)).toThrow(RangeError);
  });
});

describe('switchCases', () => {
  const cases = [0x10, 0x20, 0x30, 0x40].map((marker) => storeByte(at(0), marker));

  it.each([
    [0, 0x10],
    [1, 0x20],
    [2, 0x30],
    [3, 0x40],
    [9, 0x40], // unmatched values fall through to the last case
  ])('runs only the matching case for A=%i', (value, expected) => {
    const mem = runProgram([
      ...storeByte(at(1), 0), // counts how many bodies ran
      ld_r_n('a', u8(value)),
      ...switchCases(
        cases.map((body) => [
          ...body,
          // Count executed bodies so fall-through bugs are visible
          ld_a_nn(at(1)),
          ld_r_n('b', u8(1)),
          add_r('b'),
          ld_nn_a(at(1)),
        ]),
        { name: 'sw', branch: 'jp', exit: 'jp' },
      ),
    ]);
    expect(mem[SCRATCH]).toBe(expected);
    expect(mem[SCRATCH + 1]).toBe(1);
  });

  it('supports custom comparisons and bodies that exit on their own', () => {
    const marks = [0xaa, 0xbb, 0xcc];
    const program = (b: number): Op[] => [ld_r_n('b', u8(b)), call(ref('pick'))];
    const pick: Op[] = [
      label('pick'),
      ...switchCases(
        marks.map((m) => [...storeByte(at(0), m), ret()]),
        {
          name: 'pick',
          // Match when B equals the case index
          compare: (i) => [ld_r_n('a', u8(i)), cp_r('b')],
          exit: 'none',
        },
      ),
    ];
    expect(runProgram(program(1), pick)[SCRATCH]).toBe(0xbb);
    expect(runProgram(program(2), pick)[SCRATCH]).toBe(0xcc);
  });

  it('produces no done label when bodies exit on their own', () => {
    const ops = switchCases([[ret()], [ret()]], { name: 'x', exit: 'none' });
    expect(ops.some((o) => o.kind === 'label' && o.name === 'x_done')).toBe(false);
  });
});
