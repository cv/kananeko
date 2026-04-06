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
  type LabelRef,
  isRef,
  type U8,
  type U16,
  type IoRegOffset,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inst(bytes: number[], refs?: OpRef[]): Op {
  return refs !== undefined ? { kind: 'inst', bytes, refs } : { kind: 'inst', bytes };
}

function lo(n: number): number {
  return n & 0xff;
}
function hi(n: number): number {
  return (n >> 8) & 0xff;
}

/** Insert a named label into the program */
export function label(name: string): Op {
  return { kind: 'label', name };
}

/** Set the assembler origin address */
export function org(address: U16): Op {
  return { kind: 'org', address };
}

/** Insert raw bytes */
export function db(data: Uint8Array | number[]): Op {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return { kind: 'data', bytes };
}

// ---------------------------------------------------------------------------
// 8-bit loads
// ---------------------------------------------------------------------------

/** LD r8, r8 */
export function ld_r_r(dst: R8Name, src: R8Name): Op {
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
export function ld_rr_nn(dst: R16Name, value: U16 | LabelRef): Op {
  if (isRef(value)) {
    return inst(
      [0x01 + R16[dst] * 16, 0x00, 0x00],
      [{ offset: 1, label: value.name, type: 'imm16' }],
    );
  }
  return inst([0x01 + R16[dst] * 16, lo(value), hi(value)]);
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

/** LD (nn), A */
export function ld_nn_a(addr: U16): Op {
  return inst([0xea, lo(addr), hi(addr)]);
}

/** LD A, (nn) */
export function ld_a_nn(addr: U16): Op {
  return inst([0xfa, lo(addr), hi(addr)]);
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
export function jr(target: LabelRef): Op {
  return inst([0x18, 0x00], [{ offset: 1, label: target.name, type: 'rel8' }]);
}

/** JR cc, offset (conditional relative jump to label) */
export function jr_cc(cc: CCName, target: LabelRef): Op {
  return inst([0x20 + CC[cc] * 8, 0x00], [{ offset: 1, label: target.name, type: 'rel8' }]);
}

/** JP nn (unconditional absolute jump) */
export function jp(target: U16 | LabelRef): Op {
  if (isRef(target)) {
    return inst([0xc3, 0x00, 0x00], [{ offset: 1, label: target.name, type: 'imm16' }]);
  }
  return inst([0xc3, lo(target), hi(target)]);
}

/** JP cc, nn */
export function jp_cc(cc: CCName, target: U16 | LabelRef): Op {
  const base = 0xc2 + CC[cc] * 8;
  if (isRef(target)) {
    return inst([base, 0x00, 0x00], [{ offset: 1, label: target.name, type: 'imm16' }]);
  }
  return inst([base, lo(target), hi(target)]);
}

// ---------------------------------------------------------------------------
// Calls / Returns
// ---------------------------------------------------------------------------

/** CALL nn */
export function call(target: U16 | LabelRef): Op {
  if (isRef(target)) {
    return inst([0xcd, 0x00, 0x00], [{ offset: 1, label: target.name, type: 'imm16' }]);
  }
  return inst([0xcd, lo(target), hi(target)]);
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
