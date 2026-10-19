import {
  type Op,
  type OpRef,
  R8,
  type R8Name,
  R16,
  type R16Name,
  R16Stack,
  type R16StackName,
  CC,
  type CCName,
  Label,
  Pooled,
  type Target,
  type U8,
  type U16,
  type IoRegOffset,
} from './types';
import { hi, lo } from './util';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inst(bytes: readonly number[], refs?: readonly OpRef[]): Op {
  return refs !== undefined ? { kind: 'inst', bytes, refs } : { kind: 'inst', bytes };
}

function isTarget(value: U16 | Target): value is Target {
  return value instanceof Label || value instanceof Pooled;
}

/** Opcode followed by a 16-bit little-endian immediate, label or pooled data */
function instImm16(opcode: number, value: U16 | Target): Op {
  if (isTarget(value)) {
    return inst([opcode, 0x00, 0x00], [{ type: 'imm16', offset: 1, target: value }]);
  }
  return inst([opcode, lo(value), hi(value)]);
}

/** A 16-bit data word (little-endian), e.g. a label's address in a pointer table */
export function dw(value: U16 | Target): Op {
  if (isTarget(value)) return inst([0x00, 0x00], [{ type: 'imm16', offset: 0, target: value }]);
  return inst([lo(value), hi(value)]);
}

/** Opcode followed by a signed 8-bit offset to a label */
function instRel8(opcode: number, target: Label): Op {
  return inst([opcode, 0x00], [{ type: 'rel8', offset: 1, target }]);
}

/** Place a label at this point in the program */
export function label(l: Label): Op {
  return { kind: 'label', label: l };
}

/** Where the assembler stores all Pooled data the program refers to */
export function pool(): Op {
  return { kind: 'pool' };
}

/** Set the assembler origin address */
export function org(address: U16): Op {
  return { kind: 'org', address };
}

/** Insert raw bytes; plain numbers must each fit a byte (a Uint8Array would wrap 300 to 44) */
export function db(data: Uint8Array | readonly number[]): Op {
  if (data instanceof Uint8Array) return { kind: 'data', bytes: data };
  for (const [i, b] of data.entries()) {
    if (!Number.isInteger(b) || b < 0 || b > 0xff) {
      throw new RangeError(`db byte ${String(i)} out of range: ${String(b)}`);
    }
  }
  return { kind: 'data', bytes: Uint8Array.from(data) };
}

// ---------------------------------------------------------------------------
// 8-bit loads
// ---------------------------------------------------------------------------

/** LD r8, r8 — `LD (HL),(HL)` doesn't exist: its encoding ($76) is HALT */
export function ld_r_r(dst: R8Name, src: R8Name): Op {
  if (dst === 'hl_ptr' && src === 'hl_ptr') {
    throw new Error('LD (HL),(HL) is not an instruction ($76 is HALT); use halt() if intended');
  }
  return inst([0x40 + R8[dst] * 8 + R8[src]]);
}

/** LD r8, n8 */
export function ld_r_n(dst: R8Name, n: U8): Op {
  return inst([0x06 + R8[dst] * 8, n]);
}

/** LD (HL), n8 */
export function ld_hl_n(n: U8): Op {
  return inst([0x36, n]);
}

/** LD A, (BC) */
export function ld_a_bc(): Op {
  return inst([0x0a]);
}

/** LD A, (DE) */
export function ld_a_de(): Op {
  return inst([0x1a]);
}

/** LD (BC), A */
export function ld_bc_a(): Op {
  return inst([0x02]);
}

/** LD (DE), A */
export function ld_de_a(): Op {
  return inst([0x12]);
}

/** LD A, (HL+) */
export function ldi_a_hl(): Op {
  return inst([0x2a]);
}

/** LD A, (HL-) */
export function ldd_a_hl(): Op {
  return inst([0x3a]);
}

/** LD (HL+), A */
export function ldi_hl_a(): Op {
  return inst([0x22]);
}

/** LD (HL-), A */
export function ldd_hl_a(): Op {
  return inst([0x32]);
}

