/**
 * Scene system — manages the 5 game locations and progression.
 *
 * Dialogue content lives in src/game/scenes/*.ts (one file per location).
 * This file assembles scenes with their metadata, palettes, icons, and kana questions.
 */

import { type DialogueNode, buildDialogueTree } from './dialogue';
import { type KanaQuestion, buildKanaData, defineKanaQuestion } from './kana';
import { textToTiles } from './font';
import { SCENE_ICON_TILES } from './font-data';
import { type Pair, type Quad, type Quint } from './fixed';
import { centerStartCol } from './tilemap';
import { STATION_DIALOGUE } from './scenes/station';
import { STREET_DIALOGUE } from './scenes/street';
import { RESTAURANT_DIALOGUE } from './scenes/restaurant';
import { CONBINI_DIALOGUE } from './scenes/conbini';
import { PARK_DIALOGUE } from './scenes/park';

// ---------------------------------------------------------------------------
// Scene data types
// ---------------------------------------------------------------------------

/** GBC RGB555 color: (r5) | (g5 << 5) | (b5 << 10). Pass 8-bit RGB, auto-truncated. */
export function rgb(r: number, g: number, b: number): number {
  return ((r >> 3) & 0x1f) | (((g >> 3) & 0x1f) << 5) | (((b >> 3) & 0x1f) << 10);
}

export type Palette = Quad<number>;
export type KanaRound = Quint<KanaQuestion>;

export interface Scene {
  readonly name: string;
  readonly icon: Pair<string>;
  readonly dialogue: readonly DialogueNode[];
  readonly kanaQuestions: KanaRound;
  readonly palette: Palette;
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
    palette: [
      rgb(0xe8, 0xe8, 0xe0),
      rgb(0xb0, 0xb0, 0xa0),
      rgb(0x60, 0x60, 0x58),
      rgb(0x18, 0x18, 0x18),
    ],
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
    palette: [
      rgb(0xf0, 0xf0, 0xc0),
      rgb(0xc0, 0xd0, 0x80),
      rgb(0x60, 0x80, 0x30),
      rgb(0x18, 0x30, 0x10),
    ],
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
    palette: [
      rgb(0xf0, 0xe0, 0xd0),
      rgb(0xd0, 0xa0, 0x80),
      rgb(0x80, 0x50, 0x30),
      rgb(0x30, 0x18, 0x10),
    ],
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
    palette: [
      rgb(0xf0, 0xf0, 0xf0),
      rgb(0xa0, 0xc0, 0xe0),
      rgb(0x40, 0x60, 0xa0),
      rgb(0x10, 0x10, 0x30),
    ],
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
    palette: [
      rgb(0xd0, 0xc0, 0xe0),
      rgb(0x80, 0x70, 0xb0),
      rgb(0x40, 0x30, 0x60),
      rgb(0x10, 0x10, 0x28),
    ],
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

export interface PackedSceneData {
  scenes: Array<{
    nameRow: number[];
    dialogueData: Uint8Array;
    kanaData: Uint8Array;
  }>;
}

export function buildSceneData(): PackedSceneData {
  return {
    scenes: SCENES.map((scene) => {
      const nameTiles = textToTiles(scene.name);
      const pad = centerStartCol(nameTiles.length);
      const nameRow = [...Array<number>(pad).fill(0), ...nameTiles];

      const dialogueData = buildDialogueTree(scene.dialogue);
      const kanaData = buildKanaData(scene.kanaQuestions);

      return { nameRow, dialogueData, kanaData };
    }),
  };
}
