/** Assembler macros, verified by running them in the emulator. */

import {
  addAToHl,
  copyBlock,
  copyByte,
  copyBytes,
  copyPages,
  copyWord,
  countDownOrReturn,
  decByte,
  expandOneBit,
  incByte,
  loadPointer,
  storeByte,
  storePointer,
  switchCases,
  tableEntry,
  zeroBlock,
  zeroBytes,
  zeroPages,
} from '@asm/macros';
import { allocate, type ByteVar, word } from '@asm/ram';
import { add, call, cp, db, jr, label, ld, ret } from '@asm/sm83';
import { Label, type Op, u16 } from '@asm/types';
import { describe, expect, it } from 'vitest';

import { runProgram, SCRATCH } from '../helpers/run-program';

// Labels placed in this module
const TICK = new Label('tick');
const SOURCE = new Label('source');
const SRC = new Label('src');
const PICK = new Label('pick');

const at = (offset: number): ReturnType<typeof u16> => u16(SCRATCH + offset);

/** Words in the scratch area: W0 at SCRATCH, W2 two bytes on */
const { W0, W2 } = allocate('scratch', SCRATCH, 4, { W0: word(), W2: word() }).vars;

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
      ...loadPointer(rr, W0),
      ...storePointer(rr, W2),
    ]);
    expect([mem[SCRATCH + 2], mem[SCRATCH + 3]]).toEqual([0xcd, 0xab]);
  });

  it('loads the low byte into the low register', () => {
    const mem = runProgram([
      ...storeByte(at(0), 0x11),
      ...storeByte(at(1), 0x22),
      ...loadPointer('de', W0),
      ld('a', 'e'),
      ld([at(2)], 'a'),
      ld('a', 'd'),
      ld([at(3)], 'a'),
    ]);
    expect([mem[SCRATCH + 2], mem[SCRATCH + 3]]).toEqual([0x11, 0x22]);
  });
});

describe('countDownOrReturn', () => {
  it('returns early until the counter reaches zero', () => {
    const tick: Op[] = [
      label(TICK),
      ...countDownOrReturn(at(0)),
      ...storeByte(at(1), 0xff), // only reached when the counter hits zero
      ret(),
    ];
    const mem = runProgram(
      [
        ...storeByte(at(0), 3),
        call(TICK),
        call(TICK),
        ld('a', [at(1)]),
        ld([at(2)], 'a'), // snapshot after two ticks
        call(TICK),
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
    const copy = runProgram([...copyPages(at(0), SOURCE, 1)], [label(SOURCE), db(source)]);
    expect(Array.from(copy.slice(SCRATCH, SCRATCH + 256))).toEqual(source);

    const zeroed = runProgram(
      [...copyPages(at(0), SOURCE, 1), ...zeroPages(at(0), 1)],
      [label(SOURCE), db(source)],
    );
    expect(zeroed.slice(SCRATCH, SCRATCH + 256).every((b) => b === 0)).toBe(true);
  });

  it('zeroes a block of up to 256 bytes', () => {
    const source = Array.from({ length: 256 }, () => 0xee);
    const memory = runProgram(
      [...copyPages(at(0), SOURCE, 1), ...zeroBlock(at(1), 254)],
      [label(SOURCE), db(source)],
    );
    expect(memory[SCRATCH]).toBe(0xee);
    expect(memory.slice(SCRATCH + 1, SCRATCH + 255).every((b) => b === 0)).toBe(true);
    expect(memory[SCRATCH + 255]).toBe(0xee);
    expect(() => zeroBlock(at(0), 0)).toThrow(RangeError);
    expect(() => zeroBlock(at(0), 257)).toThrow(RangeError);
  });

  it.each([0, 256, 1.5])('rejects %s pages (B = 0 would mean 256 pages)', (pages) => {
    expect(() => zeroPages(at(0), pages)).toThrow(RangeError);
    expect(() => copyPages(at(0), SRC, pages)).toThrow(RangeError);
  });
});

describe('copyBytes', () => {
  it('copies an exact number of bytes, including a full 256', () => {
    const source = Array.from({ length: 256 }, (_, i) => (255 - i) & 0xff);
    const mem = runProgram(
      [...copyBytes(at(0), SRC, 256), ...copyBytes(at(0x200), SRC, 3)],
      [label(SRC), db(source)],
    );
    expect(Array.from(mem.slice(SCRATCH, SCRATCH + 256))).toEqual(source);
    expect(Array.from(mem.slice(SCRATCH + 0x200, SCRATCH + 0x204))).toEqual([255, 254, 253, 0]);
  });

  it('rejects counts outside 1-256', () => {
    expect(() => copyBytes(at(0), SRC, 0)).toThrow(RangeError);
    expect(() => copyBytes(at(0), SRC, 257)).toThrow(RangeError);
  });
});

describe('copyBlock', () => {
  it('copies exactly the requested number of bytes, past 256', () => {
    const source = Array.from({ length: 300 }, (_, i) => (i * 3 + 1) & 0xff);
    const mem = runProgram([...copyBlock(at(0), SRC, 300)], [label(SRC), db(source), db([0xee])]);
    expect(Array.from(mem.slice(SCRATCH, SCRATCH + 300))).toEqual(source);
    expect(mem[SCRATCH + 300]).not.toBe(0xee);
    expect(() => copyBlock(at(0), SRC, 0)).toThrow(RangeError);
  });
});

describe('expandOneBit', () => {
  it('writes every byte twice, filling both bit planes', () => {
    const source = [0x81, 0x7e, 0x00, 0xff];
    const mem = runProgram([...expandOneBit(at(0), SRC, source.length)], [label(SRC), db(source)]);
    expect(Array.from(mem.slice(SCRATCH, SCRATCH + 8))).toEqual([
      0x81, 0x81, 0x7e, 0x7e, 0x00, 0x00, 0xff, 0xff,
    ]);
    expect(() => expandOneBit(at(0), SRC, 0)).toThrow(RangeError);
    expect(() => expandOneBit(at(0), SRC, 0x10000)).toThrow(RangeError);
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
      ld('a', value),
      ...switchCases(
        cases.map((body) => [
          ...body,
          // Count executed bodies so fall-through bugs are visible
          ld('a', [at(1)]),
          ld('b', 1),
          add('b'),
          ld([at(1)], 'a'),
        ]),
      ),
    ]);
    expect(mem[SCRATCH]).toBe(expected);
    expect(mem[SCRATCH + 1]).toBe(1);
  });

  it('supports custom comparisons and bodies that exit on their own', () => {
    const marks = [0xaa, 0xbb, 0xcc];
    const program = (b: number): Op[] => [ld('b', b), call(PICK)];
    const pick: Op[] = [
      label(PICK),
      ...switchCases(
        marks.map((m) => [...storeByte(at(0), m), ret()]),
        {
          // Match when B equals the case index
          compare: (i) => [ld('a', i), cp('b')],
          exit: 'none',
        },
      ),
    ];
    expect(runProgram(program(1), pick)[SCRATCH]).toBe(0xbb);
    expect(runProgram(program(2), pick)[SCRATCH]).toBe(0xcc);
  });

  it('produces no done label when bodies exit on their own', () => {
    const ops = switchCases([[ret()], [ret()]], { exit: 'none' });
    expect(ops.some((o) => o.kind === 'label' && o.label.name === 'x_done')).toBe(false);
  });
});

