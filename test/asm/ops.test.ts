/** Opcode encodings, checked against the published SM83 opcode table. */

import * as op from '@asm/ops';
import { ioReg, Label, type Op, s8, u8, u16 } from '@asm/types';
import { hi, lo } from '@asm/util';
import { describe, expect, it } from 'vitest';

// Labels placed in this module
const HERE = new Label('here');
const X = new Label('x');

function bytes(o: Op): number[] {
  if (o.kind !== 'inst') throw new Error(`expected an instruction, got ${o.kind}`);
  return [...o.bytes];
}

const ENCODINGS: [string, Op, number[]][] = [
  // 8-bit loads
  ['LD B,C', op.ld_r_r('b', 'c'), [0x41]],
  ['LD A,(HL)', op.ld_r_r('a', 'hl_ptr'), [0x7e]],
  ['LD (HL),E', op.ld_r_r('hl_ptr', 'e'), [0x73]],
  ['LD A,$12', op.ld_r_n('a', u8(0x12)), [0x3e, 0x12]],
  ['LD L,$FF', op.ld_r_n('l', u8(0xff)), [0x2e, 0xff]],
  ['LD (HL),$34', op.ld_hl_n(u8(0x34)), [0x36, 0x34]],
  ['LD A,(BC)', op.ld_a_bc(), [0x0a]],
  ['LD A,(DE)', op.ld_a_de(), [0x1a]],
  ['LD (BC),A', op.ld_bc_a(), [0x02]],
  ['LD (DE),A', op.ld_de_a(), [0x12]],
  ['LD A,(HL+)', op.ldi_a_hl(), [0x2a]],
  ['LD A,(HL-)', op.ldd_a_hl(), [0x3a]],
  ['LD (HL+),A', op.ldi_hl_a(), [0x22]],
  ['LD (HL-),A', op.ldd_hl_a(), [0x32]],
  ['LD ($C000),A', op.ld_nn_a(u16(0xc000)), [0xea, 0x00, 0xc0]],
  ['LD A,($C123)', op.ld_a_nn(u16(0xc123)), [0xfa, 0x23, 0xc1]],
  ['LD ($FF90),A as LDH', op.ld_nn_a(u16(0xff90)), [0xe0, 0x90]],
  ['LD A,($FFFE) as LDH', op.ld_a_nn(u16(0xfffe)), [0xf0, 0xfe]],
  ['LDH ($40),A', op.ldh_n_a(ioReg(0x40)), [0xe0, 0x40]],
  ['LDH (C),A', op.ldh_c_a(), [0xe2]],
  ['RLCA', op.rlca(), [0x07]],
  ['LDH A,(C)', op.ldh_a_c(), [0xf2]],
  ['LDH A,($44)', op.ldh_a_n(ioReg(0x44)), [0xf0, 0x44]],
  // 16-bit loads
  ['LD BC,$1234', op.ld_rr_nn('bc', u16(0x1234)), [0x01, 0x34, 0x12]],
  ['LD DE,$8000', op.ld_rr_nn('de', u16(0x8000)), [0x11, 0x00, 0x80]],
  ['LD HL,$9800', op.ld_rr_nn('hl', u16(0x9800)), [0x21, 0x00, 0x98]],
  ['LD SP,$FFFE', op.ld_rr_nn('sp', u16(0xfffe)), [0x31, 0xfe, 0xff]],
  ['LD SP,HL', op.ld_sp_hl(), [0xf9]],
  // ALU
  ['ADD A,B', op.add_r('b'), [0x80]],
  ['ADC A,C', op.adc_r('c'), [0x89]],
  ['SUB D', op.sub_r('d'), [0x92]],
  ['SBC A,E', op.sbc_r('e'), [0x9b]],
  ['AND H', op.and_r('h'), [0xa4]],
  ['XOR A', op.xor_r('a'), [0xaf]],
  ['OR L', op.or_r('l'), [0xb5]],
  ['CP (HL)', op.cp_r('hl_ptr'), [0xbe]],
  ['ADD A,n', op.add_n(u8(1)), [0xc6, 0x01]],
  ['ADC A,n', op.adc_n(u8(2)), [0xce, 0x02]],
  ['SUB n', op.sub_n(u8(3)), [0xd6, 0x03]],
  ['SBC A,n', op.sbc_n(u8(4)), [0xde, 0x04]],
  ['AND n', op.and_n(u8(5)), [0xe6, 0x05]],
  ['XOR n', op.xor_n(u8(6)), [0xee, 0x06]],
  ['OR n', op.or_n(u8(7)), [0xf6, 0x07]],
  ['CP n', op.cp_n(u8(8)), [0xfe, 0x08]],
  ['INC A', op.inc_r('a'), [0x3c]],
  ['DEC B', op.dec_r('b'), [0x05]],
  ['INC (HL)', op.inc_r('hl_ptr'), [0x34]],
  ['INC HL', op.inc_rr('hl'), [0x23]],
  ['DEC DE', op.dec_rr('de'), [0x1b]],
  ['ADD HL,BC', op.add_hl_rr('bc'), [0x09]],
  ['ADD HL,SP', op.add_hl_rr('sp'), [0x39]],
  ['CPL', op.cpl(), [0x2f]],
  // Control flow
  ['JP $0150', op.jp(u16(0x0150)), [0xc3, 0x50, 0x01]],
  ['JP NZ,nn', op.jp_cc('nz', u16(0x1234)), [0xc2, 0x34, 0x12]],
  ['JP Z,nn', op.jp_cc('z', u16(0x1234)), [0xca, 0x34, 0x12]],
  ['JP NC,nn', op.jp_cc('nc', u16(0x1234)), [0xd2, 0x34, 0x12]],
  ['JP C,nn', op.jp_cc('c', u16(0x1234)), [0xda, 0x34, 0x12]],
  ['CALL nn', op.call(u16(0x4000)), [0xcd, 0x00, 0x40]],
  ['RET', op.ret(), [0xc9]],
  ['RETI', op.reti(), [0xd9]],
  ['RET NZ', op.ret_cc('nz'), [0xc0]],
  ['RET C', op.ret_cc('c'), [0xd8]],
  ['RST $38', op.rst(0x38), [0xff]],
  // Stack
  ['PUSH AF', op.push('af'), [0xf5]],
  ['PUSH HL', op.push('hl'), [0xe5]],
  ['POP BC', op.pop('bc'), [0xc1]],
  ['POP AF', op.pop('af'), [0xf1]],
  // Misc
  ['NOP', op.nop(), [0x00]],
  ['HALT', op.halt(), [0x76]],
  ['DI', op.di(), [0xf3]],
  ['EI', op.ei(), [0xfb]],
  // CB prefix
  ['BIT 7,H', op.bit(7, 'h'), [0xcb, 0x7c]],
  ['RES 0,A', op.res(0, 'a'), [0xcb, 0x87]],
  ['SET 3,B', op.set(3, 'b'), [0xcb, 0xd8]],
  ['SWAP A', op.swap('a'), [0xcb, 0x37]],
  ['RL C', op.rl('c'), [0xcb, 0x11]],
  ['RR D', op.rr('d'), [0xcb, 0x1a]],
  ['SLA E', op.sla('e'), [0xcb, 0x23]],
  ['SRA H', op.sra('h'), [0xcb, 0x2c]],
  ['SRL A', op.srl('a'), [0xcb, 0x3f]],
];

