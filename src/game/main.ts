/**
 * Main game program — composes all subsystems into a complete ROM.
 *
 * Flow: Title screen → Scene 0..4 (dialogue → kana) → End/loop
 */

import { type AssembleResult, type ROMHeader, assemble } from '../asm/assembler';
import { HW, JOY, MEM } from '../asm/hardware';
import { copyPages, storeByte, switchCases, waitFrame, zeroBytes } from '../asm/macros';
import {
  and_n,
  call,
  cp_n,
  db,
  di,
  ei,
  inc_r,
  jp,
  jp_cc,
  jr,
  jr_cc,
  label,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldh_n_a,
  or_r,
  ret,
  ret_cc,
  xor_r,
} from '../asm/ops';
import { type Op, type U16, ref, u8, u16 } from '../asm/types';
import { buildDialogueEngine } from './dialogue';
import { buildTileData, requireTiles, textToTiles } from './font';
import { CAT_TILES } from './font-data';
import { buildReadJoypad } from './joypad';
import { buildKanaEngine } from './kana';
import { buildDrawHudOps } from './kana-hud';
import { type PackedScene, type Scene, SCENES, buildSceneData } from './scene';
import { END_OF_CONVERSATION, MAX_LIVES } from './state';
import {
  type Palette,
  buildVramPut,
  clearTilemap,
  rgb,
  screenOff,
  screenOn,
  setBgPalette,
  writeCenteredRow,
} from './video';

export const ROM_HEADER: ROMHeader = {
  title: 'KANANEKO',
  cgbFlag: 0x80, // CGB+DMG compatible
  destinationCode: 0x00, // Japan
};

// ---------------------------------------------------------------------------
// Title screen content
// ---------------------------------------------------------------------------

const TITLE = 'カナネコ';
const SUBTITLE = 'はじめよう!';
const TITLE_PALETTE: Palette = [
  rgb(0xff, 0xf3, 0xdb),
  rgb(0xff, 0xc8, 0x8a),
  rgb(0xc6, 0x7a, 0x3d),
  rgb(0x4a, 0x28, 0x18),
];

// Cat portrait tile rows (4x3 grid)
const CAT_ROWS = [
  requireTiles(CAT_TILES.ROW0),
  requireTiles(CAT_TILES.ROW1),
  requireTiles(CAT_TILES.ROW2),
] as const;
const START_BOX_TOP = textToTiles('┌─────────────┐');
const START_BOX_ON = textToTiles('│ PRESS START │');
const START_BOX_OFF = textToTiles('│             │');
const START_BOX_BOTTOM = textToTiles('└─────────────┘');
const START_PROMPT_ROW = 13;
/** TITLE_TIMER bit that toggles the START prompt (every 32 frames) */
const BLINK_BIT = 0x20;

const DMG_PALETTE = 0xe4; // shades 3,2,1,0

// ---------------------------------------------------------------------------
// Program helpers
// ---------------------------------------------------------------------------

export function sceneDialogueLabel(sceneIndex: number): string {
  return `scene${String(sceneIndex)}_dlg`;
}

export function sceneKanaLabel(sceneIndex: number): string {
  return `scene${String(sceneIndex)}_kana`;
}

/**
 * Run per-scene ops based on SCENE_ID. `name` must be unique per call site.
 */
function sceneSwitch(
  name: string,
  getOps: (scene: Scene, packed: PackedScene, index: number) => Op[],
  packedScenes: readonly PackedScene[],
): Op[] {
  const cases = packedScenes.map((packed, i) => {
    const scene = SCENES[i];
    if (scene === undefined) throw new RangeError(`No scene at index ${String(i)}`);
    return getOps(scene, packed, i);
  });
  return [ld_a_nn(MEM.SCENE_ID), ...switchCases(cases, { name, branch: 'jp', exit: 'jp' })];
}

/** Reset score, delta flash, and lives (plus any extra bytes to zero) for a new run. */
function resetRunState(...alsoZero: U16[]): Op[] {
  return [
    ...zeroBytes(
      ...alsoZero,
      MEM.KANA_SCORE_LO,
      MEM.KANA_SCORE_HI,
      MEM.DELTA_TYPE,
      MEM.DELTA_TIMER,
    ),
    ...storeByte(MEM.KANA_LIVES, MAX_LIVES),
  ];
}

