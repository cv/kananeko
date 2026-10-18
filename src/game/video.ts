/**
 * Screen helpers shared by the title screen, scenes, and engines.
 */

import { HW, LCDC, MEM } from '../asm/hardware';
import { lcdOff, lcdOn, zeroPages } from '../asm/macros';
import {
  and_n,
  call,
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
// Color (GBC only; the palette registers are ignored on DMG)
// ---------------------------------------------------------------------------

/** GBC RGB555 color: (r5) | (g5 << 5) | (b5 << 10). Pass 8-bit RGB, auto-truncated. */
export function rgb(r: number, g: number, b: number): number {
  return ((r >> 3) & 0x1f) | (((g >> 3) & 0x1f) << 5) | (((b >> 3) & 0x1f) << 10);
}

export type Palette = Quad<number>;

/** Write a 4-color palette to GBC BG palette 0 via BCPS/BCPD. */
export function setBgPalette(palette: Palette): Op[] {
  return [
    // Palette 0, color 0, auto-increment
    ld_r_n('a', u8(0x80)),
    ldh_n_a(HW.BCPS),
    ...palette.flatMap((color) => [
      ld_r_n('a', u8(color & 0xff)),
      ldh_n_a(HW.BCPD),
      ld_r_n('a', u8((color >> 8) & 0xff)),
      ldh_n_a(HW.BCPD),
    ]),
  ];
}
