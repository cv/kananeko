/**
 * Screen helpers shared by the title screen, scenes, and engines.
 */

import { compare, doWhile, ifThen, loop, repeat } from '../asm/flow';
import { HW, LCDC } from '../asm/hardware';
import { MEM } from './ram';
import {
  copyByte,
  incByte,
  lcdOff,
  lcdOn,
  loadPointer,
  storePointer,
  zeroPages,
} from '../asm/macros';
import {
  add,
  and,
  call,
  cp,
  db,
  dec,
  halt,
  inc,
  jp,
  jr,
  label,
  ld,
  ldh,
  nop,
  pop,
  push,
  ret,
  reti,
  sub,
  xor,
  invoke,
} from '../asm/sm83';
import { type Op, u16, Label, Pooled, routine } from '../asm/types';
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
  OAM_DMA,
} from './labels';
import { gameModule } from '../asm/program';

// Labels placed in this module
const FRAME_WAIT = routine('frame_wait', { keepsFlags: true });
const CLEAR_SCREEN = routine('clear_screen', { clobbers: ['a', 'bc', 'hl'] });
const PALETTE_PUT = routine('palette_put', { in: ['a'], keepsFlags: true });
const FADE_APPLY = routine('fade_apply', { in: ['b', 'hl'], clobbers: ['a', 'c', 'd'] });
const FADE_PALETTES = routine('fade_palettes', {
  in: ['b', 'd', 'hl'],
  clobbers: ['a', 'c', 'd', 'hl'],
});
const FADE_WAIT = routine('fade_wait', { clobbers: ['a', 'c'] });
const FADE_IN_CURRENT = routine('fade_in_current', { clobbers: ['a', 'd', 'bc', 'hl'] });
const FADE_OUT = routine('fade_out', { clobbers: ['a', 'd', 'bc', 'hl'] });
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
export function screenOff(): Op[] {
  return lcdOff();
}

/** Turn the LCD on with the game's standard flags. */
export function screenOn(): Op[] {
  return [
    ...lcdOn(SCREEN_ON_FLAGS),
    // The time spent with the screen off isn't a missed frame (see frame_wait)
    ...copyByte(MEM.LAST_FRAME, MEM.FRAME_COUNT),
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
    ...incByte(MEM.FRAME_COUNT),
    pop('af'),
    reti(),

    label(FRAME_WAIT),
    halt(),
    nop(),
    push('af'),
    push('bc'),
    ld('a', [MEM.LAST_FRAME]),
    ld('c', 'a'),
    ...copyByte(MEM.LAST_FRAME, MEM.FRAME_COUNT),
    sub('c'), // VBlanks since the last wait
    cp(2),
    ...ifThen('nc', [
      dec('a'),
      ld('c', 'a'),
      ld('a', [MEM.FRAMES_MISSED]),
      add('c'),
      ...ifThen('c', [ld('a', 0xff)]),
      ld([MEM.FRAMES_MISSED], 'a'),
    ]),
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
    ...doWhile('nz', [ldh('a', [HW.STAT]), and(STAT_BUSY)]),
    pop('af'),
    ld(['hl+'], 'a'),
    ret(),
  ];
}

/** Write A to [HL+] safely while the LCD is on (see buildVramPut). */
export function vramPut(): Op[] {
  return invoke(VRAM_PUT, { a: 'a', hl: 'hl' });
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
    ld('a', ['de']),
    inc('de'),
    cp(TILES_END),
    ret('z'),
    ...invoke(VRAM_PUT, { a: 'a', hl: 'hl' }),
    jr(DRAW_TILES),

    label(FILL_TILES),
    push('bc'),
    ...doWhile('nz', [ld(['hl+'], 'a'), dec('b')]),
    pop('bc'),
    ret(),
  ];
}