/**
 * Per-frame engine loop: wait a frame, refresh HUD and input, run `update`,
 * and repeat while the engine's state byte is non-zero.
 */
function engineLoop(name: string, update: string, stateAddr: U16): Op[] {
  return [
    label(name),
    ...waitFrame(),
    call(ref('hud_update')), // refresh HUD early in VBlank window
    call(ref('joy_read')),
    call(ref(update)),
    ld_a_nn(stateAddr),
    cp_n(u8(0)),
    jr_cc('nz', ref(name)),
  ];
}

/** Block until START is newly pressed. */
function waitForStart(name: string): Op[] {
  return [
    label(name),
    ...waitFrame(),
    call(ref('joy_read')),
    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.START)),
    jr_cc('z', ref(name)),
  ];
}

/** Subroutine: tick TITLE_TIMER and redraw the START prompt when its blink phase flips. */
function buildTitleBlink(): Op[] {
  return [
    label('title_blink'),
    ld_a_nn(MEM.TITLE_TIMER),
    inc_r('a'),
    ld_nn_a(MEM.TITLE_TIMER),
    ld_r_r('b', 'a'),
    and_n(u8(BLINK_BIT - 1)),
    ret_cc('nz'),
    ld_r_r('a', 'b'),
    and_n(u8(BLINK_BIT)),
    jr_cc('z', ref('title_prompt_on')),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_OFF, { lcdOn: true }),
    ret(),
    label('title_prompt_on'),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_ON, { lcdOn: true }),
    ret(),
  ];
}

// ---------------------------------------------------------------------------
// Program builder
// ---------------------------------------------------------------------------

