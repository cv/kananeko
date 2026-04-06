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
  ld_r_r,
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
  inc_r,
  call,
} from '../asm/ops';
import { HW, JOY, LCDC, MEM } from '../asm/hardware';
import { buildTileData, textToTiles, requireTile } from './font';
import { CAT_TILES } from './font-data';
import { buildReadJoypad } from './joypad';
import { buildDialogueEngine } from './dialogue';
import { buildKanaEngine } from './kana';
import { buildSceneData, SCENES } from './scene';

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

// Title screen text
const TITLE = 'カナネコ';
const SUBTITLE = 'はじめ';

// Cat portrait tile indices
const CAT_TL = requireTile(CAT_TILES.FACE_TL);
const CAT_TR = requireTile(CAT_TILES.FACE_TR);
const CAT_BL = requireTile(CAT_TILES.FACE_BL);
const CAT_BR = requireTile(CAT_TILES.FACE_BR);

// ---------------------------------------------------------------------------
// Helper: write a row of tiles at a tilemap address
// ---------------------------------------------------------------------------

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
// Program builder
// ---------------------------------------------------------------------------

export function buildProgram(): Op[] {
  // Pre-pack all scene data labels
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

    // Set palette
    ld_r_n('a', u8(0xe4)),
    ldh_n_a(HW.BGP),

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

    // Draw scene name at row 1
    // We dispatch based on scene_id to draw the right name
    ld_a_nn(MEM.SCENE_ID),

    // Scene 0
    cp_n(u8(0)),
    jp_cc('nz', ref('scene_name_1')),
    ...buildWriteRow(1, at(sceneData.scenes, 0).nameRow),
    jp(ref('scene_name_done')),

    label('scene_name_1'),
    cp_n(u8(1)),
    jp_cc('nz', ref('scene_name_2')),
    ...buildWriteRow(1, at(sceneData.scenes, 1).nameRow),
    jp(ref('scene_name_done')),

    label('scene_name_2'),
    cp_n(u8(2)),
    jp_cc('nz', ref('scene_name_3')),
    ...buildWriteRow(1, at(sceneData.scenes, 2).nameRow),
    jp(ref('scene_name_done')),

    label('scene_name_3'),
    cp_n(u8(3)),
    jp_cc('nz', ref('scene_name_4')),
    ...buildWriteRow(1, at(sceneData.scenes, 3).nameRow),
    jp(ref('scene_name_done')),

    label('scene_name_4'),
    ...buildWriteRow(1, at(sceneData.scenes, 4).nameRow),

    label('scene_name_done'),

    // Turn LCD back on
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    // ==== Start scene dialogue ====
    // Load dialogue data pointer based on scene_id
    ld_a_nn(MEM.SCENE_ID),
    cp_n(u8(0)),
    jp_cc('nz', ref('load_dlg_1')),
    ld_rr_nn('de', ref(at(sceneLabels, 0).dlg)),
    jp(ref('load_dlg_done')),
    label('load_dlg_1'),
    cp_n(u8(1)),
    jp_cc('nz', ref('load_dlg_2')),
    ld_rr_nn('de', ref(at(sceneLabels, 1).dlg)),
    jp(ref('load_dlg_done')),
    label('load_dlg_2'),
    cp_n(u8(2)),
    jp_cc('nz', ref('load_dlg_3')),
    ld_rr_nn('de', ref(at(sceneLabels, 2).dlg)),
    jp(ref('load_dlg_done')),
    label('load_dlg_3'),
    cp_n(u8(3)),
    jp_cc('nz', ref('load_dlg_4')),
    ld_rr_nn('de', ref(at(sceneLabels, 3).dlg)),
    jp(ref('load_dlg_done')),
    label('load_dlg_4'),
    ld_rr_nn('de', ref(at(sceneLabels, 4).dlg)),

    label('load_dlg_done'),
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

    // ==== Start kana mini-game for this scene ====
    ld_a_nn(MEM.SCENE_ID),
    cp_n(u8(0)),
    jp_cc('nz', ref('load_kana_1')),
    ld_rr_nn('de', ref(at(sceneLabels, 0).kana)),
    jp(ref('load_kana_done')),
    label('load_kana_1'),
    cp_n(u8(1)),
    jp_cc('nz', ref('load_kana_2')),
    ld_rr_nn('de', ref(at(sceneLabels, 1).kana)),
    jp(ref('load_kana_done')),
    label('load_kana_2'),
    cp_n(u8(2)),
    jp_cc('nz', ref('load_kana_3')),
    ld_rr_nn('de', ref(at(sceneLabels, 2).kana)),
    jp(ref('load_kana_done')),
    label('load_kana_3'),
    cp_n(u8(3)),
    jp_cc('nz', ref('load_kana_4')),
    ld_rr_nn('de', ref(at(sceneLabels, 3).kana)),
    jp(ref('load_kana_done')),
    label('load_kana_4'),
    ld_rr_nn('de', ref(at(sceneLabels, 4).kana)),

    label('load_kana_done'),
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

    // ==== Scene complete — mark flag and advance ====
    // Set completion bit for current scene
    ld_a_nn(MEM.SCENE_ID),
    ld_r_r('b', 'a'), // B = scene index

    // Set bit B in SCENE_FLAGS
    ld_a_nn(MEM.SCENE_FLAGS),
    // Simple approach: OR with (1 << scene_id)
    // Since scene_id is 0-4, use a lookup
    ld_r_r('c', 'a'), // C = current flags
    ld_r_r('a', 'b'), // A = scene_id

    cp_n(u8(0)),
    jp_cc('nz', ref('flag_1')),
    ld_r_n('a', u8(0x01)),
    jp(ref('flag_set')),
    label('flag_1'),
    cp_n(u8(1)),
    jp_cc('nz', ref('flag_2')),
    ld_r_n('a', u8(0x02)),
    jp(ref('flag_set')),
    label('flag_2'),
    cp_n(u8(2)),
    jp_cc('nz', ref('flag_3')),
    ld_r_n('a', u8(0x04)),
    jp(ref('flag_set')),
    label('flag_3'),
    cp_n(u8(3)),
    jp_cc('nz', ref('flag_4')),
    ld_r_n('a', u8(0x08)),
    jp(ref('flag_set')),
    label('flag_4'),
    ld_r_n('a', u8(0x10)),

    label('flag_set'),
    // OR with existing flags
    // A = bit mask, C = old flags
    // Need OR A, C — but there's no OR A, C directly. Use: LD B, A / LD A, C / OR B
    ld_r_r('b', 'a'),
    ld_r_r('a', 'c'),
    // or_r('b') — need to import. Actually let me use a different approach.
    // A = C (old flags), B = new bit. Use OR B via the opcode.
    // Actually or_r exists but wasn't imported. Let me just use ld + or pattern.
    // Hmm, let me restructure to avoid needing or_r since I didn't import it.
    // Simplest: just set the flags byte directly with the combined value.
    // Actually, let me just import or_r...

    // For now, use a workaround: XOR trick won't work. Let me just use the fact
    // that set(bit, r) can set a specific bit.
    // Actually, I have bit() imported. And set() can be imported.
    // But set() takes a BitIndex literal, not a register. So we still need the
    // dispatch approach. Let me just set it in each branch above instead.

    // Simpler approach: each branch above directly writes the OR'd flag.
    // But that's even more code. The cleanest approach is to just OR the registers.

    // I'll add an inline OR by encoding it directly as a raw byte via db().
    // OR B = opcode 0xB0
    db(new Uint8Array([0xb0])), // OR B (A = old_flags | new_bit)

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
