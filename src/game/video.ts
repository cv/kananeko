/**
 * Screen helpers shared by the title screen, scenes, and engines.
 */

import { HW, LCDC, MEM } from '../asm/hardware';
import { lcdOff, lcdOn, loadPointer, storePointer, zeroPages } from '../asm/macros';
import {
  add_hl_rr,
  and_n,
  call,
  dec_r,
  halt,
  ldi_a_hl,
  nop,
  ret_cc,
  jr_cc,
  label,
  ld_r_n,
  ld_rr_nn,
  ldh_a_n,
  ldh_n_a,
  ldi_hl_a,
  pop,
  push,
  ret,
} from '../asm/ops';
import { type Op, ref, u8, u16 } from '../asm/types';
import { type Quad } from './fixed';
import { centerStartCol, tilemapAddr, tileRow } from './tilemap';

/** LCDC value used whenever the game turns the screen on. */
export const SCREEN_ON_FLAGS = LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON;

/** Wait for VBlank and turn the LCD off. `name` labels the wait loop. */
export function screenOff(name: string): Op[] {
  return lcdOff(name);
}

/** Turn the LCD on with the game's standard flags. */
export function screenOn(): Op[] {
  return lcdOn(SCREEN_ON_FLAGS);
}

/** Clear the whole 32×32 BG tilemap (LCD must be off). */
export function clearTilemap(name: string): Op[] {
  return zeroPages(name, MEM.VRAM_MAP0, 4);
}

/** STAT mode bit 1 is set during OAM scan (2) and pixel transfer (3) */
const STAT_BUSY = 0x02;

/**
 * Subroutine: write A to [HL+] once VRAM is accessible. Preserves A and flags.
 *
 * Waits for HBlank or VBlank, which leaves at least ~20 M-cycles for the write.
 * With the LCD off STAT reads mode 0, so this never blocks. Use it for any VRAM
 * write made while the LCD is on.
 */
export function buildVramPut(): Op[] {
  return [
    label('vram_put'),
    push('af'),
    label('vram_put_wait'),
    ldh_a_n(HW.STAT),
    and_n(u8(STAT_BUSY)),
    jr_cc('nz', ref('vram_put_wait')),
    pop('af'),
    ldi_hl_a(),
    ret(),
  ];
}

/** Write A to [HL+] safely while the LCD is on (see buildVramPut). */
export function vramPut(): Op[] {
  return [call(ref('vram_put'))];
}

/**
 * Write a row of tiles horizontally centered on the visible screen.
 * `lcdOn` routes each write through vram_put so it is safe mid-frame.
 */
export function writeCenteredRow(
  row: number,
  tiles: readonly number[],
  { lcdOn = false }: { lcdOn?: boolean } = {},
): Op[] {
  const col = centerStartCol(tiles.length);
  return [
    ld_rr_nn('hl', u16(tilemapAddr(tileRow(row), col))),
    ...tiles.flatMap((tile) => [ld_r_n('a', u8(tile)), ...(lcdOn ? vramPut() : [ldi_hl_a()])]),
  ];
}

// ---------------------------------------------------------------------------
// Color (GBC palette RAM; DMG uses BGP)
// ---------------------------------------------------------------------------

/** GBC RGB555 color: (r5) | (g5 << 5) | (b5 << 10). Pass 8-bit RGB, auto-truncated. */
export function rgb(r: number, g: number, b: number): number {
  return ((r >> 3) & 0x1f) | (((g >> 3) & 0x1f) << 5) | (((b >> 3) & 0x1f) << 10);
}

export type Palette = Quad<number>;

// ---------------------------------------------------------------------------
// Fades: each palette has a table of FADE_STEPS steps from white to full color.
// A step is [BGP (DMG), 8 bytes of GBC palette 0].
// ---------------------------------------------------------------------------

export const FADE_STEPS = 5;
const FADE_STEP_BYTES = 9;
/** Frames each fade step is shown */
export const FADE_STEP_FRAMES = 2;
const WHITE = 0x1f;
/** DMG shades of color indices 0-3 at full strength (BGP = 0xE4) */
const DMG_FULL = [0, 1, 2, 3] as const;

