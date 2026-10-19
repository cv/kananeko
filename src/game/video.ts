/**
 * Screen helpers shared by the title screen, scenes, and engines.
 */

import { HW, LCDC } from '../asm/hardware';
import { MEM } from './ram';
import { lcdOff, lcdOn, loadPointer, storePointer, zeroPages } from '../asm/macros';
import {
  add_n,
  add_r,
  and_n,
  call,
  cp_n,
  db,
  dec_r,
  halt,
  inc_r,
  inc_rr,
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
  ldi_a_hl,
  ldi_hl_a,
  nop,
  pop,
  push,
  ret,
  reti,
  ret_cc,
  sub_r,
  xor_r,
} from '../asm/ops';
import { type Op, u8, u16, Label, Pooled } from '../asm/types';
import type { Quad } from './fixed';
import { SCREEN_COLS, centerStartCol, tilemapAddr, tileRow } from './tilemap';
import {
  SOUND_TICK,
  SHARED_PALETTES,
  SPRITES_OFF,
  VBLANK_HANDLER,
  VRAM_PUT,
  DRAW_TILES,
  FILL_TILES,
  DRAW_RUNS,
  FADE_IN,
} from './labels';

// Labels placed in this module
const FRAME_WAIT = new Label('frame_wait');
const FRAME_WAIT_STORE = new Label('frame_wait_store');
const FRAME_WAIT_DONE = new Label('frame_wait_done');
const VRAM_PUT_WAIT = new Label('vram_put_wait');
const FILL_TILES_NEXT = new Label('fill_tiles_next');
const CLEAR_SCREEN = new Label('clear_screen');
const DRAW_RUNS_NEXT = new Label('draw_runs_next');
const DRAW_RUNS_CELL = new Label('draw_runs_cell');
const DRAW_RUNS_NC = new Label('draw_runs_nc');
const DRAW_RUNS_SAME_ROW = new Label('draw_runs_same_row');
const PALETTE_PUT = new Label('palette_put');
const PALETTE_PUT_WAIT = new Label('palette_put_wait');
const FADE_APPLY = new Label('fade_apply');
const FADE_BGP_NC = new Label('fade_bgp_nc');
const FADE_PALETTES = new Label('fade_palettes');
const FADE_PALETTE = new Label('fade_palette');
const FADE_COLOR = new Label('fade_color');
const FADE_SRC_OK = new Label('fade_src_ok');
const FADE_SRC_NC = new Label('fade_src_nc');
const FADE_NEXT_NC = new Label('fade_next_nc');
const FADE_WAIT = new Label('fade_wait');
const FADE_WAIT_FRAME = new Label('fade_wait_frame');
const FADE_IN_CURRENT = new Label('fade_in_current');
const FADE_IN_STEP = new Label('fade_in_step');
const FADE_OUT = new Label('fade_out');
const FADE_OUT_STEP = new Label('fade_out_step');
const FADE_BGP = new Label('fade_bgp');

/** Palette numbers every screen shares (see color.ts) */
export const PAL = { ui: 0, hud: 1 } as const;

/** LCDC value used whenever the game turns the screen on. */
/**
 * The background uses $8800 tile addressing (LCDC bit 4 clear): BG tiles 0-127 live at
 * $9000 and 128-255 at $8800, which leaves $8000-$87FF to sprites alone.
 */
export const SCREEN_ON_FLAGS = LCDC.LCD_ON | LCDC.BG_ON | LCDC.OBJ_ON;

/** VRAM address of a background tile's pixel data */
export function bgTileAddr(index: number): number {
  return index < 128 ? MEM.BG_TILES_LOW + index * 16 : MEM.BG_TILES_HIGH + (index - 128) * 16;
}

/** Wait for VBlank and turn the LCD off. `name` labels the wait loop. */
export function screenOff(name: string): Op[] {
  return lcdOff(name);
}

