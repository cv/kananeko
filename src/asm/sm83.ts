/**
 * The SM83 instruction set, written the way the assembly reads: one function per
 * mnemonic, with operands like the manual's.
 *
 *   ld('a', 'b')            LD A,B             ld('b', 3)            LD B,3
 *   ld('a', [MEM.X])        LD A,(nn)          ld([MEM.X], 'a')      LD (nn),A
 *   ld('a', ['hl+'])        LD A,(HL+)         ld(['hl'], 0)         LD (HL),0
 *   ld('hl', TABLE)         LD HL,TABLE        ldh('a', [HW.LY])     LDH A,(LY)
 *   add('b'), cp(3), and(['hl']), add('hl', 'de'), inc('hl'), dec(['hl'])
 *   jr('nz', LOOP), jp(DONE), call('c', ROUTINE), ret('z'), push('bc')
 *
 * Brackets mean memory, as parentheses do in assembly. Operand combinations the CPU
 * doesn't have (`ld('b', [MEM.X])`, `ld(['hl'], ['hl'])`, `ld('a', MEM.X)` without
 * the brackets) are type errors. Immediates are range-checked when the program is
 * built. The encodings live in ops.ts.
 */

import * as op from './ops';
import {
  type CCName,
  type Imm,
  type IoRegOffset,
  Label,
  type Op,
  type R8Name,
  type R16Name,
  type R16StackName,
  type Target,
  type U16,
  u8,
  u16,
} from './types';

export { db, di, dw, ei, halt, jp_long, label, nop, org, pool, reti, rlca, rst, cpl } from './ops';

/** An 8-bit register */
export type R8 = Exclude<R8Name, 'hl_ptr'>;
/** A 16-bit register pair */
export type R16 = R16Name;
/** The byte HL points at: (HL) */
export type AtHL = readonly ['hl'];
/** An 8-bit register or (HL): what most instructions take */
export type R8OrAtHL = R8 | AtHL;
/** Memory A can load from and store to besides (HL): an address, (BC), (DE), (HL+), (HL-) or ($FF00+C) */
export type AccumulatorMem = readonly [U16] | readonly ['bc' | 'de' | 'hl+' | 'hl-' | 'c'];

type BitIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

function isMem(x: unknown): x is readonly [unknown] {
  return Array.isArray(x) && x.length === 1;
}

function r8(x: R8OrAtHL): R8Name {
  return isMem(x) ? 'hl_ptr' : x;
}

function badOperands(mnemonic: string, ...operands: unknown[]): Error {
  return new Error(
    `${mnemonic} has no form ${mnemonic.toUpperCase()} ${operands.map((o) => JSON.stringify(o)).join(',')}`,
  );
}

const R8_NAMES: ReadonlySet<unknown> = new Set(['a', 'b', 'c', 'd', 'e', 'h', 'l']);
const PAIRS: ReadonlySet<unknown> = new Set(['bc', 'de', 'hl', 'sp']);

// Loads ------------------------------------------------------------------------

/** LD: see the module comment for the forms */
export function ld(dst: R8OrAtHL, src: R8 | Imm): Op;
export function ld(dst: R8, src: AtHL): Op;
export function ld(dst: 'a', src: AccumulatorMem): Op;
export function ld(dst: AccumulatorMem, src: 'a'): Op;
/** A 16-bit pair takes any 16-bit value: an address, a constant, a label or pooled data */
export function ld(dst: R16, src: number | Target): Op;
export function ld(dst: 'sp', src: 'hl'): Op;
export function ld(dst: unknown, src: unknown): Op {
  if (dst === 'sp' && src === 'hl') return op.ld_sp_hl();
  if (
    PAIRS.has(dst) &&
    (typeof src === 'number' || src instanceof Label || typeof src === 'object')
  ) {
    if (typeof src === 'number') return op.ld_rr_nn(dst as R16, u16(src));
    if (!isMem(src)) return op.ld_rr_nn(dst as R16, src as Target);
  }
  const dstR8 = R8_NAMES.has(dst) || (isMem(dst) && dst[0] === 'hl');
  if (dstR8 && (R8_NAMES.has(src) || (isMem(src) && src[0] === 'hl'))) {
    return op.ld_r_r(r8(dst as R8OrAtHL), r8(src as R8OrAtHL));
  }
  if (dstR8 && typeof src === 'number') {
    return isMem(dst) ? op.ld_hl_n(u8(src)) : op.ld_r_n(dst as R8, u8(src));
  }
  if (dst === 'a' && isMem(src)) return loadA(src[0]);
  if (src === 'a' && isMem(dst)) return storeA(dst[0]);
  throw badOperands('ld', dst, src);
}

function loadA(from: unknown): Op {
  if (typeof from === 'number') return op.ld_a_nn(u16(from));
  switch (from) {
    case 'bc':
      return op.ld_a_bc();
    case 'de':
      return op.ld_a_de();
    case 'hl+':
      return op.ldi_a_hl();
    case 'hl-':
      return op.ldd_a_hl();
    case 'c':
      return op.ldh_a_c();
  }
  throw badOperands('ld', 'a', [from]);
}

function storeA(to: unknown): Op {
  if (typeof to === 'number') return op.ld_nn_a(u16(to));
  switch (to) {
    case 'bc':
      return op.ld_bc_a();
    case 'de':
      return op.ld_de_a();
    case 'hl+':
      return op.ldi_hl_a();
    case 'hl-':
      return op.ldd_hl_a();
    case 'c':
      return op.ldh_c_a();
  }
  throw badOperands('ld', [to], 'a');
}

