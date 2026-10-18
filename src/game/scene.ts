/**
 * Scene system — manages the 5 game locations and progression.
 *
 * Dialogue content lives in src/game/scenes/*.ts (one file per location).
 * This file assembles scenes with their metadata, palettes, icons, and kana questions.
 */

import { type DialogueNode, buildDialogueTree } from './dialogue';
import { type KanaQuestion, defineKanaQuestion } from './kana';
import { type KanaCheckpoint, buildRoundsData, planRounds } from './rounds';
import { textToTiles } from './font';
import { SCENE_ICON_TILES } from './font-data';
import { type Pair, type Quint } from './fixed';
import { type ColorScheme, attributeOfCell, buildPaletteSet } from './color';
import { type PackedCast, packCast } from './npc';
import { packAnimation } from './anim';
import {
  CONBINI_ANIMATION,
  PARK_ANIMATION,
  RESTAURANT_ANIMATION,
  STATION_ANIMATION,
  STREET_ANIMATION,
  type TileAnimation,
} from './scenes/animations';
import {
  CONBINI_CAST,
  PARK_CAST,
  RESTAURANT_CAST,
  STATION_CAST,
  STREET_CAST,
  type SceneCast,
} from './scenes/npcs';
import { encodeAttributeRuns } from './video';
import { STATION_DIALOGUE } from './scenes/station';
import { STREET_DIALOGUE } from './scenes/street';
import { RESTAURANT_DIALOGUE } from './scenes/restaurant';
import { CONBINI_DIALOGUE } from './scenes/conbini';
import { PARK_DIALOGUE } from './scenes/park';
import { type Backdrop, buildSceneArt } from './backdrop';
import {
  CONBINI_COLORS,
  PARK_COLORS,
  RESTAURANT_COLORS,
  STATION_COLORS,
  STREET_COLORS,
} from './scenes/colors';
import {
  CONBINI_BACKDROP,
  PARK_BACKDROP,
  RESTAURANT_BACKDROP,
  STATION_BACKDROP,
  STREET_BACKDROP,
} from './scenes/backdrops';

// ---------------------------------------------------------------------------
// Scene data types
// ---------------------------------------------------------------------------

export type KanaRound = Quint<KanaQuestion>;

export interface Scene {
  readonly name: string;
  readonly icon: Pair<string>;
  readonly dialogue: readonly DialogueNode[];
  readonly kanaQuestions: KanaRound;
  /** GBC colors: palettes and which backdrop cells use which */
  readonly colors: ColorScheme;
  /** Conversation partners shown as sprites */
  readonly cast: SceneCast;
  /** One animated backdrop tile */
  readonly animation?: TileAnimation;
  /** Illustration above the dialogue box (see backdrop.ts) */
  readonly backdrop: Backdrop;
}

export type SceneList = Quint<Scene>;

export function defineScenes<const T extends SceneList>(scenes: T): T {
  return scenes;
}

// ---------------------------------------------------------------------------
// Scene assembly — metadata, palettes, icons, kana questions
// ---------------------------------------------------------------------------

const q = defineKanaQuestion;

