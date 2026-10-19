/**
 * Screen helpers shared by the title screen, scenes, and engines.
 */

import { HW, LCDC, MEM } from '../asm/hardware';
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
import { type Op, ref, u8, u16 } from '../asm/types';
import type { Quad } from './fixed';
import { SCREEN_COLS, centerStartCol, tilemapAddr, tileRow } from './tilemap';

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
  return [call(ref('frame_wait'))];
}

/**
 * The VBlank handler (counts frames) and frame_wait: sleep until the next VBlank,
 * then add the VBlanks beyond one since the last wait to FRAMES_MISSED. Every frame
 * the game waits for goes through frame_wait, so FRAMES_MISSED counts the times its
 * work took longer than a frame. Preserves all registers.
 */
export function buildFrameWait(): Op[] {
  return [
    label('vblank_handler'),
    push('af'),
    ld_a_nn(MEM.FRAME_COUNT),
    inc_r('a'),
    ld_nn_a(MEM.FRAME_COUNT),
    pop('af'),
    reti(),

    label('frame_wait'),
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
    jr_cc('c', ref('frame_wait_done')),
    dec_r('a'),
    ld_r_r('c', 'a'),
    ld_a_nn(MEM.FRAMES_MISSED),
    add_r('c'),
    jr_cc('nc', ref('frame_wait_store')),
    ld_r_n('a', u8(0xff)),
    label('frame_wait_store'),
    ld_nn_a(MEM.FRAMES_MISSED),
    label('frame_wait_done'),
    // Sound steps once per frame here rather than in the VBlank handler, so it plays
    // the same with interrupts off (the tests' emulator runs without them)
    push('de'),
    push('hl'),
    call(ref('sound_tick')),
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

/** Ends a tile list drawn by draw_tiles (no tile has this index) */
const TILES_END = 0xff;

/**
 * Tile lists drawn by draw_tiles, stored once each in the data section. Reset at the
 * start of every build (resetTileLists) and emitted at its end (buildTileLists).
 */
const tileLists = new Map<string, { label: string; tiles: readonly number[] }>();

export function resetTileLists(): void {
  tileLists.clear();
}

/** Label of a tile list in the data section (identical lists share one) */
export function tileListLabel(tiles: readonly number[]): string {
  const key = tiles.join(',');
  let entry = tileLists.get(key);
  if (entry === undefined) {
    entry = { label: `tile_list_${String(tileLists.size)}`, tiles };
    tileLists.set(key, entry);
  }
  return entry.label;
}

/** The tile lists, each ending in TILES_END */
export function buildTileLists(): Op[] {
  return [...tileLists.values()].flatMap(({ label: name, tiles }) => [
    label(name),
    db([...tiles, TILES_END]),
  ]);
}

/**
 * Subroutines (drawTiles saves DE around draw_tiles, so callers only lose A and HL):
 *   draw_tiles  HL = tilemap address, DE = tile list (see tileListLabel); safe with the LCD
 *               on (each write goes through vram_put)
 *   fill_tiles  HL = tilemap address, A = tile, B = count; LCD off
 */
export function buildDrawTiles(): Op[] {
  return [
    label('draw_tiles'),
    ld_a_de(),
    inc_rr('de'),
    cp_n(u8(TILES_END)),
    ret_cc('z'),
    call(ref('vram_put')),
    jr(ref('draw_tiles')),

    label('fill_tiles'),
    push('bc'),
    label('fill_tiles_next'),
    ldi_hl_a(),
    dec_r('b'),
    jr_cc('nz', ref('fill_tiles_next')),
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
    ld_rr_nn('de', ref(tileListLabel(tiles))),
    call(ref('draw_tiles')),
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
  return [
    ld_a_nn(MEM.IS_CGB),
    cp_n(u8(0)),
    jp_cc('z', ref(`${name}_skip`)),
    ld_r_n('a', u8(1)),
    ldh_n_a(HW.VBK),
    ...ops,
    xor_r('a'),
    ldh_n_a(HW.VBK),
    label(`${name}_skip`),
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
    label('clear_screen'),
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
  return [call(ref('clear_screen'))];
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
    label('draw_runs'),
    ld_r_n('c', u8(SCREEN_COLS)),
    label('draw_runs_next'),
    ld_a_de(),
    inc_rr('de'),
    cp_n(u8(0)),
    ret_cc('z'),
    ld_r_r('b', 'a'), // run length
    ld_a_de(),
    inc_rr('de'), // A = tile or palette
    label('draw_runs_cell'),
    ldi_hl_a(),
    dec_r('c'),
    jr_cc('nz', ref('draw_runs_same_row')),
    // End of a visible row: skip to the next tilemap row
    push('af'),
    ld_r_r('a', 'l'),
    add_n(u8(32 - SCREEN_COLS)),
    ld_r_r('l', 'a'),
    jr_cc('nc', ref('draw_runs_nc')),
    inc_r('h'),
    label('draw_runs_nc'),
    pop('af'),
    ld_r_n('c', u8(SCREEN_COLS)),
    label('draw_runs_same_row'),
    dec_r('b'),
    jr_cc('nz', ref('draw_runs_cell')),
    jr(ref('draw_runs_next')),
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
const FADE_BGP = [0xe4, 0x90, 0x40, 0x00] as const;

/** Fade in the palette set at `setLabel`, turning the LCD on first. */
export function fadeIn(setLabel: string): Op[] {
  return [ld_rr_nn('hl', ref(setLabel)), call(ref('fade_in'))];
}

/** Fade the palette set currently on screen back in (e.g. after redrawing). */
export function fadeInCurrent(): Op[] {
  return [call(ref('fade_in_current'))];
}

/** Fade the screen to its paper color (no-op if the LCD is off). */
export function fadeOut(): Op[] {
  return [call(ref('fade_out'))];
}

/** Palettes every screen shares (UI, HUD), stored once at shared_palettes (see color.ts) */
const SHARED_PALETTES = 2;

/** Subroutines palette_put, fade_apply, fade_palettes, fade_wait, fade_in(_current), fade_out. */
export function buildFadeRoutines(): Op[] {
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

    // fade_apply: show fade level B of the palette set at HL. Preserves B, HL.
    label('fade_apply'),
    push('hl'),
    push('hl'),
    ld_rr_nn('hl', ref('fade_bgp')),
    ld_r_r('a', 'b'),
    add_r('l'),
    ld_r_r('l', 'a'),
    jr_cc('nc', ref('fade_bgp_nc')),
    inc_r('h'),
    label('fade_bgp_nc'),
    ld_r_r('a', 'hl_ptr'),
    ldh_n_a(HW.BGP),
    pop('hl'), // the set (the other copy is restored on return)
    ld_r_n('a', u8(0x80)), // palette 0, color 0, auto-increment
    ldh_n_a(HW.BCPS),
    // The UI and HUD palettes every screen shares, then the set's own
    push('hl'),
    ld_rr_nn('hl', ref('shared_palettes')),
    ld_r_n('d', u8(SHARED_PALETTES)),
    call(ref('fade_palettes')),
    pop('hl'),
    ldi_a_hl(),
    ld_r_r('d', 'a'), // D = palettes in the set
    call(ref('fade_palettes')),
    pop('hl'),
    ret(),

    // fade_palettes: write D palettes from HL at fade level B. Clobbers A, C, D, HL.
    label('fade_palettes'),
    label('fade_palette'),
    ld_r_n('c', u8(0)), // C = color index j
    label('fade_color'),
    push('hl'),
    ld_r_r('a', 'c'),
    sub_r('b'),
    jr_cc('nc', ref('fade_src_ok')),
    xor_r('a'), // max(0, j - k)
    label('fade_src_ok'),
    add_r('a'), // 2 bytes per color
    add_r('l'),
    ld_r_r('l', 'a'),
    jr_cc('nc', ref('fade_src_nc')),
    inc_r('h'),
    label('fade_src_nc'),
    ldi_a_hl(),
    call(ref('palette_put')),
    ld_r_r('a', 'hl_ptr'),
    call(ref('palette_put')),
    pop('hl'),
    inc_r('c'),
    ld_r_r('a', 'c'),
    cp_n(u8(4)),
    jr_cc('nz', ref('fade_color')),
    ld_r_r('a', 'l'),
    add_n(u8(8)), // next palette
    ld_r_r('l', 'a'),
    jr_cc('nc', ref('fade_next_nc')),
    inc_r('h'),
    label('fade_next_nc'),
    dec_r('d'),
    jr_cc('nz', ref('fade_palette')),
    ret(),

    // fade_wait: show the current level for FADE_STEP_FRAMES frames
    label('fade_wait'),
    ld_r_n('c', u8(FADE_STEP_FRAMES)),
    label('fade_wait_frame'),
    call(ref('frame_wait')),
    call(u16(0xff80)), // OAM DMA (see sprites.ts) so sprites update during fades
    dec_r('c'),
    jr_cc('nz', ref('fade_wait_frame')),
    ret(),

    // fade_in: HL = palette set. Starts at paper, turns the LCD on, steps to full color.
    label('fade_in_current'),
    ...loadPointer('hl', MEM.FADE_TABLE_LO, MEM.FADE_TABLE_HI),
    label('fade_in'),
    ...storePointer('hl', MEM.FADE_TABLE_LO, MEM.FADE_TABLE_HI),
    ld_r_n('b', u8(FADE_STEPS - 1)),
    call(ref('fade_apply')),
    ...screenOn(),
    label('fade_in_step'),
    call(ref('fade_wait')),
    dec_r('b'),
    call(ref('fade_apply')),
    ld_r_r('a', 'b'),
    cp_n(u8(0)),
    jr_cc('nz', ref('fade_in_step')),
    ret(),

    // fade_out: step the current set to paper. HALT never wakes with the LCD
    // off (no VBlank), so do nothing in that case.
    label('fade_out'),
    ldh_a_n(HW.LCDC),
    and_n(u8(LCDC.LCD_ON)),
    ret_cc('z'),
    call(ref('sprites_off')), // sprites don't fade: take them off first
    ...loadPointer('hl', MEM.FADE_TABLE_LO, MEM.FADE_TABLE_HI),
    ld_r_n('b', u8(0)),
    label('fade_out_step'),
    call(ref('fade_wait')),
    inc_r('b'),
    call(ref('fade_apply')),
    ld_r_r('a', 'b'),
    cp_n(u8(FADE_STEPS - 1)),
    jr_cc('nz', ref('fade_out_step')),
    ret(),
  ];
}

/** Data used by the fade routines */
export function buildFadeData(): Op[] {
  return [label('fade_bgp'), db([...FADE_BGP])];
}
