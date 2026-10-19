/**
 * Main game program — composes all subsystems into a complete ROM.
 *
 * Flow: Title screen → Scene 0..4 (dialogue → kana) → End/loop
 */

import { type AssembleResult, type ROMHeader, assemble } from '../asm/assembler';
import { HW, JOY } from '../asm/hardware';
import { BUFFERS, MEM, STACK_TOP, VARIABLES } from './ram';
import {
  copyBlock,
  expandOneBit,
  loadPointer,
  storeByte,
  storePointer,
  zeroBytes,
  zeroBlock,
  zeroPages,
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
  pool,
  xor_r,
} from '../asm/ops';
import { type Op, type U16, u8, u16, Label, labelFamily } from '../asm/types';
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
import { DIALOGUE_LAYOUT, buildDialogueEngine, buildTextNext } from './dialogue';
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
import { SCENES, SPEED_ROUND, buildSceneData, dialogueCodec } from './scene';
import { buildMenuRoutines, menuPick } from './menu';
import {
  PASSWORD_LABEL,
  buildPasswordData,
  buildPasswordRoutines,
  buildPasswordScreen,
  passwordLineCol,
} from './password';
import {
  type SongName,
  buildSoundData,
  buildSoundDriver,
  buildSoundInit,
  playMusic,
  playSfx,
} from './sound';
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
import { CHART_COLORS, ENDING_COLORS, GAME_OVER_COLORS, TITLE_COLORS } from './scenes/colors';
import { buildChartData, buildChartRoutines } from './chart';
import { buildPracticeData, buildPracticeLoop, buildPracticeRoutines } from './practice';
import { BACKDROP } from './backdrop';
import {
  bgTileAddr,
  buildFrameWait,
  buildDrawTiles,
  tileList,
  buildDrawRuns,
  buildClearScreen,
  buildFadeData,
  buildFadeRoutines,
  buildVramPut,
  cgbAttributes,
  clearScreen,
  fadeIn,
  frameWait,
  fadeOut,
  fillAttributes,
  screenOff,
  writeCenteredRow,
  drawTiles,
} from './video';
import {
  CAT_REST,
  CAT_TICK,
  NPC_HIDE,
  DLG_OPEN_TREE,
  DLG_OPEN_NODE,
  DLG_DRAW_BOX,
  DLG_UPDATE,
  JOY_READ,
  KANA_START,
  KANA_UPDATE,
  HUD_UPDATE,
  KANA_DRAW_HUD,
  SCORE_DIGITS,
  MENU_DRAW,
  MENU_UPDATE,
  PASS_ENCODE,
  PASS_DRAW,
  PASSWORD_SCREEN,
  SCENE_DESC,
  CHART_SHOW,
  PRACTICE_START,
  PRACTICE_RAND,
  SPEED_FILL,
  VBLANK_HANDLER,
  DRAW_RUNS,
  DRAW_TILES,
  FADE_IN,
  PLAY_ROUND,
  TITLE_SCREEN,
  SCENE_LOAD,
  TEXT_DICT,
  SHARED_PALETTES,
} from './labels';

// Labels placed in this module
const TABLE_FIND = new Label('table_find');
const TABLE_SCAN = new Label('table_scan');
const TABLE_ABSENT = new Label('table_absent');
const TABLE_FOUND = new Label('table_found');
const ROUND_CHECK = new Label('round_check');
const CHANCE_CHECK = new Label('chance_check');
const CHANCE_NOT_BAD = new Label('chance_not_bad');
const CHANCE_FIND = new Label('chance_find');
const DRAW_STAMPS = new Label('draw_stamps');
const DRAW_START_BOX = new Label('draw_start_box');
const TITLE_BLINK = new Label('title_blink');
const TITLE_PROMPT_ON = new Label('title_prompt_on');
const INIT_NOT_CGB = new Label('init_not_cgb');
const TITLE_DEBOUNCE = new Label('title_debounce');
const TITLE_LOOP = new Label('title_loop');
const TITLE_NEW_GAME = new Label('title_new_game');
const SCENE_NO_ROUND = new Label('scene_no_round');
const SCENE_OPEN_NODE = new Label('scene_open_node');
const SCENE_COMPLETE = new Label('scene_complete');
const SCENE_LAST_DONE = new Label('scene_last_done');
const SCENE_DRAW = new Label('scene_draw');
const SCENE_CAST_PALETTE = new Label('scene_cast_palette');