/** Turn the LCD on with the game's standard flags. */
export function screenOn(): Op[] {
  return [
    ...lcdOn(SCREEN_ON_FLAGS),
    // The time spent with the screen off isn't a missed frame (see frame_wait)
    ld_a_nn(MEM.FRAME_COUNT),
    ld_nn_a(MEM.LAST_FRAME),
  ];
}

/** Wait for the next VBlank, counting any frame the game's work ran past (frame_wait) */
export function frameWait(): Op[] {
  return [call(FRAME_WAIT)];
}

/**
 * The VBlank handler (counts frames) and frame_wait: sleep until the next VBlank,
 * then add the VBlanks beyond one since the last wait to FRAMES_MISSED. Every frame
 * the game waits for goes through frame_wait, so FRAMES_MISSED counts the times its
 * work took longer than a frame. Preserves all registers.
 */
export function buildFrameWait(): Op[] {
  return [
    label(VBLANK_HANDLER),
    push('af'),
    ld_a_nn(MEM.FRAME_COUNT),
    inc_r('a'),
    ld_nn_a(MEM.FRAME_COUNT),
    pop('af'),
    reti(),

    label(FRAME_WAIT),
    halt(),
    nop(),
    push('af'),
    push('bc'),
    ld_a_nn(MEM.LAST_FRAME),
    ld_r_r('c', 'a'),
    ld_a_nn(MEM.FRAME_COUNT),
    ld_nn_a(MEM.LAST_FRAME),
    sub_r('c'), // VBlanks since the last wait
    cp_n(u8(2)),
    jr_cc('c', FRAME_WAIT_DONE),
    dec_r('a'),
    ld_r_r('c', 'a'),
    ld_a_nn(MEM.FRAMES_MISSED),
    add_r('c'),
    jr_cc('nc', FRAME_WAIT_STORE),
    ld_r_n('a', u8(0xff)),
    label(FRAME_WAIT_STORE),
    ld_nn_a(MEM.FRAMES_MISSED),
    label(FRAME_WAIT_DONE),
    // Sound steps once per frame here rather than in the VBlank handler, so it plays
    // the same with interrupts off (the tests' emulator runs without them)
    push('de'),
    push('hl'),
    call(SOUND_TICK),
    pop('hl'),
    pop('de'),
    pop('bc'),
    pop('af'),
    ret(),
  ];
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
    label(VRAM_PUT),
    push('af'),
    label(VRAM_PUT_WAIT),
    ldh_a_n(HW.STAT),
    and_n(u8(STAT_BUSY)),
    jr_cc('nz', VRAM_PUT_WAIT),
    pop('af'),
    ldi_hl_a(),
    ret(),
  ];
}

/** Write A to [HL+] safely while the LCD is on (see buildVramPut). */
export function vramPut(): Op[] {
  return [call(VRAM_PUT)];
}

/** Ends a tile list drawn by draw_tiles (no tile has this index) */
const TILES_END = 0xff;

/**
 * A tile list for draw_tiles, ending in TILES_END. The assembler stores it in the
 * program's pool(), once however many places draw the same tiles.
 */
export function tileList(tiles: readonly number[]): Pooled {
  return new Pooled('tile_list', [...tiles, TILES_END]);
}

/**
 * Subroutines (drawTiles saves DE around draw_tiles, so callers only lose A and HL):
 *   draw_tiles  HL = tilemap address, DE = tile list (see tileList); safe with the LCD
 *               on (each write goes through vram_put)
 *   fill_tiles  HL = tilemap address, A = tile, B = count; LCD off
 */
export function buildDrawTiles(): Op[] {
  return [
    label(DRAW_TILES),
    ld_a_de(),
    inc_rr('de'),
    cp_n(u8(TILES_END)),
    ret_cc('z'),
    call(VRAM_PUT),
    jr(DRAW_TILES),

    label(FILL_TILES),
    push('bc'),
    label(FILL_TILES_NEXT),
    ldi_hl_a(),
    dec_r('b'),
    jr_cc('nz', FILL_TILES_NEXT),
    pop('bc'),
    ret(),
  ];
}

