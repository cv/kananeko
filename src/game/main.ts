/**
 * Main game program — composes all subsystems into a complete ROM.
 *
 * Flow: Title screen → Scene 0..4 (dialogue → kana) → End/loop
 */

import { doWhile, ifElse, ifThen, loop } from '../asm/flow';
import { type AssembleResult, type ROMHeader, assemble } from '../asm/assembler';
import { HW, JOY } from '../asm/hardware';
import { BUFFERS, MEM, STACK_TOP, VARIABLES } from './ram';
import { type GameModule, gameModule, link } from '../asm/program';
import { CHART_FADE, SPEED_ROUND_DATA, TITLE_FADE } from './labels';
import type { PackedScene } from './scene';
import { animModule } from './anim';
import { catModule } from './cat';
import { chartModule } from './chart';
import { dialogueModule } from './dialogue';
import { joypadModule } from './joypad';
import { kanaModule } from './kana';
import { hudModule } from './kana-hud';
import { menuModule } from './menu';
import { npcModule } from './npc';
import { passwordModule } from './password';
import { practiceModule } from './practice';
import { sceneTableModule } from './scene-table';
import { soundModule } from './sound';
import { spritesModule } from './sprites';
import { videoModule } from './video';
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
  add,
  and,
  call,
  cp,
  dec,
  db,
  di,
  ei,
  inc,
  jp,
  jr,
  label,
  ld,
  ldh,
  or,
  pop,
  push,
  ret,
  sla,
  xor,
} from '../asm/sm83';
import { type Op, type U16, u16, Label, labelFamily, routine } from '../asm/types';
import { SCENE_TILE_BASE } from './backdrop';
import { runDma } from './sprites';
import { CAT_SPOTS, type CatFace, catFace, placeCat } from './cat';
import { NPC_NONE, NPC_TILE_BASE } from './npc';
import { DIALOGUE_LAYOUT } from './dialogue';
import {
  ONE_BIT_TILES,
  TILE_COUNT,
  buildPackedTileData,
  requireTile,
  requireTiles,
  textToTiles,
} from './font';
import { UI_TILES } from './font-data';
import { buildKanaData } from './kana';
import { buildDrawScoreDigits, SCORE_DIGIT_COUNT } from './kana-hud';
import { centerStartCol, tilemapAddr } from './tilemap';
import { SCENES, SPEED_ROUND, buildSceneData, dialogueCodec } from './scene';
import { menuPick } from './menu';
import { PASSWORD_LABEL, passwordLineCol } from './password';
import { type SongName, playMusic, playSfx } from './sound';
import { BAD_PICK, END_OF_CONVERSATION, KanaMode, MAX_LIVES } from './state';
import { REDEEM_KEY } from './rounds';
import { type ColorScheme, buildPaletteSet, buildSharedPalettes, paletteOf } from './color';
import { LOGO_ROWS } from './logo';
import { buildSceneTable, copySceneBlock, sceneByte, sceneWord } from './scene-table';
import { CHART_COLORS, ENDING_COLORS, GAME_OVER_COLORS, TITLE_COLORS } from './scenes/colors';
import { BACKDROP } from './backdrop';
import {
  bgTileAddr,
  tileList,
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
const TABLE_FIND = routine('table_find', { out: ['c', 'f'], clobbers: ['a', 'b', 'de', 'hl'] });
const ROUND_CHECK = routine('round_check', { clobbers: ['a', 'bc', 'de', 'hl'] });
const CHANCE_CHECK = routine('chance_check', { clobbers: ['a', 'bc', 'de', 'hl'] });
const DRAW_STAMPS = routine('draw_stamps', { clobbers: ['a', 'hl'] });
const DRAW_START_BOX = routine('draw_start_box', { clobbers: ['a', 'hl'] });
const TITLE_BLINK = routine('title_blink', { clobbers: ['a', 'b', 'hl'] });
const SCENE_DRAW = routine('scene_draw', { clobbers: ['a', 'bc', 'de', 'hl'] });

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
    ld('a', [stateAddr]),
    cp(0),
    jr('nz', loop),
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
  const found = new Label('table_found');
  return [
    label(TABLE_FIND),
    push('hl'), // table start, for the offset
    ld('a', ['hl+']),
    ld('b', 'a'), // entries left
    ld('c', 1),
    ...loop((again, done) => [
      ld('a', 'b'),
      or('a'),
      jr('z', done),
      ld('a', ['hl+']),
      cp('d'),
      jr('z', found),
      inc('hl'), // skip the offset
      inc('hl'),
      sla('c'),
      dec('b'),
      jr(again),
    ]),
    pop('hl'),
    xor('a'), // Z
    ret(),
    label(found),
    ld('a', ['hl+']),
    ld('e', 'a'),
    ld('d', ['hl']), // DE = offset
    pop('hl'),
    add('hl', 'de'),
    ld('d', 'h'),
    ld('e', 'l'),
    ld('a', 1),
    or('a'), // NZ
    ret(),

    label(ROUND_CHECK),
    ...loadPointer('hl', MEM.ROUNDS),
    ld('a', [MEM.DLG_NODE_ID]),
    ld('d', 'a'),
    call(TABLE_FIND),
    ret('z'),
    ld('a', [MEM.ROUNDS_DONE]),
    and('c'),
    ret('nz'), // already played (the dialogue looped back)
    ld('a', [MEM.ROUNDS_DONE]),
    or('c'),
    ld([MEM.ROUNDS_DONE], 'a'),
    ...storeByte(MEM.KANA_MODE, KanaMode.NORMAL),
    jr(PLAY_ROUND),

    label(CHANCE_CHECK),
    ld('a', [MEM.DLG_PICK]),
    ld('b', 'a'),
    and(BAD_PICK),
    ...ifElse(
      'nz',
      [
        ld('a', [MEM.KANA_LIVES]),
        or('a'),
        ret('z'), // the conversation is over anyway
        ld('a', [MEM.DLG_FROM_NODE]),
        or(REDEEM_KEY),
        ld('d', 'a'),
        ld('a', KanaMode.REDEEM),
      ],
      [
        ld('a', 'b'),
        or('a'),
        ret('nz'), // only the first reply can be a fill-in
        ld('a', [MEM.DLG_FROM_NODE]),
        ld('d', 'a'),
        ld('a', KanaMode.SAY_IT),
      ],
    ),
    ld([MEM.KANA_MODE], 'a'),
    ...loadPointer('hl', MEM.CHANCES),
    call(TABLE_FIND),
    ret('z'),

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
      ld('a', [MEM.SCENE_FLAGS]),
      and(1 << i),
      jr('z', skip),
      ld('hl', u16(tilemapAddr(row, startCol + i * 3))),
      ...requireTiles(scene.icon).flatMap((tile) => [ld('a', tile), ld(['hl+'], 'a')]),
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
    ld('hl', u16(tilemapAddr(ENDING_ROWS.score, scoreCol))),
    ...labelTiles.flatMap((tile) => [ld('a', tile), ld(['hl+'], 'a')]),
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
    ld('a', [MEM.JOYPAD_NEW]),
    and(JOY.START),
    jr('z', loop),
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
    ld('a', [MEM.TITLE_TIMER]),
    inc('a'),
    ld([MEM.TITLE_TIMER], 'a'),
    ld('b', 'a'),
    and(BLINK_BIT - 1),
    ret('nz'),
    ld('a', 'b'),
    and(BLINK_BIT),
    ...ifThen('nz', [...writeCenteredRow(START_PROMPT_ROW, START_BOX_OFF), ret()]),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_ON),
    ret(),
  ];
}

