/** Register contracts, checked against what routines' code does. */

import { describe, expect, it } from 'vitest';
import { REG, effect } from '@asm/analysis';
import { assemble } from '@asm/assembler';
import { call, inc, jp, jr, label, ld, nop, pop, push, ret, xor } from '@asm/sm83';
import { type ExternalRoutine, Label, type Op, routine, u16 } from '@asm/types';

const HEADER = { title: 'TEST' };

/** Assemble with contracts checked; returns the stack bound or throws the problems */
function check(program: Op[], vblankHandler?: Label): number | undefined {
  return assemble(program, vblankHandler === undefined ? HEADER : { ...HEADER, vblankHandler }, {
    contracts: 'strict',
  }).stackDepth;
}

/** The main program: call `target`, then loop forever */
const main = (...ops: Op[]): Op[] => {
  const forever = new Label();
  return [...ops, label(forever), jr(forever)];
};

describe('effect', () => {
  it('knows what instructions read and write', () => {
    expect(effect([0x78])).toMatchObject({ reads: REG.b, writes: REG.a }); // LD A,B
    expect(effect([0x7e])).toMatchObject({ reads: REG.h | REG.l, writes: REG.a }); // LD A,(HL)
    expect(effect([0xfe, 3])).toMatchObject({ reads: REG.a, writes: REG.f }); // CP n
    expect(effect([0xaf])).toMatchObject({ reads: 0, writes: REG.a | REG.f }); // XOR A
    expect(effect([0x2a])).toMatchObject({ writes: REG.a | REG.h | REG.l }); // LD A,(HL+)
    expect(effect([0xcb, 0x7e])).toMatchObject({ reads: REG.h | REG.l, writes: REG.f }); // BIT 7,(HL)
    expect(effect([0xc5])).toMatchObject({ push: REG.b | REG.c });
    expect(effect([0xc9]).flow).toBe('ret');
  });
});

describe('contracts', () => {
  it('pass when a routine changes only what it declares', () => {
    const r = routine('r', { clobbers: ['b'] });
    expect(check([...main(call(r)), label(r), ld('b', 1), ret()])).toBe(2);
  });

  it('fail when a routine changes an undeclared register', () => {
    const r = routine('r', { clobbers: ['b'] });
    expect(() => check([...main(call(r)), label(r), ld('c', 1), ret()])).toThrow(
      /r changes C, which its contract doesn't allow/,
    );
  });

  it("don't count registers a routine saves and restores", () => {
    const r = routine('r', {});
    expect(check([...main(call(r)), label(r), push('bc'), ld('b', 1), pop('bc'), ret()])).toBe(4);
  });

  it('count what a routine calls, and what it tail-jumps to', () => {
    const inner = routine('inner', { clobbers: ['d'] });
    const outer = routine('outer', { clobbers: ['e'] });
    expect(() =>
      check([
        ...main(call(outer), call(inner)),
        label(outer),
        ld('e', 0),
        jp(inner),
        label(inner),
        ld('d', 0),
        ret(),
      ]),
    ).toThrow(/outer changes D/);
  });

  it('fail when a caller still needs a register the routine clobbers', () => {
    const r = routine('r', { clobbers: ['b'] });
    expect(() =>
      check([
        ...main(ld('b', 5), call(r), ld('a', 'b'), ld([u16(0xc000)], 'a')),
        label(r),
        ld('b', 1),
        ret(),
      ]),
    ).toThrow(/still needs B after calling r/);
  });

  it('let callers use what a routine returns', () => {
    const r = routine('r', { out: ['b'] });
    expect(
      check([...main(call(r), ld('a', 'b'), ld([u16(0xc000)], 'a')), label(r), ld('b', 1), ret()]),
    ).toBe(2);
  });

  it('use the contracts of routines outside the program', () => {
    const dma: ExternalRoutine = {
      name: 'dma',
      address: u16(0xff80),
      contract: { clobbers: ['a'] },
    };
    expect(() => check(main(ld('a', 1), call(dma), inc('a'), ld([u16(0xc000)], 'a')))).toThrow(
      /still needs A after calling dma/,
    );
  });

  it('require a contract on every called routine', () => {
    const r = new Label('r');
    expect(() => check([...main(call(r)), label(r), ret()])).toThrow(/routine r has no contract/);
  });

  it('require interrupt handlers to restore what they use', () => {
    const handler = routine('handler', {});
    expect(() => check([...main(nop()), label(handler), xor('a'), ret()], handler)).toThrow(
      /interrupt handler handler changes A, F/,
    );
    const saving = routine('saving', {});
    expect(
      check([...main(nop()), label(saving), push('af'), xor('a'), pop('af'), ret()], saving),
    ).toBe(4);
  });

  it('catch unbalanced stacks', () => {
    const r = routine('r', {});
    expect(() => check([...main(call(r)), label(r), push('bc'), ret()])).toThrow(
      /returns with 2 bytes still pushed/,
    );
  });

  it('bound the stack by the deepest call chain plus an interrupt', () => {
    const leaf = routine('leaf', {});
    const mid = routine('mid', {});
    const handler = routine('handler', {});
    const program = [
      ...main(call(mid)),
      label(mid),
      push('bc'),
      call(leaf),
      pop('bc'),
      ret(),
      label(leaf),
      ret(),
      label(handler),
      push('hl'),
      pop('hl'),
      ret(),
    ];
    // main → mid (2) → push (2) → leaf (2), and an interrupt there (2 + 2)
    expect(check(program, handler)).toBe(10);
  });
});
