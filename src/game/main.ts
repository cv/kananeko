/**
 * Main game program — composes all subsystems into a complete ROM.
 *
 * Flow: Title screen → Scene 0..4 (dialogue → kana) → End/loop
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
  jp,
  jp_cc,
  dec_r,
  inc_rr,
  ld_a_de,
  ld_a_nn,
  ld_nn_a,
  and_n,
  or_r,
  inc_r,
  call,
} from '../asm/ops';
import { HW, JOY, LCDC, MEM } from '../asm/hardware';
import { buildTileData, textToTiles, requireTile } from './font';
import { CAT_TILES } from './font-data';
import { buildReadJoypad } from './joypad';
import { buildDialogueEngine } from './dialogue';
import { buildKanaEngine } from './kana';
import { buildSceneData, rgb, SCENES, type Palette } from './scene';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const tileData = buildTileData();
const tileDataSize = tileData.length;
const sceneData = buildSceneData();

const MAP_COLS = 32;
const SCREEN_COLS = 20;

function tilemapAddr(row: number, col: number): number {
  return 0x9800 + row * MAP_COLS + col;
}

/** Safe array access — throws instead of returning undefined */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) {
    throw new RangeError(`Index ${String(i)} out of bounds`);
  }
  return v;
}

// Title screen text & palette
const TITLE = 'カナネコ';
const SUBTITLE = 'はじめ';
const TITLE_PALETTE: Palette = [
  rgb(0xe0, 0xf0, 0xe0),
  rgb(0xa0, 0xc0, 0xa0),
  rgb(0x50, 0x70, 0x50),
  rgb(0x10, 0x20, 0x10),
];

// Cat portrait tile indices
const CAT_TL = requireTile(CAT_TILES.FACE_TL);
const CAT_TR = requireTile(CAT_TILES.FACE_TR);
const CAT_BL = requireTile(CAT_TILES.FACE_BL);
const CAT_BR = requireTile(CAT_TILES.FACE_BR);

// ---------------------------------------------------------------------------
// Helper: write a row of tiles at a tilemap address
// ---------------------------------------------------------------------------

/**
 * Write a 4-color GBC palette to BG palette 0 via BCPS/BCPD.
 * On DMG this is harmless (registers are ignored).
 */
function buildSetPalette(palette: Palette): Op[] {
  const ops: Op[] = [
    // Set BCPS to palette 0, color 0, auto-increment
    ld_r_n('a', u8(0x80)),
    ldh_n_a(HW.BCPS),
  ];
  // Write 4 colors × 2 bytes each
  for (const color of palette) {
    ops.push(ld_r_n('a', u8(color & 0xff)));
    ops.push(ldh_n_a(HW.BCPD));
    ops.push(ld_r_n('a', u8((color >> 8) & 0xff)));
    ops.push(ldh_n_a(HW.BCPD));
  }
  return ops;
}

/** Draw a 2x2 tile portrait at the given tilemap position */
function buildDrawPortrait(
  row: number,
  col: number,
  tl: number,
  tr: number,
  bl: number,
  br: number,
): Op[] {
  return [
    ld_rr_nn('hl', u16(tilemapAddr(row, col))),
    ld_r_n('a', u8(tl)),
    ldi_hl_a(),
    ld_r_n('a', u8(tr)),
    ldi_hl_a(),
    ld_rr_nn('hl', u16(tilemapAddr(row + 1, col))),
    ld_r_n('a', u8(bl)),
    ldi_hl_a(),
    ld_r_n('a', u8(br)),
    ldi_hl_a(),
  ];
}

