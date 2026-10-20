/**
 * The game: what it does from the title screen through the scenes to the result
 * screens, and the modules it's built from.
 *
 * Flow: title screen (title.ts) → scenes 0..4 (dialogue, with kana rounds from
 * rounds.ts) → the speed round → the ending, or game over (results.ts) → title
 */

import { titleModule, titleScreen } from './title';
import { CHANCE_CHECK, ROUND_CHECK, engineLoop, resetRunState, roundsModule } from './rounds';
import { ENDING, GAME_OVER_SCREEN, resultScreen, resultsModule } from './results';
import { buildBoot, fontModule } from './boot';
import { compare, doWhile, ifElse, ifThen } from '../asm/flow';
import { type AssembleResult, type ROMHeader, assemble } from '../asm/assembler';
import { HW } from '../asm/hardware';
import { MEM } from './ram';
import { type GameModule, gameModule, link } from '../asm/program';
import {
  CAT_REST,
  DLG_OPEN_TREE,
  DLG_OPEN_NODE,
  DLG_DRAW_BOX,
  DLG_UPDATE,
  KANA_DRAW_HUD,
  SCENE_DESC,
  CHART_SHOW,
  PRACTICE_RAND,
  SPEED_FILL,
  VBLANK_HANDLER,
  DRAW_RUNS,
  DRAW_TILES,
  FADE_IN,
  PLAY_ROUND,
  SCENE_LOAD,
  SHARED_PALETTES,
} from './labels';
import type { PackedScene } from './scene';
import { animModule } from './anim';
import { catModule, CAT_SPOTS, catFace, placeCat } from './cat';
import { chartModule } from './chart';
import { dialogueModule, DIALOGUE_LAYOUT } from './dialogue';
import { joypadModule } from './joypad';
import { kanaModule } from './kana';
import { hudModule } from './kana-hud';
import { menuModule } from './menu';
import { npcModule, NPC_NONE, NPC_TILE_BASE } from './npc';
import { passwordModule } from './password';
import { practiceModule } from './practice';
import {
  sceneTableModule,
  buildSceneTable,
  copySceneBlock,
  sceneByte,
  sceneWord,
} from './scene-table';
import { soundModule, playMusic } from './sound';
import { spritesModule } from './sprites';
import {
  videoModule,
  bgTileAddr,
  tileList,
  cgbAttributes,
  clearScreen,
  fadeOut,
  screenOff,
} from './video';
import { incByte, storeByte, storePointer, zeroBytes } from '../asm/macros';
import {
  call,
  cp,
  dec,
  db,
  ei,
  jp,
  jr,
  label,
  ld,
  ldh,
  or,
  pop,
  push,
  ret,
  xor,
  invoke,
} from '../asm/sm83';
import { type Op, u16, Label, labelFamily, routine } from '../asm/types';
import { SCENE_TILE_BASE, BACKDROP } from './backdrop';
import { requireTile } from './font';
import { UI_TILES } from './font-data';
import { tilemapAddr } from './tilemap';
import { SCENES, buildSceneData, dialogueCodec } from './scene';
import { END_OF_CONVERSATION, KanaMode } from './state';
import { buildSharedPalettes } from './color';

// Labels placed in this module
const SCENE_DRAW = routine('scene_draw', { clobbers: ['a', 'bc', 'de', 'hl'] });

export const ROM_HEADER: ROMHeader = {
  title: 'KANANEKO',
  cgbFlag: 0x80, // CGB+DMG compatible
  destinationCode: 0x00, // Japan
  vblankHandler: VBLANK_HANDLER, // counts frames (see buildFrameWait)
};

/** Caps of the location name tag on the dialogue box's top edge: ─( えき )─ */
const NAME_TAG_LEFT = requireTile(UI_TILES.TAG_LEFT);
const NAME_TAG_RIGHT = requireTile(UI_TILES.TAG_RIGHT);

// ---------------------------------------------------------------------------
// Program helpers
// ---------------------------------------------------------------------------

const sceneLabel = (part: string): ((sceneIndex: number) => Label) =>
  labelFamily((sceneIndex: number) => `scene${String(sceneIndex)}_${part}`);

