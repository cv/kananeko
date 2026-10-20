/**
 * Reusable instruction sequences (macros), written with the instructions in sm83.ts.
 *
 * Macros that branch use local labels (`new Label()`), which the assembler names
 * after the named label before them, so they need no names of their own.
 */

import { add, cp, dec, inc, jp, jr, label, ld, ldh, or, ret, xor } from './sm83';
import { HW } from './hardware';
import type { ByteValue, WordVar } from './ram';
import { Label, type Op, type Target, type U16 } from './types';
import { lo } from './util';

/** First scanline of the vertical blank period. */
const VBLANK_LINE = 144;

/** Busy-wait until the LCD reaches VBlank (LY == 144). */
export function waitVBlank(): Op[] {
  const loop = new Label();
  return [label(loop), ldh('a', [HW.LY]), cp(VBLANK_LINE), jr('nz', loop)];
}

/** Wait for VBlank, then switch the LCD off so VRAM can be written freely. */
export function lcdOff(): Op[] {
  return [...waitVBlank(), xor('a'), ldh([HW.LCDC], 'a')];
}

/** Switch the LCD on with the given LCDC flags. */
export function lcdOn(flags: number): Op[] {
  return [ld('a', flags), ldh([HW.LCDC], 'a')];
}

/** Store an immediate byte to memory (clobbers A). */
export function storeByte<A extends U16>(addr: A, value: ByteValue<A>): Op[] {
  return [ld('a', value), ld([addr], 'a')];
}

/** Zero a list of memory bytes (clobbers A). */
export function zeroBytes(...addrs: U16[]): Op[] {
  return [xor('a'), ...addrs.map((addr) => ld([addr], 'a'))];
}

/** Add 1 to a byte in memory: A = the new value, Z set if it wrapped to 0. */
export function incByte(addr: U16): Op[] {
  return [ld('a', [addr]), inc('a'), ld([addr], 'a')];
}

/** Take 1 from a byte in memory: A = the new value, Z set if it reached 0. */
export function decByte(addr: U16): Op[] {
  return [ld('a', [addr]), dec('a'), ld([addr], 'a')];
}

/** Decrement a memory counter and return from the subroutine while it is still non-zero. */
export function countDownOrReturn(addr: U16): Op[] {
  return [...decByte(addr), ret('nz')];
}

/**
 * Copy a byte in memory (A = the byte). A variable declared with byteOf only takes
 * bytes of the same kind.
 */
export function copyByte<D extends U16, S extends U16>(
  dst: D,
  src: S & (ByteValue<S> extends ByteValue<D> ? unknown : never),
): Op[] {
  return [ld('a', [src]), ld([dst], 'a')];
}

/** Copy a word variable (A = its high byte). */
export function copyWord(dst: WordVar, src: WordVar): Op[] {
  return [ld('a', [src.lo]), ld([dst.lo], 'a'), ld('a', [src.hi]), ld([dst.hi], 'a')];
}

/**
 * HL = the entry of a table whose entries are `stride` bytes, for the index in A.
 * A × stride must stay under 256. Clobbers A (with a stride over 1) and DE.
 */
export function tableEntry(table: U16 | Target, stride: 1 | 2 | 4 | 8 = 1): Op[] {
  return [
    ...Array.from({ length: Math.log2(stride) }, () => add('a')),
    ld('e', 'a'),
    ld('d', 0),
    ld('hl', table),
    add('hl', 'de'),
  ];
}

/** HL += A. Clobbers DE. */
export function addAToHl(): Op[] {
  return [ld('e', 'a'), ld('d', 0), add('hl', 'de')];
}

// ---------------------------------------------------------------------------
// 16-bit pointers stored as separate lo/hi bytes in memory
// ---------------------------------------------------------------------------

export type PointerPair = 'bc' | 'de' | 'hl';

const PAIR_HALVES = {
  bc: { low: 'c', high: 'b' },
  de: { low: 'e', high: 'd' },
  hl: { low: 'l', high: 'h' },
} as const satisfies Record<PointerPair, { low: string; high: string }>;

/** Load a register pair from a lo/hi byte pair in memory (clobbers A). */
export function loadPointer(rr: PointerPair, src: WordVar): Op[] {
  const { low, high } = PAIR_HALVES[rr];
  return [ld('a', [src.lo]), ld(low, 'a'), ld('a', [src.hi]), ld(high, 'a')];
}

/** Store a register pair into a word variable (clobbers A). */
export function storePointer(rr: PointerPair, dst: WordVar): Op[] {
  const { low, high } = PAIR_HALVES[rr];
  return [ld('a', low), ld([dst.lo], 'a'), ld('a', high), ld([dst.hi], 'a')];
}

// ---------------------------------------------------------------------------
// Block memory operations (256-byte pages)
// ---------------------------------------------------------------------------

/** B counts pages down to zero, so 0 would mean 256 pages: all 64KB of the address space. */
function checkPages(macro: string, pages: number): void {
  if (!Number.isInteger(pages) || pages < 1 || pages > 255) {
    throw new RangeError(`${macro} pages must be 1-255, got ${String(pages)}`);
  }
}

