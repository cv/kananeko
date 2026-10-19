import { type U8, u16 } from './types';

/** Checked index read: throws on out-of-bounds instead of returning undefined. */
export function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i];
  if (v === undefined) {
    throw new RangeError(`Index ${String(i)} out of bounds (length ${String(arr.length)})`);
  }
  return v;
}

/** Low byte of a 16-bit value (throws unless `n` is an integer in 0-$FFFF) */
export function lo(n: number): U8 {
  return (u16(n) & 0xff) as U8;
}

/** High byte of a 16-bit value (throws unless `n` is an integer in 0-$FFFF) */
export function hi(n: number): U8 {
  return (u16(n) >> 8) as U8;
}

/** Format a number as zero-padded lowercase hex (no prefix). */
export function hex(n: number, width: number): string {
  return n.toString(16).padStart(width, '0');
}
