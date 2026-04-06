/**
 * Scene system — manages the 5 game locations and progression.
 *
 * Each scene has:
 * - A location name displayed at the top
 * - A set of dialogue entries (NPC conversation)
 * - A set of kana questions (mini-game)
 * - A completion bit that gates the next scene
 */

import { type DialogueEntry, buildDialogueData } from './dialogue';
import { type KanaQuestion, buildKanaData } from './kana';
import { textToTiles } from './font';

// ---------------------------------------------------------------------------
// Scene data types
// ---------------------------------------------------------------------------

export interface Scene {
  name: string;
  dialogues: DialogueEntry[];
  kanaQuestions: KanaQuestion[];
}

// ---------------------------------------------------------------------------
// Game scenes
// ---------------------------------------------------------------------------

export const SCENES: Scene[] = [
  // Scene 0: Train Station
  {
    name: 'えき',
    dialogues: [
      {
        text: 'こんにちは!',
        choices: ['こんにちは', 'さようなら'],
      },
      {
        text: 'おげんきですか?',
        choices: ['はい げんきです', 'いいえ'],
      },
    ],
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
    ],
  },

  // Scene 1: Street
  {
    name: 'みち',
    dialogues: [
      {
        text: 'どこにいきますか?',
        choices: ['レストラン', 'コンビニ'],
      },
    ],
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
    ],
  },

  // Scene 2: Restaurant
  {
    name: 'レストラン',
    dialogues: [
      {
        text: 'なにをたべますか?',
        choices: ['ラーメン', 'おちゃ'],
      },
      {
        text: 'おいしいですか?',
        choices: ['はい おいしい', 'まあまあ'],
      },
    ],
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
    ],
  },

  // Scene 3: Convenience Store
  {
    name: 'コンビニ',
    dialogues: [
      {
        text: 'いらっしゃいませ!',
        choices: ['これ ください', 'みているだけ'],
      },
      {
        text: 'ひゃくえんです',
        choices: ['はい', 'たかい!'],
      },
    ],
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
    ],
  },

  // Scene 4: Evening Park
  {
    name: 'こうえん',
    dialogues: [
      {
        text: 'おなまえは?',
        choices: ['わたしは..です', 'ひみつです'],
      },
      {
        text: 'たのしかったです!',
        choices: ['またね', 'さようなら'],
      },
    ],
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
    ],
  },
];

// ---------------------------------------------------------------------------
// Build packed scene data for ROM
// ---------------------------------------------------------------------------

export interface PackedSceneData {
  /** Per-scene: { nameRow, dialogueOffset, kanaOffset } */
  scenes: Array<{
    nameRow: number[]; // tile indices for the location name (centered in 20 cols)
    dialogueData: Uint8Array;
    kanaData: Uint8Array;
  }>;
}

export function buildSceneData(): PackedSceneData {
  return {
    scenes: SCENES.map((scene) => {
      const nameTiles = textToTiles(scene.name);
      // Center the name in 20 columns
      const pad = Math.floor((20 - nameTiles.length) / 2);
      const nameRow = [...Array<number>(pad).fill(0), ...nameTiles];

      const { data: dialogueData } = buildDialogueData(scene.dialogues);
      const kanaData = buildKanaData(scene.kanaQuestions);

      return { nameRow, dialogueData, kanaData };
    }),
  };
}