/** Fill `count` (1-256) bytes starting at `dst` with zero. Clobbers A, B, HL. */
export function zeroBlock(dst: U16, count: number): Op[] {
  if (!Number.isInteger(count) || count < 1 || count > 256)
    throw new RangeError(`zeroBlock count must be 1-256, got ${String(count)}`);
  const loop = new Label();
  return [
    ld('hl', dst),
    xor('a'),
    ld('b', lo(count)), // 256 wraps
    label(loop),
    ld(['hl+'], 'a'),
    dec('b'),
    jr('nz', loop),
  ];
}

/** Fill `pages` (1-255) × 256 bytes starting at `dst` with zero. Clobbers A, BC, HL. */
export function zeroPages(dst: U16, pages: number): Op[] {
  checkPages('zeroPages', pages);
  const loop = new Label();
  return [
    ld('hl', dst),
    xor('a'),
    ld('b', pages),
    ld('c', 0),
    label(loop),
    ld(['hl+'], 'a'),
    dec('c'),
    jr('nz', loop),
    dec('b'),
    jr('nz', loop),
  ];
}

/** Copy `count` (1-256) bytes from `src` to `dst`. Clobbers A, B, DE, HL. */
export function copyBytes(dst: U16, src: U16 | Target, count: number): Op[] {
  if (!Number.isInteger(count) || count < 1 || count > 256)
    throw new RangeError(`copyBytes count must be 1-256, got ${String(count)}`);
  const loop = new Label();
  return [
    ld('hl', dst),
    ld('de', src),
    ld('b', lo(count)), // 256 wraps to 0, which DEC/JR NZ treats as 256
    label(loop),
    ld('a', ['de']),
    ld(['hl+'], 'a'),
    inc('de'),
    dec('b'),
    jr('nz', loop),
  ];
}

/** Copy exactly `count` (1-65535) bytes from `src` to `dst`. Clobbers A, BC, DE, HL. */
export function copyBlock(dst: U16, src: U16 | Target, count: number): Op[] {
  if (!Number.isInteger(count) || count < 1 || count > 0xffff)
    throw new RangeError(`copyBlock count must be 1-65535, got ${String(count)}`);
  const loop = new Label();
  return [
    ld('hl', dst),
    ld('de', src),
    ld('bc', count),
    label(loop),
    ld('a', ['de']),
    ld(['hl+'], 'a'),
    inc('de'),
    dec('bc'),
    ld('a', 'b'),
    or('c'),
    jr('nz', loop),
  ];
}

/**
 * Copy `count` (1-65535) bytes of 1bpp tile data to `dst`, writing each byte twice
 * (both bit planes), so set pixels become color 3. Clobbers A, BC, DE, HL.
 */
export function expandOneBit(dst: U16, src: U16 | Target, count: number): Op[] {
  if (!Number.isInteger(count) || count < 1 || count > 0xffff)
    throw new RangeError(`expandOneBit count must be 1-65535, got ${String(count)}`);
  const loop = new Label();
  return [
    ld('hl', dst),
    ld('de', src),
    ld('bc', count),
    label(loop),
    ld('a', ['de']),
    inc('de'),
    ld(['hl+'], 'a'),
    ld(['hl+'], 'a'),
    dec('bc'),
    ld('a', 'b'),
    or('c'),
    jr('nz', loop),
  ];
}

/** Copy `pages` (1-255) × 256 bytes from `src` to `dst`. Clobbers A, BC, DE, HL. */
export function copyPages(dst: U16, src: U16 | Target, pages: number): Op[] {
  checkPages('copyPages', pages);
  const loop = new Label();
  return [
    ld('hl', dst),
    ld('de', src),
    ld('b', pages),
    ld('c', 0),
    label(loop),
    ld('a', ['de']),
    ld(['hl+'], 'a'),
    inc('de'),
    dec('c'),
    jr('nz', loop),
    dec('b'),
    jr('nz', loop),
  ];
}

// ---------------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------------

export interface SwitchOptions {
  /**
   * Ops that set the Z flag when case `i` matches. Defaults to `cp i` against A.
   * Not called for the last case, which is the fall-through default.
   */
  readonly compare?: (i: number) => Op[];
  /** 'none' when every body ends on its own (e.g. RET), so none jumps to the end. */
  readonly exit?: 'jump' | 'none';
}

/**
 * Compare-and-branch chain: run `cases[i]` for the first matching case,
 * falling through to the last case when none of the others match.
 */
export function switchCases(cases: readonly (readonly Op[])[], options: SwitchOptions = {}): Op[] {
  const { compare = (i): Op[] => [cp(i)], exit = 'jump' } = options;
  const done = new Label();
  const ops: Op[] = [];

  cases.forEach((body, i) => {
    const isLast = i === cases.length - 1;
    if (isLast) {
      ops.push(...body);
      return;
    }
    const next = new Label();
    // The assembler makes these JRs when the case is short enough
    ops.push(...compare(i), jp('nz', next), ...body);
    if (exit !== 'none') ops.push(jp(done));
    ops.push(label(next));
  });

  if (exit !== 'none') {
    ops.push(label(done));
  }
  return ops;
}