describe('opcode encoding', () => {
  it.each(ENCODINGS)('%s', (_mnemonic, instruction, expected) => {
    expect(bytes(instruction)).toEqual(expected);
  });
});

describe('jumps to labels', () => {
  it.each([
    ['JP', op.jp(X), 0x18, 0xc3],
    ['JP NZ', op.jp_cc('nz', X), 0x20, 0xc2],
    ['JP Z', op.jp_cc('z', X), 0x28, 0xca],
    ['JP NC', op.jp_cc('nc', X), 0x30, 0xd2],
    ['JP C', op.jp_cc('c', X), 0x38, 0xda],
  ])('%s leaves the assembler a JR or a JP', (_m, instruction, jrOpcode, jpOpcode) => {
    expect(instruction).toEqual({
      kind: 'jump',
      target: X,
      short: {
        kind: 'inst',
        bytes: [jrOpcode, 0x00],
        refs: [{ type: 'rel8', offset: 1, target: X }],
      },
      long: {
        kind: 'inst',
        bytes: [jpOpcode, 0x00, 0x00],
        refs: [{ type: 'imm16', offset: 1, target: X }],
      },
    });
  });

  it('jumps to a fixed address with JP', () => {
    expect(bytes(op.jp(u16(0x1234)))).toEqual([0xc3, 0x34, 0x12]);
    expect(bytes(op.jp_cc('c', u16(0x1234)))).toEqual([0xda, 0x34, 0x12]);
  });
});