export const ROM_HEADER: ROMHeader = {
  title: 'KANANEKO',
  cgbFlag: 0x80, // CGB+DMG compatible
  destinationCode: 0x00, // Japan
  vblankHandler: VBLANK_HANDLER, // counts frames (see buildFrameWait)
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
const ENDING_ROWS = { cat: 2, title: 6, stamps: 8, score: 10, password: 16 } as const;

// ---------------------------------------------------------------------------
// Font in ROM: 1-bit tiles first (expanded at boot), then 2-bit tiles, each split
// at tile 128, where $8800 addressing moves from $9000 to $8800
// ---------------------------------------------------------------------------

interface FontSegment {
  readonly label: Label;
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
      label: new Label(label),
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

const sceneLabel = (part: string): ((sceneIndex: number) => Label) =>
  labelFamily((sceneIndex: number) => `scene${String(sceneIndex)}_${part}`);

export const sceneDialogueLabel = sceneLabel('dlg');
export const sceneChancesLabel = sceneLabel('chances');
export const sceneRoundsLabel = sceneLabel('rounds');
export const sceneFadeLabel = sceneLabel('fade');
export const sceneAnimationLabel = sceneLabel('anim');
export const sceneColorsLabel = sceneLabel('colors');
export const sceneTilesLabel = sceneLabel('tiles');
export const sceneBackdropLabel = sceneLabel('backdrop');
const castTilesLabel = sceneLabel('npc_tiles');
const castPalettesLabel = sceneLabel('npc_palettes');
const castTableLabel = sceneLabel('npc_table');

export function castLabels(sceneIndex: number): { tiles: Label; palettes: Label; table: Label } {
  return {
    tiles: castTilesLabel(sceneIndex),
    palettes: castPalettesLabel(sceneIndex),
    table: castTableLabel(sceneIndex),
  };
}

const SPEED_ROUND_LABEL = new Label('speed_round');
const TITLE_FADE = new Label('title_fade');
const CHART_FADE = new Label('chart_fade');
const resultFadeLabel = labelFamily((screen: ResultScreen) => `${screen.entry.toString()}_fade`);
const SCENE_DLG_LOOP = new Label('scene_dlg_loop');

/** Reset score, delta flash, streak, and lives (plus any extra bytes to zero) for a new run. */
function resetRunState(...alsoZero: U16[]): Op[] {
  return [
    ...zeroBytes(
      ...alsoZero,
      MEM.KANA_SCORE.lo,
      MEM.KANA_SCORE.hi,
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
function engineLoop(loop: Label, update: Label, stateAddr: U16): Op[] {
  return [
    label(loop),
    ...frameWait(),
    ...runDma(),
    call(HUD_UPDATE), // refresh HUD early in VBlank window
    call(CAT_TICK),
    call(JOY_READ),
    call(update),
    ld_a_nn(stateAddr),
    cp_n(u8(0)),
    jr_cc('nz', loop),
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
    label(TABLE_FIND),
    push('hl'), // table start, for the offset
    ldi_a_hl(),
    ld_r_r('b', 'a'), // entries left
    ld_r_n('c', u8(1)),
    label(TABLE_SCAN),
    ld_r_r('a', 'b'),
    or_r('a'),
    jr_cc('z', TABLE_ABSENT),
    ldi_a_hl(),
    cp_r('d'),
    jr_cc('z', TABLE_FOUND),
    inc_rr('hl'), // skip the offset
    inc_rr('hl'),
    sla('c'),
    dec_r('b'),
    jr(TABLE_SCAN),
    label(TABLE_ABSENT),
    pop('hl'),
    xor_r('a'), // Z
    ret(),
    label(TABLE_FOUND),
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

    label(ROUND_CHECK),
    ...loadPointer('hl', MEM.ROUNDS),
    ld_a_nn(MEM.DLG_NODE_ID),
    ld_r_r('d', 'a'),
    call(TABLE_FIND),
    ret_cc('z'),
    ld_a_nn(MEM.ROUNDS_DONE),
    and_r('c'),
    ret_cc('nz'), // already played (the dialogue looped back)
    ld_a_nn(MEM.ROUNDS_DONE),
    or_r('c'),
    ld_nn_a(MEM.ROUNDS_DONE),
    ...storeByte(MEM.KANA_MODE, KanaMode.NORMAL),
    jr(PLAY_ROUND),

    label(CHANCE_CHECK),
    ld_a_nn(MEM.DLG_PICK),
    ld_r_r('b', 'a'),
    and_n(u8(BAD_PICK)),
    jr_cc('z', CHANCE_NOT_BAD),
    ld_a_nn(MEM.KANA_LIVES),
    or_r('a'),
    ret_cc('z'), // the conversation is over anyway
    ld_a_nn(MEM.DLG_FROM_NODE),
    or_n(u8(REDEEM_KEY)),
    ld_r_r('d', 'a'),
    ld_r_n('a', u8(KanaMode.REDEEM)),
    jr(CHANCE_FIND),
    label(CHANCE_NOT_BAD),
    ld_r_r('a', 'b'),
    or_r('a'),
    ret_cc('nz'), // only the first reply can be a fill-in
    ld_a_nn(MEM.DLG_FROM_NODE),
    ld_r_r('d', 'a'),
    ld_r_n('a', u8(KanaMode.SAY_IT)),
    label(CHANCE_FIND),
    ld_nn_a(MEM.KANA_MODE),
    ...loadPointer('hl', MEM.CHANCES),
    call(TABLE_FIND),
    ret_cc('z'),

    label(PLAY_ROUND),
    push('de'),
    call(NPC_HIDE),
    pop('de'),
    call(KANA_START),
    ...engineLoop(new Label('round_loop'), KANA_UPDATE, MEM.KANA_STATE),
    ...storeByte(MEM.ROUND_RAN, 1),
    ret(),
  ];
}

interface ResultScreen {
  /** Where the game jumps to; its name prefixes the screen's internal labels */
  readonly entry: Label;
  /** The cat's face here (a neutral cat blinks) */
  readonly face: CatFace;
  readonly title: string;
  readonly colors: ColorScheme;
  /** The music it plays */
  readonly song: SongName;
  /** Show the password that continues from the scene being played */
  readonly password?: boolean;
}

const ENDING: ResultScreen = {
  entry: new Label('game_complete'),
  face: 'happy',
  song: 'ending',
  title: ENDING_TITLE,
  colors: ENDING_COLORS,
};

const GAME_OVER_SCREEN: ResultScreen = {
  entry: new Label('game_over'),
  face: 'sad',
  song: 'gameOver',
  password: true,
  title: 'ゲームオーバー',
  colors: GAME_OVER_COLORS,
};

/** Width of the stamp row: each scene icon is 2 tiles, one blank tile apart */
const STAMP_ROW_WIDTH = SCENES.length * 3 - 1;

/** Draw the icon of every scene whose SCENE_FLAGS bit is set (LCD off) */
function drawClearedStamps(row: number): Op[] {
  const startCol = centerStartCol(STAMP_ROW_WIDTH);
  return SCENES.flatMap((scene, i) => {
    const skip = new Label();
    return [
      ld_a_nn(MEM.SCENE_FLAGS),
      and_n(u8(1 << i)),
      jr_cc('z', skip),
      ld_rr_nn('hl', u16(tilemapAddr(row, startCol + i * 3))),
      ...requireTiles(scene.icon).flatMap((tile) => [ld_r_n('a', u8(tile)), ldi_hl_a()]),
      label(skip),
    ];
  });
}

/** Subroutine draw_stamps: the result screens' row of cleared-scene stamps (LCD off) */
function buildDrawStamps(): Op[] {
  return [label(DRAW_STAMPS), ...drawClearedStamps(ENDING_ROWS.stamps), ret()];
}

/** End-of-run screen: cat, title, cleared-scene stamps, final score; START returns to the title. */
function buildResultScreen(screen: ResultScreen): Op[] {
  const { entry } = screen;
  const loop = new Label();
  const labelTiles = textToTiles(ENDING_SCORE_LABEL);
  const scoreCol = centerStartCol(labelTiles.length + SCORE_DIGIT_COUNT);
  return [
    label(entry),
    ...fadeOut(),
    ...screenOff(),
    ...playMusic(screen.song),
    ...clearScreen(),
    ...zeroBytes(MEM.TITLE_TIMER), // prompt starts visible

    call(KANA_DRAW_HUD),
    ...writeCenteredRow(ENDING_ROWS.title, textToTiles(screen.title)),
    call(DRAW_STAMPS),
    ld_rr_nn('hl', u16(tilemapAddr(ENDING_ROWS.score, scoreCol))),
    ...labelTiles.flatMap((tile) => [ld_r_n('a', u8(tile)), ldi_hl_a()]),
    call(SCORE_DIGITS),
    ...buildDrawScoreDigits(ENDING_ROWS.score, scoreCol + labelTiles.length),
    call(DRAW_START_BOX),
    ...(screen.password === true
      ? [
          ...storeByte(MEM.KANA_LIVES, MAX_LIVES), // continuing starts with full hearts
          call(PASS_ENCODE),
          ...drawTiles(
            tilemapAddr(ENDING_ROWS.password, passwordLineCol()),
            textToTiles(`${PASSWORD_LABEL} `),
          ),
          call(PASS_DRAW),
        ]
      : []),
    ...fadeIn(resultFadeLabel(screen)),
    ...catFace(CAT_REST, screen.face),
    ...placeCat(CAT_SPOTS.portrait),

    label(loop),
    ...frameWait(),
    ...runDma(),
    call(JOY_READ),
    call(TITLE_BLINK),
    call(CAT_TICK),
    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.START)),
    jr_cc('z', loop),
    ...playSfx('confirm'),

    ...resetRunState(MEM.SCENE_FLAGS),
    ...fadeOut(),
    ...screenOff(),
    jp(TITLE_SCREEN),
  ];
}

/** Subroutine: draw the framed PRESS START prompt (LCD off). */
function buildDrawStartBox(): Op[] {
  return [
    label(DRAW_START_BOX),
    ...writeCenteredRow(START_PROMPT_ROW - 1, START_BOX_TOP),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_ON),
    ...writeCenteredRow(START_PROMPT_ROW + 1, START_BOX_BOTTOM),
    ret(),
  ];
}

/** Subroutine: tick TITLE_TIMER and redraw the START prompt when its blink phase flips. */
function buildTitleBlink(): Op[] {
  return [
    label(TITLE_BLINK),
    ld_a_nn(MEM.TITLE_TIMER),
    inc_r('a'),
    ld_nn_a(MEM.TITLE_TIMER),
    ld_r_r('b', 'a'),
    and_n(u8(BLINK_BIT - 1)),
    ret_cc('nz'),
    ld_r_r('a', 'b'),
    and_n(u8(BLINK_BIT)),
    jr_cc('z', TITLE_PROMPT_ON),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_OFF),
    ret(),
    label(TITLE_PROMPT_ON),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_ON),
    ret(),
  ];
}

