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
import { buildTileData, textToTiles, requireTiles } from './font';
import { CAT_TILES } from './font-data';
import { buildReadJoypad } from './joypad';
import { buildDialogueEngine } from './dialogue';
import { buildKanaEngine } from './kana';
import { buildSceneData, rgb, SCENES, type Palette } from './scene';
import { centerStartCol, tilemapAddr, tileRow } from './tilemap';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const tileData = buildTileData();
const tileDataSize = tileData.length;
const sceneData = buildSceneData();

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
const SUBTITLE = 'はじめよう!';
const TITLE_PALETTE: Palette = [
  rgb(0xff, 0xf3, 0xdb),
  rgb(0xff, 0xc8, 0x8a),
  rgb(0xc6, 0x7a, 0x3d),
  rgb(0x4a, 0x28, 0x18),
];

// Cat portrait tile rows (4x3 grid)
const CAT_ROW0 = requireTiles(CAT_TILES.ROW0);
const CAT_ROW1 = requireTiles(CAT_TILES.ROW1);
const CAT_ROW2 = requireTiles(CAT_TILES.ROW2);
const START_BOX_TOP = textToTiles('┌─────────────┐');
const START_BOX_ON = textToTiles('│ PRESS START │');
const START_BOX_OFF = textToTiles('│             │');
const START_BOX_BOTTOM = textToTiles('└─────────────┘');

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

function buildWriteRow(row: number, tiles: readonly number[]): Op[] {
  const ops: Op[] = [];
  const col = centerStartCol(tiles.length);
  ops.push(ld_rr_nn('hl', u16(tilemapAddr(tileRow(row), col))));
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
    ld_nn_a(MEM.TITLE_TIMER),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_nn_a(MEM.KANA_SCORE_HI),
    ld_nn_a(MEM.DELTA_TYPE),
    ld_nn_a(MEM.DELTA_TIMER),
    ld_r_n('a', u8(3)),
    ld_nn_a(MEM.KANA_LIVES),

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

    // Reset title animation state so the prompt always starts visible.
    xor_r('a'),
    ld_nn_a(MEM.TITLE_TIMER),

    // Draw score HUD on row 0
    call(ref('kana_draw_hud')),

    // Draw cat portrait (4x3 tiles, centered)
    ...buildWriteRow(2, CAT_ROW0),
    ...buildWriteRow(3, CAT_ROW1),
    ...buildWriteRow(4, CAT_ROW2),

    // Draw title card + prompt frame
    ...buildWriteRow(7, textToTiles(TITLE)),
    ...buildWriteRow(10, textToTiles(SUBTITLE)),
    ...buildWriteRow(12, START_BOX_TOP),
    ...buildWriteRow(13, START_BOX_ON),
    ...buildWriteRow(14, START_BOX_BOTTOM),

    // Turn on LCD
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    // Enable VBlank interrupt — required for HALT on real hardware.
    // Handler at $0040 (RETI) is placed by the assembler.
    ld_r_n('a', u8(0x01)), // bit 0 = VBlank
    ld_nn_a(MEM.IE),
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

    // Blink the START prompt at a gentler pace.
    ld_a_nn(MEM.TITLE_TIMER),
    inc_r('a'),
    ld_nn_a(MEM.TITLE_TIMER),
    and_n(u8(0x20)),
    jr_cc('z', ref('title_prompt_on')),
    ...buildWriteRow(13, START_BOX_OFF),
    jr(ref('title_prompt_done')),
    label('title_prompt_on'),
    ...buildWriteRow(13, START_BOX_ON),
    label('title_prompt_done'),

    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.START)),
    jr_cc('z', ref('title_loop')),

    // START pressed — begin scene 0
    xor_r('a'),
    ldh_n_a(HW.DIV), // reset entropy timing so gameplay remains deterministic after title idling
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
      return buildWriteRow(4, requireTiles(scene.icon));
    }),

    // Set scene palette (dispatched by scene_id)
    ...buildSceneDispatch((i) => buildSetPalette(at(SCENES, i).palette)),

    // Draw score HUD on row 0 (hearts + 4-digit score)
    call(ref('kana_draw_hud')),

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
    call(ref('hud_update')), // refresh HUD early in VBlank window
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
    call(ref('hud_update')), // refresh HUD early in VBlank window
    call(ref('joy_read')),
    call(ref('kana_update')),
    ld_a_nn(MEM.KANA_STATE),
    cp_n(u8(0)),
    jr_cc('nz', ref('scene_kana_loop')),

    // Check if player died (lives == 0) → game over
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(0)),
    jp_cc('z', ref('game_over')),

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

    // ==== Game Over ====
    label('game_over'),

    // Turn LCD off
    label('gameover_vblank'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('gameover_vblank')),
    xor_r('a'),
    ldh_n_a(HW.LCDC),

    // Clear tilemap and draw game over screen
    ...buildClearTilemap(),
    ...buildWriteRow(6, textToTiles('GAME OVER')),
    call(ref('kana_draw_hud')), // show final score + empty hearts

    // Turn LCD on
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    // Wait for START
    label('gameover_loop'),
    halt(),
    nop(),
    call(ref('joy_read')),
    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.START)),
    jr_cc('z', ref('gameover_loop')),

    // Reset score and lives, back to title
    xor_r('a'),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_nn_a(MEM.KANA_SCORE_HI),
    ld_nn_a(MEM.DELTA_TYPE),
    ld_nn_a(MEM.DELTA_TIMER),
    ld_r_n('a', u8(3)),
    ld_nn_a(MEM.KANA_LIVES),

    // Turn LCD off for title redraw
    label('gameover_to_title'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('gameover_to_title')),
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
