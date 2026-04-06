/**
 * Title screen ROM program.
 *
 * Displays "JRPGEN" with "はじめ" (hajime / begin) underneath.
 * Press START to open a test dialogue, then launches a kana mini-game.
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
import { buildDialogueData, buildDialogueEngine } from './dialogue';
import { buildKanaData, buildKanaEngine, KANA_QUESTIONS } from './kana';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const TILEMAP_BASE = MEM.VRAM_MAP0;
const SCREEN_COLS = 20;
const MAP_COLS = 32;

function mapAddr(row: number, col: number): number {
  return TILEMAP_BASE + row * MAP_COLS + col;
}

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
// Tile & dialogue & kana data
// ---------------------------------------------------------------------------

const tileData = buildTileData();
const tileDataSize = tileData.length;

const { data: dialogueData } = buildDialogueData([
  {
    text: 'こんにちは!',
    choices: ['はい', 'いいえ'],
  },
]);

const kanaData = buildKanaData(KANA_QUESTIONS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TextWrite {
  addr: number;
  tiles: number[];
}

const textWrites: TextWrite[] = [
  { addr: mapAddr(titleRow, titleCol), tiles: textToTiles(TITLE) },
  { addr: mapAddr(subRow, subCol), tiles: textToTiles(SUBTITLE) },
];

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

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

export function buildProgram(): Op[] {
  return [
    // ---- Init ----
    di(),
    ld_rr_nn('sp', u16(0xfffe)),

    // Clear WRAM state
    xor_r('a'),
    ld_nn_a(MEM.JOYPAD_CUR),
    ld_nn_a(MEM.JOYPAD_PREV),
    ld_nn_a(MEM.JOYPAD_NEW),
    ld_nn_a(MEM.DLG_STATE),
    ld_nn_a(MEM.KANA_STATE),

    // Wait for VBlank
    label('waitVBlank'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('waitVBlank')),

    // Turn off LCD
    xor_r('a'),
    ldh_n_a(HW.LCDC),

    // Copy tile data to VRAM
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

    // Clear tilemap
    ld_rr_nn('hl', MEM.VRAM_MAP0),
    xor_r('a'),
    ld_r_n('b', u8(4)),
    ld_r_n('c', u8(0)),

    label('clearMap'),
    ldi_hl_a(),
    dec_r('c'),
    jr_cc('nz', ref('clearMap')),
    dec_r('b'),
    jr_cc('nz', ref('clearMap')),

    // Write title text
    ...buildTextWriteOps(textWrites),

    // Set palette & turn on LCD
    ld_r_n('a', u8(0xe4)),
    ldh_n_a(HW.BGP),
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    ei(),

    // ---- Title screen loop: wait for START ----
    label('titleLoop'),
    halt(),
    nop(),
    call(ref('joy_read')),

    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.START)),
    jr_cc('z', ref('titleLoop')),

    // START pressed — open the test dialogue
    ld_rr_nn('de', ref('dialogueData')),
    call(ref('dlg_open')),

    // ---- Dialogue loop ----
    label('dialogueLoop'),
    halt(),
    nop(),
    call(ref('joy_read')),
    call(ref('dlg_update')),

    ld_a_nn(MEM.DLG_STATE),
    cp_n(u8(0)),
    jr_cc('nz', ref('dialogueLoop')),

    // Dialogue done — launch kana mini-game
    ld_rr_nn('de', ref('kanaData')),
    call(ref('kana_start')),

    // ---- Kana game loop ----
    label('kanaLoop'),
    halt(),
    nop(),
    call(ref('joy_read')),
    call(ref('kana_update')),

    ld_a_nn(MEM.KANA_STATE),
    cp_n(u8(0)),
    jr_cc('nz', ref('kanaLoop')),

    // Kana done — back to title
    // Redraw title screen (LCD off, clear, redraw, LCD on)
    label('redrawTitle'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('redrawTitle')),
    xor_r('a'),
    ldh_n_a(HW.LCDC),

    ld_rr_nn('hl', MEM.VRAM_MAP0),
    xor_r('a'),
    ld_r_n('b', u8(4)),
    ld_r_n('c', u8(0)),
    label('clearMap2'),
    ldi_hl_a(),
    dec_r('c'),
    jr_cc('nz', ref('clearMap2')),
    dec_r('b'),
    jr_cc('nz', ref('clearMap2')),

    ...buildTextWriteOps(textWrites),

    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    jr(ref('titleLoop')),

    // ---- Subroutines ----
    ...buildReadJoypad(),
    ...buildDialogueEngine(),
    ...buildKanaEngine(),

    // ---- Data ----
    label('tileData'),
    db(tileData),

    label('dialogueData'),
    db(dialogueData),

    label('kanaData'),
    db(kanaData),
  ];
}
