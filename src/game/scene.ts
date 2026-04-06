/**
 * Scene system — manages the 5 game locations and progression.
 *
 * Each scene has a location name, an icon, a GBC color palette,
 * a branching dialogue tree, and kana questions.
 */

import { type DialogueNode, buildDialogueTree } from './dialogue';
import { type KanaQuestion, buildKanaData } from './kana';
import { textToTiles } from './font';
import { SCENE_ICON_TILES } from './font-data';

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
// Scene 0: Train Station (えき)
//
// You've just arrived. The station attendant greets you and helps
// you find your way into town. Teaches: greetings, self-introduction,
// asking for directions.
// ---------------------------------------------------------------------------

const STATION_DIALOGUE: DialogueNode[] = [
  {
    // Node 0: Greeting
    text: 'こんにちは!',
    choices: [
      { text: 'こんにちは!', next: 1 },
      { text: 'はい...', next: 1, hint: 'こんにちは!' },
      { text: '...', next: 1, hint: 'こんにちは!' },
    ],
  },
  {
    // Node 1: How are you?
    text: 'おげんきですか?',
    choices: [
      { text: 'はい げんきです', next: 2 },
      { text: 'まあまあです', next: 2 },
      { text: 'つかれました', next: 3 },
    ],
  },
  {
    // Node 2: Good! Where are you going?
    text: 'いいですね! どこにいきますか?',
    choices: [
      { text: 'まちにいきます', next: 5 },
      { text: 'レストラン', next: 4 },
      { text: 'わかりません', next: 4, hint: 'まちです!' },
    ],
  },
  {
    // Node 3: Tired? That's too bad
    text: 'そうですか... だいじょうぶ?',
    choices: [
      { text: 'はい だいじょうぶ', next: 2 },
      { text: 'すこし', next: 2 },
      { text: 'みず ください', next: 6 },
    ],
  },
  {
    // Node 4: Town is that way
    text: 'まちはあちらです!',
    choices: [
      { text: 'ありがとう!', next: 5 },
      { text: 'どこですか?', next: 5, hint: 'あちらです!' },
      { text: 'すみません', next: 5 },
    ],
  },
  {
    // Node 5: Farewell
    text: 'いってらっしゃい!',
    choices: [
      { text: 'ありがとう!', next: null },
      { text: 'いってきます!', next: null },
      { text: 'さようなら', next: null },
    ],
  },
  {
    // Node 6: Water response
    text: 'はい どうぞ!',
    choices: [
      { text: 'ありがとう!', next: 2 },
      { text: 'すみません', next: 2 },
      { text: 'おいしい!', next: 2 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 1: Street (みち)
//
// Walking through town, someone stops you to ask for directions.
// You help them (or try to). Teaches: locations, directions,
// polite responses.
// ---------------------------------------------------------------------------

const STREET_DIALOGUE: DialogueNode[] = [
  {
    // Node 0: Excuse me!
    text: 'すみません!',
    choices: [
      { text: 'はい?', next: 1 },
      { text: 'なんですか?', next: 1 },
      { text: '...', next: 1, hint: 'はい?' },
    ],
  },
  {
    // Node 1: Where is the restaurant?
    text: 'レストランはどこですか?',
    choices: [
      { text: 'あちらです', next: 3 },
      { text: 'ちかいです', next: 3 },
      { text: 'わかりません', next: 2 },
    ],
  },
  {
    // Node 2: You don't know?
    text: 'そうですか... ほかのひとにききます',
    choices: [
      { text: 'すみません', next: 3 },
      { text: 'がんばって!', next: 3 },
      { text: 'さようなら', next: 3 },
    ],
  },
  {
    // Node 3: Thank you!
    text: 'ありがとうございます!',
    choices: [
      { text: 'どういたしまして', next: 4 },
      { text: 'いいえ', next: 4, hint: 'どういたしまして!' },
      { text: 'がんばって!', next: 4 },
    ],
  },
  {
    // Node 4: What's your name?
    text: 'おなまえは?',
    choices: [
      { text: 'カナネコです', next: 5 },
      { text: 'ひみつです', next: 5 },
      { text: 'あなたは?', next: 6 },
    ],
  },
  {
    // Node 5: Nice name, goodbye
    text: 'いいなまえですね! またね!',
    choices: [
      { text: 'またね!', next: null },
      { text: 'ありがとう!', next: null },
      { text: 'さようなら', next: null },
    ],
  },
  {
    // Node 6: I'm Tanaka
    text: 'わたしはたなかです!',
    choices: [
      { text: 'はじめまして!', next: 5 },
      { text: 'よろしく!', next: 5 },
      { text: 'いいなまえ!', next: 5 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 2: Restaurant (レストラン)
//
// Ordering food. The waiter takes your order and you decide what
// to eat and drink. Teaches: food vocabulary, ordering, expressing
// preferences.
// ---------------------------------------------------------------------------

const RESTAURANT_DIALOGUE: DialogueNode[] = [
  {
    // Node 0: Welcome!
    text: 'いらっしゃいませ!',
    choices: [
      { text: 'こんにちは!', next: 1 },
      { text: 'ひとりです', next: 1 },
      { text: '...', next: 1 },
    ],
  },
  {
    // Node 1: What would you like?
    text: 'なにをたべますか?',
    choices: [
      { text: 'ラーメン ください', next: 2 },
      { text: 'おちゃ ください', next: 3 },
      { text: 'おすすめは?', next: 4 },
    ],
  },
  {
    // Node 2: Ramen, got it
    text: 'ラーメンですね!',
    choices: [
      { text: 'はい!', next: 5 },
      { text: 'おおきい ください', next: 5 },
      { text: 'からい?', next: 5 },
    ],
  },
  {
    // Node 3: Tea, got it
    text: 'おちゃですね!',
    choices: [
      { text: 'はい', next: 5 },
      { text: 'あたたかい', next: 5 },
      { text: 'つめたい', next: 5 },
    ],
  },
  {
    // Node 4: Recommendation
    text: 'ラーメンがおすすめです!',
    choices: [
      { text: 'じゃあ ラーメン!', next: 2 },
      { text: 'おちゃも ください', next: 3 },
      { text: 'ほかには?', next: 2, hint: 'ラーメン!' },
    ],
  },
  {
    // Node 5: Please wait
    text: 'おまちください!',
    choices: [
      { text: 'はい', next: 6 },
      { text: 'たのしみです!', next: 6 },
      { text: 'ありがとう', next: 6 },
    ],
  },
  {
    // Node 6: How is it?
    text: 'おいしいですか?',
    choices: [
      { text: 'おいしい!', next: 7 },
      { text: 'まあまあ', next: 7 },
      { text: 'すごくおいしい!', next: 8 },
    ],
  },
  {
    // Node 7: Thanks for coming
    text: 'ありがとうございます!',
    choices: [
      { text: 'ごちそうさまでした', next: null },
      { text: 'ありがとう!', next: null },
      { text: 'またきます!', next: null },
    ],
  },
  {
    // Node 8: Amazing! Here's a bonus
    text: 'うれしいです! おちゃ どうぞ!',
    choices: [
      { text: 'ありがとう!', next: 7 },
      { text: 'やった!', next: 7 },
      { text: 'すみません!', next: 7 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 3: Convenience Store (コンビニ)
//
// Shopping at the konbini. Browse, ask prices, buy things.
// Teaches: shopping phrases, numbers, polite requests.
// ---------------------------------------------------------------------------

const CONBINI_DIALOGUE: DialogueNode[] = [
  {
    // Node 0: Welcome!
    text: 'いらっしゃいませ!',
    choices: [
      { text: 'こんにちは!', next: 1 },
      { text: 'これ ください', next: 2 },
      { text: 'みているだけ', next: 3 },
    ],
  },
  {
    // Node 1: Can I help you?
    text: 'なにかおさがしですか?',
    choices: [
      { text: 'おにぎり ある?', next: 4 },
      { text: 'みず ください', next: 2 },
      { text: 'だいじょうぶです', next: 3 },
    ],
  },
  {
    // Node 2: That'll be 100 yen
    text: 'ひゃくえんです',
    choices: [
      { text: 'はい', next: 5 },
      { text: 'たかい!', next: 5, hint: 'ひゃくえん!' },
      { text: 'やすい!', next: 5 },
    ],
  },
  {
    // Node 3: Take your time
    text: 'どうぞ ゆっくり!',
    choices: [
      { text: 'ありがとう', next: 0 },
      { text: 'すみません', next: 0 },
      { text: 'これ ください', next: 2 },
    ],
  },
  {
    // Node 4: Onigiri is over there
    text: 'おにぎりはあちらです!',
    choices: [
      { text: 'ありがとう!', next: 2 },
      { text: 'いくつ ある?', next: 2 },
      { text: 'おすすめは?', next: 2 },
    ],
  },
  {
    // Node 5: Thank you!
    text: 'ありがとうございます!',
    choices: [
      { text: 'ありがとう!', next: 6 },
      { text: 'どうも!', next: 6 },
      { text: 'またきます', next: 6 },
    ],
  },
  {
    // Node 6: Come again
    text: 'またおこしください!',
    choices: [
      { text: 'はい またね!', next: null },
      { text: 'さようなら!', next: null },
      { text: 'ありがとう!', next: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 4: Evening Park (こうえん)
//
// Relaxing in the park at sunset. Meet someone and have a
// deeper conversation. Teaches: time of day, feelings,
// self-expression, farewells.
// ---------------------------------------------------------------------------

const PARK_DIALOGUE: DialogueNode[] = [
  {
    // Node 0: Good evening!
    text: 'こんばんは!',
    choices: [
      { text: 'こんばんは!', next: 1 },
      { text: 'こんにちは', next: 1, hint: 'こんばんは!' },
      { text: 'きれいですね', next: 2 },
    ],
  },
  {
    // Node 1: Nice weather
    text: 'いいてんきですね!',
    choices: [
      { text: 'そうですね!', next: 3 },
      { text: 'きれいです', next: 2 },
      { text: 'すこしさむい', next: 3 },
    ],
  },
  {
    // Node 2: The sunset is beautiful
    text: 'ゆうやけがきれいですね!',
    choices: [
      { text: 'ほんとうに!', next: 3 },
      { text: 'すごい!', next: 3 },
      { text: 'しゃしん とりたい', next: 3 },
    ],
  },
  {
    // Node 3: What's your name?
    text: 'おなまえは?',
    choices: [
      { text: 'カナネコです', next: 4 },
      { text: 'ひみつです', next: 4 },
      { text: 'あなたは?', next: 5 },
    ],
  },
  {
    // Node 4: Did you enjoy today?
    text: 'きょうはたのしかったですか?',
    choices: [
      { text: 'はい たのしかった!', next: 6 },
      { text: 'とてもたのしい!', next: 7 },
      { text: 'まあまあです', next: 6 },
    ],
  },
  {
    // Node 5: I'm Sakura
    text: 'わたしはさくらです!',
    choices: [
      { text: 'はじめまして!', next: 4 },
      { text: 'よろしく!', next: 4 },
      { text: 'いいなまえ!', next: 4 },
    ],
  },
  {
    // Node 6: Let's meet again
    text: 'またあいましょう!',
    choices: [
      { text: 'またね!', next: null },
      { text: 'さようなら!', next: null },
      { text: 'たのしかった!', next: null },
    ],
  },
  {
    // Node 7: You learned a lot!
    text: 'にほんご じょうずですね!',
    choices: [
      { text: 'ありがとう!', next: 6 },
      { text: 'まだまだです', next: 6 },
      { text: 'がんばります!', next: 6 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene assembly
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
