/** Checked index read: throws on out-of-bounds instead of returning undefined. */
export function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i];
  if (v === undefined) {
    throw new RangeError(`Index ${String(i)} out of bounds (length ${String(arr.length)})`);
  }
  return v;
}

/** Low byte of a 16-bit value */
export function lo(n: number): number {
  return n & 0xff;
}

/** High byte of a 16-bit value */
export function hi(n: number): number {
  return (n >> 8) & 0xff;
}

/** Format a number as zero-padded lowercase hex (no prefix). */
export function hex(n: number, width: number): string {
  return n.toString(16).padStart(width, '0');
}
