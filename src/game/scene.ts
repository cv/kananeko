/**
 * Scene system — manages the 5 game locations and progression.
 *
 * Dialogue content lives in src/game/scenes/*.ts (one file per location).
 * This file assembles scenes with their metadata, palettes, icons, and kana questions.
 */

import { type DialogueNode, buildDialogueTree } from './dialogue';
import { type KanaQuestion, buildKanaData } from './kana';
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
      {
        word: 'こんにちは',
        blankIndex: 0,
        correct: 'こ',
        distractors: ['か', 'く', 'き'],
      },
      {
        word: 'すみません',
        blankIndex: 1,
        correct: 'み',
        distractors: ['む', 'ま', 'め'],
      },
      {
        word: 'おげんき',
        blankIndex: 2,
        correct: 'ん',
        distractors: ['な', 'に', 'ぬ'],
      },
      {
        word: 'ありがとう',
        blankIndex: 0,
        correct: 'あ',
        distractors: ['い', 'う', 'え'],
      },
      {
        word: 'げんき',
        blankIndex: 1,
        correct: 'ん',
        distractors: ['に', 'ね', 'な'],
      },
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
      {
        word: 'レストラン',
        blankIndex: 4,
        correct: 'ン',
        distractors: ['ナ', 'ニ', 'ヌ'],
      },
      {
        word: 'コンビニ',
        blankIndex: 0,
        correct: 'コ',
        distractors: ['カ', 'キ', 'ク'],
      },
      {
        word: 'あちら',
        blankIndex: 1,
        correct: 'ち',
        distractors: ['た', 'つ', 'て'],
      },
      {
        word: 'どこ',
        blankIndex: 0,
        correct: 'ど',
        distractors: ['だ', 'で', 'づ'],
      },
      {
        word: 'ありがとう',
        blankIndex: 3,
        correct: 'と',
        distractors: ['た', 'つ', 'て'],
      },
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
      {
        word: 'ラーメン',
        blankIndex: 0,
        correct: 'ラ',
        distractors: ['リ', 'ル', 'レ'],
      },
      {
        word: 'おちゃ',
        blankIndex: 1,
        correct: 'ち',
        distractors: ['た', 'つ', 'て'],
      },
      {
        word: 'ください',
        blankIndex: 2,
        correct: 'さ',
        distractors: ['だ', 'た', 'な'],
      },
      {
        word: 'たべます',
        blankIndex: 0,
        correct: 'た',
        distractors: ['な', 'だ', 'か'],
      },
      {
        word: 'おいしい',
        blankIndex: 2,
        correct: 'し',
        distractors: ['さ', 'す', 'せ'],
      },
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
      {
        word: 'ください',
        blankIndex: 0,
        correct: 'く',
        distractors: ['き', 'け', 'か'],
      },
      {
        word: 'ありがとう',
        blankIndex: 2,
        correct: 'が',
        distractors: ['き', 'ぎ', 'ぐ'],
      },
      {
        word: 'いらっしゃい',
        blankIndex: 0,
        correct: 'い',
        distractors: ['う', 'え', 'あ'],
      },
      {
        word: 'ひゃくえん',
        blankIndex: 3,
        correct: 'え',
        distractors: ['あ', 'い', 'お'],
      },
      {
        word: 'どうぞ',
        blankIndex: 2,
        correct: 'ぞ',
        distractors: ['ざ', 'ず', 'ぜ'],
      },
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
      {
        word: 'さようなら',
        blankIndex: 3,
        correct: 'な',
        distractors: ['に', 'ぬ', 'ね'],
      },
      {
        word: 'おはよう',
        blankIndex: 0,
        correct: 'お',
        distractors: ['あ', 'い', 'う'],
      },
      {
        word: 'こんばんは',
        blankIndex: 2,
        correct: 'ば',
        distractors: ['ぱ', 'び', 'べ'],
      },
      {
        word: 'おなまえ',
        blankIndex: 1,
        correct: 'な',
        distractors: ['に', 'ぬ', 'ね'],
      },
      {
        word: 'たのしい',
        blankIndex: 1,
        correct: 'の',
        distractors: ['な', 'に', 'ぬ'],
      },
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