describe('incByte / decByte', () => {
  it('change a byte in memory, leaving the new value in A and Z when it hits 0', () => {
    const mem = runProgram([
      ...storeByte(at(0), 0xff),
      ...storeByte(at(1), 1),
      ...incByte(at(0)),
      ld([at(2)], 'a'),
      ...decByte(at(1)),
      ...ifZeroStore(at(3)),
    ]);
    expect([mem[SCRATCH], mem[SCRATCH + 1], mem[SCRATCH + 2], mem[SCRATCH + 3]]).toEqual([
      0, 0, 0, 1,
    ]);
  });
});

/** Write 1 to `addr` if Z is set */
function ifZeroStore(addr: ReturnType<typeof u16>): Op[] {
  const skip = new Label();
  return [ld('a', 1), jr('nz', skip), ld([addr], 'a'), label(skip)];
}

describe('copyByte / copyWord', () => {
  it('copy bytes and words', () => {
    const mem = runProgram([
      ...storeByte(at(0), 0x34),
      ...storeByte(at(1), 0x12),
      ...copyWord(W2, W0),
      ...copyByte(at(4), at(1)),
    ]);
    expect([mem[SCRATCH + 2], mem[SCRATCH + 3], mem[SCRATCH + 4]]).toEqual([0x34, 0x12, 0x12]);
  });

  it('only copies into a byteOf variable from one of the same kind', () => {
    const light = at(5) as ByteVar<0 | 1>;
    const mood = at(6) as ByteVar<0 | 1 | 2>;
    // @ts-expect-error: a mood can be 2, which isn't a light
    copyByte(light, mood);
    expect(copyByte(mood, light)).toHaveLength(2);
  });
});

describe('tableEntry / addAToHl', () => {
  it.each([1, 2, 4] as const)('points HL at entry 3 of a table with %i-byte entries', (stride) => {
    const TABLE = new Label('table');
    const mem = runProgram(
      [ld('a', 3), ...tableEntry(TABLE, stride), ld('a', ['hl']), ld([at(0)], 'a')],
      [label(TABLE), db(Array.from({ length: 16 }, (_, i) => i))],
    );
    expect(mem[SCRATCH]).toBe(3 * stride);
  });

  it('adds A to HL', () => {
    const mem = runProgram([
      ld('hl', 0x12f0),
      ld('a', 0x20),
      ...addAToHl(),
      ld('a', 'h'),
      ld([at(0)], 'a'),
      ld('a', 'l'),
      ld([at(1)], 'a'),
    ]);
    expect([mem[SCRATCH], mem[SCRATCH + 1]]).toEqual([0x13, 0x10]);
  });
});