describe('label references', () => {
  it.each([
    ['JR', op.jr(X), 0x18],
    ['JR NZ', op.jr_cc('nz', X), 0x20],
    ['JR Z', op.jr_cc('z', X), 0x28],
    ['JR NC', op.jr_cc('nc', X), 0x30],
    ['JR C', op.jr_cc('c', X), 0x38],
  ])('%s emits a rel8 placeholder', (_m, instruction, opcode) => {
    expect(instruction).toEqual({
      kind: 'inst',
      bytes: [opcode, 0x00],
      refs: [{ type: 'rel8', offset: 1, target: X }],
    });
  });

  it.each([
    ['JP (always long)', op.jp_long(X), 0xc3],
    ['CALL', op.call(X), 0xcd],
    ['LD HL', op.ld_rr_nn('hl', X), 0x21],
  ])('%s emits an imm16 placeholder', (_m, instruction, opcode) => {
    expect(instruction).toEqual({
      kind: 'inst',
      bytes: [opcode, 0x00, 0x00],
      refs: [{ type: 'imm16', offset: 1, target: X }],
    });
  });
});

describe('pseudo-ops', () => {
  it('emits labels, origins, and raw data', () => {
    expect(op.label(HERE)).toEqual({ kind: 'label', label: HERE });
    expect(op.pool()).toEqual({ kind: 'pool' });
    expect(op.org(u16(0x4000))).toEqual({ kind: 'org', address: 0x4000 });
    expect(op.db([1, 2, 3])).toEqual({ kind: 'data', bytes: new Uint8Array([1, 2, 3]) });
  });
});

describe('branded numbers', () => {
  it('rejects values outside their range', () => {
    expect(() => u8(256)).toThrow(RangeError);
    expect(() => u8(-1)).toThrow(RangeError);
    expect(() => u16(0x10000)).toThrow(RangeError);
    expect(() => ioReg(0x100)).toThrow(RangeError);
    expect(u8(255)).toBe(255);
    expect(u16(0xffff)).toBe(0xffff);
  });

  it.each([Number.NaN, 1.5, Number.POSITIVE_INFINITY])('rejects %s', (n) => {
    expect(() => u8(n)).toThrow(RangeError);
    expect(() => u16(n)).toThrow(RangeError);
    expect(() => ioReg(n)).toThrow(RangeError);
    expect(() => s8(n)).toThrow(RangeError);
  });

  it("encodes signed bytes in two's complement", () => {
    expect(s8(-1)).toBe(0xff);
    expect(s8(-128)).toBe(0x80);
    expect(s8(127)).toBe(0x7f);
    expect(() => s8(128)).toThrow(RangeError);
    expect(() => s8(-129)).toThrow(RangeError);
  });

  it('splits 16-bit values into bytes, rejecting anything wider', () => {
    expect([lo(0x1234), hi(0x1234)]).toEqual([0x34, 0x12]);
    expect(() => lo(0x10000)).toThrow(RangeError);
    expect(() => hi(-1)).toThrow(RangeError);
  });
});

describe('operand validation', () => {
  it('rejects db bytes that would silently wrap', () => {
    expect(() => op.db([0x100])).toThrow(/db byte 0/);
    expect(() => op.db([1, -1])).toThrow(/db byte 1/);
    expect(() => op.db([0.5])).toThrow(RangeError);
  });

  it('refuses LD (HL),(HL), whose encoding is HALT', () => {
    expect(() => op.ld_r_r('hl_ptr', 'hl_ptr')).toThrow(/HALT/);
  });
});
