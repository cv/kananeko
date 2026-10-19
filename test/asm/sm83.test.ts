/** The mnemonic layer encodes exactly what the encoding layer does, and rejects what the CPU can't do. */

import { describe, expect, it } from 'vitest';
import * as op from '@asm/ops';
import { allocate, byte } from '@asm/ram';
import {
  adc,
  add,
  and,
  bit,
  call,
  cp,
  dec,
  inc,
  jp,
  jr,
  ld,
  ldh,
  or,
  res,
  ret,
  rl,
  sbc,
  set,
  sub,
  swap,
  xor,
} from '@asm/sm83';
import { type Op, ioReg, Label, u8, u16 } from '@asm/types';

const X = new Label('x');
const { V } = allocate('test', 0xc000, 1, { V: byte() }).vars;
const HRAM = u16(0xff90);

describe('the mnemonic layer', () => {
  it.each<[string, Op, Op]>([
    ['LD A,B', ld('a', 'b'), op.ld_r_r('a', 'b')],
    ['LD (HL),C', ld(['hl'], 'c'), op.ld_r_r('hl_ptr', 'c')],
    ['LD D,(HL)', ld('d', ['hl']), op.ld_r_r('d', 'hl_ptr')],
    ['LD B,n', ld('b', 7), op.ld_r_n('b', u8(7))],
    ['LD (HL),n', ld(['hl'], 7), op.ld_hl_n(u8(7))],
    ['LD A,(nn)', ld('a', [V]), op.ld_a_nn(V)],
    ['LD (nn),A', ld([V], 'a'), op.ld_nn_a(V)],
    ['LD A,(nn) in HRAM', ld('a', [HRAM]), op.ld_a_nn(HRAM)],
    ['LD A,(BC)', ld('a', ['bc']), op.ld_a_bc()],
    ['LD (DE),A', ld(['de'], 'a'), op.ld_de_a()],
    ['LD A,(HL+)', ld('a', ['hl+']), op.ldi_a_hl()],
    ['LD (HL-),A', ld(['hl-'], 'a'), op.ldd_hl_a()],
    ['LD A,(C)', ld('a', ['c']), op.ldh_a_c()],
    ['LD (C),A', ld(['c'], 'a'), op.ldh_c_a()],
    ['LD HL,nn', ld('hl', 0x1234), op.ld_rr_nn('hl', u16(0x1234))],
    ['LD DE,label', ld('de', X), op.ld_rr_nn('de', X)],
    ['LD SP,HL', ld('sp', 'hl'), op.ld_sp_hl()],
    ['LDH A,(n)', ldh('a', [ioReg(0x44)]), op.ldh_a_n(ioReg(0x44))],
    ['LDH (n),A', ldh([ioReg(0x40)], 'a'), op.ldh_n_a(ioReg(0x40))],
    ['ADD A,B', add('b'), op.add_r('b')],
    ['ADD A,n', add(3), op.add_n(u8(3))],
    ['ADD HL,DE', add('hl', 'de'), op.add_hl_rr('de')],
    ['ADC A,(HL)', adc(['hl']), op.adc_r('hl_ptr')],
    ['SUB A,n', sub(1), op.sub_n(u8(1))],
    ['SBC A,C', sbc('c'), op.sbc_r('c')],
    ['AND A,n', and(0x0f), op.and_n(u8(0x0f))],
    ['XOR A,A', xor('a'), op.xor_r('a')],
    ['OR A,(HL)', or(['hl']), op.or_r('hl_ptr')],
    ['CP A,n', cp(9), op.cp_n(u8(9))],
    ['INC B', inc('b'), op.inc_r('b')],
    ['INC HL', inc('hl'), op.inc_rr('hl')],
    ['DEC (HL)', dec(['hl']), op.dec_r('hl_ptr')],
    ['DEC DE', dec('de'), op.dec_rr('de')],
    ['JR label', jr(X), op.jr(X)],
    ['JR NZ,label', jr('nz', X), op.jr_cc('nz', X)],
    ['JP label', jp(X), op.jp(X)],
    ['JP C,label', jp('c', X), op.jp_cc('c', X)],
    ['CALL label', call(X), op.call(X)],
    ['CALL Z,label', call('z', X), op.call_cc('z', X)],
    ['RET', ret(), op.ret()],
    ['RET NC', ret('nc'), op.ret_cc('nc')],
    ['BIT 7,(HL)', bit(7, ['hl']), op.bit(7, 'hl_ptr')],
    ['SET 0,A', set(0, 'a'), op.set(0, 'a')],
    ['RES 3,B', res(3, 'b'), op.res(3, 'b')],
    ['SWAP A', swap('a'), op.swap('a')],
    ['RL (HL)', rl(['hl']), op.rl('hl_ptr')],
  ])('%s', (_mnemonic, mnemonic, encoding) => {
    expect(mnemonic).toEqual(encoding);
  });

  it('encodes CALL cc,nn', () => {
    expect(op.call_cc('nz', u16(0x1234))).toEqual({ kind: 'inst', bytes: [0xc4, 0x34, 0x12] });
    expect(op.call_cc('c', u16(0x1234))).toEqual({ kind: 'inst', bytes: [0xdc, 0x34, 0x12] });
  });

  it('range-checks immediates', () => {
    expect(() => ld('a', 256)).toThrow(RangeError);
    expect(() => cp(-1)).toThrow(RangeError);
    expect(() => ld('hl', 0x10000)).toThrow(RangeError);
  });

  it("rejects forms the CPU doesn't have", () => {
    // @ts-expect-error only A loads from an address
    expect(() => ld('b', [V])).toThrow(/ld has no form/);
    // @ts-expect-error LD (HL),(HL) is HALT
    expect(() => ld(['hl'], ['hl'])).toThrow(/HALT/);
    // @ts-expect-error without brackets this would load the address, not what's there
    expect(() => ld('a', V)).toThrow(RangeError);
    // @ts-expect-error ADD only adds 16-bit pairs to HL
    expect(() => add('de', 'bc')).toThrow(/add has no form/);
  });
});
