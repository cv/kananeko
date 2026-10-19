/**
 * Main game program — composes all subsystems into a complete ROM.
 *
 * Flow: Title screen → Scene 0..4 (dialogue → kana) → End/loop
 */

import { type AssembleResult, type ROMHeader, assemble } from '../asm/assembler';
import { HW, JOY, MEM } from '../asm/hardware';
import {
  copyBlock,
  expandOneBit,
  loadPointer,
  storeByte,
  storePointer,
  waitFrame,
  zeroBytes,
} from '../asm/macros';
import {
  add_hl_rr,
  and_n,
  and_r,
  call,
  cp_n,
  cp_r,
  dec_r,
  db,
  di,
  ei,
  inc_r,
  inc_rr,
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
  ldi_a_hl,
  ldi_hl_a,
  or_n,
  or_r,
  pop,
  push,
  ret,
  ret_cc,
  sla,
  xor_r,
} from '../asm/ops';
import { type Op, type U16, ref, u8, u16 } from '../asm/types';
import { SCENE_TILE_BASE } from './backdrop';
import { buildSpriteData, buildSpriteInit, buildSpriteRoutines, runDma } from './sprites';
import {
  CAT_SPOTS,
  type CatFace,
  buildCatData,
  buildCatInit,
  buildCatRoutines,
  catFace,
  placeCat,
} from './cat';
import { NPC_NONE, NPC_TILE_BASE, buildNpcRoutines } from './npc';
import { buildAnimRoutines } from './anim';
import { DIALOGUE_LAYOUT, buildDialogueEngine } from './dialogue';
import {
  ONE_BIT_TILES,
  TILE_COUNT,
  buildPackedTileData,
  requireTile,
  requireTiles,
  textToTiles,
} from './font';
import { UI_TILES } from './font-data';
import { buildReadJoypad } from './joypad';
import { buildKanaData, buildKanaEngine } from './kana';
import {
  buildDrawHudOps,
  buildDrawScoreDigits,
  buildScoreDigits,
  buildScoreRoutines,
  SCORE_DIGIT_COUNT,
} from './kana-hud';
import { centerStartCol, tilemapAddr } from './tilemap';
import { SCENES, SPEED_ROUND, buildSceneData } from './scene';
import { BAD_PICK, END_OF_CONVERSATION, KanaMode, MAX_LIVES } from './state';
import { REDEEM_KEY } from './rounds';
import { type ColorScheme, buildPaletteSet, buildSharedPalettes, paletteOf } from './color';
import { LOGO_ROWS } from './logo';
import {
  buildSceneTable,
  buildSceneTableRoutines,
  copySceneBlock,
  sceneByte,
  sceneWord,
} from './scene-table';
import { ENDING_COLORS, GAME_OVER_COLORS, TITLE_COLORS } from './scenes/colors';
import { BACKDROP } from './backdrop';
import {
  bgTileAddr,
  buildDrawTiles,
  buildTileLists,
  resetTileLists,
  tileListLabel,
  buildDrawRuns,
  buildClearScreen,
  buildFadeData,
  buildFadeRoutines,
  buildVramPut,
  cgbAttributes,
  clearScreen,
  fadeIn,
  fadeOut,
  fillAttributes,
  screenOff,
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

/** Rows of the two-row カナネコ logo */
const LOGO_TOP_ROW = 6;
const LOGO_WIDTH = Array.from(LOGO_ROWS[0]).length;
const SUBTITLE = 'ねこと にほんごの たび';

const START_BOX_TOP = textToTiles('┌────────────┐');
const START_BOX_ON = textToTiles('│ スタートを おしてね ▕');
const START_BOX_OFF = textToTiles('│            ▕');
const START_BOX_BOTTOM = textToTiles('└▁▁▁▁▁▁▁▁▁▁▁▁┘');
const START_PROMPT_ROW = 13;
/** TITLE_TIMER bit that toggles the START prompt (every 32 frames) */
const BLINK_BIT = 0x20;

/** Caps of the location name tag on the dialogue box's top edge: ─( えき )─ */
const NAME_TAG_LEFT = requireTile(UI_TILES.TAG_LEFT);
const NAME_TAG_RIGHT = requireTile(UI_TILES.TAG_RIGHT);

// Ending screen content
const ENDING_TITLE = 'おめでとう!';
const ENDING_SCORE_LABEL = 'とくてん ';
const ENDING_ROWS = { cat: 2, title: 6, stamps: 8, score: 10 } as const;

// ---------------------------------------------------------------------------
// Font in ROM: 1-bit tiles first (expanded at boot), then 2-bit tiles, each split
// at tile 128, where $8800 addressing moves from $9000 to $8800
// ---------------------------------------------------------------------------

interface FontSegment {
  readonly label: string;
  readonly first: number;
  readonly oneBit: boolean;
  readonly data: Uint8Array;
}

const FONT_SEGMENTS: readonly FontSegment[] = ((): FontSegment[] => {
  const { oneBit, twoBit } = buildPackedTileData();
  const total = TILE_COUNT + 1;
  const split = 128;
  const ranges = [
    { label: 'font_1bpp_low', first: 0, end: Math.min(ONE_BIT_TILES, split), oneBit: true },
    { label: 'font_1bpp_high', first: split, end: ONE_BIT_TILES, oneBit: true },
    { label: 'font_2bpp_low', first: ONE_BIT_TILES, end: Math.min(total, split), oneBit: false },
    { label: 'font_2bpp_high', first: Math.max(ONE_BIT_TILES, split), end: total, oneBit: false },
  ];
  return ranges
    .filter((r) => r.end > r.first)
    .map(({ label, first, end, oneBit: isOne }) => ({
      label,
      first,
      oneBit: isOne,
      data: isOne
        ? oneBit.slice(first * 8, end * 8)
        : twoBit.slice((first - ONE_BIT_TILES) * 16, (end - ONE_BIT_TILES) * 16),
    }));
})();

// ---------------------------------------------------------------------------
// Program helpers
// ---------------------------------------------------------------------------

export function sceneDialogueLabel(sceneIndex: number): string {
  return `scene${String(sceneIndex)}_dlg`;
}

const SPEED_ROUND_LABEL = 'speed_round';

export function sceneChancesLabel(sceneIndex: number): string {
  return `scene${String(sceneIndex)}_chances`;
}

export function sceneRoundsLabel(sceneIndex: number): string {
  return `scene${String(sceneIndex)}_rounds`;
}

export function sceneFadeLabel(sceneIndex: number): string {
  return `scene${String(sceneIndex)}_fade`;
}

const TITLE_FADE = 'title_fade';

function resultFadeLabel(screen: { readonly name: string }): string {
  return `${screen.name}_fade`;
}

export function castLabels(sceneIndex: number): { tiles: string; palettes: string; table: string } {
  const prefix = `scene${String(sceneIndex)}_npc`;
  return { tiles: `${prefix}_tiles`, palettes: `${prefix}_palettes`, table: `${prefix}_table` };
}

export function sceneAnimationLabel(sceneIndex: number): string {
  return `scene${String(sceneIndex)}_anim`;
}

export function sceneColorsLabel(sceneIndex: number): string {
  return `scene${String(sceneIndex)}_colors`;
}

export function sceneTilesLabel(sceneIndex: number): string {
  return `scene${String(sceneIndex)}_tiles`;
}

export function sceneBackdropLabel(sceneIndex: number): string {
  return `scene${String(sceneIndex)}_backdrop`;
}

/** Reset score, delta flash, streak, and lives (plus any extra bytes to zero) for a new run. */
function resetRunState(...alsoZero: U16[]): Op[] {
  return [
    ...zeroBytes(
      ...alsoZero,
      MEM.KANA_SCORE_LO,
      MEM.KANA_SCORE_HI,
      MEM.DELTA_TYPE,
      MEM.DELTA_TIMER,
      MEM.KANA_STREAK,
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
    ...runDma(),
    call(ref('hud_update')), // refresh HUD early in VBlank window
    call(ref('cat_tick')),
    call(ref('joy_read')),
    call(ref(update)),
    ld_a_nn(stateAddr),
    cp_n(u8(0)),
    jr_cc('nz', ref(name)),
  ];
}

/**
 * Kana rounds inside a scene:
 * - table_find: HL = question table (see buildQuestionTable), D = key.
 *   Z if absent; NZ with DE = the question list and C = the entry's bit (1 << index).
 * - round_check: play the unplayed round at DLG_NODE_ID, if any.
 * - chance_check: after a bad answer, a chance to win the life back; after picking a
 *   reply to fill in, the fill-in.
 * - play_round: DE = question list, KANA_MODE set; hides the speaker, plays, sets ROUND_RAN.
 */
function buildRoundRoutines(): Op[] {
  return [
    label('table_find'),
    push('hl'), // table start, for the offset
    ldi_a_hl(),
    ld_r_r('b', 'a'), // entries left
    ld_r_n('c', u8(1)),
    label('table_scan'),
    ld_r_r('a', 'b'),
    or_r('a'),
    jr_cc('z', ref('table_absent')),
    ldi_a_hl(),
    cp_r('d'),
    jr_cc('z', ref('table_found')),
    inc_rr('hl'), // skip the offset
    inc_rr('hl'),
    sla('c'),
    dec_r('b'),
    jr(ref('table_scan')),
    label('table_absent'),
    pop('hl'),
    xor_r('a'), // Z
    ret(),
    label('table_found'),
    ldi_a_hl(),
    ld_r_r('e', 'a'),
    ld_r_r('d', 'hl_ptr'), // DE = offset
    pop('hl'),
    add_hl_rr('de'),
    ld_r_r('d', 'h'),
    ld_r_r('e', 'l'),
    ld_r_n('a', u8(1)),
    or_r('a'), // NZ
    ret(),

    label('round_check'),
    ...loadPointer('hl', MEM.ROUNDS_LO, MEM.ROUNDS_HI),
    ld_a_nn(MEM.DLG_NODE_ID),
    ld_r_r('d', 'a'),
    call(ref('table_find')),
    ret_cc('z'),
    ld_a_nn(MEM.ROUNDS_DONE),
    and_r('c'),
    ret_cc('nz'), // already played (the dialogue looped back)
    ld_a_nn(MEM.ROUNDS_DONE),
    or_r('c'),
    ld_nn_a(MEM.ROUNDS_DONE),
    ...storeByte(MEM.KANA_MODE, KanaMode.NORMAL),
    jr(ref('play_round')),

    label('chance_check'),
    ld_a_nn(MEM.DLG_PICK),
    ld_r_r('b', 'a'),
    and_n(u8(BAD_PICK)),
    jr_cc('z', ref('chance_not_bad')),
    ld_a_nn(MEM.KANA_LIVES),
    or_r('a'),
    ret_cc('z'), // the conversation is over anyway
    ld_a_nn(MEM.DLG_FROM_NODE),
    or_n(u8(REDEEM_KEY)),
    ld_r_r('d', 'a'),
    ld_r_n('a', u8(KanaMode.REDEEM)),
    jr(ref('chance_find')),
    label('chance_not_bad'),
    ld_r_r('a', 'b'),
    or_r('a'),
    ret_cc('nz'), // only the first reply can be a fill-in
    ld_a_nn(MEM.DLG_FROM_NODE),
    ld_r_r('d', 'a'),
    ld_r_n('a', u8(KanaMode.SAY_IT)),
    label('chance_find'),
    ld_nn_a(MEM.KANA_MODE),
    ...loadPointer('hl', MEM.CHANCES_LO, MEM.CHANCES_HI),
    call(ref('table_find')),
    ret_cc('z'),

    label('play_round'),
    push('de'),
    call(ref('npc_hide')),
    pop('de'),
    call(ref('kana_start')),
    ...engineLoop('round_loop', 'kana_update', MEM.KANA_STATE),
    ...storeByte(MEM.ROUND_RAN, 1),
    ret(),
  ];
}

interface ResultScreen {
  /** Label the game jumps to; also the prefix for internal labels */
  readonly name: string;
  /** The cat's face here (a neutral cat blinks) */
  readonly face: CatFace;
  readonly title: string;
  readonly colors: ColorScheme;
}

const ENDING: ResultScreen = {
  name: 'game_complete',
  face: 'happy',
  title: ENDING_TITLE,
  colors: ENDING_COLORS,
};

const GAME_OVER: ResultScreen = {
  name: 'game_over',
  face: 'sad',
  title: 'ゲームオーバー',
  colors: GAME_OVER_COLORS,
};

/** Width of the stamp row: each scene icon is 2 tiles, one blank tile apart */
const STAMP_ROW_WIDTH = SCENES.length * 3 - 1;

/** Draw the icon of every scene whose SCENE_FLAGS bit is set (LCD off) */
function drawClearedStamps(name: string, row: number): Op[] {
  const startCol = centerStartCol(STAMP_ROW_WIDTH);
  return SCENES.flatMap((scene, i) => {
    const skip = `${name}_stamp${String(i)}_skip`;
    return [
      ld_a_nn(MEM.SCENE_FLAGS),
      and_n(u8(1 << i)),
      jr_cc('z', ref(skip)),
      ld_rr_nn('hl', u16(tilemapAddr(row, startCol + i * 3))),
      ...requireTiles(scene.icon).flatMap((tile) => [ld_r_n('a', u8(tile)), ldi_hl_a()]),
      label(skip),
    ];
  });
}

/** Subroutine draw_stamps: the result screens' row of cleared-scene stamps (LCD off) */
function buildDrawStamps(): Op[] {
  return [label('draw_stamps'), ...drawClearedStamps('draw_stamps', ENDING_ROWS.stamps), ret()];
}

/** End-of-run screen: cat, title, cleared-scene stamps, final score; START returns to the title. */
function buildResultScreen(screen: ResultScreen): Op[] {
  const { name } = screen;
  const labelTiles = textToTiles(ENDING_SCORE_LABEL);
  const scoreCol = centerStartCol(labelTiles.length + SCORE_DIGIT_COUNT);
  return [
    label(name),
    ...fadeOut(),
    ...screenOff(`${name}_vblank`),
    ...clearScreen(),
    ...zeroBytes(MEM.TITLE_TIMER), // prompt starts visible

    call(ref('kana_draw_hud')),
    ...writeCenteredRow(ENDING_ROWS.title, textToTiles(screen.title)),
    call(ref('draw_stamps')),
    ld_rr_nn('hl', u16(tilemapAddr(ENDING_ROWS.score, scoreCol))),
    ...labelTiles.flatMap((tile) => [ld_r_n('a', u8(tile)), ldi_hl_a()]),
    call(ref('score_digits')),
    ...buildDrawScoreDigits(ENDING_ROWS.score, scoreCol + labelTiles.length),
    call(ref('draw_start_box')),
    ...fadeIn(resultFadeLabel(screen)),
    ...catFace('cat_rest', screen.face),
    ...placeCat(CAT_SPOTS.portrait),

    label(`${name}_loop`),
    ...waitFrame(),
    ...runDma(),
    call(ref('joy_read')),
    call(ref('title_blink')),
    call(ref('cat_tick')),
    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.START)),
    jr_cc('z', ref(`${name}_loop`)),

    ...resetRunState(MEM.SCENE_FLAGS),
    ...fadeOut(),
    ...screenOff(`${name}_to_title`),
    jp(ref('title_screen')),
  ];
}

