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

export type Palette = [number, number, number, number];

export interface Scene {
  name: string;
  icon: [string, string];
  dialogue: DialogueNode[];
  kanaQuestions: KanaQuestion[];
  palette: Palette;
}

// ---------------------------------------------------------------------------
// Scene assembly — metadata, palettes, icons, kana questions
// ---------------------------------------------------------------------------

export const SCENES: Scene[] = [
  {
    name: 'えき',
    icon: [...SCENE_ICON_TILES.TRAIN],
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
        options: { up: 'こ', down: 'か', left: 'く', right: 'き' },
        correctDir: 'up',
      },
      {
        word: 'すみません',
        blankIndex: 1,
        options: { up: 'む', down: 'ま', left: 'み', right: 'め' },
        correctDir: 'left',
      },
      {
        word: 'おげんき',
        blankIndex: 2,
        options: { up: 'ん', down: 'な', left: 'に', right: 'ぬ' },
        correctDir: 'up',
      },
      {
        word: 'ありがとう',
        blankIndex: 0,
        options: { up: 'い', down: 'う', left: 'え', right: 'あ' },
        correctDir: 'right',
      },
      {
        word: 'げんき',
        blankIndex: 1,
        options: { up: 'ん', down: 'に', left: 'ね', right: 'な' },
        correctDir: 'up',
      },
    ],
  },
  {
    name: 'みち',
    icon: [...SCENE_ICON_TILES.HOUSE],
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
        options: { up: 'ナ', down: 'ニ', left: 'ヌ', right: 'ン' },
        correctDir: 'right',
      },
      {
        word: 'コンビニ',
        blankIndex: 0,
        options: { up: 'カ', down: 'キ', left: 'コ', right: 'ク' },
        correctDir: 'left',
      },
      {
        word: 'あちら',
        blankIndex: 1,
        options: { up: 'た', down: 'ち', left: 'つ', right: 'て' },
        correctDir: 'down',
      },
      {
        word: 'どこ',
        blankIndex: 0,
        options: { up: 'ど', down: 'だ', left: 'で', right: 'づ' },
        correctDir: 'up',
      },
      {
        word: 'ありがとう',
        blankIndex: 3,
        options: { up: 'た', down: 'と', left: 'つ', right: 'て' },
        correctDir: 'down',
      },
    ],
  },
  {
    name: 'レストラン',
    icon: [...SCENE_ICON_TILES.BOWL],
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
        options: { up: 'リ', down: 'ラ', left: 'ル', right: 'レ' },
        correctDir: 'down',
      },
      {
        word: 'おちゃ',
        blankIndex: 1,
        options: { up: 'ち', down: 'た', left: 'つ', right: 'て' },
        correctDir: 'up',
      },
      {
        word: 'ください',
        blankIndex: 2,
        options: { up: 'さ', down: 'だ', left: 'た', right: 'な' },
        correctDir: 'up',
      },
      {
        word: 'たべます',
        blankIndex: 0,
        options: { up: 'な', down: 'た', left: 'だ', right: 'か' },
        correctDir: 'down',
      },
      {
        word: 'おいしい',
        blankIndex: 2,
        options: { up: 'さ', down: 'し', left: 'す', right: 'せ' },
        correctDir: 'down',
      },
    ],
  },
  {
    name: 'コンビニ',
    icon: [...SCENE_ICON_TILES.SHOP],
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
        options: { up: 'き', down: 'く', left: 'け', right: 'か' },
        correctDir: 'down',
      },
      {
        word: 'ありがとう',
        blankIndex: 2,
        options: { up: 'き', down: 'が', left: 'ぎ', right: 'ぐ' },
        correctDir: 'down',
      },
      {
        word: 'いらっしゃい',
        blankIndex: 0,
        options: { up: 'う', down: 'い', left: 'え', right: 'あ' },
        correctDir: 'down',
      },
      {
        word: 'ひゃくえん',
        blankIndex: 3,
        options: { up: 'え', down: 'あ', left: 'い', right: 'お' },
        correctDir: 'up',
      },
      {
        word: 'どうぞ',
        blankIndex: 2,
        options: { up: 'ざ', down: 'ぞ', left: 'ず', right: 'ぜ' },
        correctDir: 'down',
      },
    ],
  },
  {
    name: 'こうえん',
    icon: [...SCENE_ICON_TILES.TREE],
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
        options: { up: 'な', down: 'に', left: 'ぬ', right: 'ね' },
        correctDir: 'up',
      },
      {
        word: 'おはよう',
        blankIndex: 0,
        options: { up: 'あ', down: 'い', left: 'う', right: 'お' },
        correctDir: 'right',
      },
      {
        word: 'こんばんは',
        blankIndex: 2,
        options: { up: 'ぱ', down: 'ば', left: 'び', right: 'べ' },
        correctDir: 'down',
      },
      {
        word: 'おなまえ',
        blankIndex: 1,
        options: { up: 'に', down: 'な', left: 'ぬ', right: 'ね' },
        correctDir: 'down',
      },
      {
        word: 'たのしい',
        blankIndex: 1,
        options: { up: 'な', down: 'の', left: 'に', right: 'ぬ' },
        correctDir: 'down',
      },
    ],
  },
];

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
      const pad = Math.floor((20 - nameTiles.length) / 2);
      const nameRow = [...Array<number>(pad).fill(0), ...nameTiles];

      const dialogueData = buildDialogueTree(scene.dialogue);
      const kanaData = buildKanaData(scene.kanaQuestions);

      return { nameRow, dialogueData, kanaData };
    }),
  };
}
