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
// Scene 0: Train Station (えき) — 10 nodes, hiragana only
//
// You've just arrived. The station attendant greets you and helps
// you find your way into town. Teaches: greetings, feelings,
// directions, self-introduction.
// ---------------------------------------------------------------------------

// Tree: 0→1→{2,3}→4→5→6→7→8→9→END
// Branch at node 1: choice 0→node 2 (げんき path), choice 2→node 3 (つかれた path)
// Paths rejoin at node 4
const STATION_DIALOGUE: DialogueNode[] = [
  {
    // Node 0: あいさつ
    text: 'こんにちは!',
    choices: [
      { text: 'こんにちは!', next: 1 },
      { text: 'はい...', next: 1, hint: 'こんにちは!' },
      { text: '...', next: 1, hint: 'こんにちは!' },
    ],
  },
  {
    // Node 1: おげんきですか
    text: 'おげんきですか?',
    choices: [
      { text: 'げんきです!', next: 2 },
      { text: 'まあまあです', next: 2 },
      { text: 'つかれました', next: 3 },
    ],
  },
  {
    // Node 2: げんき path
    text: 'いいですね!',
    choices: [
      { text: 'はい!', next: 4 },
      { text: 'ありがとう', next: 4 },
      { text: 'きょうもげんき', next: 4 },
    ],
  },
  {
    // Node 3: つかれた path
    text: 'だいじょうぶですか?',
    choices: [
      { text: 'だいじょうぶです', next: 4 },
      { text: 'すこしだけ', next: 4 },
      { text: 'みず ください', next: 4, hint: 'みずはいいですね' },
    ],
  },
  {
    // Node 4: どこにいきますか (converge)
    text: 'どこにいきますか?',
    choices: [
      { text: 'まちにいきます', next: 5 },
      { text: 'えきはどこ?', next: 5, hint: 'ここがえきです!' },
      { text: 'わかりません', next: 5, hint: 'まちがいいですよ' },
    ],
  },
  {
    // Node 5: みちをおしえる
    text: 'まちはあちらです!',
    choices: [
      { text: 'ありがとう!', next: 6 },
      { text: 'みぎですか?', next: 6, hint: 'あちらです!' },
      { text: 'ひだりですか?', next: 6, hint: 'あちらです!' },
    ],
  },
  {
    // Node 6: もうひとつ
    text: 'おなまえは?',
    choices: [
      { text: 'カナネコです', next: 7 },
      { text: 'ひみつです', next: 7 },
      { text: 'あなたは?', next: 8 },
    ],
  },
  {
    // Node 7: いいなまえですね
    text: 'いいなまえですね!',
    choices: [
      { text: 'ありがとう!', next: 9 },
      { text: 'そうですか?', next: 9 },
      { text: 'えへへ', next: 9 },
    ],
  },
  {
    // Node 8: わたしはたなかです
    text: 'たなかです! よろしく!',
    choices: [
      { text: 'はじめまして!', next: 7 },
      { text: 'よろしく!', next: 7 },
      { text: 'いいなまえ!', next: 7 },
    ],
  },
  {
    // Node 9: さようなら
    text: 'いってらっしゃい!',
    choices: [
      { text: 'いってきます!', next: null },
      { text: 'ありがとう!', next: null },
      { text: 'さようなら!', next: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 1: Street (みち) — 10 nodes, hiragana + katakana signs
//
// Walking through town, someone stops you to ask for directions.
// You help them (or try to). Teaches: locations, directions,
// polite responses, introductions.
// ---------------------------------------------------------------------------

// Tree: 0→1→{2,3}→4→5→6→7→8→9→END
// Branch at node 1: choice 0→node 2 (みちをしる path), choice 2→node 3 (わからない path)
// Paths rejoin at node 4
const STREET_DIALOGUE: DialogueNode[] = [
  {
    // Node 0: すみません
    text: 'すみません!',
    choices: [
      { text: 'はい?', next: 1 },
      { text: 'なんですか?', next: 1 },
      { text: '...', next: 1, hint: 'はい がいいですよ' },
    ],
  },
  {
    // Node 1: レストランはどこ
    text: 'レストランはどこ?',
    choices: [
      { text: 'あちらです!', next: 2 },
      { text: 'ちかいですよ', next: 2 },
      { text: 'わかりません', next: 3 },
    ],
  },
  {
    // Node 2: みちをしる path - おしえてくれる
    text: 'ほんとうですか?',
    choices: [
      { text: 'まっすぐいって', next: 4 },
      { text: 'みぎにまがって', next: 4 },
      { text: 'ひだりですよ', next: 4 },
    ],
  },
  {
    // Node 3: わからない path
    text: 'そうですか...',
    choices: [
      { text: 'すみません', next: 4 },
      { text: 'がんばって!', next: 4 },
      { text: 'コンビニできく?', next: 4, hint: 'いいですね!' },
    ],
  },
  {
    // Node 4: ありがとう (converge)
    text: 'ありがとうございます!',
    choices: [
      { text: 'どういたしまして', next: 5 },
      { text: 'いいえ', next: 5, hint: 'どういたしまして!' },
      { text: 'がんばって!', next: 5 },
    ],
  },
  {
    // Node 5: じこしょうかい
    text: 'おなまえは?',
    choices: [
      { text: 'カナネコです', next: 6 },
      { text: 'ひみつです', next: 6 },
      { text: 'あなたは?', next: 7 },
    ],
  },
  {
    // Node 6: いいなまえですね
    text: 'いいなまえですね!',
    choices: [
      { text: 'ありがとう!', next: 8 },
      { text: 'そうですか?', next: 8 },
      { text: 'えへへ', next: 8 },
    ],
  },
  {
    // Node 7: わたしはさくらです
    text: 'さくらです!',
    choices: [
      { text: 'はじめまして!', next: 6 },
      { text: 'よろしく!', next: 6 },
      { text: 'いいなまえ!', next: 6 },
    ],
  },
  {
    // Node 8: どこからきた
    text: 'どこからきましたか?',
    choices: [
      { text: 'とおいまちから', next: 9 },
      { text: 'えきから', next: 9 },
      { text: 'ひみつです!', next: 9 },
    ],
  },
  {
    // Node 9: さようなら
    text: 'たのしいたびを!',
    choices: [
      { text: 'ありがとう!', next: null },
      { text: 'またね!', next: null },
      { text: 'さようなら!', next: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 2: Restaurant (レストラン) — 12 nodes, katakana food + hiragana
//
// Ordering food. The waiter takes your order and you decide what
// to eat and drink. Teaches: food vocabulary, adjectives (あつい,
// からい, つめたい, あまい), ordering phrases.
// ---------------------------------------------------------------------------

// Tree: 0→1→{2,3}→4→5→6→{7,8}→9→10→11→END
// Branch at node 1: choice 0→node 2 (ラーメン path), choice 1→node 3 (おちゃ path)
// Paths rejoin at node 4
// Branch at node 6: choice 0→node 7 (あつい/からい), choice 1→node 8 (つめたい/あまい)
// Paths rejoin at node 9
const RESTAURANT_DIALOGUE: DialogueNode[] = [
  {
    // Node 0: いらっしゃいませ
    text: 'いらっしゃいませ!',
    choices: [
      { text: 'こんにちは!', next: 1 },
      { text: 'ひとりです', next: 1 },
      { text: '...', next: 1, hint: 'こんにちは!' },
    ],
  },
  {
    // Node 1: なにをたべますか - branch
    text: 'なにがいいですか?',
    choices: [
      { text: 'ラーメン ください', next: 2 },
      { text: 'おちゃ ください', next: 3 },
      { text: 'おすすめは?', next: 2, hint: 'ラーメンがおすすめ' },
    ],
  },
  {
    // Node 2: ラーメン path
    text: 'ラーメンですね!',
    choices: [
      { text: 'はい!', next: 4 },
      { text: 'おおきいの!', next: 4 },
      { text: 'からいの?', next: 4, hint: 'すこしからいです' },
    ],
  },
  {
    // Node 3: おちゃ path
    text: 'おちゃですね!',
    choices: [
      { text: 'はい おねがい', next: 4 },
      { text: 'あたたかいの?', next: 4, hint: 'あたたかいですよ' },
      { text: 'つめたいの?', next: 4, hint: 'つめたいもある' },
    ],
  },
  {
    // Node 4: おまちください (converge)
    text: 'おまちください!',
    choices: [
      { text: 'はい!', next: 5 },
      { text: 'たのしみです!', next: 5 },
      { text: 'ありがとう', next: 5 },
    ],
  },
  {
    // Node 5: どうぞ
    text: 'おまたせしました!',
    choices: [
      { text: 'ありがとう!', next: 6 },
      { text: 'おいしそう!', next: 6 },
      { text: 'いいにおい!', next: 6 },
    ],
  },
  {
    // Node 6: おいしいですか - branch
    text: 'おあじはどうですか?',
    choices: [
      { text: 'あつくておいしい', next: 7 },
      { text: 'つめたくてあまい', next: 8 },
      { text: 'からい!', next: 7, hint: 'みずをどうぞ' },
    ],
  },
  {
    // Node 7: あつい/からい path
    text: 'あついのがすき?',
    choices: [
      { text: 'だいすきです!', next: 9 },
      { text: 'すこしからい', next: 9, hint: 'みずをどうぞ' },
      { text: 'おいしいです!', next: 9 },
    ],
  },
  {
    // Node 8: つめたい/あまい path
    text: 'あまいのがすき?',
    choices: [
      { text: 'だいすきです!', next: 9 },
      { text: 'すこしあまい', next: 9 },
      { text: 'おいしいです!', next: 9 },
    ],
  },
  {
    // Node 9: もういっぱい? (converge)
    text: 'おかわりは?',
    choices: [
      { text: 'おなかいっぱい', next: 10 },
      { text: 'もうひとつ!', next: 10 },
      { text: 'みず ください', next: 10 },
    ],
  },
  {
    // Node 10: おかいけい
    text: 'おかいけいですね',
    choices: [
      { text: 'はい おねがい', next: 11 },
      { text: 'いくらですか?', next: 11, hint: 'ごひゃくえんです' },
      { text: 'ありがとう', next: 11 },
    ],
  },
  {
    // Node 11: さようなら
    text: 'ありがとうございます!',
    choices: [
      { text: 'ごちそうさま!', next: null },
      { text: 'おいしかった!', next: null },
      { text: 'またきます!', next: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 3: Convenience Store (コンビニ) — 10 nodes, mixed + numbers
//
// Shopping at the konbini. Browse, ask prices, buy things.
// Teaches: shopping phrases, numbers (ひゃくえん, にひゃくえん),
// polite requests, katakana items.
// ---------------------------------------------------------------------------

// Tree: 0→1→{2,3}→4→5→6→7→8→9→END
// Branch at node 1: choice 0→node 2 (かいもの path), choice 2→node 3 (みるだけ path)
// Paths rejoin at node 4
const CONBINI_DIALOGUE: DialogueNode[] = [
  {
    // Node 0: いらっしゃいませ
    text: 'いらっしゃいませ!',
    choices: [
      { text: 'こんにちは!', next: 1 },
      { text: 'すみません', next: 1 },
      { text: '...', next: 1, hint: 'こんにちは!' },
    ],
  },
  {
    // Node 1: なにかおさがし? - branch
    text: 'なにかおさがしですか?',
    choices: [
      { text: 'おにぎり ある?', next: 2 },
      { text: 'おかし ある?', next: 2 },
      { text: 'みているだけ', next: 3 },
    ],
  },
  {
    // Node 2: かいもの path
    text: 'あちらにあります!',
    choices: [
      { text: 'ありがとう!', next: 4 },
      { text: 'いくらですか?', next: 4, hint: 'ひゃくえんです' },
      { text: 'おすすめは?', next: 4 },
    ],
  },
  {
    // Node 3: みるだけ path
    text: 'どうぞ ゆっくり!',
    choices: [
      { text: 'ありがとう', next: 4 },
      { text: 'すみません', next: 4 },
      { text: 'いいおみせ!', next: 4 },
    ],
  },
  {
    // Node 4: これ ください (converge)
    text: 'これにしますか?',
    choices: [
      { text: 'はい ください', next: 5 },
      { text: 'ほかにもある?', next: 5, hint: 'たくさんあります' },
      { text: 'やめます', next: 5, hint: 'ざんねんです!' },
    ],
  },
  {
    // Node 5: おかいけい
    text: 'ひゃくえんです!',
    choices: [
      { text: 'はい どうぞ', next: 6 },
      { text: 'やすいですね!', next: 6 },
      { text: 'たかい!', next: 6, hint: 'ひゃくえんです!' },
    ],
  },
  {
    // Node 6: にひゃくえん?
    text: 'もうひとつどうですか?',
    choices: [
      { text: 'いいですね!', next: 7 },
      { text: 'おなかいっぱい', next: 7 },
      { text: 'にひゃくえん?', next: 7, hint: 'はい そうです' },
    ],
  },
  {
    // Node 7: ありがとうございます
    text: 'ありがとうございます!',
    choices: [
      { text: 'ありがとう!', next: 8 },
      { text: 'どうも!', next: 8 },
      { text: 'おいしそう!', next: 8 },
    ],
  },
  {
    // Node 8: レシートは?
    text: 'レシートはいりますか?',
    choices: [
      { text: 'だいじょうぶです', next: 9 },
      { text: 'はい ください', next: 9 },
      { text: 'レシート?', next: 9, hint: 'かみのことです' },
    ],
  },
  {
    // Node 9: さようなら
    text: 'またおこしください!',
    choices: [
      { text: 'はい またね!', next: null },
      { text: 'さようなら!', next: null },
      { text: 'ありがとう!', next: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 4: Evening Park (こうえん) — 12 nodes, everything
//
// Relaxing in the park at evening. Meet someone and have a
// deeper conversation. Teaches: time of day, weather, feelings
// (たのしい, うれしい, さびしい), farewells.
// ---------------------------------------------------------------------------

// Tree: 0→1→2→{3,4}→5→6→7→{8,9}→10→11→END
// Branch at node 2: choice 0→node 3 (きょうのこと path), choice 1→node 4 (てんき path)
// Paths rejoin at node 5
// Branch at node 7: choice 0→node 8 (たのしい/うれしい), choice 1→node 9 (さびしい)
// Paths rejoin at node 10
const PARK_DIALOGUE: DialogueNode[] = [
  {
    // Node 0: こんばんは
    text: 'こんばんは!',
    choices: [
      { text: 'こんばんは!', next: 1 },
      { text: 'こんにちは', next: 1, hint: 'よるはこんばんは' },
      { text: 'やあ!', next: 1 },
    ],
  },
  {
    // Node 1: いいよるですね
    text: 'いいよるですね!',
    choices: [
      { text: 'そうですね!', next: 2 },
      { text: 'すずしいですね', next: 2 },
      { text: 'さむいですね', next: 2 },
    ],
  },
  {
    // Node 2: なにをはなす? - branch
    text: 'なにをはなしますか?',
    choices: [
      { text: 'きょうのこと', next: 3 },
      { text: 'おてんきのこと', next: 4 },
      { text: 'なんでもいい!', next: 3 },
    ],
  },
  {
    // Node 3: きょうのこと path
    text: 'きょうなにをした?',
    choices: [
      { text: 'まちをあるいた', next: 5 },
      { text: 'ごはんをたべた', next: 5 },
      { text: 'かいものをした', next: 5 },
    ],
  },
  {
    // Node 4: てんき path
    text: 'きょうのてんきは?',
    choices: [
      { text: 'あたたかかった', next: 5 },
      { text: 'すずしかった', next: 5 },
      { text: 'さむかった', next: 5 },
    ],
  },
  {
    // Node 5: そうですか (converge)
    text: 'いいですね!',
    choices: [
      { text: 'そうですね!', next: 6 },
      { text: 'ありがとう', next: 6 },
      { text: 'あなたは?', next: 6 },
    ],
  },
  {
    // Node 6: おなまえは
    text: 'おなまえは?',
    choices: [
      { text: 'カナネコです', next: 7 },
      { text: 'ひみつです', next: 7 },
      { text: 'あなたは?', next: 7 },
    ],
  },
  {
    // Node 7: たびはどうですか - branch
    text: 'たびはどうですか?',
    choices: [
      { text: 'たのしいです!', next: 8 },
      { text: 'さびしいです', next: 9 },
      { text: 'うれしいです!', next: 8 },
    ],
  },
  {
    // Node 8: たのしい/うれしい path
    text: 'それはよかった!',
    choices: [
      { text: 'とてもうれしい!', next: 10 },
      { text: 'にほんがすき!', next: 10 },
      { text: 'ありがとう!', next: 10 },
    ],
  },
  {
    // Node 9: さびしい path
    text: 'さびしいですか...',
    choices: [
      { text: 'ともだちがほしい', next: 10 },
      { text: 'でもたのしい!', next: 10 },
      { text: 'だいじょうぶ!', next: 10 },
    ],
  },
  {
    // Node 10: ともだち (converge)
    text: 'ともだちになろう!',
    choices: [
      { text: 'はい! うれしい!', next: 11 },
      { text: 'ほんとうに?', next: 11 },
      { text: 'ありがとう!', next: 11 },
    ],
  },
  {
    // Node 11: さようなら
    text: 'またあいましょう!',
    choices: [
      { text: 'またね!', next: null },
      { text: 'さようなら!', next: null },
      { text: 'たのしかった!', next: null },
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