/** Subroutine: draw the framed PRESS START prompt (LCD off). */
function buildDrawStartBox(): Op[] {
  return [
    label('draw_start_box'),
    ...writeCenteredRow(START_PROMPT_ROW - 1, START_BOX_TOP),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_ON),
    ...writeCenteredRow(START_PROMPT_ROW + 1, START_BOX_BOTTOM),
    ret(),
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
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_OFF),
    ret(),
    label('title_prompt_on'),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_ON),
    ret(),
  ];
}

// ---------------------------------------------------------------------------
// Program builder
// ---------------------------------------------------------------------------

export function buildProgram(): Op[] {
  const packedScenes = buildSceneData();
  resetTileLists(); // filled in as the code below is generated, emitted last

  return [
    // ==== Init ====
    di(),
    // A = $11 at boot on a Game Boy Color (LD doesn't touch the flags CP set)
    cp_n(u8(0x11)),
    ld_r_n('a', u8(0)),
    jr_cc('nz', ref('init_not_cgb')),
    inc_r('a'),
    label('init_not_cgb'),
    ld_nn_a(MEM.IS_CGB),
    ld_rr_nn('sp', u16(0xfffe)),

    // Clear WRAM state
    ...zeroBytes(MEM.JOYPAD_CUR, MEM.JOYPAD_PREV, MEM.JOYPAD_NEW, MEM.DLG_STATE),
    ...storeByte(MEM.DLG_NODE_ID, END_OF_CONVERSATION),
    ...resetRunState(MEM.KANA_STATE, MEM.SCENE_ID, MEM.SCENE_FLAGS, MEM.GAME_MODE, MEM.TITLE_TIMER),

    // Copy all tile data to VRAM with the LCD off
    ...screenOff('init_vblank'),
    // BG tiles 0-127 go to $9000 and 128+ to $8800 ($8800 addressing); 1-bit tiles expand
    ...FONT_SEGMENTS.flatMap((segment) =>
      (segment.oneBit ? expandOneBit : copyBlock)(
        `${segment.label}_copy`,
        u16(bgTileAddr(segment.first)),
        ref(segment.label),
        segment.data.length,
      ),
    ),

    ...buildSpriteInit(),
    ...buildCatInit(),

    // Enable the VBlank interrupt so HALT wakes once per frame (fades and game loops).
    // The handler at $0040 is a RETI placed by the assembler.
    ...storeByte(MEM.IE, 0x01), // bit 0 = VBlank
    ei(),

    // ==== Title Screen (entered with the LCD off) ====
    label('title_screen'),
    ...clearScreen(),

    // Reset title animation state so the prompt always starts visible.
    ...zeroBytes(MEM.TITLE_TIMER),

    // Score HUD on row 0, title card, and prompt frame (the cat comes after the fade)
    call(ref('kana_draw_hud')),
    ...LOGO_ROWS.flatMap((row, i) => writeCenteredRow(LOGO_TOP_ROW + i, textToTiles(row))),
    ...cgbAttributes(
      'title_logo_colors',
      fillAttributes(
        LOGO_TOP_ROW,
        centerStartCol(LOGO_WIDTH),
        LOGO_ROWS.length,
        LOGO_WIDTH,
        paletteOf(TITLE_COLORS, 'cat'),
      ),
    ),
    ...writeCenteredRow(10, textToTiles(SUBTITLE)),
    call(ref('draw_start_box')),
    ...fadeIn(TITLE_FADE),
    ...catFace('cat_rest', 'neutral'),
    ...placeCat(CAT_SPOTS.portrait),

    // Wait for all buttons to be released (debounce boot ROM START press)
    label('title_debounce'),
    ...waitFrame(),
    ...runDma(),
    call(ref('joy_read')),
    ld_a_nn(MEM.JOYPAD_CUR),
    cp_n(u8(0)),
    jr_cc('nz', ref('title_debounce')),

    // Wait for START, blinking the prompt
    label('title_loop'),
    ...waitFrame(),
    ...runDma(),
    call(ref('joy_read')),

    call(ref('title_blink')),
    call(ref('cat_tick')),

    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.START)),
    jr_cc('z', ref('title_loop')),

    // START pressed — begin a fresh run at scene 0
    ...resetRunState(MEM.SCENE_FLAGS),
    xor_r('a'),
    ldh_n_a(HW.DIV), // reset entropy timing so gameplay remains deterministic after title idling
    ld_nn_a(MEM.SCENE_ID),

    // ==== Scene load ====
    label('scene_load'),
    call(ref('scene_desc')), // everything below reads this scene's entry in scene_table
    ...storeByte(MEM.ROUNDS_DONE, 0),
    ...sceneWord('rounds'),
    ...storePointer('hl', MEM.ROUNDS_LO, MEM.ROUNDS_HI),
    ...sceneWord('chances'),
    ...storePointer('hl', MEM.CHANCES_LO, MEM.CHANCES_HI),
    call(ref('scene_draw')),

    // ==== Dialogue, with a kana round after each conversation ====
    ...sceneWord('dialogue'),
    ld_r_r('d', 'h'),
    ld_r_r('e', 'l'),
    call(ref('dlg_open_tree')), // initialize tree and open node 0

    // Process nodes until the conversation ends
    ...engineLoop('scene_dlg_loop', 'dlg_update', MEM.DLG_STATE),
    ...zeroBytes(MEM.ROUND_RAN),
    call(ref('chance_check')), // a one-question chance after this choice?
    call(ref('round_check')), // a kana round before the next node?
    ld_a_nn(MEM.ROUND_RAN),
    or_r('a'),
    jr_cc('z', ref('scene_no_round')),
    // Out of lives → game over
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(0)),
    jp_cc('z', ref('game_over')),
    ld_a_nn(MEM.DLG_NODE_ID),
    cp_n(u8(END_OF_CONVERSATION)),
    jr_cc('z', ref('scene_complete')),
    call(ref('scene_draw')), // back from the round: the conversation resumes
    jr(ref('scene_open_node')),
    label('scene_no_round'),
    ld_a_nn(MEM.DLG_NODE_ID),
    cp_n(u8(END_OF_CONVERSATION)),
    jr_cc('z', ref('scene_complete')),
    label('scene_open_node'),
    call(ref('dlg_open_node')),
    jp(ref('scene_dlg_loop')),

    label('scene_complete'),
    // ==== Scene complete — set completion flag and advance ====
    ...sceneByte('flag'),
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.SCENE_FLAGS),
    or_r('b'),
    ld_nn_a(MEM.SCENE_FLAGS),

    ld_a_nn(MEM.SCENE_ID),
    inc_r('a'),
    ld_nn_a(MEM.SCENE_ID),
    cp_n(u8(SCENES.length)),
    jp_cc('c', ref('scene_load')), // more scenes to go

    // ==== Bonus: the speed round ====
    ...storeByte(MEM.KANA_MODE, KanaMode.SPEED),
    ld_rr_nn('de', ref(SPEED_ROUND_LABEL)),
    call(ref('play_round')),

    // ==== Game complete — ending screen, then back to the title ====
    ...buildResultScreen(ENDING),

    // ==== Game Over ====
    ...buildResultScreen(GAME_OVER),

    // ==== Subroutines ====
    // scene_draw — fade out, draw the current scene (backdrop, cast, HUD, empty box, name), fade in
    label('scene_draw'),
    ...fadeOut(),
    ...screenOff('scene_vblank'),
    ...clearScreen(),

    // Backdrop above the dialogue box: the scene's own tiles, then its map
    ...copySceneBlock(u16(bgTileAddr(SCENE_TILE_BASE)), 'tiles', 'tilesLength'),
    ...sceneWord('backdrop'),
    ld_r_r('d', 'h'),
    ld_r_r('e', 'l'),
    ld_rr_nn('hl', u16(tilemapAddr(BACKDROP.top, 0))),
    call(ref('draw_runs')),

    // The cast: sprite tiles, GBC sprite palettes 1..n, who speaks when, where they stand
    ...copySceneBlock(u16(MEM.OBJ_TILES + NPC_TILE_BASE * 16), 'castTiles', 'castTilesLength'),
    ld_r_n('a', u8(0x80 | 8)),
    ldh_n_a(HW.OCPS),
    ...sceneByte('castPaletteBytes'),
    push('af'),
    ...sceneWord('castPalettes'),
    pop('af'),
    ld_r_r('b', 'a'),
    label('scene_cast_palette'),
    ldi_a_hl(),
    ldh_n_a(HW.OCPD),
    dec_r('b'),
    jr_cc('nz', ref('scene_cast_palette')),
    ...sceneWord('castTable'),
    ...storePointer('hl', MEM.NPC_TABLE_LO, MEM.NPC_TABLE_HI),
    ...storeByte(MEM.NPC_CURRENT, NPC_NONE),
    ...sceneByte('stageX'),
    ld_nn_a(MEM.NPC_X),
    ...sceneByte('stageY'),
    ld_nn_a(MEM.NPC_Y),

    // The animated tile
    ...sceneWord('animation'),
    ...storePointer('hl', MEM.ANIM_LO, MEM.ANIM_HI),
    ...zeroBytes(MEM.ANIM_TIMER, MEM.ANIM_FRAME),

    // GBC colors of the backdrop
    ...cgbAttributes('scene_colors', [
      ...sceneWord('colors'),
      ld_r_r('d', 'h'),
      ld_r_r('e', 'l'),
      ld_rr_nn('hl', u16(tilemapAddr(BACKDROP.top, 0))),
      call(ref('draw_runs')),
    ]),
    call(ref('kana_draw_hud')), // hearts + score on row 0
    call(ref('dlg_draw_box')),
    // Location name as a label in the box's top border: ┌─── えき ─┐
    ...sceneWord('nameTiles'),
    push('hl'),
    ...sceneWord('nameAddress'),
    pop('de'),
    call(ref('draw_tiles')),
    ...sceneWord('fade'),
    call(ref('fade_in')),
    ...catFace('cat_rest', 'neutral'),
    ...placeCat(CAT_SPOTS.dialogue),
    ret(),
    ...buildRoundRoutines(),
    ...buildSceneTableRoutines(),
    ...buildReadJoypad(),
    ...buildTitleBlink(),
    ...buildCatRoutines(),
    ...buildSpriteRoutines(),
    ...buildDrawStartBox(),
    ...buildDrawStamps(),
    ...buildDialogueEngine(),
    ...buildKanaEngine(),
    ...buildDrawHudOps(),
    ...buildScoreRoutines(),
    ...buildScoreDigits(),
    ...buildVramPut(),
    ...buildDrawTiles(),
    ...buildFadeRoutines(),
    ...buildClearScreen(),
    ...buildDrawRuns(),
    ...buildNpcRoutines(),
    ...buildAnimRoutines(),

    // ==== Data ====
    ...buildSpriteData(),
    ...buildCatData(),
    ...buildFadeData(),
    ...FONT_SEGMENTS.flatMap((segment) => [label(segment.label), db(segment.data)]),

    label(SPEED_ROUND_LABEL),
    db(buildKanaData(SPEED_ROUND)),

    // Per-scene dialogue and kana data
    ...packedScenes.flatMap((scene, i) => [
      label(sceneDialogueLabel(i)),
      db(scene.dialogueData),
      label(sceneRoundsLabel(i)),
      db(scene.roundsData),
      label(sceneChancesLabel(i)),
      db(scene.chancesData),
      label(sceneBackdropLabel(i)),
      db(scene.backdropData),
      label(sceneTilesLabel(i)),
      db(scene.sceneTileData),
    ]),

    // GBC palette sets (also drive the fades) and backdrop palette maps
    label(TITLE_FADE),
    db(buildPaletteSet(TITLE_COLORS)),
    ...packedScenes.flatMap((packed, i) => [
      label(sceneFadeLabel(i)),
      db(packed.paletteSet),
      label(sceneColorsLabel(i)),
      db(packed.backdropAttributes),
      label(castLabels(i).tiles),
      db(packed.cast.tiles),
      label(castLabels(i).palettes),
      db(packed.cast.palettes),
      label(castLabels(i).table),
      db(packed.cast.table),
      label(sceneAnimationLabel(i)),
      db(packed.animation),
    ]),
    ...[ENDING, GAME_OVER].flatMap((screen) => [
      label(resultFadeLabel(screen)),
      db(buildPaletteSet(screen.colors)),
    ]),
    // GBC palettes every screen shares (the palette sets hold only their own)
    label('shared_palettes'),
    db(buildSharedPalettes()),

    // Everything the engine loads per scene (scene-table.ts)
    ...buildSceneTable(
      packedScenes.map((packed, i) => ({
        dialogue: sceneDialogueLabel(i),
        rounds: sceneRoundsLabel(i),
        chances: sceneChancesLabel(i),
        fade: sceneFadeLabel(i),
        tiles: sceneTilesLabel(i),
        tilesLength: u16(packed.sceneTileData.length),
        backdrop: sceneBackdropLabel(i),
        castTiles: castLabels(i).tiles,
        castTilesLength: u16(packed.cast.tiles.length),
        castPalettes: castLabels(i).palettes,
        castTable: castLabels(i).table,
        animation: sceneAnimationLabel(i),
        colors: sceneColorsLabel(i),
        nameTiles: tileListLabel([NAME_TAG_LEFT, ...packed.nameRow, NAME_TAG_RIGHT]),
        nameAddress: u16(
          tilemapAddr(DIALOGUE_LAYOUT.boxTop, DIALOGUE_LAYOUT.nameCol(packed.nameRow.length)),
        ),
        castPaletteBytes: packed.cast.palettes.length,
        stageX: packed.cast.stage.x,
        stageY: packed.cast.stage.y,
        flag: 1 << i,
      })),
    ),
    // Tile lists drawn by draw_tiles (collected while generating the code above)
    ...buildTileLists(),
  ];
}

/** Assemble the complete game ROM. */
export function buildRom(): AssembleResult {
  return assemble(buildProgram(), ROM_HEADER);
}