function buildWriteRow(row: number, tiles: number[]): Op[] {
  const ops: Op[] = [];
  const col = Math.floor((SCREEN_COLS - tiles.length) / 2);
  ops.push(ld_rr_nn('hl', u16(tilemapAddr(row, col))));
  for (const tile of tiles) {
    ops.push(ld_r_n('a', u8(tile)));
    ops.push(ldi_hl_a());
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Helper: clear tilemap
// ---------------------------------------------------------------------------

let clearTilemapCounter = 0;

function buildClearTilemap(): Op[] {
  const id = String(clearTilemapCounter++);
  const lbl = `clear_map_${id}`;
  return [
    ld_rr_nn('hl', MEM.VRAM_MAP0),
    xor_r('a'),
    ld_r_n('b', u8(4)),
    ld_r_n('c', u8(0)),
    label(lbl),
    ldi_hl_a(),
    dec_r('c'),
    jr_cc('nz', ref(lbl)),
    dec_r('b'),
    jr_cc('nz', ref(lbl)),
  ];
}

// ---------------------------------------------------------------------------
// Helper: scene dispatch table
// ---------------------------------------------------------------------------

let dispatchCounter = 0;

/**
 * Build a scene-id-based dispatch: reads SCENE_ID, then for each scene
 * executes the ops returned by `getOps(sceneIndex)`. Avoids repeating
 * the compare-and-jump pattern 5 times per use site.
 */
function buildSceneDispatch(getOps: (i: number) => Op[]): Op[] {
  const id = String(dispatchCounter++);
  const doneLabel = `dispatch_done_${id}`;
  const ops: Op[] = [ld_a_nn(MEM.SCENE_ID)];

  for (let i = 0; i < SCENES.length; i++) {
    const branchLabel = `dispatch_${id}_s${String(i + 1)}`;
    if (i < SCENES.length - 1) {
      ops.push(cp_n(u8(i)));
      ops.push(jp_cc('nz', ref(branchLabel)));
    }
    ops.push(...getOps(i));
    if (i < SCENES.length - 1) {
      ops.push(jp(ref(doneLabel)));
      ops.push(label(branchLabel));
    }
  }

  ops.push(label(doneLabel));
  return ops;
}

// ---------------------------------------------------------------------------
// Program builder
// ---------------------------------------------------------------------------

export function buildProgram(): Op[] {
  const sceneLabels = SCENES.map((_, i) => ({
    dlg: `scene${String(i)}_dlg`,
    kana: `scene${String(i)}_kana`,
  }));

  return [
    // ==== Init ====
    di(),
    ld_rr_nn('sp', u16(0xfffe)),

    // Clear WRAM state
    xor_r('a'),
    ld_nn_a(MEM.JOYPAD_CUR),
    ld_nn_a(MEM.JOYPAD_PREV),
    ld_nn_a(MEM.JOYPAD_NEW),
    ld_nn_a(MEM.DLG_STATE),
    ld_r_n('a', u8(0xff)),
    ld_nn_a(MEM.DLG_NODE_ID),
    xor_r('a'),
    ld_nn_a(MEM.KANA_STATE),
    ld_nn_a(MEM.SCENE_ID),
    ld_nn_a(MEM.SCENE_FLAGS),
    ld_nn_a(MEM.GAME_MODE),

    // Wait for VBlank
    label('init_vblank'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('init_vblank')),

    // Turn off LCD
    xor_r('a'),
    ldh_n_a(HW.LCDC),

    // Copy all tile data to VRAM
    ld_rr_nn('hl', MEM.VRAM_TILES),
    ld_rr_nn('de', ref('tileData')),
    ld_r_n('b', u8(Math.ceil(tileDataSize / 256))),
    ld_r_n('c', u8(0)),
    label('init_copy'),
    ld_a_de(),
    ldi_hl_a(),
    inc_rr('de'),
    dec_r('c'),
    jr_cc('nz', ref('init_copy')),
    dec_r('b'),
    jr_cc('nz', ref('init_copy')),

    // Set DMG palette (for original GB compatibility)
    ld_r_n('a', u8(0xe4)),
    ldh_n_a(HW.BGP),
    // Set GBC palette (ignored on DMG)
    ...buildSetPalette(TITLE_PALETTE),

    // ==== Title Screen ====
    label('title_screen'),

    // Clear tilemap (LCD already off or we turn it off)
    ...buildClearTilemap(),

    // Draw cat portrait centered above title
    ...buildDrawPortrait(3, 9, CAT_TL, CAT_TR, CAT_BL, CAT_BR),

    // Draw title text
    ...buildWriteRow(7, textToTiles(TITLE)),
    ...buildWriteRow(11, textToTiles(SUBTITLE)),

    // Turn on LCD
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),
    ei(),

    // Wait for all buttons to be released (debounce boot ROM START press)
    label('title_debounce'),
    halt(),
    nop(),
    call(ref('joy_read')),
    ld_a_nn(MEM.JOYPAD_CUR),
    cp_n(u8(0)),
    jr_cc('nz', ref('title_debounce')),

    // Wait for START
    label('title_loop'),
    halt(),
    nop(),
    call(ref('joy_read')),
    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.START)),
    jr_cc('z', ref('title_loop')),

    // START pressed — begin scene 0
    xor_r('a'),
    ld_nn_a(MEM.SCENE_ID),

    // ==== Scene dispatch ====
    label('scene_load'),

    // Turn LCD off for redraw
    label('scene_vblank'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('scene_vblank')),
    xor_r('a'),
    ldh_n_a(HW.LCDC),

    // Clear tilemap
    ...buildClearTilemap(),

    // Draw scene name at row 1 (dispatched by scene_id)
    ...buildSceneDispatch((i) => buildWriteRow(1, at(sceneData.scenes, i).nameRow)),

    // Draw scene icon at row 4, centered (dispatched by scene_id)
    ...buildSceneDispatch((i) => {
      const scene = at(SCENES, i);
      const iconTiles = scene.icon.map((ch) => requireTile(ch));
      return buildWriteRow(4, iconTiles);
    }),

    // Set scene palette (dispatched by scene_id)
    ...buildSceneDispatch((i) => buildSetPalette(at(SCENES, i).palette)),

    // Turn LCD back on
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    // Load dialogue data pointer (dispatched by scene_id)
    ...buildSceneDispatch((i) => [ld_rr_nn('de', ref(at(sceneLabels, i).dlg))]),
    call(ref('dlg_open_tree')), // initialize tree and open node 0

    // Dialogue loop — process nodes until conversation ends
    label('scene_dlg_loop'),
    halt(),
    nop(),
    call(ref('joy_read')),
    call(ref('dlg_update')),
    ld_a_nn(MEM.DLG_STATE),
    cp_n(u8(0)),
    jr_cc('nz', ref('scene_dlg_loop')),

    // Node done — check if conversation continues
    ld_a_nn(MEM.DLG_NODE_ID),
    cp_n(u8(0xff)), // 0xFF = conversation over
    jr_cc('z', ref('scene_dlg_done')),

    // More nodes — open the next one
    call(ref('dlg_open_node')),
    jr(ref('scene_dlg_loop')),

    label('scene_dlg_done'),

    // Load kana data pointer (dispatched by scene_id)
    ...buildSceneDispatch((i) => [ld_rr_nn('de', ref(at(sceneLabels, i).kana))]),
    call(ref('kana_start')),

    // Kana game loop
    label('scene_kana_loop'),
    halt(),
    nop(),
    call(ref('joy_read')),
    call(ref('kana_update')),
    ld_a_nn(MEM.KANA_STATE),
    cp_n(u8(0)),
    jr_cc('nz', ref('scene_kana_loop')),

    // ==== Scene complete — set completion flag and advance ====
    ...buildSceneDispatch((i) => [ld_r_n('b', u8(1 << i))]),
    ld_a_nn(MEM.SCENE_FLAGS),
    or_r('b'),
    ld_nn_a(MEM.SCENE_FLAGS),

    // Advance to next scene
    ld_a_nn(MEM.SCENE_ID),
    inc_r('a'),
    ld_nn_a(MEM.SCENE_ID),

    // Check if we've done all 5 scenes
    cp_n(u8(SCENES.length)),
    jp_cc('c', ref('scene_load')), // more scenes to go

    // ==== Game complete — back to title ====
    // Turn LCD off to redraw
    label('game_complete_vblank'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('game_complete_vblank')),
    xor_r('a'),
    ldh_n_a(HW.LCDC),

    jp(ref('title_screen')),

    // ==== Subroutines ====
    ...buildReadJoypad(),
    ...buildDialogueEngine(),
    ...buildKanaEngine(),

    // ==== Data ====
    label('tileData'),
    db(tileData),

    // Per-scene dialogue and kana data
    ...sceneData.scenes.flatMap((scene, i) => [
      label(at(sceneLabels, i).dlg),
      db(scene.dialogueData),
      label(at(sceneLabels, i).kana),
      db(scene.kanaData),
    ]),
  ];
}