export function buildProgram(): Op[] {
  const tileData = buildTileData();
  const packedScenes = buildSceneData();

  return [
    // ==== Init ====
    di(),
    ld_rr_nn('sp', u16(0xfffe)),

    // Clear WRAM state
    ...zeroBytes(MEM.JOYPAD_CUR, MEM.JOYPAD_PREV, MEM.JOYPAD_NEW, MEM.DLG_STATE),
    ...storeByte(MEM.DLG_NODE_ID, END_OF_CONVERSATION),
    ...resetRunState(MEM.KANA_STATE, MEM.SCENE_ID, MEM.SCENE_FLAGS, MEM.GAME_MODE, MEM.TITLE_TIMER),

    // Copy all tile data to VRAM with the LCD off
    ...screenOff('init_vblank'),
    ...copyPages('init_copy', MEM.VRAM_TILES, ref('tileData'), Math.ceil(tileData.length / 256)),

    // Set DMG palette (for original GB compatibility) and GBC palette (ignored on DMG)
    ld_r_n('a', u8(DMG_PALETTE)),
    ldh_n_a(HW.BGP),
    ...setBgPalette(TITLE_PALETTE),

    // ==== Title Screen (entered with the LCD off) ====
    label('title_screen'),
    ...clearTilemap('title_clear'),

    // Reset title animation state so the prompt always starts visible.
    ...zeroBytes(MEM.TITLE_TIMER),

    // Score HUD on row 0, cat portrait, title card, and prompt frame
    call(ref('kana_draw_hud')),
    ...CAT_ROWS.flatMap((tiles, i) => writeCenteredRow(2 + i, tiles)),
    ...writeCenteredRow(7, textToTiles(TITLE)),
    ...writeCenteredRow(10, textToTiles(SUBTITLE)),
    ...writeCenteredRow(START_PROMPT_ROW - 1, START_BOX_TOP),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_ON),
    ...writeCenteredRow(START_PROMPT_ROW + 1, START_BOX_BOTTOM),

    ...screenOn(),

    // Enable VBlank interrupt — required for HALT on real hardware.
    // Handler at $0040 (RETI) is placed by the assembler.
    ...storeByte(MEM.IE, 0x01), // bit 0 = VBlank
    ei(),

    // Wait for all buttons to be released (debounce boot ROM START press)
    label('title_debounce'),
    ...waitFrame(),
    call(ref('joy_read')),
    ld_a_nn(MEM.JOYPAD_CUR),
    cp_n(u8(0)),
    jr_cc('nz', ref('title_debounce')),

    // Wait for START, blinking the prompt
    label('title_loop'),
    ...waitFrame(),
    call(ref('joy_read')),

    call(ref('title_blink')),

    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.START)),
    jr_cc('z', ref('title_loop')),

    // START pressed — begin scene 0
    xor_r('a'),
    ldh_n_a(HW.DIV), // reset entropy timing so gameplay remains deterministic after title idling
    ld_nn_a(MEM.SCENE_ID),

    // ==== Scene load ====
    label('scene_load'),
    ...screenOff('scene_vblank'),
    ...clearTilemap('scene_clear'),

    // Scene name (row 1), icon (row 4), and palette
    ...sceneSwitch('scene_name', (_, packed) => writeCenteredRow(1, packed.nameRow), packedScenes),
    ...sceneSwitch(
      'scene_icon',
      (scene) => writeCenteredRow(4, requireTiles(scene.icon)),
      packedScenes,
    ),
    ...sceneSwitch('scene_palette', (scene) => setBgPalette(scene.palette), packedScenes),

    call(ref('kana_draw_hud')), // hearts + score on row 0
    ...screenOn(),

    // ==== Dialogue ====
    ...sceneSwitch(
      'scene_dlg_ptr',
      (_s, _p, i) => [ld_rr_nn('de', ref(sceneDialogueLabel(i)))],
      packedScenes,
    ),
    call(ref('dlg_open_tree')), // initialize tree and open node 0

    // Process nodes until the conversation ends
    ...engineLoop('scene_dlg_loop', 'dlg_update', MEM.DLG_STATE),
    ld_a_nn(MEM.DLG_NODE_ID),
    cp_n(u8(END_OF_CONVERSATION)),
    jr_cc('z', ref('scene_dlg_done')),
    call(ref('dlg_open_node')),
    jr(ref('scene_dlg_loop')),
    label('scene_dlg_done'),

    // ==== Kana round ====
    ...sceneSwitch(
      'scene_kana_ptr',
      (_s, _p, i) => [ld_rr_nn('de', ref(sceneKanaLabel(i)))],
      packedScenes,
    ),
    call(ref('kana_start')),
    ...engineLoop('scene_kana_loop', 'kana_update', MEM.KANA_STATE),

    // Out of lives → game over
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(0)),
    jp_cc('z', ref('game_over')),

    // ==== Scene complete — set completion flag and advance ====
    ...sceneSwitch('scene_flag', (_s, _p, i) => [ld_r_n('b', u8(1 << i))], packedScenes),
    ld_a_nn(MEM.SCENE_FLAGS),
    or_r('b'),
    ld_nn_a(MEM.SCENE_FLAGS),

    ld_a_nn(MEM.SCENE_ID),
    inc_r('a'),
    ld_nn_a(MEM.SCENE_ID),
    cp_n(u8(SCENES.length)),
    jp_cc('c', ref('scene_load')), // more scenes to go

    // ==== Game complete — back to title ====
    ...screenOff('game_complete_vblank'),
    jp(ref('title_screen')),

    // ==== Game Over ====
    label('game_over'),
    ...screenOff('gameover_vblank'),
    ...clearTilemap('gameover_clear'),
    ...writeCenteredRow(6, textToTiles('GAME OVER')),
    call(ref('kana_draw_hud')), // show final score + empty hearts
    ...screenOn(),

    ...waitForStart('gameover_loop'),
    ...resetRunState(),
    ...screenOff('gameover_to_title'),
    jp(ref('title_screen')),

    // ==== Subroutines ====
    ...buildReadJoypad(),
    ...buildTitleBlink(),
    ...buildDialogueEngine(),
    ...buildKanaEngine(),
    ...buildDrawHudOps(),
    ...buildVramPut(),

    // ==== Data ====
    label('tileData'),
    db(tileData),

    // Per-scene dialogue and kana data
    ...packedScenes.flatMap((scene, i) => [
      label(sceneDialogueLabel(i)),
      db(scene.dialogueData),
      label(sceneKanaLabel(i)),
      db(scene.kanaData),
    ]),
  ];
}

/** Assemble the complete game ROM. */
export function buildRom(): AssembleResult {
  return assemble(buildProgram(), ROM_HEADER);
}