export const SCENES = defineScenes([
  {
    name: 'えき',
    icon: SCENE_ICON_TILES.TRAIN,
    animation: STATION_ANIMATION,
    cast: STATION_CAST,
    backdrop: STATION_BACKDROP,
    colors: STATION_COLORS,
    dialogue: STATION_DIALOGUE,
    kanaQuestions: [
      q(['こ', 'ん', 'に', 'ち', 'は'], 0, 'か', 'く', 'き'),
      q(['す', 'み', 'ま', 'せ', 'ん'], 1, 'む', 'ま', 'め'),
      q(['お', 'げ', 'ん', 'き'], 2, 'な', 'に', 'ぬ'),
      q(['あ', 'り', 'が', 'と', 'う'], 0, 'い', 'う', 'え'),
      q(['げ', 'ん', 'き'], 1, 'に', 'ね', 'な'),
    ],
  },
  {
    name: 'みち',
    icon: SCENE_ICON_TILES.HOUSE,
    animation: STREET_ANIMATION,
    cast: STREET_CAST,
    backdrop: STREET_BACKDROP,
    colors: STREET_COLORS,
    dialogue: STREET_DIALOGUE,
    kanaQuestions: [
      q(['レ', 'ス', 'ト', 'ラ', 'ン'], 4, 'ナ', 'ニ', 'ヌ'),
      q(['コ', 'ン', 'ビ', 'ニ'], 0, 'カ', 'キ', 'ク'),
      q(['あ', 'ち', 'ら'], 1, 'た', 'つ', 'て'),
      q(['ど', 'こ'], 0, 'だ', 'で', 'づ'),
      q(['あ', 'り', 'が', 'と', 'う'], 3, 'た', 'つ', 'て'),
    ],
  },
  {
    name: 'レストラン',
    icon: SCENE_ICON_TILES.BOWL,
    animation: RESTAURANT_ANIMATION,
    cast: RESTAURANT_CAST,
    backdrop: RESTAURANT_BACKDROP,
    colors: RESTAURANT_COLORS,
    dialogue: RESTAURANT_DIALOGUE,
    kanaQuestions: [
      q(['ラ', 'ー', 'メ', 'ン'], 0, 'リ', 'ル', 'レ'),
      q(['お', 'ち', 'ゃ'], 1, 'た', 'つ', 'て'),
      q(['く', 'だ', 'さ', 'い'], 2, 'だ', 'た', 'な'),
      q(['た', 'べ', 'ま', 'す'], 0, 'な', 'だ', 'か'),
      q(['お', 'い', 'し', 'い'], 2, 'さ', 'す', 'せ'),
    ],
  },
  {
    name: 'コンビニ',
    icon: SCENE_ICON_TILES.SHOP,
    animation: CONBINI_ANIMATION,
    cast: CONBINI_CAST,
    backdrop: CONBINI_BACKDROP,
    colors: CONBINI_COLORS,
    dialogue: CONBINI_DIALOGUE,
    kanaQuestions: [
      q(['く', 'だ', 'さ', 'い'], 0, 'き', 'け', 'か'),
      q(['あ', 'り', 'が', 'と', 'う'], 2, 'き', 'ぎ', 'ぐ'),
      q(['い', 'ら', 'っ', 'し', 'ゃ', 'い'], 0, 'う', 'え', 'あ'),
      q(['ひ', 'ゃ', 'く', 'え', 'ん'], 3, 'あ', 'い', 'お'),
      q(['ど', 'う', 'ぞ'], 2, 'ざ', 'ず', 'ぜ'),
    ],
  },
  {
    name: 'こうえん',
    icon: SCENE_ICON_TILES.TREE,
    animation: PARK_ANIMATION,
    cast: PARK_CAST,
    backdrop: PARK_BACKDROP,
    colors: PARK_COLORS,
    dialogue: PARK_DIALOGUE,
    kanaQuestions: [
      q(['さ', 'よ', 'う', 'な', 'ら'], 3, 'に', 'ぬ', 'ね'),
      q(['お', 'は', 'よ', 'う'], 0, 'あ', 'い', 'う'),
      q(['こ', 'ん', 'ば', 'ん', 'は'], 2, 'ぱ', 'び', 'べ'),
      q(['お', 'な', 'ま', 'え'], 1, 'に', 'ぬ', 'ね'),
      q(['た', 'の', 'し', 'い'], 1, 'な', 'に', 'ぬ'),
    ],
  },
] as const);

// ---------------------------------------------------------------------------
// Build packed scene data for ROM
// ---------------------------------------------------------------------------

export interface PackedScene {
  /** Scene name tiles (centered when drawn) */
  readonly nameRow: readonly number[];
  readonly dialogueData: Uint8Array;
  /** Kana rounds and their questions (see buildRoundsData) */
  readonly roundsData: Uint8Array;
  readonly backdropData: Uint8Array;
  /** Pixel data of the scene's own BG tiles (see SCENE_TILE_BASE) */
  readonly sceneTileData: Uint8Array;
  /** NPC sprites, palettes, and who speaks when */
  readonly cast: PackedCast;
  /** Animated backdrop tile (see packAnimation) */
  readonly animation: Uint8Array;
  /** GBC palette set (see buildPaletteSet) */
  readonly paletteSet: Uint8Array;
  /** Run-length encoded backdrop palettes (see encodeAttributeRuns) */
  readonly backdropAttributes: Uint8Array;
}

export function packScene(scene: Scene): PackedScene {
  const art = buildSceneArt(scene.backdrop);
  return {
    nameRow: textToTiles(scene.name),
    dialogueData: buildDialogueTree(scene.dialogue),
    roundsData: buildRoundsData(sceneRounds(scene)),
    backdropData: art.backdrop,
    sceneTileData: art.tileData,
    cast: packCast(scene.cast),
    animation: packAnimation(scene.animation, art),
    paletteSet: buildPaletteSet(scene.colors),
    backdropAttributes: encodeAttributeRuns(
      scene.backdrop.flatMap((row) =>
        Array.from(row).map((cell) => attributeOfCell(scene.colors, cell)),
      ),
    ),
  };
}

/** When the scene's kana rounds happen and what they ask */
export function sceneRounds(scene: Scene): readonly KanaCheckpoint[] {
  return planRounds(scene.cast, scene.dialogue, scene.kanaQuestions);
}

export function buildSceneData(): PackedScene[] {
  return SCENES.map(packScene);
}