/** Draw tiles at a tilemap address from a shared tile list (safe with the LCD on) */
export function drawTiles(address: number, tiles: readonly number[]): Op[] {
  // draw_tiles walks the list with DE: save the caller's
  return [
    push('de'),
    ld_rr_nn('hl', u16(address)),
    ld_rr_nn('de', tileList(tiles)),
    call(DRAW_TILES),
    pop('de'),
  ];
}

/** Write a row of tiles horizontally centered on the visible screen (safe with the LCD on) */
export function writeCenteredRow(row: number, tiles: readonly number[]): Op[] {
  return drawTiles(tilemapAddr(tileRow(row), centerStartCol(tiles.length)), tiles);
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
// Game Boy Color: attributes (VRAM bank 1) and palette sets
// ---------------------------------------------------------------------------

/** Run `ops` only on a Game Boy Color, with VRAM bank 1 (attributes) selected. */
export function cgbAttributes(name: string, ops: readonly Op[]): Op[] {
  const skip = new Label(`${name}_skip`);
  return [
    ld_a_nn(MEM.IS_CGB),
    cp_n(u8(0)),
    jp_cc('z', skip),
    ld_r_n('a', u8(1)),
    ldh_n_a(HW.VBK),
    ...ops,
    xor_r('a'),
    ldh_n_a(HW.VBK),
    label(skip),
  ];
}

/** Set the palette of a rectangle of cells (LCD off, inside cgbAttributes). */
export function fillAttributes(
  row: number,
  col: number,
  rows: number,
  cols: number,
  palette: number,
): Op[] {
  return Array.from({ length: rows }, (_, r) => [
    ld_rr_nn('hl', u16(tilemapAddr(row + r, col))),
    ld_r_n('a', u8(palette)),
    ...Array.from({ length: cols }, () => ldi_hl_a()),
  ]).flat();
}

/** Hearts on the HUD row (cols 1-3) */
/** The HUD sits on a ribbon across the top row */
const HUD_ROW = 0;

/**
 * Subroutine clear_screen: blank the BG tilemap and, on GBC, reset every cell to
 * palette 0 except the HUD ribbon (top row, palette 1). LCD must be off.
 */
export function buildClearScreen(): Op[] {
  return [
    label(CLEAR_SCREEN),
    ...zeroPages('clear_screen_map', MEM.VRAM_MAP0, 4),
    ...cgbAttributes('clear_screen_attrs', [
      ...zeroPages('clear_screen_attr', MEM.VRAM_MAP0, 4),
      ...fillAttributes(HUD_ROW, 0, 1, SCREEN_COLS, PAL.hud),
    ]),
    ret(),
  ];
}

/** Clear the screen (tiles and, on GBC, attributes). LCD must be off. */
export function clearScreen(): Op[] {
  return [call(CLEAR_SCREEN)];
}

/**
 * Run-length encode cells (tiles or palettes) for rows of SCREEN_COLS cells:
 * [count, value] pairs, ended by a 0 count (see draw_runs).
 */
export function encodeRuns(palettes: readonly number[]): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < palettes.length;) {
    const value = palettes[i] ?? 0;
    let run = 1;
    while (run < 255 && palettes[i + run] === value) run++;
    out.push(run, value);
    i += run;
  }
  out.push(0);
  return Uint8Array.from(out);
}

/**
 * Subroutine draw_runs: DE = runs (see encodeRuns), HL = first cell. Writes rows of
 * SCREEN_COLS cells, LCD off: backdrop tiles, or (inside cgbAttributes) their palettes.
 */