// ---------------------------------------------------------------------------
// 16-bit loads
// ---------------------------------------------------------------------------

/** LD r16, nn — immediate or label */
export function ld_rr_nn(dst: R16Name, value: U16 | Target): Op {
  return instImm16(0x01 + R16[dst] * 16, value);
}

/** LD SP, HL */
export function ld_sp_hl(): Op {
  return inst([0xf9]);
}

// ---------------------------------------------------------------------------
// High-page loads (LDH)
// ---------------------------------------------------------------------------

/** LDH (FF00+n), A */
export function ldh_n_a(n: IoRegOffset): Op {
  return inst([0xe0, n]);
}

/** LDH A, (FF00+n) */
export function ldh_a_n(n: IoRegOffset): Op {
  return inst([0xf0, n]);
}

/** RLCA: rotate A left, bit 7 into bit 0 and the carry */
export function rlca(): Op {
  return inst([0x07]);
}

/** LDH (C), A: store A into $FF00+C */
export function ldh_c_a(): Op {
  return inst([0xe2]);
}

/** LDH A, (C): load A from $FF00+C */
export function ldh_a_c(): Op {
  return inst([0xf2]);
}

/** LD (nn), A; as LDH (2 bytes, 4 cycles faster) when nn is in $FF00-$FFFF */
export function ld_nn_a(addr: U16): Op {
  return addr >= 0xff00 ? inst([0xe0, addr & 0xff]) : instImm16(0xea, addr);
}

/** LD A, (nn); as LDH (2 bytes, 4 cycles faster) when nn is in $FF00-$FFFF */
export function ld_a_nn(addr: U16): Op {
  return addr >= 0xff00 ? inst([0xf0, addr & 0xff]) : instImm16(0xfa, addr);
}

// ---------------------------------------------------------------------------
// ALU — register operand
// ---------------------------------------------------------------------------

export function add_r(r: R8Name): Op {
  return inst([0x80 + R8[r]]);
}
export function adc_r(r: R8Name): Op {
  return inst([0x88 + R8[r]]);
}
export function sub_r(r: R8Name): Op {
  return inst([0x90 + R8[r]]);
}
export function sbc_r(r: R8Name): Op {
  return inst([0x98 + R8[r]]);
}
export function and_r(r: R8Name): Op {
  return inst([0xa0 + R8[r]]);
}
export function xor_r(r: R8Name): Op {
  return inst([0xa8 + R8[r]]);
}
export function or_r(r: R8Name): Op {
  return inst([0xb0 + R8[r]]);
}
export function cp_r(r: R8Name): Op {
  return inst([0xb8 + R8[r]]);
}

// ---------------------------------------------------------------------------
// ALU — immediate operand
// ---------------------------------------------------------------------------

export function add_n(n: U8): Op {
  return inst([0xc6, n]);
}
export function adc_n(n: U8): Op {
  return inst([0xce, n]);
}
export function sub_n(n: U8): Op {
  return inst([0xd6, n]);
}
export function sbc_n(n: U8): Op {
  return inst([0xde, n]);
}
export function and_n(n: U8): Op {
  return inst([0xe6, n]);
}
export function xor_n(n: U8): Op {
  return inst([0xee, n]);
}
export function or_n(n: U8): Op {
  return inst([0xf6, n]);
}
export function cp_n(n: U8): Op {
  return inst([0xfe, n]);
}

// ---------------------------------------------------------------------------
// INC / DEC
// ---------------------------------------------------------------------------

export function inc_r(r: R8Name): Op {
  return inst([0x04 + R8[r] * 8]);
}
export function dec_r(r: R8Name): Op {
  return inst([0x05 + R8[r] * 8]);
}
export function inc_rr(rr: R16Name): Op {
  return inst([0x03 + R16[rr] * 16]);
}
export function dec_rr(rr: R16Name): Op {
  return inst([0x0b + R16[rr] * 16]);
}

// ---------------------------------------------------------------------------
// Jumps
// ---------------------------------------------------------------------------

/** JR offset (unconditional relative jump to label) */
export function jr(target: Label): Op {
  return instRel8(0x18, target);
}