// ---------------------------------------------------------------------------
// Program builder
// ---------------------------------------------------------------------------

/** Boot: the CPU, RAM and the font, with the LCD off, before the modules' inits */
function buildBoot(): Op[] {
  return [
    // ==== Init ====
    di(),
    // A = $11 at boot on a Game Boy Color (LD doesn't touch the flags CP set)
    cp(0x11),
    ld('a', 0),
    ...ifThen('z', [inc('a')]),
    ld('sp', STACK_TOP),
    // WRAM and HRAM start with random contents on real hardware (and in accurate
    // emulators): zero the buffers' page and every variable, keeping the GBC flag across
    push('af'),
    ...zeroPages(u16(BUFFERS.start), 1),
    ...zeroBlock(u16(VARIABLES.start), VARIABLES.end - VARIABLES.start),
    pop('af'),
    ld([MEM.IS_CGB], 'a'),

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
  ];
}

/** The game: the title screen, the scenes and their rounds, and the result screens */
function buildMain(): Op[] {
  const sceneComplete = new Label('scene_complete');
  return [
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
    ...doWhile('nz', [
      ...frameWait(),
      ...runDma(),
      call(JOY_READ),
      ld('a', [MEM.JOYPAD_CUR]),
      cp(0),
    ]),

    // The menu: はじめる starts a run, つづき takes a password
    ...doWhile('z', [
      ...frameWait(),
      ...runDma(),
      call(JOY_READ),
      call(CAT_TICK),
      call(MENU_UPDATE),
      or('a'),
    ]),
    cp(menuPick('はじめる')),
    ...ifThen('nz', [
      ...playSfx('confirm'),
      cp(menuPick('つづき')),
      jp('z', PASSWORD_SCREEN),
      jp(PRACTICE_START),
    ]),
    ...playSfx('start'),

    // START pressed — begin a fresh run at scene 0
    ...resetRunState(MEM.SCENE_FLAGS),
    xor('a'),
    ldh([HW.DIV], 'a'), // reset entropy timing so gameplay remains deterministic after title idling
    ld([MEM.SCENE_ID], 'a'),

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
    ld('d', 'h'),
    ld('e', 'l'),
    call(DLG_OPEN_TREE), // initialize tree and open node 0

    // Process nodes until the conversation ends
    ...engineLoop(SCENE_DLG_LOOP, DLG_UPDATE, MEM.DLG_STATE),
    ...zeroBytes(MEM.ROUND_RAN),
    call(CHANCE_CHECK), // a one-question chance after this choice?
    call(ROUND_CHECK), // a kana round before the next node?
    ld('a', [MEM.ROUND_RAN]),
    or('a'),
    ...ifElse(
      'nz',
      [
        ld('a', [MEM.KANA_LIVES]),
        cp(0),
        jp('z', GAME_OVER_SCREEN.entry),
        ld('a', [MEM.DLG_NODE_ID]),
        cp(END_OF_CONVERSATION),
        jr('z', sceneComplete),
        call(SCENE_DRAW),
      ],
      [ld('a', [MEM.DLG_NODE_ID]), cp(END_OF_CONVERSATION), jr('z', sceneComplete)],
    ),
    call(DLG_OPEN_NODE),
    jp(SCENE_DLG_LOOP),

    label(sceneComplete),
    // ==== Scene complete — set completion flag and advance ====
    ...sceneByte('flag'),
    ld('b', 'a'),
    ld('a', [MEM.SCENE_FLAGS]),
    or('b'),
    ld([MEM.SCENE_FLAGS], 'a'),

    ld('a', [MEM.SCENE_ID]),
    inc('a'),
    ld([MEM.SCENE_ID], 'a'),
    cp(SCENES.length),
    ...ifThen('c', [ld('c', 1), call(CHART_SHOW), jp(SCENE_LOAD)]),

    // ==== Bonus: the speed round ====
    ...storeByte(MEM.KANA_MODE, KanaMode.SPEED),
    call(PRACTICE_RAND),
    ld([MEM.PRACTICE_NEXT], 'a'),
    call(SPEED_FILL), // the missed kana first, then the round's own questions
    ld('de', MEM.PRACTICE_BUF.address),
    call(PLAY_ROUND),
    ld('c', 0),
    call(CHART_SHOW), // the whole trip's kana, then the ending

    // ==== Game complete — ending screen, then back to the title ====
    ...buildResultScreen(ENDING),

    // ==== Game Over ====
    ...buildResultScreen(GAME_OVER_SCREEN),
  ];
}