/** Draw tiles at a tilemap address from a shared tile list (safe with the LCD on) */
export function drawTiles(address: number, tiles: readonly number[]): Op[] {
  // draw_tiles walks the list with DE: save the caller's
  return [push('de'), ...invoke(DRAW_TILES, { hl: u16(address), de: tileList(tiles) }), pop('de')];
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
export function cgbAttributes(ops: readonly Op[]): Op[] {
  const skip = new Label();
  return [
    ...compare(MEM.IS_CGB, 0),
    jp('z', skip),
    ld('a', 1),
    ldh([HW.VBK], 'a'),
    ...ops,
    xor('a'),
    ldh([HW.VBK], 'a'),
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
    ld('hl', u16(tilemapAddr(row + r, col))),
    ld('a', palette),
    ...Array.from({ length: cols }, () => ld(['hl+'], 'a')),
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
    ...zeroPages(MEM.VRAM_MAP0, 4),
    ...cgbAttributes([
      ...zeroPages(MEM.VRAM_MAP0, 4),
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
    ld('c', SCREEN_COLS),
    ...loop((again) => [
      ld('a', ['de']),
      inc('de'),
      cp(0),
      ret('z'),
      ld('b', 'a'), // run length
      ld('a', ['de']),
      inc('de'), // A = tile or palette
      ...doWhile('nz', [
        ld(['hl+'], 'a'),
        dec('c'),
        ...ifThen('z', [
          push('af'),
          ld('a', 'l'),
          add(32 - SCREEN_COLS),
          ld('l', 'a'),
          ...ifThen('c', [inc('h')]),
          pop('af'),
          ld('c', SCREEN_COLS),
        ]),
        dec('b'),
      ]),
      jr(again),
    ]),
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
  return invoke(FADE_IN, { hl: setLabel });
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
    ...doWhile('nz', [ldh('a', [HW.STAT]), and(STAT_BUSY)]),
    pop('af'),
    ldh([HW.BCPD], 'a'),
    ret(),

    // fade_apply: show fade level B of the palette set at HL. Preserves B, HL.
    label(FADE_APPLY),
    push('hl'),
    push('hl'),
    ld('hl', FADE_BGP),
    ld('a', 'b'),
    add('l'),
    ld('l', 'a'),
    ...ifThen('c', [inc('h')]),
    ld('a', ['hl']),
    ldh([HW.BGP], 'a'),
    pop('hl'), // the set (the other copy is restored on return)
    ld('a', 0x80), // palette 0, color 0, auto-increment
    ldh([HW.BCPS], 'a'),
    // The UI and HUD palettes every screen shares, then the set's own
    push('hl'),
    ...invoke(FADE_PALETTES, { hl: SHARED_PALETTES, d: SHARED_PALETTE_COUNT, b: 'b' }),
    pop('hl'),
    ld('a', ['hl+']),
    // D = palettes in the set
    ...invoke(FADE_PALETTES, { d: 'a', b: 'b', hl: 'hl' }),
    pop('hl'),
    ret(),

    // fade_palettes: write D palettes from HL at fade level B. Clobbers A, C, D, HL.
    label(FADE_PALETTES),
    ...doWhile('nz', [
      ld('c', 0), // C = color index j
      ...doWhile('nz', [
        push('hl'),
        ld('a', 'c'),
        sub('b'),
        ...ifThen('c', [xor('a')]),
        add('a'), // 2 bytes per color
        add('l'),
        ld('l', 'a'),
        ...ifThen('c', [inc('h')]),
        ...invoke(PALETTE_PUT, { a: ['hl+'] }),
        ...invoke(PALETTE_PUT, { a: ['hl'] }),
        pop('hl'),
        inc('c'),
        ld('a', 'c'),
        cp(4),
      ]),
      ld('a', 'l'),
      add(8), // next palette
      ld('l', 'a'),
      ...ifThen('c', [inc('h')]),
      dec('d'),
    ]),
    ret(),

    // fade_wait: show the current level for FADE_STEP_FRAMES frames
    label(FADE_WAIT),
    ...repeat(FADE_STEP_FRAMES, [call(FRAME_WAIT), call(OAM_DMA)], 'c'),
    ret(),

    // fade_in: HL = palette set. Starts at paper, turns the LCD on, steps to full color.
    label(FADE_IN_CURRENT),
    ...loadPointer('hl', MEM.FADE_TABLE),
    label(FADE_IN),
    ...storePointer('hl', MEM.FADE_TABLE),
    ...invoke(FADE_APPLY, { b: FADE_STEPS - 1, hl: 'hl' }),
    ...screenOn(),
    ...doWhile('nz', [
      call(FADE_WAIT),
      dec('b'),
      ...invoke(FADE_APPLY, { b: 'b', hl: 'hl' }),
      ld('a', 'b'),
      cp(0),
    ]),
    ret(),

    // fade_out: step the current set to paper. HALT never wakes with the LCD
    // off (no VBlank), so do nothing in that case.
    label(FADE_OUT),
    ldh('a', [HW.LCDC]),
    and(LCDC.LCD_ON),
    ret('z'),
    call(SPRITES_OFF), // sprites don't fade: take them off first
    ...loadPointer('hl', MEM.FADE_TABLE),
    ld('b', 0),
    ...doWhile('nz', [
      call(FADE_WAIT),
      inc('b'),
      ...invoke(FADE_APPLY, { b: 'b', hl: 'hl' }),
      ld('a', 'b'),
      cp(FADE_STEPS - 1),
    ]),
    ret(),
  ];
}

/** Data used by the fade routines */
export function buildFadeData(): Op[] {
  return [label(FADE_BGP), db([...FADE_BGP_SHADES])];
}

export const videoModule = gameModule({
  name: 'video',
  code: () => [
    ...buildVramPut(),
    ...buildFrameWait(),
    ...buildDrawTiles(),
    ...buildFadeRoutines(),
    ...buildClearScreen(),
    ...buildDrawRuns(),
  ],
  data: buildFadeData,
});
