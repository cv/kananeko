/**
 * RAM allocation: variables are declared by kind (a byte, a word, a buffer), and the
 * allocator gives each one an address, so no two can overlap by accident. Bytes that
 * two engines share on purpose are declared with `same()`.
 *
 * What a variable is decides what code can do with it: a byte goes to `ld_a_nn` and
 * `storeByte` (and a `byteOf(SomeEnum)` byte only takes that enum's values), a word
 * to `loadPointer`/`storePointer` (or its `.lo`/`.hi` bytes), and a buffer to HL
 * (`.address`) or one checked byte at a time (`.at(i)`).
 *
 * Variables are laid out in declaration order, so ones declared together stay
 * adjacent (code may walk from one to the next). A multi-byte variable never crosses a
 * 256-byte page, so 8-bit index arithmetic on its low byte is safe.
 */

import { type U16, u16 } from './types';
import { hex } from './util';

declare const __byteValue: unique symbol;

/**
 * A 1-byte variable's address, holding values of type `T` (any byte unless it was
 * declared with byteOf). It's a U16, so anything taking an address takes it.
 */
export type ByteVar<T extends number = number> = U16 & { readonly [__byteValue]: T };

/** A 16-bit variable, little-endian: `lo` at `address`, `hi` after it */
export interface WordVar {
  readonly kind: 'word';
  readonly name: string;
  readonly address: U16;
  readonly lo: ByteVar;
  readonly hi: ByteVar;
}

/** `size` bytes: point HL at `address`, or reach one byte with a checked `at(i)` */
export interface BufferVar<N extends number = number> {
  readonly kind: 'buffer';
  readonly name: string;
  readonly address: U16;
  readonly size: N;
  at(i: number): ByteVar;
}

/** The values a byte declared with byteOf(E) holds */
export type ValuesOf<E> = E[keyof E];

/** The value type a byte address holds: T for ByteVar<T>, any byte for a plain address */
export type ByteValue<A extends U16> = A extends ByteVar<infer T> ? T : number;

// Layout entries ---------------------------------------------------------------

export interface ByteSpec<T extends number = number> {
  readonly kind: 'byte';
  /** Never set: carries T */
  readonly values?: T;
}

export interface WordSpec {
  readonly kind: 'word';
}

export interface BufferSpec<N extends number = number> {
  readonly kind: 'buffer';
  readonly size: N;
}

/** A variable that reuses another's bytes */
export interface SameAs<K extends string = string> {
  readonly kind: 'same';
  readonly of: K;
}

/** One byte, any value */
export function byte(): ByteSpec {
  return { kind: 'byte' };
}

/** One byte holding only the values of `values`, e.g. byteOf(KanaState) */
export function byteOf<const E extends Readonly<Record<string, number>>>(
  values: E,
): ByteSpec<ValuesOf<E>> {
  // Only the type of `values` matters, but check it's a set of bytes
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new RangeError(`byteOf: ${key} = ${String(value)} doesn't fit a byte`);
    }
  }
  return { kind: 'byte' };
}

/** Two bytes, little-endian (a pointer or a 16-bit count) */
export function word(): WordSpec {
  return { kind: 'word' };
}

/** `size` bytes */
export function buffer<const N extends number>(size: N): BufferSpec<N> {
  return { kind: 'buffer', size };
}

/**
 * Reuse the bytes of `of` (declared earlier in the same region, as a variable of its
 * own): for state two engines that never run together can share. It's the same kind of
 * variable as `of`.
 */
export function same<K extends string>(of: K): SameAs<K> {
  return { kind: 'same', of };
}

type Spec = ByteSpec | WordSpec | BufferSpec | SameAs;

/** A region's entries: same() may only name another entry, so a typo is a compile error */
export type RamLayout = Readonly<Record<string, Spec>>;

type VarFor<L extends RamLayout, S> =
  S extends SameAs<infer K>
    ? K extends keyof L
      ? VarFor<L, L[K]>
      : never
    : S extends ByteSpec<infer T>
      ? ByteVar<T>
      : S extends WordSpec
        ? WordVar
        : S extends BufferSpec<infer N>
          ? BufferVar<N>
          : never;

/** The typed variables of a layout */
export type RamVars<L extends RamLayout> = { readonly [K in keyof L]: VarFor<L, L[K]> };