/** The routines and data of the game's flow: scenes, the title, the result screens */
function gameFlow(packedScenes: readonly PackedScene[]): GameModule {
  return gameModule({
    name: 'game',
    code: () => [
      // scene_draw — fade out, draw the current scene (backdrop, cast, HUD, empty box, name), fade in
      label(SCENE_DRAW),
      ...fadeOut(),
      ...screenOff(),
      ...playMusic('travel'), // (carries on if it was already playing)
      ...clearScreen(),

      // Backdrop above the dialogue box: the scene's own tiles, then its map
      ...copySceneBlock(u16(bgTileAddr(SCENE_TILE_BASE)), 'tiles', 'tilesLength'),
      ...sceneWord('backdrop'),
      ld('d', 'h'),
      ld('e', 'l'),
      ld('hl', u16(tilemapAddr(BACKDROP.top, 0))),
      call(DRAW_RUNS),

      // The cast: sprite tiles, GBC sprite palettes 1..n, who speaks when, where they stand
      ...copySceneBlock(u16(MEM.OBJ_TILES + NPC_TILE_BASE * 16), 'castTiles', 'castTilesLength'),
      ld('a', 0x80 | 8),
      ldh([HW.OCPS], 'a'),
      ...sceneByte('castPaletteBytes'),
      push('af'),
      ...sceneWord('castPalettes'),
      pop('af'),
      ld('b', 'a'),
      ...doWhile('nz', [ld('a', ['hl+']), ldh([HW.OCPD], 'a'), dec('b')]),
      ...sceneWord('castTable'),
      ...storePointer('hl', MEM.NPC_TABLE),
      ...storeByte(MEM.NPC_CURRENT, NPC_NONE),
      ...sceneByte('stageX'),
      ld([MEM.NPC_X], 'a'),
      ...sceneByte('stageY'),
      ld([MEM.NPC_Y], 'a'),

      // The animated tile
      ...sceneWord('animation'),
      ...storePointer('hl', MEM.ANIM),
      ...zeroBytes(MEM.ANIM_TIMER, MEM.ANIM_FRAME),

      // GBC colors of the backdrop
      ...cgbAttributes([
        ...sceneWord('colors'),
        ld('d', 'h'),
        ld('e', 'l'),
        ld('hl', u16(tilemapAddr(BACKDROP.top, 0))),
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
      ...buildTitleBlink(),
      ...buildDrawStartBox(),
      ...buildDrawStamps(),
    ],
    data: () => [
      label(CHART_FADE),
      db(buildPaletteSet(CHART_COLORS)),
      ...FONT_SEGMENTS.flatMap((segment) => [label(segment.label), db(segment.data)]),

      label(SPEED_ROUND_DATA),
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
    ],
  });
}

/** Every engine, in the order their code and data go in the ROM */
const ENGINES: readonly GameModule[] = [
  spritesModule,
  catModule,
  soundModule,
  sceneTableModule,
  joypadModule,
  menuModule,
  passwordModule,
  chartModule,
  practiceModule,
  dialogueModule(() => dialogueCodec().base),
  kanaModule,
  hudModule,
  videoModule,
  npcModule,
  animModule,
];

export function buildProgram(): Op[] {
  const packedScenes = buildSceneData();
  return link({
    boot: buildBoot(),
    main: buildMain(),
    modules: [gameFlow(packedScenes), ...ENGINES],
  });
}

/** Assemble the complete game ROM. */
export function buildRom(): AssembleResult {
  return assemble(buildProgram(), ROM_HEADER, { contracts: 'strict' });
}
