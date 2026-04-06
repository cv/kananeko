import { type DialogueNode } from '../dialogue';

// ---------------------------------------------------------------------------

export const CONBINI_DIALOGUE: DialogueNode[] = [
  // --- NPC 1: Store clerk ---
  {
    // 0
    text: 'いらっしゃいませ!',
    choices: [
      { text: 'こんにちは!', next: 1 },
      { text: 'すみません', next: 1 },
      { text: '...', next: 1, hint: 'こんにちは!' },
    ],
  },
  {
    // 1: what looking for
    text: 'なにかおさがし?',
    choices: [
      { text: 'おにぎり ある?', next: 2 },
      { text: 'おかし ある?', next: 3 },
      { text: 'みているだけ', next: 4 },
    ],
  },
  {
    // 2: おにぎり path
    text: 'おにぎり あちらです!',
    choices: [
      { text: 'ありがとう!', next: 5 },
      { text: 'いくらですか?', next: 6 },
      { text: 'おすすめは?', next: 5 },
    ],
  },
  {
    // 3: おかし path
    text: 'おかしはこちら!',
    choices: [
      { text: 'ありがとう!', next: 5 },
      { text: 'いくらですか?', next: 7 },
      { text: 'ガムある?', next: 5, hint: 'はい あります!' },
    ],
  },
  {
    // 4: みるだけ path
    text: 'どうぞ ゆっくり!',
    choices: [
      { text: 'ありがとう', next: 5 },
      { text: 'すみません', next: 5 },
      { text: 'いいおみせ!', next: 5 },
    ],
  },
  {
    // 5: converge - browse
    text: 'これにしますか?',
    choices: [
      { text: 'はい ください', next: 8 },
      { text: 'ほかにもある?', next: 9 },
      { text: 'パンもほしい', next: 10 },
    ],
  },
  {
    // 6: おにぎり price
    text: 'ひゃくえんです!',
    choices: [
      { text: 'やすい!', next: 5 },
      { text: 'はい ください', next: 8 },
      { text: 'ちょっとたかい', next: 5, hint: 'やすいですよ!' },
    ],
  },
  {
    // 7: おかし price
    text: 'にひゃくえんです!',
    choices: [
      { text: 'はい ください', next: 8 },
      { text: 'やすい!', next: 5 },
      { text: 'たかい!', next: 5, hint: 'おいしいですよ' },
    ],
  },
  {
    // 8: buying
    text: 'いいですね!',
    choices: [
      { text: 'ありがとう!', next: 11 },
      { text: 'おいしそう!', next: 11 },
      { text: 'たのしみ!', next: 11 },
    ],
  },
  {
    // 9: ほかにもある
    text: 'パンもあります!',
    choices: [
      { text: 'パン ください', next: 10 },
      { text: 'いいですね', next: 8 },
      { text: 'だいじょうぶです', next: 8 },
    ],
  },
  {
    // 10: パン
    text: 'パン にひゃくえん!',
    choices: [
      { text: 'はい ください', next: 11 },
      { text: 'おいしそう!', next: 11 },
      { text: 'やすい!', next: 11 },
    ],
  },
  {
    // 11: のみもの
    text: 'のみものもどう?',
    choices: [
      { text: 'ジュース ください', next: 12 },
      { text: 'おちゃ ください', next: 13 },
      { text: 'だいじょうぶです', next: 14 },
    ],
  },
  {
    // 12: ジュース
    text: 'ジュース ひゃくえん!',
    choices: [
      { text: 'はい ください', next: 14 },
      { text: 'やすい!', next: 14 },
      { text: 'つめたい?', next: 14, hint: 'はい つめたい!' },
    ],
  },
  {
    // 13: おちゃ
    text: 'おちゃ ひゃくえん!',
    choices: [
      { text: 'はい ください', next: 14 },
      { text: 'あたたかい?', next: 14, hint: 'はい あたたかい' },
      { text: 'やすい!', next: 14 },
    ],
  },
  {
    // 14: converge - total
    text: 'ぜんぶで いくら?',
    choices: [
      { text: 'いくらですか?', next: 15 },
      { text: 'おねがいします', next: 15 },
      { text: 'はい どうぞ', next: 15 },
    ],
  },
  {
    // 15: payment
    text: 'さんびゃくえん!',
    choices: [
      { text: 'はい どうぞ', next: 16 },
      { text: 'やすいですね!', next: 16 },
      { text: 'ちょうどいい!', next: 16 },
    ],
  },
  {
    // 16: bag
    text: 'ふくろ いりますか?',
    choices: [
      { text: 'はい ください', next: 17 },
      { text: 'だいじょうぶです', next: 17 },
      { text: 'ふくろ?', next: 17, hint: 'かばんのことです' },
    ],
  },
  {
    // 17: レシート
    text: 'レシートはいる?',
    choices: [
      { text: 'だいじょうぶです', next: 18 },
      { text: 'はい ください', next: 18 },
      { text: 'レシート?', next: 18, hint: 'かみのことです' },
    ],
  },
  {
    // 18: clerk farewell
    text: 'ありがとうございます!',
    choices: [
      { text: 'ありがとう!', next: 19 },
      { text: 'どうも!', next: 19 },
      { text: 'おいしそう!', next: 19 },
    ],
  },
  {
    // 19: transition to NPC 2
    text: 'あ! あのひとは...',
    choices: [
      { text: 'だれ?', next: 20 },
      { text: 'しってる!', next: 20 },
      { text: 'みてみよう', next: 20 },
    ],
  },
  // --- NPC 2: Friend from restaurant ---
  {
    // 20
    text: 'あ! こんにちは!',
    choices: [
      { text: 'こんにちは!', next: 21 },
      { text: 'あ! ひさしぶり', next: 21 },
      { text: 'またあった!', next: 21 },
    ],
  },
  {
    // 21: what did you buy
    text: 'なにかった?',
    choices: [
      { text: 'おにぎりかった', next: 22 },
      { text: 'おかしかった', next: 23 },
      { text: 'パンかった', next: 24 },
    ],
  },
  {
    // 22: おにぎり
    text: 'おにぎり? おいしそう!',
    choices: [
      { text: 'たべる?', next: 25 },
      { text: 'おいしいよ!', next: 25 },
      { text: 'すきなんだ', next: 25 },
    ],
  },
  {
    // 23: おかし
    text: 'おかし! いいなあ!',
    choices: [
      { text: 'いっしょに!', next: 25 },
      { text: 'おいしいよ!', next: 25 },
      { text: 'あまいよ!', next: 25 },
    ],
  },
  {
    // 24: パン
    text: 'パン? おいしそう!',
    choices: [
      { text: 'うん! おいしい', next: 25 },
      { text: 'たべる?', next: 25 },
      { text: 'やすかった!', next: 25 },
    ],
  },
  {
    // 25: converge - price chat
    text: 'いくらだった?',
    choices: [
      { text: 'ひゃくえん!', next: 26 },
      { text: 'にひゃくえん!', next: 27 },
      { text: 'さんびゃくえん!', next: 28 },
    ],
  },
  {
    // 26: ひゃくえん
    text: 'やすい! いいね!',
    choices: [
      { text: 'うん やすい!', next: 29 },
      { text: 'おとくだよね', next: 29 },
      { text: 'コンビニいいね', next: 29 },
    ],
  },
  {
    // 27: にひゃくえん
    text: 'にひゃくえん? ふつう!',
    choices: [
      { text: 'そうだね!', next: 29 },
      { text: 'おいしいから!', next: 29 },
      { text: 'だいじょうぶ', next: 29 },
    ],
  },
  {
    // 28: さんびゃくえん
    text: 'さんびゃくえん? たかい!',
    choices: [
      { text: 'おいしいから!', next: 29 },
      { text: 'すこしだけ', next: 29 },
      { text: 'だいじょうぶ!', next: 29 },
    ],
  },
  {
    // 29: converge - compare
    text: 'わたしはガムかった!',
    choices: [
      { text: 'おいしそう!', next: 30 },
      { text: 'ガム すき!', next: 30 },
      { text: 'いくらだった?', next: 31 },
    ],
  },
  {
    // 30: チョコ nice
    text: 'ガム だいすき!',
    choices: [
      { text: 'わたしも!', next: 32 },
      { text: 'あまいよね', next: 32 },
      { text: 'いいね!', next: 32 },
    ],
  },
  {
    // 31: チョコ price
    text: 'ひゃくごじゅうえん!',
    choices: [
      { text: 'やすい!', next: 32 },
      { text: 'ちょうどいい!', next: 32 },
      { text: 'おいしそう!', next: 32 },
    ],
  },
  {
    // 32: converge - next plan
    text: 'こうえんいかない?',
    choices: [
      { text: 'いこう!', next: 33 },
      { text: 'いいね!', next: 33 },
      { text: 'つかれたかも', next: 34 },
    ],
  },
  {
    // 33: いこう path
    text: 'たのしみだね!',
    choices: [
      { text: 'うん!', next: 35 },
      { text: 'ワクワクする!', next: 35 },
      { text: 'はやくいこう!', next: 35 },
    ],
  },
  {
    // 34: つかれた path
    text: 'だいじょうぶ?',
    choices: [
      { text: 'うん だいじょうぶ', next: 35 },
      { text: 'すこしだけ', next: 35 },
      { text: 'がんばる!', next: 35 },
    ],
  },
  {
    // 35: converge - weather check
    text: 'そといいてんき!',
    choices: [
      { text: 'そうだね!', next: 36 },
      { text: 'きもちいい!', next: 36 },
      { text: 'あたたかい!', next: 36 },
    ],
  },
  {
    // 36: snack time
    text: 'たべながらいこう!',
    choices: [
      { text: 'いいね!', next: 37 },
      { text: 'おいしい!', next: 37 },
      { text: 'しあわせ!', next: 37 },
    ],
  },
  {
    // 37: almost done
    text: 'こうえんちかいよ!',
    choices: [
      { text: 'やった!', next: 38 },
      { text: 'たのしみ!', next: 38 },
      { text: 'みえた!', next: 38 },
    ],
  },
  {
    // 38: farewell
    text: 'じゃあ いこう!',
    choices: [
      { text: 'うん! いこう!', next: 39 },
      { text: 'ありがとう!', next: 39 },
      { text: 'たのしもう!', next: 39 },
    ],
  },
  {
    // 39: END
    text: 'こうえんにつくよ!',
    choices: [
      { text: 'やった!', next: null },
      { text: 'たのしみ!', next: null },
      { text: 'いこう!', next: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 4: Evening Park (こうえん) — 40 nodes, everything
//
// NPC 1 (stranger ゆき): time, weather, feelings (nodes 0-19)
// NPC 2 (reflection/farewell): travel recap, farewell (nodes 20-39)
// ---------------------------------------------------------------------------
