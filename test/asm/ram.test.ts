/** The RAM allocator: layout order, page boundaries, sharing, and errors. */

import { describe, expect, it } from 'vitest';
import { allocate, checkRegions, same } from '@asm/ram';

describe('allocate', () => {
  it('lays variables out in declaration order', () => {
    const region = allocate('test', 0xc000, 0x100, { A: 1, B: 2, C: 1 });
    expect(region.addresses).toEqual({ A: 0xc000, B: 0xc001, C: 0xc003 });
    expect(region.end).toBe(0xc004);
  });

  it('moves a buffer that would cross a page to the next page', () => {
    const region = allocate('test', 0xc0fe, 0x10, { A: 1, BUF: 4 });
    expect(region.addresses.BUF).toBe(0xc100);
  });

  it('shares bytes only where same() asks', () => {
    const region = allocate('test', 0xc000, 0x10, { PTR: 2, B: 1, PTR_HI: same('PTR', 1) });
    expect(region.addresses.PTR_HI).toBe(0xc001);
    expect(region.addresses.B).toBe(0xc002);
    expect(region.variables.find((v) => v.name === 'PTR_HI')?.sharesWith).toBe('PTR');
  });

  it('rejects a full region', () => {
    expect(() => allocate('tiny', 0xc000, 2, { A: 2, B: 1 })).toThrow(/tiny is full: B/);
  });

  it('rejects bad sizes and sharing', () => {
    expect(() => allocate('test', 0xc000, 8, { A: 0 })).toThrow(/positive integer/);
    expect(() => allocate('test', 0xc000, 8, { A: 1.5 })).toThrow(/positive integer/);
    expect(() => allocate('test', 0xc000, 8, { A: 1, B: same('A', 1) })).toThrow(/outside A/);
    expect(() => allocate('test', 0xc000, 8, { B: same('A'), A: 1 })).toThrow(/earlier variable/);
    expect(() => allocate('test', 0xc000, 8, { A: 1, B: same('A'), C: same('B') })).toThrow(
      /earlier variable of its own/,
    );
  });
});

describe('checkRegions', () => {
  it('rejects overlapping regions', () => {
    const a = allocate('a', 0xc000, 0x100, { X: 1 });
    const b = allocate('b', 0xc080, 0x100, { Y: 1 });
    expect(() => {
      checkRegions([a, b]);
    }).toThrow(/a and b overlap at \$c080/);
    expect(() => {
      checkRegions([a, allocate('c', 0xc100, 1, { Z: 1 })]);
    }).not.toThrow();
  });
});
