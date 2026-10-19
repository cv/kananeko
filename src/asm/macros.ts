/**
 * Reusable instruction sequences (macros) built on top of the raw opcodes.
 *
 * Every macro that needs labels takes an explicit `name`, which becomes the
 * label prefix. That keeps symbol names meaningful in the .sym file, avoids
 * hidden global counters, and lets the assembler reject accidental reuse.
 */

import { HW } from './hardware';
import {
  cp_n,
  dec_r,
  dec_rr,
  inc_rr,
  jp,
  jp_cc,
  jr,
  jr_cc,
  label,
  ld_a_de,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldh_a_n,
  ldh_n_a,
  ldi_hl_a,
  or_r,
  ret_cc,
  xor_r,
} from './ops';
import { Label, type Op, type Target, type U16, u8, u16 } from './types';
import { lo } from './util';

/** First scanline of the vertical blank period. */
const VBLANK_LINE = 144;

/** Busy-wait until the LCD reaches VBlank (LY == 144). */
export function waitVBlank(name: string): Op[] {
  const loop = new Label(name);
  return [label(loop), ldh_a_n(HW.LY), cp_n(u8(VBLANK_LINE)), jr_cc('nz', loop)];
}

/** Wait for VBlank, then switch the LCD off so VRAM can be written freely. */
export function lcdOff(name: string): Op[] {
  return [...waitVBlank(name), xor_r('a'), ldh_n_a(HW.LCDC)];
}

/** Switch the LCD on with the given LCDC flags. */
export function lcdOn(flags: number): Op[] {
  return [ld_r_n('a', u8(flags)), ldh_n_a(HW.LCDC)];
}

/** Store an immediate byte to memory (clobbers A). */
export function storeByte(addr: U16, value: number): Op[] {
  return [ld_r_n('a', u8(value)), ld_nn_a(addr)];
}

/** Zero a list of memory bytes (clobbers A). */
export function zeroBytes(...addrs: U16[]): Op[] {
  return [xor_r('a'), ...addrs.map((addr) => ld_nn_a(addr))];
}