export interface RamVariable {
  readonly name: string;
  readonly address: U16;
  readonly size: number;
  /** Set when the variable shares another's bytes */
  readonly sharesWith?: string;
}

export interface RamRegion<L extends RamLayout> {
  readonly name: string;
  readonly start: number;
  /** One past the last byte the region may use */
  readonly limit: number;
  /** One past the last byte allocated */
  readonly end: number;
  readonly vars: RamVars<L>;
  readonly variables: readonly RamVariable[];
}

function addr(n: number): string {
  return `$${hex(n, 4)}`;
}

function byteVar(address: number): ByteVar {
  return u16(address) as ByteVar;
}

type AnyVar = ByteVar | WordVar | BufferVar;

function makeVar(spec: ByteSpec | WordSpec | BufferSpec, name: string, address: number): AnyVar {
  switch (spec.kind) {
    case 'byte':
      return byteVar(address);
    case 'word':
      return {
        kind: 'word',
        name,
        address: u16(address),
        lo: byteVar(address),
        hi: byteVar(address + 1),
      };
    case 'buffer':
      return {
        kind: 'buffer',
        name,
        address: u16(address),
        size: spec.size,
        at(i: number): ByteVar {
          if (!Number.isInteger(i) || i < 0 || i >= spec.size) {
            throw new RangeError(
              `${name}.at(${String(i)}) is outside its ${String(spec.size)} bytes`,
            );
          }
          return byteVar(address + i);
        },
      };
  }
}

function sizeOf(spec: ByteSpec | WordSpec | BufferSpec): number {
  return spec.kind === 'byte' ? 1 : spec.kind === 'word' ? 2 : spec.size;
}

/**
 * Allocate the variables of `layout` in `[start, start + size)`, in declaration order.
 * Throws if they don't fit or a `same()` refers to an unknown or later variable.
 */
export function allocate<const L extends RamLayout>(
  name: string,
  start: number,
  size: number,
  layout: L & { readonly [K in keyof L]: Exclude<Spec, SameAs> | SameAs<Extract<keyof L, string>> },
): RamRegion<L> {
  const limit = start + size;
  if (!Number.isInteger(start) || !Number.isInteger(size) || size < 1 || limit > 0x10000) {
    throw new RangeError(`RAM region ${name} is not a valid address range`);
  }

  const variables: RamVariable[] = [];
  const specs = new Map<
    string,
    { spec: ByteSpec | WordSpec | BufferSpec; variable: RamVariable }
  >();
  const vars: Record<string, AnyVar> = {};
  let pc = start;

  for (const [key, entry] of Object.entries(layout) as [string, Spec][]) {
    let variable: RamVariable;
    let spec: ByteSpec | WordSpec | BufferSpec;
    if (entry.kind === 'same') {
      const target = specs.get(entry.of);
      if (target === undefined || target.variable.sharesWith !== undefined) {
        throw new Error(
          `${name}.${key}: same('${entry.of}') must name an earlier variable of its own`,
        );
      }
      spec = target.spec;
      variable = { ...target.variable, name: key, sharesWith: entry.of };
    } else {
      spec = entry;
      const bytes = sizeOf(spec);
      if (!Number.isInteger(bytes) || bytes < 1) {
        throw new RangeError(
          `${name}.${key}: size must be a positive integer, got ${String(bytes)}`,
        );
      }
      // Keep multi-byte variables within one page
      if (bytes > 1 && bytes <= 0x100 && pc >> 8 !== (pc + bytes - 1) >> 8) pc = (pc | 0xff) + 1;
      if (pc + bytes > limit) {
        throw new RangeError(
          `${name} is full: ${key} (${String(bytes)} bytes) would end at ${addr(pc + bytes)}, past ${addr(limit)}`,
        );
      }
      variable = { name: key, address: u16(pc), size: bytes };
      pc += bytes;
    }
    variables.push(variable);
    specs.set(key, { spec, variable });
    vars[key] = makeVar(spec, key, variable.address);
  }

  return { name, start, limit, end: pc, vars: vars as RamVars<L>, variables };
}

/** Throw if any two regions overlap */
export function checkRegions(
  regions: readonly { name: string; start: number; limit: number }[],
): void {
  const sorted = [...regions].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (prev !== undefined && next !== undefined && next.start < prev.limit) {
      throw new Error(`RAM regions ${prev.name} and ${next.name} overlap at ${addr(next.start)}`);
    }
  }
}
