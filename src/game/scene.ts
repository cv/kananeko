/**
 * Scene system — manages the 5 game locations and progression.
 *
 * Each scene has a location name, a branching dialogue tree, and kana questions.
 */

import { type DialogueNode, buildDialogueTree } from './dialogue';
import { type KanaQuestion, buildKanaData } from './kana';
import { textToTiles } from './font';

// ---------------------------------------------------------------------------
// Scene data types
// ---------------------------------------------------------------------------

export interface Scene {
  name: string;
  dialogue: DialogueNode[]; // branching tree — node 0 is the entry point
  kanaQuestions: KanaQuestion[];
}

// ---------------------------------------------------------------------------
// Game scenes with branching dialogue
// ---------------------------------------------------------------------------

export const SCENES: Scene[] = [
  // Scene 0: Train Station
  {
    name: 'えき',
    dialogue: [
      {
        // Node 0
        text: 'こんにちは!',
        choices: [
          { text: 'こんにちは', next: 1 },
          { text: '...', next: 1, hint: 'こんにちは!' },
        ],
      },
      {
        // Node 1
        text: 'おげんきですか?',
        choices: [
          { text: 'はい げんきです', next: 2 },
          { text: 'わかりません', next: 2, hint: 'げんき!' },
        ],
      },
      {
        // Node 2
        text: 'いってらっしゃい!',
        choices: [{ text: 'ありがとう', next: null }],
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
    dialogue: [
      {
        // Node 0
        text: 'すみません!',
        choices: [
          { text: 'はい?', next: 1 },
          { text: '...', next: 1, hint: 'はい!' },
        ],
      },
      {
        // Node 1
        text: 'レストランはどこですか?',
        choices: [
          { text: 'あちらです', next: 2 },
          { text: 'わかりません', next: 2 },
        ],
      },
      {
        // Node 2
        text: 'ありがとう!',
        choices: [
          { text: 'どういたしまして', next: null },
          { text: 'いいえ', next: null, hint: 'どういたしまして!' },
        ],
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
    dialogue: [
      {
        // Node 0
        text: 'いらっしゃいませ!',
        choices: [
          { text: 'こんにちは', next: 1 },
          { text: '...', next: 1 },
        ],
      },
      {
        // Node 1
        text: 'なにをたべますか?',
        choices: [
          { text: 'ラーメン ください', next: 2 },
          { text: 'おちゃ ください', next: 3 },
        ],
      },
      {
        // Node 2
        text: 'ラーメンですね!',
        choices: [{ text: 'はい', next: 4 }],
      },
      {
        // Node 3
        text: 'おちゃですね!',
        choices: [{ text: 'はい', next: 4 }],
      },
      {
        // Node 4
        text: 'おいしいですか?',
        choices: [
          { text: 'おいしい!', next: null },
          { text: 'まあまあ', next: null },
        ],
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
    dialogue: [
      {
        // Node 0
        text: 'いらっしゃいませ!',
        choices: [
          { text: 'これ ください', next: 1 },
          { text: 'みているだけ', next: 2 },
        ],
      },
      {
        // Node 1
        text: 'ひゃくえんです',
        choices: [
          { text: 'はい', next: 3 },
          { text: 'たかい!', next: 3, hint: 'ひゃくえん!' },
        ],
      },
      {
        // Node 2
        text: 'どうぞ ゆっくり!',
        choices: [{ text: 'ありがとう', next: 0 }],
      },
      {
        // Node 3
        text: 'ありがとうございます!',
        choices: [{ text: 'ありがとう', next: null }],
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
    dialogue: [
      {
        // Node 0
        text: 'こんばんは!',
        choices: [
          { text: 'こんばんは', next: 1 },
          { text: 'こんにちは', next: 1, hint: 'こんばんは!' },
        ],
      },
      {
        // Node 1
        text: 'おなまえは?',
        choices: [
          { text: 'カナネコです', next: 2 },
          { text: 'ひみつです', next: 2 },
        ],
      },
      {
        // Node 2
        text: 'たのしかったですか?',
        choices: [
          { text: 'たのしかった!', next: 3 },
          { text: 'まあまあです', next: 3 },
        ],
      },
      {
        // Node 3
        text: 'またあいましょう!',
        choices: [
          { text: 'またね!', next: null },
          { text: 'さようなら', next: null },
        ],
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