/** JR cc, offset (conditional relative jump to label) */
export function jr_cc(cc: CCName, target: Label): Op {
  return instRel8(0x20 + CC[cc] * 8, target);
}

/** A jump the assembler makes a JR (2 bytes, faster) when the label is in range, else a JP */
function jump(jrOpcode: number, jpOpcode: number, target: Label): Op {
  return {
    kind: 'jump',
    target,
    short: { kind: 'inst', bytes: [jrOpcode, 0x00], refs: [{ type: 'rel8', offset: 1, target }] },
    long: {
      kind: 'inst',
      bytes: [jpOpcode, 0x00, 0x00],
      refs: [{ type: 'imm16', offset: 1, target }],
    },
  };
}

/** JP nn (unconditional absolute jump); to a label, a JR when it's in range */
export function jp(target: U16 | Label): Op {
  return target instanceof Label ? jump(0x18, 0xc3, target) : instImm16(0xc3, target);
}

/** JP cc, nn; to a label, a JR cc when it's in range */
export function jp_cc(cc: CCName, target: U16 | Label): Op {
  const jpOpcode = 0xc2 + CC[cc] * 8;
  return target instanceof Label
    ? jump(0x20 + CC[cc] * 8, jpOpcode, target)
    : instImm16(jpOpcode, target);
}

/** JP nn always, even when a JR would reach (e.g. for a table of fixed-size entries) */
export function jp_long(target: U16 | Label): Op {
  return instImm16(0xc3, target);
}

// ---------------------------------------------------------------------------
// Calls / Returns
// ---------------------------------------------------------------------------

/** CALL nn */
export function call(target: U16 | Label): Op {
  return instImm16(0xcd, target);
}

/** RET */
export function ret(): Op {
  return inst([0xc9]);
}

/** RETI */
export function reti(): Op {
  return inst([0xd9]);
}

/** RET cc */
export function ret_cc(cc: CCName): Op {
  return inst([0xc0 + CC[cc] * 8]);
}

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------

export function push(rr: R16StackName): Op {
  return inst([0xc5 + R16Stack[rr] * 16]);
}
export function pop(rr: R16StackName): Op {
  return inst([0xc1 + R16Stack[rr] * 16]);
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function nop(): Op {
  return inst([0x00]);
}
export function halt(): Op {
  return inst([0x76]);
}
export function di(): Op {
  return inst([0xf3]);
}
export function ei(): Op {
  return inst([0xfb]);
}
export function cpl(): Op {
  return inst([0x2f]);
}

/** ADD HL, r16 */
export function add_hl_rr(rr: R16Name): Op {
  return inst([0x09 + R16[rr] * 16]);
}
export function rst(vec: 0x00 | 0x08 | 0x10 | 0x18 | 0x20 | 0x28 | 0x30 | 0x38): Op {
  return inst([0xc7 + vec]);
}

// ---------------------------------------------------------------------------
// CB-prefixed (bit operations)
// ---------------------------------------------------------------------------

type BitIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function bit(b: BitIndex, r: R8Name): Op {
  return inst([0xcb, 0x40 + b * 8 + R8[r]]);
}
export function res(b: BitIndex, r: R8Name): Op {
  return inst([0xcb, 0x80 + b * 8 + R8[r]]);
}
export function set(b: BitIndex, r: R8Name): Op {
  return inst([0xcb, 0xc0 + b * 8 + R8[r]]);
}
export function swap(r: R8Name): Op {
  return inst([0xcb, 0x30 + R8[r]]);
}
export function rl(r: R8Name): Op {
  return inst([0xcb, 0x10 + R8[r]]);
}
export function rr(r: R8Name): Op {
  return inst([0xcb, 0x18 + R8[r]]);
}
export function sla(r: R8Name): Op {
  return inst([0xcb, 0x20 + R8[r]]);
}
export function sra(r: R8Name): Op {
  return inst([0xcb, 0x28 + R8[r]]);
}
export function srl(r: R8Name): Op {
  return inst([0xcb, 0x38 + R8[r]]);
}
