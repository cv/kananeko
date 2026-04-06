/**
 * Title screen ROM program.
 *
 * Displays "JRPGEN" with "はじめ" (hajime / begin) underneath.
 * Waits for START press, then loops (will later trigger scene transition).
 */

import { type Op, ref, u8, u16 } from '../asm/types';
import {
  label,
  db,
  di,
  ei,
  nop,
  halt,
  ld_rr_nn,
  ld_r_n,
  ldi_hl_a,
  xor_r,
  cp_n,
  ldh_a_n,
  ldh_n_a,
  jr,
  jr_cc,
  dec_r,
  inc_rr,
  ld_a_de,
  ld_a_nn,
  ld_nn_a,
  and_n,
  call,
} from '../asm/ops';
import { HW, JOY, LCDC, MEM } from '../asm/hardware';
import { buildTileData, textToTiles } from './font';
import { buildReadJoypad } from './joypad';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const TILEMAP_BASE = MEM.VRAM_MAP0; // $9800
const SCREEN_COLS = 20;
const MAP_COLS = 32;

/** Tilemap address for a screen row/col */
function mapAddr(row: number, col: number): number {
  return TILEMAP_BASE + row * MAP_COLS + col;
}

/** Center text on screen, returning the starting column */
function centerCol(text: string): number {
  return Math.floor((SCREEN_COLS - Array.from(text).length) / 2);
}

// ---------------------------------------------------------------------------
// Text layout
// ---------------------------------------------------------------------------

const TITLE = 'JRPGEN';
const SUBTITLE = 'はじめ';

const titleRow = 6;
const titleCol = centerCol(TITLE);
const subRow = 10;
const subCol = centerCol(SUBTITLE);

// ---------------------------------------------------------------------------
// Build tile data
// ---------------------------------------------------------------------------

const tileData = buildTileData();
const tileDataSize = tileData.length;

// ---------------------------------------------------------------------------
// Build tilemap writes as a sequence of (addr, tileIndex) pairs
// ---------------------------------------------------------------------------

interface TextWrite {
  addr: number;
  tiles: number[];
}

const textWrites: TextWrite[] = [
  { addr: mapAddr(titleRow, titleCol), tiles: textToTiles(TITLE) },
  { addr: mapAddr(subRow, subCol), tiles: textToTiles(SUBTITLE) },
];

// ---------------------------------------------------------------------------
// Assemble the program
// ---------------------------------------------------------------------------

function buildTextWriteOps(writes: TextWrite[]): Op[] {
  const ops: Op[] = [];
  for (const w of writes) {
    ops.push(ld_rr_nn('hl', u16(w.addr)));
    for (const tile of w.tiles) {
      ops.push(ld_r_n('a', u8(tile)));
      ops.push(ldi_hl_a());
    }
  }
  return ops;
}

export function buildProgram(): Op[] {
  return [
    // ---- Init ----
    di(),
    ld_rr_nn('sp', u16(0xfffe)),

    // Clear joypad WRAM
    xor_r('a'),
    ld_nn_a(MEM.JOYPAD_CUR),
    ld_nn_a(MEM.JOYPAD_PREV),
    ld_nn_a(MEM.JOYPAD_NEW),

    // Wait for VBlank so we can safely disable the LCD
    label('waitVBlank'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('waitVBlank')),

    // Turn off LCD
    xor_r('a'),
    ldh_n_a(HW.LCDC),

    // ---- Copy tile data to VRAM ($8000) ----
    ld_rr_nn('hl', MEM.VRAM_TILES),
    ld_rr_nn('de', ref('tileData')),
    ld_r_n('b', u8(Math.ceil(tileDataSize / 256))),
    ld_r_n('c', u8(0)),

    label('copyTiles'),
    ld_a_de(),
    ldi_hl_a(),
    inc_rr('de'),
    dec_r('c'),
    jr_cc('nz', ref('copyTiles')),
    dec_r('b'),
    jr_cc('nz', ref('copyTiles')),

    // ---- Clear tilemap ----
    ld_rr_nn('hl', MEM.VRAM_MAP0),
    xor_r('a'),
    ld_r_n('b', u8(4)), // 4 * 256 = 1024
    ld_r_n('c', u8(0)),

    label('clearMap'),
    ldi_hl_a(),
    dec_r('c'),
    jr_cc('nz', ref('clearMap')),
    dec_r('b'),
    jr_cc('nz', ref('clearMap')),

    // ---- Write text to tilemap ----
    ...buildTextWriteOps(textWrites),

    // ---- Set BG palette (darkest to lightest: 11 10 01 00) ----
    ld_r_n('a', u8(0xe4)),
    ldh_n_a(HW.BGP),

    // ---- Turn on LCD: BG on, tile data at $8000 ----
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    ei(),

    // ---- Main loop: read input, check for START ----
    label('mainLoop'),
    halt(),
    nop(), // NOP after HALT (DMG hardware bug workaround)

    call(ref('joy_read')),

    // Check if START was newly pressed
    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.START)),
    jr_cc('z', ref('mainLoop')), // not pressed → keep looping

    // START was pressed — for now, loop back (scene transition will go here)
    label('startPressed'),
    jr(ref('mainLoop')),

    // ---- Subroutines ----
    ...buildReadJoypad(),

    // ---- Tile data ----
    label('tileData'),
    db(tileData),
  ];
}