/** Decrement a memory counter and return from the subroutine while it is still non-zero. */
export function countDownOrReturn(addr: U16): Op[] {
  return [ld_a_nn(addr), dec_r('a'), ld_nn_a(addr), ret_cc('nz')];
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
export function loadPointer(rr: PointerPair, loAddr: U16, hiAddr: U16): Op[] {
  const { low, high } = PAIR_HALVES[rr];
  return [ld_a_nn(loAddr), ld_r_r(low, 'a'), ld_a_nn(hiAddr), ld_r_r(high, 'a')];
}

/** Store a register pair into a lo/hi byte pair in memory (clobbers A). */
export function storePointer(rr: PointerPair, loAddr: U16, hiAddr: U16): Op[] {
  const { low, high } = PAIR_HALVES[rr];
  return [ld_r_r('a', low), ld_nn_a(loAddr), ld_r_r('a', high), ld_nn_a(hiAddr)];
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

/** Fill `pages` (1-255) × 256 bytes starting at `dst` with zero. Clobbers A, BC, HL. */
export function zeroPages(name: string, dst: U16, pages: number): Op[] {
  checkPages('zeroPages', pages);
  const loop = new Label(name);
  return [
    ld_rr_nn('hl', dst),
    xor_r('a'),
    ld_r_n('b', u8(pages)),
    ld_r_n('c', u8(0)),
    label(loop),
    ldi_hl_a(),
    dec_r('c'),
    jr_cc('nz', loop),
    dec_r('b'),
    jr_cc('nz', loop),
  ];
}

/** Copy `count` (1-256) bytes from `src` to `dst`. Clobbers A, B, DE, HL. */
export function copyBytes(name: string, dst: U16, src: U16 | Target, count: number): Op[] {
  if (!Number.isInteger(count) || count < 1 || count > 256)
    throw new RangeError(`copyBytes count must be 1-256, got ${String(count)}`);
  const loop = new Label(name);
  return [
    ld_rr_nn('hl', dst),
    ld_rr_nn('de', src),
    ld_r_n('b', lo(count)), // 256 wraps to 0, which DEC/JR NZ treats as 256
    label(loop),
    ld_a_de(),
    ldi_hl_a(),
    inc_rr('de'),
    dec_r('b'),
    jr_cc('nz', loop),
  ];
}

/** Copy exactly `count` (1-65535) bytes from `src` to `dst`. Clobbers A, BC, DE, HL. */
export function copyBlock(name: string, dst: U16, src: U16 | Target, count: number): Op[] {
  if (!Number.isInteger(count) || count < 1 || count > 0xffff)
    throw new RangeError(`copyBlock count must be 1-65535, got ${String(count)}`);
  const loop = new Label(name);
  return [
    ld_rr_nn('hl', dst),
    ld_rr_nn('de', src),
    ld_rr_nn('bc', u16(count)),
    label(loop),
    ld_a_de(),
    ldi_hl_a(),
    inc_rr('de'),
    dec_rr('bc'),
    ld_r_r('a', 'b'),
    or_r('c'),
    jr_cc('nz', loop),
  ];
}

/**
 * Copy `count` (1-65535) bytes of 1bpp tile data to `dst`, writing each byte twice
 * (both bit planes), so set pixels become color 3. Clobbers A, BC, DE, HL.
 */
export function expandOneBit(name: string, dst: U16, src: U16 | Target, count: number): Op[] {
  if (!Number.isInteger(count) || count < 1 || count > 0xffff)
    throw new RangeError(`expandOneBit count must be 1-65535, got ${String(count)}`);
  const loop = new Label(name);
  return [
    ld_rr_nn('hl', dst),
    ld_rr_nn('de', src),
    ld_rr_nn('bc', u16(count)),
    label(loop),
    ld_a_de(),
    inc_rr('de'),
    ldi_hl_a(),
    ldi_hl_a(),
    dec_rr('bc'),
    ld_r_r('a', 'b'),
    or_r('c'),
    jr_cc('nz', loop),
  ];
}

/** Copy `pages` (1-255) × 256 bytes from `src` to `dst`. Clobbers A, BC, DE, HL. */
export function copyPages(name: string, dst: U16, src: U16 | Target, pages: number): Op[] {
  checkPages('copyPages', pages);
  const loop = new Label(name);
  return [
    ld_rr_nn('hl', dst),
    ld_rr_nn('de', src),
    ld_r_n('b', u8(pages)),
    ld_r_n('c', u8(0)),
    label(loop),
    ld_a_de(),
    ldi_hl_a(),
    inc_rr('de'),
    dec_r('c'),
    jr_cc('nz', loop),
    dec_r('b'),
    jr_cc('nz', loop),
  ];
}

// ---------------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------------

export interface SwitchOptions {
  /** Label prefix; must be unique in the program. */
  readonly name: string;
  /**
   * Ops that set the Z flag when case `i` matches. Defaults to `cp i` against A.
   * Not called for the last case, which is the fall-through default.
   */
  readonly compare?: (i: number) => Op[];
  /** Jump used to skip a non-matching case (`jr` is shorter but limited to ±127 bytes). */
  readonly branch?: 'jr' | 'jp';
  /** Jump used to leave a case body, or 'none' when every body ends on its own (e.g. RET). */
  readonly exit?: 'jr' | 'jp' | 'none';
}

/**
 * Compare-and-branch chain: run `cases[i]` for the first matching case,
 * falling through to the last case when none of the others match.
 */
export function switchCases(cases: readonly (readonly Op[])[], options: SwitchOptions): Op[] {
  const { name, compare = (i): Op[] => [cp_n(u8(i))], branch = 'jr', exit = 'jr' } = options;
  const done = new Label(`${name}_done`);
  const ops: Op[] = [];

  cases.forEach((body, i) => {
    const isLast = i === cases.length - 1;
    if (isLast) {
      ops.push(...body);
      return;
    }
    const next = new Label(`${name}_case${String(i + 1)}`);
    ops.push(...compare(i), branch === 'jr' ? jr_cc('nz', next) : jp_cc('nz', next), ...body);
    if (exit !== 'none') {
      ops.push(exit === 'jr' ? jr(done) : jp(done));
    }
    ops.push(label(next));
  });

  if (exit !== 'none') {
    ops.push(label(done));
  }
  return ops;
}