// ---------------------------------------------------------------------------
// Program builder
// ---------------------------------------------------------------------------

export function buildProgram(): Op[] {
  const packedScenes = buildSceneData();

  return [
    // ==== Init ====
    di(),
    // A = $11 at boot on a Game Boy Color (LD doesn't touch the flags CP set)
    cp_n(u8(0x11)),
    ld_r_n('a', u8(0)),
    jr_cc('nz', INIT_NOT_CGB),
    inc_r('a'),
    label(INIT_NOT_CGB),
    ld_rr_nn('sp', STACK_TOP),
    // WRAM and HRAM start with random contents on real hardware (and in accurate
    // emulators): zero the buffers' page and every variable, keeping the GBC flag across
    push('af'),
    ...zeroPages(u16(BUFFERS.start), 1),
    ...zeroBlock(u16(VARIABLES.start), VARIABLES.end - VARIABLES.start),
    pop('af'),
    ld_nn_a(MEM.IS_CGB),

    // Clear WRAM state
    ...zeroBytes(MEM.JOYPAD_CUR, MEM.JOYPAD_PREV, MEM.JOYPAD_NEW, MEM.DLG_STATE),
    ...storeByte(MEM.DLG_NODE_ID, END_OF_CONVERSATION),
    ...resetRunState(MEM.KANA_STATE, MEM.SCENE_ID, MEM.SCENE_FLAGS, MEM.GAME_MODE, MEM.TITLE_TIMER),

    // Copy all tile data to VRAM with the LCD off
    ...screenOff(),
    // BG tiles 0-127 go to $9000 and 128+ to $8800 ($8800 addressing); 1-bit tiles expand
    ...FONT_SEGMENTS.flatMap((segment) =>
      (segment.oneBit ? expandOneBit : copyBlock)(
        u16(bgTileAddr(segment.first)),
        segment.label,
        segment.data.length,
      ),
    ),

    ...buildSpriteInit(),
    ...buildCatInit(),
    ...buildSoundInit(),

    // Enable the VBlank interrupt so HALT wakes once per frame (fades and game loops);
    // its handler counts frames (see buildFrameWait).
    ...storeByte(MEM.IE, 0x01), // bit 0 = VBlank
    ei(),

    // ==== Title Screen (entered with the LCD off) ====
    label(TITLE_SCREEN),
    ...playMusic('title'),
    ...clearScreen(),

    // Reset title animation state so the prompt always starts visible.
    ...zeroBytes(MEM.TITLE_TIMER),

    // Score HUD on row 0, title card, and prompt frame (the cat comes after the fade)
    call(KANA_DRAW_HUD),
    ...LOGO_ROWS.flatMap((row, i) => writeCenteredRow(LOGO_TOP_ROW + i, textToTiles(row))),
    ...cgbAttributes(
      fillAttributes(
        LOGO_TOP_ROW,
        centerStartCol(LOGO_WIDTH),
        LOGO_ROWS.length,
        LOGO_WIDTH,
        paletteOf(TITLE_COLORS, 'cat'),
      ),
    ),
    ...writeCenteredRow(10, textToTiles(SUBTITLE)),
    call(MENU_DRAW),
    ...fadeIn(TITLE_FADE),
    ...catFace(CAT_REST, 'neutral'),
    ...placeCat(CAT_SPOTS.portrait),

    // Wait for all buttons to be released (debounce boot ROM START press)
    label(TITLE_DEBOUNCE),
    ...frameWait(),
    ...runDma(),
    call(JOY_READ),
    ld_a_nn(MEM.JOYPAD_CUR),
    cp_n(u8(0)),
    jr_cc('nz', TITLE_DEBOUNCE),

    // The menu: はじめる starts a run, つづき takes a password
    label(TITLE_LOOP),
    ...frameWait(),
    ...runDma(),
    call(JOY_READ),
    call(CAT_TICK),
    call(MENU_UPDATE),
    or_r('a'),
    jr_cc('z', TITLE_LOOP),
    cp_n(u8(menuPick('はじめる'))),
    jr_cc('z', TITLE_NEW_GAME),
    ...playSfx('confirm'),
    cp_n(u8(menuPick('つづき'))),
    jp_cc('z', PASSWORD_SCREEN),
    jp(PRACTICE_START),

    label(TITLE_NEW_GAME),
    ...playSfx('start'),

    // START pressed — begin a fresh run at scene 0
    ...resetRunState(MEM.SCENE_FLAGS),
    xor_r('a'),
    ldh_n_a(HW.DIV), // reset entropy timing so gameplay remains deterministic after title idling
    ld_nn_a(MEM.SCENE_ID),

    // ==== Scene load ====
    label(SCENE_LOAD),
    call(SCENE_DESC), // everything below reads this scene's entry in scene_table
    ...storeByte(MEM.ROUNDS_DONE, 0),
    ...sceneWord('rounds'),
    ...storePointer('hl', MEM.ROUNDS),
    ...sceneWord('chances'),
    ...storePointer('hl', MEM.CHANCES),
    call(SCENE_DRAW),

    // ==== Dialogue, with a kana round after each conversation ====
    ...sceneWord('dialogue'),
    ld_r_r('d', 'h'),
    ld_r_r('e', 'l'),
    call(DLG_OPEN_TREE), // initialize tree and open node 0

    // Process nodes until the conversation ends
    ...engineLoop(SCENE_DLG_LOOP, DLG_UPDATE, MEM.DLG_STATE),
    ...zeroBytes(MEM.ROUND_RAN),
    call(CHANCE_CHECK), // a one-question chance after this choice?
    call(ROUND_CHECK), // a kana round before the next node?
    ld_a_nn(MEM.ROUND_RAN),
    or_r('a'),
    jr_cc('z', SCENE_NO_ROUND),
    // Out of lives → game over
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(0)),
    jp_cc('z', GAME_OVER_SCREEN.entry),
    ld_a_nn(MEM.DLG_NODE_ID),
    cp_n(u8(END_OF_CONVERSATION)),
    jr_cc('z', SCENE_COMPLETE),
    call(SCENE_DRAW), // back from the round: the conversation resumes
    jr(SCENE_OPEN_NODE),
    label(SCENE_NO_ROUND),
    ld_a_nn(MEM.DLG_NODE_ID),
    cp_n(u8(END_OF_CONVERSATION)),
    jr_cc('z', SCENE_COMPLETE),
    label(SCENE_OPEN_NODE),
    call(DLG_OPEN_NODE),
    jp(SCENE_DLG_LOOP),

    label(SCENE_COMPLETE),
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
    jr_cc('nc', SCENE_LAST_DONE),
    // More scenes to go: the kana chart, with the password for the next
    ld_r_n('c', u8(1)),
    call(CHART_SHOW),
    jp(SCENE_LOAD),
    label(SCENE_LAST_DONE),

    // ==== Bonus: the speed round ====
    ...storeByte(MEM.KANA_MODE, KanaMode.SPEED),
    call(PRACTICE_RAND),
    ld_nn_a(MEM.PRACTICE_NEXT),
    call(SPEED_FILL), // the missed kana first, then the round's own questions
    ld_rr_nn('de', MEM.PRACTICE_BUF.address),
    call(PLAY_ROUND),
    ld_r_n('c', u8(0)),
    call(CHART_SHOW), // the whole trip's kana, then the ending

    // ==== Game complete — ending screen, then back to the title ====
    ...buildResultScreen(ENDING),

    // ==== Game Over ====
    ...buildResultScreen(GAME_OVER_SCREEN),

    // ==== Subroutines ====
    // scene_draw — fade out, draw the current scene (backdrop, cast, HUD, empty box, name), fade in
    label(SCENE_DRAW),
    ...fadeOut(),
    ...screenOff(),
    ...playMusic('travel'), // (carries on if it was already playing)
    ...clearScreen(),

    // Backdrop above the dialogue box: the scene's own tiles, then its map
    ...copySceneBlock(u16(bgTileAddr(SCENE_TILE_BASE)), 'tiles', 'tilesLength'),
    ...sceneWord('backdrop'),
    ld_r_r('d', 'h'),
    ld_r_r('e', 'l'),
    ld_rr_nn('hl', u16(tilemapAddr(BACKDROP.top, 0))),
    call(DRAW_RUNS),

    // The cast: sprite tiles, GBC sprite palettes 1..n, who speaks when, where they stand
    ...copySceneBlock(u16(MEM.OBJ_TILES + NPC_TILE_BASE * 16), 'castTiles', 'castTilesLength'),
    ld_r_n('a', u8(0x80 | 8)),
    ldh_n_a(HW.OCPS),
    ...sceneByte('castPaletteBytes'),
    push('af'),
    ...sceneWord('castPalettes'),
    pop('af'),
    ld_r_r('b', 'a'),
    label(SCENE_CAST_PALETTE),
    ldi_a_hl(),
    ldh_n_a(HW.OCPD),
    dec_r('b'),
    jr_cc('nz', SCENE_CAST_PALETTE),
    ...sceneWord('castTable'),
    ...storePointer('hl', MEM.NPC_TABLE),
    ...storeByte(MEM.NPC_CURRENT, NPC_NONE),
    ...sceneByte('stageX'),
    ld_nn_a(MEM.NPC_X),
    ...sceneByte('stageY'),
    ld_nn_a(MEM.NPC_Y),

    // The animated tile
    ...sceneWord('animation'),
    ...storePointer('hl', MEM.ANIM),
    ...zeroBytes(MEM.ANIM_TIMER, MEM.ANIM_FRAME),

    // GBC colors of the backdrop
    ...cgbAttributes([
      ...sceneWord('colors'),
      ld_r_r('d', 'h'),
      ld_r_r('e', 'l'),
      ld_rr_nn('hl', u16(tilemapAddr(BACKDROP.top, 0))),
      call(DRAW_RUNS),
    ]),
    call(KANA_DRAW_HUD), // hearts + score on row 0
    call(DLG_DRAW_BOX),
    // Location name as a label in the box's top border: ┌─── えき ─┐
    ...sceneWord('nameTiles'),
    push('hl'),
    ...sceneWord('nameAddress'),
    pop('de'),
    call(DRAW_TILES),
    ...sceneWord('fade'),
    call(FADE_IN),
    ...catFace(CAT_REST, 'neutral'),
    ...placeCat(CAT_SPOTS.dialogue),
    ret(),
    ...buildRoundRoutines(),
    ...buildSceneTableRoutines(),
    ...buildReadJoypad(),
    ...buildTitleBlink(),
    ...buildCatRoutines(),
    ...buildSpriteRoutines(),
    ...buildDrawStartBox(),
    ...buildMenuRoutines(),
    ...buildPasswordRoutines(SCENES.length),
    ...buildPasswordScreen(TITLE_FADE),
    ...buildChartRoutines(CHART_FADE),
    ...buildPracticeRoutines(SPEED_ROUND_LABEL),
    ...buildPracticeLoop(),
    ...buildDrawStamps(),
    ...buildDialogueEngine(),
    ...buildTextNext(dialogueCodec().base),
    ...buildKanaEngine(),
    ...buildDrawHudOps(),
    ...buildScoreRoutines(),
    ...buildScoreDigits(),
    ...buildVramPut(),
    ...buildFrameWait(),
    ...buildSoundDriver(),
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
    ...buildSoundData(),
    ...buildPasswordData(),
    ...buildChartData(),
    ...buildPracticeData(),
    label(CHART_FADE),
    db(buildPaletteSet(CHART_COLORS)),
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
    ...[ENDING, GAME_OVER_SCREEN].flatMap((screen) => [
      label(resultFadeLabel(screen)),
      db(buildPaletteSet(screen.colors)),
    ]),
    // Dialogue compression dictionary: two bytes per code (text-codec.ts)
    label(TEXT_DICT),
    db(dialogueCodec().pairs.flat()),

    // GBC palettes every screen shares (the palette sets hold only their own)
    label(SHARED_PALETTES),
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
        nameTiles: tileList([NAME_TAG_LEFT, ...packed.nameRow, NAME_TAG_RIGHT]),
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
    pool(), // tile lists (see tileList)
  ];
}

/** Assemble the complete game ROM. */
export function buildRom(): AssembleResult {
  return assemble(buildProgram(), ROM_HEADER);
}
