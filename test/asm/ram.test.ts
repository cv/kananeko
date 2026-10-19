/** The RAM allocator: layout order, page boundaries, variable kinds, sharing, and errors. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { storeByte } from '@asm/macros';
import {
  type ByteVar,
  type WordVar,
  allocate,
  buffer,
  byte,
  byteOf,
  checkRegions,
  same,
  word,
} from '@asm/ram';

const State = { IDLE: 0, BUSY: 2 } as const;

describe('allocate', () => {
  it('lays variables out in declaration order', () => {
    const { vars, end } = allocate('test', 0xc000, 0x100, { A: byte(), B: word(), C: byte() });
    expect([vars.A, vars.B.address, vars.C]).toEqual([0xc000, 0xc001, 0xc003]);
    expect(end).toBe(0xc004);
  });

  it('gives a word its two bytes, little-endian', () => {
    const { vars } = allocate('test', 0xc000, 4, { PTR: word() });
    expect([vars.PTR.lo, vars.PTR.hi]).toEqual([0xc000, 0xc001]);
    expectTypeOf(vars.PTR).toEqualTypeOf<WordVar>();
  });

  it('reaches a buffer one checked byte at a time', () => {
    const { vars } = allocate('test', 0xc000, 8, { BUF: buffer(4) });
    expect(vars.BUF.at(3)).toBe(0xc003);
    expect(() => vars.BUF.at(4)).toThrow(/BUF.at\(4\) is outside its 4 bytes/);
    expect(() => vars.BUF.at(-1)).toThrow(RangeError);
  });

  it('moves a buffer that would cross a page to the next page', () => {
    const { vars } = allocate('test', 0xc0fe, 0x10, { A: byte(), BUF: buffer(4) });
    expect(vars.BUF.address).toBe(0xc100);
  });

  it('shares bytes only where same() asks, as the same kind of variable', () => {
    const { vars, variables } = allocate('test', 0xc000, 0x10, {
      PTR: word(),
      B: byte(),
      ALIAS: same('PTR'),
    });
    expect(vars.ALIAS.lo).toBe(vars.PTR.lo);
    expect(vars.B).toBe(0xc002);
    expect(variables.find((v) => v.name === 'ALIAS')).toMatchObject({ sharesWith: 'PTR', size: 2 });
  });

  it('rejects a full region', () => {
    expect(() => allocate('tiny', 0xc000, 2, { A: word(), B: byte() })).toThrow(/tiny is full: B/);
  });

  it('rejects bad sizes and sharing', () => {
    expect(() => allocate('test', 0xc000, 8, { A: buffer(0) })).toThrow(/positive integer/);
    expect(() => allocate('test', 0xc000, 8, { A: buffer(1.5) })).toThrow(/positive integer/);
    expect(() => allocate('test', 0xc000, 8, { B: same('A'), A: byte() })).toThrow(
      /earlier variable/,
    );
    expect(() => allocate('test', 0xc000, 8, { A: byte(), B: same('A'), C: same('B') })).toThrow(
      /earlier variable of its own/,
    );
  });
});

describe('typed variables', () => {
  const { vars } = allocate('test', 0xc000, 8, {
    STATE: byteOf(State),
    COUNT: byte(),
    PTR: word(),
  });

  it('carry the values a byte may hold', () => {
    expectTypeOf(vars.STATE).toEqualTypeOf<ByteVar<0 | 2>>();
    expect(() => storeByte(vars.STATE, State.BUSY)).not.toThrow();
    // @ts-expect-error 1 isn't a State
    storeByte(vars.STATE, 1);
    storeByte(vars.COUNT, 1);
  });

  it('keep words out of byte instructions', () => {
    // @ts-expect-error a word isn't a byte address: use .lo or .hi
    expect(() => storeByte(vars.PTR, 0)).toThrow();
    storeByte(vars.PTR.lo, 0);
  });

  it('only share with a variable of the same layout', () => {
    // @ts-expect-error there's no NOPE in this layout
    expect(() => allocate('test', 0xc000, 8, { A: byte(), B: same('NOPE') })).toThrow();
  });
});

describe('checkRegions', () => {
  it('rejects overlapping regions', () => {
    const a = allocate('a', 0xc000, 0x100, { X: byte() });
    const b = allocate('b', 0xc080, 0x100, { Y: byte() });
    expect(() => {
      checkRegions([a, b]);
    }).toThrow(/a and b overlap at \$c080/);
    expect(() => {
      checkRegions([a, allocate('c', 0xc100, 1, { Z: byte() })]);
    }).not.toThrow();
  });
});