export function buildDrawRuns(): Op[] {
  return [
    label(DRAW_RUNS),
    ld_r_n('c', u8(SCREEN_COLS)),
    label(DRAW_RUNS_NEXT),
    ld_a_de(),
    inc_rr('de'),
    cp_n(u8(0)),
    ret_cc('z'),
    ld_r_r('b', 'a'), // run length
    ld_a_de(),
    inc_rr('de'), // A = tile or palette
    label(DRAW_RUNS_CELL),
    ldi_hl_a(),
    dec_r('c'),
    jr_cc('nz', DRAW_RUNS_SAME_ROW),
    // End of a visible row: skip to the next tilemap row
    push('af'),
    ld_r_r('a', 'l'),
    add_n(u8(32 - SCREEN_COLS)),
    ld_r_r('l', 'a'),
    jr_cc('nc', DRAW_RUNS_NC),
    inc_r('h'),
    label(DRAW_RUNS_NC),
    pop('af'),
    ld_r_n('c', u8(SCREEN_COLS)),
    label(DRAW_RUNS_SAME_ROW),
    dec_r('b'),
    jr_cc('nz', DRAW_RUNS_CELL),
    jr(DRAW_RUNS_NEXT),
  ];
}

// ---------------------------------------------------------------------------
// Fades: every palette of a set shares color 0 (paper), so fading shifts each
// palette's colors toward index 0 (step k: color j shows color max(0, j - k)),
// and the whole screen melts into the paper color. The DMG does the same with BGP.
// ---------------------------------------------------------------------------

/** Fade levels: 0 = full color ... FADE_STEPS - 1 = all paper */
export const FADE_STEPS = 4;
/** Frames each fade step is shown */
export const FADE_STEP_FRAMES = 3;
/** BGP for each fade level (shade of color index i = max(0, i - k)) */
const FADE_BGP_SHADES = [0xe4, 0x90, 0x40, 0x00] as const;

/** Fade in the palette set at `setLabel`, turning the LCD on first. */
export function fadeIn(setLabel: Label): Op[] {
  return [ld_rr_nn('hl', setLabel), call(FADE_IN)];
}

/** Fade the palette set currently on screen back in (e.g. after redrawing). */
export function fadeInCurrent(): Op[] {
  return [call(FADE_IN_CURRENT)];
}

/** Fade the screen to its paper color (no-op if the LCD is off). */
export function fadeOut(): Op[] {
  return [call(FADE_OUT)];
}

/** Palettes every screen shares (UI, HUD), stored once at shared_palettes (see color.ts) */
const SHARED_PALETTE_COUNT = 2;