/** Precompute the fade steps for a palette, step 0 = white, last step = the palette itself. */
export function buildFadeTable(palette: Palette): Uint8Array {
  const bytes: number[] = [];
  for (let step = 0; step < FADE_STEPS; step++) {
    const t = step / (FADE_STEPS - 1);
    const toward = (full: number): number => Math.round(WHITE - (WHITE - full) * t);
    const bgp = DMG_FULL.reduce<number>(
      (acc, shade, i) => acc | (Math.round(shade * t) << (i * 2)),
      0,
    );
    bytes.push(bgp);
    for (const color of palette) {
      const r = toward(color & 0x1f);
      const g = toward((color >> 5) & 0x1f);
      const b = toward((color >> 10) & 0x1f);
      const faded = r | (g << 5) | (b << 10);
      bytes.push(faded & 0xff, faded >> 8);
    }
  }
  return Uint8Array.from(bytes);
}

/** Fade in the palette whose table is at `tableLabel`, turning the LCD on first. */
export function fadeIn(tableLabel: string): Op[] {
  return [ld_rr_nn('hl', ref(tableLabel)), call(ref('fade_in'))];
}

/** Fade the palette currently on screen back in (e.g. after redrawing). */
export function fadeInCurrent(): Op[] {
  return [call(ref('fade_in_current'))];
}

/** Fade the screen to white (no-op if the LCD is off). */
export function fadeOut(): Op[] {
  return [call(ref('fade_out'))];
}

/** Subroutines palette_put, fade_apply, fade_wait, fade_in(_current), fade_out. */
export function buildFadeRoutines(): Op[] {
  const toNext = [ld_rr_nn('de', u16(FADE_STEP_BYTES)), add_hl_rr('de')];
  const toPrevious = [ld_rr_nn('de', u16(0x10000 - FADE_STEP_BYTES)), add_hl_rr('de')];
  return [
    // palette_put: write A to BCPD once palette RAM is accessible (preserves A)
    label('palette_put'),
    push('af'),
    label('palette_put_wait'),
    ldh_a_n(HW.STAT),
    and_n(u8(STAT_BUSY)),
    jr_cc('nz', ref('palette_put_wait')),
    pop('af'),
    ldh_n_a(HW.BCPD),
    ret(),

    // fade_apply: write the step at HL to BGP and GBC palette 0 (preserves HL, B)
    label('fade_apply'),
    push('hl'),
    ldi_a_hl(),
    ldh_n_a(HW.BGP),
    ld_r_n('a', u8(0x80)), // palette 0, color 0, auto-increment
    ldh_n_a(HW.BCPS),
    ld_r_n('c', u8(FADE_STEP_BYTES - 1)),
    label('fade_apply_byte'),
    ldi_a_hl(),
    call(ref('palette_put')),
    dec_r('c'),
    jr_cc('nz', ref('fade_apply_byte')),
    pop('hl'),
    ret(),

    // fade_wait: show the current step for FADE_STEP_FRAMES frames
    label('fade_wait'),
    ld_r_n('c', u8(FADE_STEP_FRAMES)),
    label('fade_wait_frame'),
    halt(),
    nop(),
    dec_r('c'),
    jr_cc('nz', ref('fade_wait_frame')),
    ret(),

    // fade_in: HL = fade table. Starts white, turns the LCD on, steps to full color.
    label('fade_in_current'),
    ...loadPointer('hl', MEM.FADE_TABLE_LO, MEM.FADE_TABLE_HI),
    label('fade_in'),
    ...storePointer('hl', MEM.FADE_TABLE_LO, MEM.FADE_TABLE_HI),
    call(ref('fade_apply')),
    ...screenOn(),
    ld_r_n('b', u8(FADE_STEPS - 1)),
    label('fade_in_step'),
    ...toNext,
    call(ref('fade_wait')),
    call(ref('fade_apply')),
    dec_r('b'),
    jr_cc('nz', ref('fade_in_step')),
    ret(),

    // fade_out: step the current palette back to white. HALT never wakes with
    // the LCD off (no VBlank), so do nothing in that case.
    label('fade_out'),
    ldh_a_n(HW.LCDC),
    and_n(u8(LCDC.LCD_ON)),
    ret_cc('z'),
    ...loadPointer('hl', MEM.FADE_TABLE_LO, MEM.FADE_TABLE_HI),
    ld_rr_nn('de', u16(FADE_STEP_BYTES * (FADE_STEPS - 1))),
    add_hl_rr('de'),
    ld_r_n('b', u8(FADE_STEPS - 1)),
    label('fade_out_step'),
    ...toPrevious,
    call(ref('fade_wait')),
    call(ref('fade_apply')),
    dec_r('b'),
    jr_cc('nz', ref('fade_out_step')),
    ret(),
  ];
}
