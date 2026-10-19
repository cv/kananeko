/**
 * RAM allocation: variables are declared with a size, and the allocator gives each
 * one an address, so no two can overlap by accident. Bytes that two engines share on
 * purpose are declared with `same()`.
 *
 * Variables are laid out in declaration order, so ones declared together stay
 * adjacent (code may walk from one to the next). A multi-byte variable never crosses a
 * 256-byte page, so 8-bit index arithmetic on its low byte is safe.
 */

import { type U16, u16 } from './types';
import { hex } from './util';

/** A variable that reuses another's bytes (`offset` bytes into it) */
export class SameAs<K extends string = string> {
  readonly of: K;
  readonly offset: number;

  constructor(of: K, offset: number) {
    this.of = of;
    this.offset = offset;
  }
}

/** Reuse the bytes of `of` (declared earlier in the same region): for state two engines that never run together can share */
export function same<K extends string>(of: K, offset = 0): SameAs<K> {
  return new SameAs(of, offset);
}

/** A variable's size in bytes, or the variable whose bytes it shares */
export type RamLayout = Readonly<Record<string, number | SameAs>>;

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
  readonly addresses: { readonly [K in keyof L]: U16 };
  readonly variables: readonly RamVariable[];
}

function addr(n: number): string {
  return `$${hex(n, 4)}`;
}

/**
 * Allocate the variables of `layout` in `[start, start + size)`, in declaration order.
 * Throws if they don't fit or a `same()` refers to an unknown or later variable.
 */
export function allocate<const L extends RamLayout>(
  name: string,
  start: number,
  size: number,
  // same() may only name a variable of this layout: a typo is a compile error
  layout: L & { readonly [K in keyof L]: number | SameAs<Extract<keyof L, string>> },
): RamRegion<L> {
  const limit = start + size;
  if (!Number.isInteger(start) || !Number.isInteger(size) || size < 1 || limit > 0x10000) {
    throw new RangeError(`RAM region ${name} is not a valid address range`);
  }

  const variables: RamVariable[] = [];
  const byName = new Map<string, RamVariable>();
  let pc = start;

  for (const [key, entry] of Object.entries(layout)) {
    let variable: RamVariable;
    if (entry instanceof SameAs) {
      const target = byName.get(entry.of);
      if (target === undefined || target.sharesWith !== undefined) {
        throw new Error(
          `${name}.${key}: same('${entry.of}') must name an earlier variable of its own`,
        );
      }
      if (!Number.isInteger(entry.offset) || entry.offset < 0 || entry.offset >= target.size) {
        throw new RangeError(
          `${name}.${key}: offset ${String(entry.offset)} is outside ${entry.of}`,
        );
      }
      variable = {
        name: key,
        address: u16(target.address + entry.offset),
        size: 1,
        sharesWith: entry.of,
      };
    } else {
      if (!Number.isInteger(entry) || entry < 1) {
        throw new RangeError(
          `${name}.${key}: size must be a positive integer, got ${String(entry)}`,
        );
      }
      // Keep multi-byte variables within one page
      if (entry > 1 && entry <= 0x100 && pc >> 8 !== (pc + entry - 1) >> 8) pc = (pc | 0xff) + 1;
      if (pc + entry > limit) {
        throw new RangeError(
          `${name} is full: ${key} (${String(entry)} bytes) would end at ${addr(pc + entry)}, past ${addr(limit)}`,
        );
      }
      variable = { name: key, address: u16(pc), size: entry };
      pc += entry;
    }
    variables.push(variable);
    byName.set(key, variable);
  }

  const addresses = Object.fromEntries(variables.map((v) => [v.name, v.address])) as {
    readonly [K in keyof L]: U16;
  };
  return { name, start, limit, end: pc, addresses, variables };
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