/** Subroutines palette_put, fade_apply, fade_palettes, fade_wait, fade_in(_current), fade_out. */
export function buildFadeRoutines(): Op[] {
  return [
    // palette_put: write A to BCPD once palette RAM is accessible (preserves A)
    label(PALETTE_PUT),
    push('af'),
    label(PALETTE_PUT_WAIT),
    ldh_a_n(HW.STAT),
    and_n(u8(STAT_BUSY)),
    jr_cc('nz', PALETTE_PUT_WAIT),
    pop('af'),
    ldh_n_a(HW.BCPD),
    ret(),

    // fade_apply: show fade level B of the palette set at HL. Preserves B, HL.
    label(FADE_APPLY),
    push('hl'),
    push('hl'),
    ld_rr_nn('hl', FADE_BGP),
    ld_r_r('a', 'b'),
    add_r('l'),
    ld_r_r('l', 'a'),
    jr_cc('nc', FADE_BGP_NC),
    inc_r('h'),
    label(FADE_BGP_NC),
    ld_r_r('a', 'hl_ptr'),
    ldh_n_a(HW.BGP),
    pop('hl'), // the set (the other copy is restored on return)
    ld_r_n('a', u8(0x80)), // palette 0, color 0, auto-increment
    ldh_n_a(HW.BCPS),
    // The UI and HUD palettes every screen shares, then the set's own
    push('hl'),
    ld_rr_nn('hl', SHARED_PALETTES),
    ld_r_n('d', u8(SHARED_PALETTE_COUNT)),
    call(FADE_PALETTES),
    pop('hl'),
    ldi_a_hl(),
    ld_r_r('d', 'a'), // D = palettes in the set
    call(FADE_PALETTES),
    pop('hl'),
    ret(),

    // fade_palettes: write D palettes from HL at fade level B. Clobbers A, C, D, HL.
    label(FADE_PALETTES),
    label(FADE_PALETTE),
    ld_r_n('c', u8(0)), // C = color index j
    label(FADE_COLOR),
    push('hl'),
    ld_r_r('a', 'c'),
    sub_r('b'),
    jr_cc('nc', FADE_SRC_OK),
    xor_r('a'), // max(0, j - k)
    label(FADE_SRC_OK),
    add_r('a'), // 2 bytes per color
    add_r('l'),
    ld_r_r('l', 'a'),
    jr_cc('nc', FADE_SRC_NC),
    inc_r('h'),
    label(FADE_SRC_NC),
    ldi_a_hl(),
    call(PALETTE_PUT),
    ld_r_r('a', 'hl_ptr'),
    call(PALETTE_PUT),
    pop('hl'),
    inc_r('c'),
    ld_r_r('a', 'c'),
    cp_n(u8(4)),
    jr_cc('nz', FADE_COLOR),
    ld_r_r('a', 'l'),
    add_n(u8(8)), // next palette
    ld_r_r('l', 'a'),
    jr_cc('nc', FADE_NEXT_NC),
    inc_r('h'),
    label(FADE_NEXT_NC),
    dec_r('d'),
    jr_cc('nz', FADE_PALETTE),
    ret(),

    // fade_wait: show the current level for FADE_STEP_FRAMES frames
    label(FADE_WAIT),
    ld_r_n('c', u8(FADE_STEP_FRAMES)),
    label(FADE_WAIT_FRAME),
    call(FRAME_WAIT),
    call(MEM.OAM_DMA), // see sprites.ts: so sprites update during fades
    dec_r('c'),
    jr_cc('nz', FADE_WAIT_FRAME),
    ret(),

    // fade_in: HL = palette set. Starts at paper, turns the LCD on, steps to full color.
    label(FADE_IN_CURRENT),
    ...loadPointer('hl', MEM.FADE_TABLE_LO, MEM.FADE_TABLE_HI),
    label(FADE_IN),
    ...storePointer('hl', MEM.FADE_TABLE_LO, MEM.FADE_TABLE_HI),
    ld_r_n('b', u8(FADE_STEPS - 1)),
    call(FADE_APPLY),
    ...screenOn(),
    label(FADE_IN_STEP),
    call(FADE_WAIT),
    dec_r('b'),
    call(FADE_APPLY),
    ld_r_r('a', 'b'),
    cp_n(u8(0)),
    jr_cc('nz', FADE_IN_STEP),
    ret(),

    // fade_out: step the current set to paper. HALT never wakes with the LCD
    // off (no VBlank), so do nothing in that case.
    label(FADE_OUT),
    ldh_a_n(HW.LCDC),
    and_n(u8(LCDC.LCD_ON)),
    ret_cc('z'),
    call(SPRITES_OFF), // sprites don't fade: take them off first
    ...loadPointer('hl', MEM.FADE_TABLE_LO, MEM.FADE_TABLE_HI),
    ld_r_n('b', u8(0)),
    label(FADE_OUT_STEP),
    call(FADE_WAIT),
    inc_r('b'),
    call(FADE_APPLY),
    ld_r_r('a', 'b'),
    cp_n(u8(FADE_STEPS - 1)),
    jr_cc('nz', FADE_OUT_STEP),
    ret(),
  ];
}

/** Data used by the fade routines */
export function buildFadeData(): Op[] {
  return [label(FADE_BGP), db([...FADE_BGP_SHADES])];
}
