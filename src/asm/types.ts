// ---------------------------------------------------------------------------
// Branded numeric types — catch size mismatches at compile time
// ---------------------------------------------------------------------------

declare const __u8: unique symbol;
declare const __u16: unique symbol;
declare const __ioReg: unique symbol;

/** 8-bit unsigned integer (0x00–0xFF) */
export type U8 = number & { readonly [__u8]: true };

/** 16-bit unsigned integer (0x0000–0xFFFF) */
export type U16 = number & { readonly [__u16]: true };

/** I/O register offset from $FF00 (0x00–0xFF), used with LDH instructions */
export type IoRegOffset = number & { readonly [__ioReg]: true };

/** Brand a number as U8 with runtime range check */
export function u8(n: number): U8 {
  if (n < 0 || n > 0xff) {
    throw new RangeError(`u8 out of range: ${String(n)}`);
  }
  return n as U8;
}

/** Brand a number as U16 with runtime range check */
export function u16(n: number): U16 {
  if (n < 0 || n > 0xffff) {
    throw new RangeError(`u16 out of range: ${String(n)}`);
  }
  return n as U16;
}

/** Brand a number as an I/O register offset with runtime range check */
export function ioReg(n: number): IoRegOffset {
  if (n < 0 || n > 0xff) {
    throw new RangeError(`IoRegOffset out of range: ${String(n)}`);
  }
  return n as IoRegOffset;
}

// ---------------------------------------------------------------------------
// Register encodings
// ---------------------------------------------------------------------------

/** 8-bit register encoding for SM83 opcodes */
export const R8 = {
  b: 0,
  c: 1,
  d: 2,
  e: 3,
  h: 4,
  l: 5,
  hl_ptr: 6,
  a: 7,
} as const;
export type R8Name = keyof typeof R8;

/** 16-bit register pairs for LD/INC/DEC */
export const R16 = { bc: 0, de: 1, hl: 2, sp: 3 } as const;
export type R16Name = keyof typeof R16;

/** 16-bit register pairs for PUSH/POP */
export const R16Stack = { bc: 0, de: 1, hl: 2, af: 3 } as const;
export type R16StackName = keyof typeof R16Stack;

/** Condition codes for JR/JP/CALL/RET */
export const CC = { nz: 0, z: 1, nc: 2, c: 3 } as const;
export type CCName = keyof typeof CC;

// ---------------------------------------------------------------------------
// Label references
// ---------------------------------------------------------------------------

/** A reference to a label, resolved during assembly */
export interface LabelRef {
  __labelRef: true;
  name: string;
}

/** Create a label reference for use in instructions */
export function ref(name: string): LabelRef {
  return { __labelRef: true, name };
}

export function isRef(v: unknown): v is LabelRef {
  return typeof v === 'object' && v !== null && '__labelRef' in v;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** An operation in the program */
export type Op =
  | { kind: 'inst'; bytes: number[]; refs?: OpRef[] }
  | { kind: 'label'; name: string }
  | { kind: 'data'; bytes: Uint8Array }
  | { kind: 'org'; address: number };

export interface OpRef {
  /** Byte offset within the instruction where the reference sits */
  offset: number;
  /** Label name to resolve */
  label: string;
  /** rel8 = signed relative offset (JR), imm16 = absolute 16-bit LE address */
  type: 'rel8' | 'imm16';
}
