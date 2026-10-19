// ---------------------------------------------------------------------------
// Branded numeric types — catch size mismatches at compile time
// ---------------------------------------------------------------------------

declare const __u8: unique symbol;
declare const __u16: unique symbol;
declare const __ioReg: unique symbol;
declare const __tileIndex: unique symbol;

/** 8-bit unsigned integer (0x00–0xFF) */
export type U8 = number & { readonly [__u8]: true };

/** 16-bit unsigned integer (0x0000–0xFFFF) */
export type U16 = number & { readonly [__u16]: true };

/** I/O register offset from $FF00 (0x00–0xFF), used with LDH instructions */
export type IoRegOffset = number & { readonly [__ioReg]: true };

/**
 * Tile index (0x00–0xFD). Values 0xFE and 0xFF are reserved as sentinels
 * (text terminator and end-of-conversation marker respectively) and can
 * never be a valid tile. This prevents the bug where tile 0 (space) was
 * confused with a null terminator.
 */
export type TileIndex = number & { readonly [__tileIndex]: true };

/** True when `n` is an integer in [min, max]. Rejects NaN, ±Infinity and fractions. */
function isIntIn(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

/** Brand a number as U8 with runtime range check */
export function u8(n: number): U8 {
  if (!isIntIn(n, 0, 0xff)) {
    throw new RangeError(`u8 out of range: ${String(n)}`);
  }
  return n as U8;
}

/** A signed byte (-128 to 127) in two's complement, e.g. `add_n(s8(-1))` subtracts 1 */
export function s8(n: number): U8 {
  if (!isIntIn(n, -0x80, 0x7f)) {
    throw new RangeError(`s8 out of range: ${String(n)}`);
  }
  return (n & 0xff) as U8;
}

/** Brand a number as U16 with runtime range check */
export function u16(n: number): U16 {
  if (!isIntIn(n, 0, 0xffff)) {
    throw new RangeError(`u16 out of range: ${String(n)}`);
  }
  return n as U16;
}

/** Brand a number as an I/O register offset with runtime range check */
export function ioReg(n: number): IoRegOffset {
  if (!isIntIn(n, 0, 0xff)) {
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
// Labels and pooled data
// ---------------------------------------------------------------------------

const LABEL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A position in the program. Place it once with `label(l)` and refer to it by passing
 * the object itself to jumps, calls, loads and `dw`. Labels match by identity, so a
 * misspelt label is a compile error rather than an assembly one; the name is what the
 * .sym file and error messages show, and must be unique in the program.
 */
export class Label {
  readonly name: string;

  constructor(name: string) {
    if (!LABEL_NAME.test(name)) throw new Error(`Invalid label name: "${name}"`);
    this.name = name;
  }

  toString(): string {
    return this.name;
  }
}

/**
 * Labels made on demand from a key (one per scene, sound, ...): the same key always
 * gives the same Label, so the code defining it and the code referring to it agree.
 */
export function labelFamily<K>(name: (key: K) => string): (key: K) => Label {
  const made = new Map<K, Label>();
  return (key) => {
    let l = made.get(key);
    if (l === undefined) {
      l = new Label(name(key));
      made.set(key, l);
    }
    return l;
  };
}

/**
 * Read-only bytes the assembler stores once, at the program's `pool()`, however many
 * instructions refer to them: identical data with the same `prefix` shares one copy,
 * labelled `<prefix>_<n>` in order of first reference.
 */
export class Pooled {
  readonly prefix: string;
  readonly bytes: Uint8Array;

  constructor(prefix: string, bytes: Uint8Array | readonly number[]) {
    if (!LABEL_NAME.test(prefix)) throw new Error(`Invalid pool prefix: "${prefix}"`);
    for (const [i, b] of bytes.entries()) {
      if (!Number.isInteger(b) || b < 0 || b > 0xff) {
        throw new RangeError(`Pooled byte ${String(i)} out of range: ${String(b)}`);
      }
    }
    this.prefix = prefix;
    this.bytes = Uint8Array.from(bytes);
  }

  /** Identical data under the same prefix is stored once */
  get key(): string {
    return `${this.prefix}:${this.bytes.join(',')}`;
  }
}

/** What an absolute (16-bit) operand can point at besides a fixed address */
export type Target = Label | Pooled;

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Instruction bytes, with any references the assembler fills in */
export interface InstOp {
  readonly kind: 'inst';
  readonly bytes: readonly number[];
  readonly refs?: readonly OpRef[];
}

/** An operation in the program */
export type Op =
  | InstOp
  /**
   * A jump to a label the assembler encodes as `short` (JR) when the target is in
   * range and as `long` (JP) otherwise: see jp() and jp_cc()
   */
  | { readonly kind: 'jump'; readonly target: Label; readonly short: InstOp; readonly long: InstOp }
  | { readonly kind: 'label'; readonly label: Label }
  | { readonly kind: 'data'; readonly bytes: Uint8Array }
  | { readonly kind: 'org'; readonly address: number }
  /** Where the assembler stores the program's Pooled data */
  | { readonly kind: 'pool' };

export type OpRef =
  /** A signed offset to a label from the end of the instruction (JR) */
  | { readonly type: 'rel8'; readonly offset: number; readonly target: Label }
  /** An absolute little-endian address */
  | { readonly type: 'imm16'; readonly offset: number; readonly target: Target };