/** LDH A,($FF00+n) and LDH ($FF00+n),A, for I/O registers (HW.*) */
export function ldh(dst: 'a', src: readonly [IoRegOffset]): Op;
export function ldh(dst: readonly [IoRegOffset], src: 'a'): Op;
export function ldh(dst: 'a' | readonly [IoRegOffset], src: 'a' | readonly [IoRegOffset]): Op {
  if (dst === 'a' && isMem(src)) return op.ldh_a_n(src[0]);
  if (src === 'a' && isMem(dst)) return op.ldh_n_a(dst[0]);
  throw badOperands('ldh', dst, src);
}

// Arithmetic and logic (A is the implied destination) ----------------------------

/** What the 8-bit ALU instructions take: a register, (HL), or an immediate */
export type AluSrc = R8OrAtHL | Imm;

function alu(
  name: string,
  onReg: (r: R8Name) => Op,
  onImm: (n: ReturnType<typeof u8>) => Op,
): (src: AluSrc) => Op {
  return (src) => {
    if (typeof src === 'number') return onImm(u8(src));
    if (R8_NAMES.has(src) || isMem(src)) return onReg(r8(src));
    throw badOperands(name, src);
  };
}

const add8 = alu('add', op.add_r, op.add_n);

/** ADD A,src, or ADD HL,rr */
export function add(src: AluSrc): Op;
export function add(dst: 'hl', src: R16): Op;
export function add(a: AluSrc | 'hl', b?: R16): Op {
  if (b !== undefined) {
    if (a === 'hl' && PAIRS.has(b)) return op.add_hl_rr(b);
    throw badOperands('add', a, b);
  }
  return add8(a as AluSrc);
}

/** ADC A,src */
export const adc = alu('adc', op.adc_r, op.adc_n);
/** SUB A,src */
export const sub = alu('sub', op.sub_r, op.sub_n);
/** SBC A,src */
export const sbc = alu('sbc', op.sbc_r, op.sbc_n);
/** AND A,src */
export const and = alu('and', op.and_r, op.and_n);
/** XOR A,src */
export const xor = alu('xor', op.xor_r, op.xor_n);
/** OR A,src */
export const or = alu('or', op.or_r, op.or_n);
/** CP A,src */
export const cp = alu('cp', op.cp_r, op.cp_n);

/** INC r, INC (HL) or INC rr */
export function inc(x: R8OrAtHL | R16): Op {
  return typeof x === 'string' && PAIRS.has(x) ? op.inc_rr(x as R16) : op.inc_r(r8(x as R8OrAtHL));
}

/** DEC r, DEC (HL) or DEC rr */
export function dec(x: R8OrAtHL | R16): Op {
  return typeof x === 'string' && PAIRS.has(x) ? op.dec_rr(x as R16) : op.dec_r(r8(x as R8OrAtHL));
}

// Stack ------------------------------------------------------------------------

export function push(rr: R16StackName): Op {
  return op.push(rr);
}

export function pop(rr: R16StackName): Op {
  return op.pop(rr);
}

// Jumps, calls and returns -----------------------------------------------------

/** JR label or JR cc,label (must reach: use jp to let the assembler choose) */
export function jr(target: Label): Op;
export function jr(cc: CCName, target: Label): Op;
export function jr(a: CCName | Label, b?: Label): Op {
  return b === undefined ? op.jr(a as Label) : op.jr_cc(a as CCName, b);
}

/** JP nn or JP cc,nn; to a label, a JR when it's in range */
export function jp(target: U16 | Label): Op;
export function jp(cc: CCName, target: U16 | Label): Op;
export function jp(a: CCName | U16 | Label, b?: U16 | Label): Op {
  return b === undefined ? op.jp(a as U16 | Label) : op.jp_cc(a as CCName, b);
}

/** CALL nn or CALL cc,nn */
export function call(target: U16 | Label): Op;
export function call(cc: CCName, target: U16 | Label): Op;
export function call(a: CCName | U16 | Label, b?: U16 | Label): Op {
  return b === undefined ? op.call(a as U16 | Label) : op.call_cc(a as CCName, b);
}

/** RET or RET cc */
export function ret(cc?: CCName): Op {
  return cc === undefined ? op.ret() : op.ret_cc(cc);
}

// Bit operations and shifts (CB prefix) ----------------------------------------

export function bit(b: BitIndex, x: R8OrAtHL): Op {
  return op.bit(b, r8(x));
}
export function res(b: BitIndex, x: R8OrAtHL): Op {
  return op.res(b, r8(x));
}
export function set(b: BitIndex, x: R8OrAtHL): Op {
  return op.set(b, r8(x));
}
export function swap(x: R8OrAtHL): Op {
  return op.swap(r8(x));
}
export function rl(x: R8OrAtHL): Op {
  return op.rl(r8(x));
}
export function rr(x: R8OrAtHL): Op {
  return op.rr(r8(x));
}
export function sla(x: R8OrAtHL): Op {
  return op.sla(r8(x));
}
export function sra(x: R8OrAtHL): Op {
  return op.sra(r8(x));
}
export function srl(x: R8OrAtHL): Op {
  return op.srl(r8(x));
}