export const sceneDialogueLabel = sceneLabel('dlg');
const sceneChancesLabel = sceneLabel('chances');
export const sceneRoundsLabel = sceneLabel('rounds');
const sceneFadeLabel = sceneLabel('fade');
const sceneAnimationLabel = sceneLabel('anim');
const sceneColorsLabel = sceneLabel('colors');
export const sceneTilesLabel = sceneLabel('tiles');
export const sceneBackdropLabel = sceneLabel('backdrop');
const castTilesLabel = sceneLabel('npc_tiles');
const castPalettesLabel = sceneLabel('npc_palettes');
const castTableLabel = sceneLabel('npc_table');

function castLabels(sceneIndex: number): { tiles: Label; palettes: Label; table: Label } {
  return {
    tiles: castTilesLabel(sceneIndex),
    palettes: castPalettesLabel(sceneIndex),
    table: castTableLabel(sceneIndex),
  };
}

const SCENE_DLG_LOOP = new Label('scene_dlg_loop');

// ---------------------------------------------------------------------------
// Program builder
// ---------------------------------------------------------------------------

/** The game: the title screen, the scenes and their rounds, and the result screens */
function buildMain(): Op[] {
  const sceneComplete = new Label('scene_complete');
  return [
    // Enable the VBlank interrupt so HALT wakes once per frame (fades and game loops);
    // its handler counts frames (see buildFrameWait).
    ...storeByte(MEM.IE, 0x01), // bit 0 = VBlank
    ei(),
    ...titleScreen(),

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
    ...invoke(DLG_OPEN_TREE, { de: 'de' }), // initialize tree and open node 0

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
        ...compare(MEM.KANA_LIVES, 0),
        jp('z', GAME_OVER_SCREEN.entry),
        ...compare(MEM.DLG_NODE_ID, END_OF_CONVERSATION),
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

    ...incByte(MEM.SCENE_ID),
    cp(SCENES.length),
    ...ifThen('c', [...invoke(CHART_SHOW, { c: 1 }), jp(SCENE_LOAD)]),

    // ==== Bonus: the speed round ====
    ...storeByte(MEM.KANA_MODE, KanaMode.SPEED),
    call(PRACTICE_RAND),
    ld([MEM.PRACTICE_NEXT], 'a'),
    call(SPEED_FILL), // the missed kana first, then the round's own questions
    ...invoke(PLAY_ROUND, { de: MEM.PRACTICE_BUF.address }),
    ...invoke(CHART_SHOW, { c: 0 }), // the whole trip's kana, then the ending

    // ==== Game complete — ending screen, then back to the title ====
    ...resultScreen(ENDING),

    // ==== Game Over ====
    ...resultScreen(GAME_OVER_SCREEN),
  ];
}

/** The scenes: scene_draw, and every scene's data and its entry in the scene table */
function scenesModule(packedScenes: readonly PackedScene[]): GameModule {
  return gameModule({
    name: 'scenes',
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
      ...invoke(DRAW_RUNS, { hl: tilemapAddr(BACKDROP.top, 0), de: 'de' }),

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
        ...invoke(DRAW_RUNS, { hl: tilemapAddr(BACKDROP.top, 0), de: 'de' }),
      ]),
      call(KANA_DRAW_HUD), // hearts + score on row 0
      call(DLG_DRAW_BOX),
      // Location name as a label in the box's top border: ┌─── えき ─┐
      ...sceneWord('nameTiles'),
      push('hl'),
      ...sceneWord('nameAddress'),
      pop('de'),
      ...invoke(DRAW_TILES, { de: 'de', hl: 'hl' }),
      ...sceneWord('fade'),
      ...invoke(FADE_IN, { hl: 'hl' }),
      ...catFace(CAT_REST, 'neutral'),
      ...placeCat(CAT_SPOTS.dialogue),
      ret(),
    ],
    data: () => [
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
  dialogueModule(dialogueCodec),
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
    modules: [
      scenesModule(packedScenes),
      roundsModule,
      titleModule,
      resultsModule,
      fontModule,
      ...ENGINES,
    ],
  });
}

/** Assemble the complete game ROM. */
export function buildRom(): AssembleResult {
  return assemble(buildProgram(), ROM_HEADER, { contracts: 'strict' });
}
