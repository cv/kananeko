/** Record layouts. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { assemble } from '@asm/assembler';
import { type FieldsOf, byte, struct, word } from '@asm/struct';
import { label } from '@asm/sm83';
import { Label } from '@asm/types';

const ENTRY = struct('entry', { ptr: word(), count: byte(), flags: byte(), size: word() });

describe('struct', () => {
  it('lays fields out in declaration order', () => {
    expect(ENTRY.offset).toEqual({ ptr: 0, count: 2, flags: 3, size: 4 });
    expect(ENTRY.size).toBe(6);
  });

  it('encodes a record and decodes it back', () => {
    const target = new Label('target');
    const { rom, symbols } = assemble(
      [...ENTRY.encode({ ptr: target, count: 3, flags: 0x80, size: 0x1234 }), label(target)],
      { title: 'TEST' },
    );
    expect(ENTRY.decode(rom, 0x150)).toEqual({
      ptr: symbols.get('target'),
      count: 3,
      flags: 0x80,
      size: 0x1234,
    });
  });

  it('range-checks values', () => {
    expect(() => ENTRY.encode({ ptr: 0, count: 256, flags: 0, size: 0 })).toThrow(RangeError);
    expect(() => ENTRY.encode({ ptr: 0x10000, count: 0, flags: 0, size: 0 })).toThrow(RangeError);
  });

  it('types its fields by kind', () => {
    expectTypeOf<FieldsOf<typeof ENTRY.fields, 'word'>>().toEqualTypeOf<'ptr' | 'size'>();
    expectTypeOf<FieldsOf<typeof ENTRY.fields, 'byte'>>().toEqualTypeOf<'count' | 'flags'>();
    // @ts-expect-error a byte field can't hold an address
    expect(() => ENTRY.encode({ ptr: 0, count: new Label('x'), flags: 0, size: 0 })).toThrow(
      /byte/,
    );
  });
});
