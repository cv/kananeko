import { type DialogueNode } from '../dialogue';

// ---------------------------------------------------------------------------

export const PARK_DIALOGUE: DialogueNode[] = [
  // --- NPC 1: Stranger ゆき ---
  {
    // 0
    text: 'こんばんは!',
    choices: [
      { text: 'こんばんは!', next: 1 },
      { text: 'こんにちは', next: 1, hint: 'よるはこんばんは' },
      { text: 'やあ!', next: 1 },
    ],
  },
  {
    // 1
    text: 'いいよるですね!',
    choices: [
      { text: 'そうですね!', next: 2 },
      { text: 'すずしいですね', next: 2 },
      { text: 'さむいですね', next: 3 },
    ],
  },
  {
    // 2: いいよる path
    text: 'ほしがきれい!',
    choices: [
      { text: 'きれいですね!', next: 4 },
      { text: 'すごい!', next: 4 },
      { text: 'すてき!', next: 4 },
    ],
  },
  {
    // 3: さむい path
    text: 'さむいですか?',
    choices: [
      { text: 'すこしだけ', next: 4 },
      { text: 'だいじょうぶ', next: 4 },
      { text: 'あたたかいもの!', next: 4, hint: 'おちゃがいいね' },
    ],
  },
  {
    // 4: converge - what to talk
    text: 'なにをはなす?',
    choices: [
      { text: 'きょうのこと', next: 5 },
      { text: 'おてんきのこと', next: 7 },
      { text: 'なんでもいい!', next: 5 },
    ],
  },
  {
    // 5: きょうのこと
    text: 'きょうなにをした?',
    choices: [
      { text: 'まちをあるいた', next: 6 },
      { text: 'ごはんをたべた', next: 8 },
      { text: 'かいものをした', next: 9 },
    ],
  },
  {
    // 6: まち details
    text: 'まちはどうだった?',
    choices: [
      { text: 'たのしかった!', next: 10 },
      { text: 'きれいだった', next: 10 },
      { text: 'にぎやかだった', next: 10 },
    ],
  },
  {
    // 7: てんき
    text: 'きょうのてんきは?',
    choices: [
      { text: 'あたたかかった', next: 10 },
      { text: 'すずしかった', next: 10 },
      { text: 'さむかった', next: 10 },
    ],
  },
  {
    // 8: ごはん details
    text: 'なにたべたの?',
    choices: [
      { text: 'ラーメン!', next: 10 },
      { text: 'カレー!', next: 10 },
      { text: 'おにぎり!', next: 10 },
    ],
  },
  {
    // 9: かいもの details
    text: 'なにかった?',
    choices: [
      { text: 'おかし!', next: 10 },
      { text: 'おみやげ!', next: 10 },
      { text: 'ガム!', next: 10 },
    ],
  },
  {
    // 10: converge - response
    text: 'いいですね!',
    choices: [
      { text: 'そうですね!', next: 11 },
      { text: 'ありがとう', next: 11 },
      { text: 'あなたは?', next: 11 },
    ],
  },
  {
    // 11: name
    text: 'おなまえは?',
    choices: [
      { text: 'カナネコです', next: 12 },
      { text: 'ひみつです', next: 12 },
      { text: 'あなたは?', next: 13 },
    ],
  },
  {
    // 12: いいなまえ
    text: 'いいなまえですね!',
    choices: [
      { text: 'ありがとう!', next: 14 },
      { text: 'そうですか?', next: 14 },
      { text: 'えへへ', next: 14 },
    ],
  },
  {
    // 13: ゆきです
    text: 'ゆきです!',
    choices: [
      { text: 'はじめまして!', next: 12 },
      { text: 'よろしく!', next: 12 },
      { text: 'いいなまえ!', next: 12 },
    ],
  },
  {
    // 14: たびはどう
    text: 'たびはどうですか?',
    choices: [
      { text: 'たのしいです!', next: 15 },
      { text: 'さびしいです', next: 16 },
      { text: 'うれしいです!', next: 15 },
    ],
  },
  {
    // 15: たのしい
    text: 'それはよかった!',
    choices: [
      { text: 'とてもうれしい!', next: 17 },
      { text: 'にほんがすき!', next: 17 },
      { text: 'ありがとう!', next: 17 },
    ],
  },
  {
    // 16: さびしい
    text: 'さびしいですか...',
    choices: [
      { text: 'ともだちほしい', next: 17 },
      { text: 'でもたのしい!', next: 17 },
      { text: 'だいじょうぶ!', next: 17 },
    ],
  },
  {
    // 17: converge - ともだち
    text: 'ともだちになろう!',
    choices: [
      { text: 'うれしい!', next: 18 },
      { text: 'ほんとうに?', next: 18 },
      { text: 'ありがとう!', next: 18 },
    ],
  },
  {
    // 18: ゆき's story
    text: 'わたしもたびがすき',
    choices: [
      { text: 'そうなんだ!', next: 19 },
      { text: 'どこにいった?', next: 19 },
      { text: 'いいですね!', next: 19 },
    ],
  },
  {
    // 19: transition
    text: 'すこしあるこう!',
    choices: [
      { text: 'うん いこう!', next: 20 },
      { text: 'いいね!', next: 20 },
      { text: 'たのしそう!', next: 20 },
    ],
  },
  // --- NPC 2: Reflection / farewell ---
  {
    // 20
    text: 'いいこうえんだね!',
    choices: [
      { text: 'そうだね!', next: 21 },
      { text: 'きれい!', next: 21 },
      { text: 'しずかだね', next: 21 },
    ],
  },
  {
    // 21: time of day
    text: 'いまなんじ?',
    choices: [
      { text: 'よる7じかな', next: 22 },
      { text: 'わからない', next: 22 },
      { text: 'おそいかな', next: 22 },
    ],
  },
  {
    // 22: sunset
    text: 'ゆうやけきれい!',
    choices: [
      { text: 'きれいだね!', next: 23 },
      { text: 'すてき!', next: 23 },
      { text: 'しゃしんとりたい', next: 23 },
    ],
  },
  {
    // 23: travel recap
    text: 'たびをふりかえろう!',
    choices: [
      { text: 'いいね!', next: 24 },
      { text: 'たくさんあった!', next: 24 },
      { text: 'たのしかった!', next: 24 },
    ],
  },
  {
    // 24: えき memory
    text: 'えきでなにした?',
    choices: [
      { text: 'ともだちできた', next: 25 },
      { text: 'きっぷかった', next: 25 },
      { text: 'みちきいた', next: 26 },
    ],
  },
  {
    // 25
    text: 'それはよかった!',
    choices: [
      { text: 'うん!', next: 27 },
      { text: 'たのしかった!', next: 27 },
      { text: 'うれしかった!', next: 27 },
    ],
  },
  {
    // 26: みち memory
    text: 'みちをきいたんだ!',
    choices: [
      { text: 'うん やさしかった', next: 27 },
      { text: 'ひとがいいね', next: 27 },
      { text: 'たすかった!', next: 27 },
    ],
  },
  {
    // 27: converge - restaurant memory
    text: 'ごはんおいしかった?',
    choices: [
      { text: 'おいしかった!', next: 28 },
      { text: 'さいこう!', next: 28 },
      { text: 'またたべたい', next: 29 },
    ],
  },
  {
    // 28
    text: 'よかったね!',
    choices: [
      { text: 'うん!', next: 30 },
      { text: 'しあわせだった', next: 30 },
      { text: 'ありがとう', next: 30 },
    ],
  },
  {
    // 29: またたべたい
    text: 'またいこうね!',
    choices: [
      { text: 'うん! いこう!', next: 30 },
      { text: 'やくそく!', next: 30 },
      { text: 'たのしみ!', next: 30 },
    ],
  },
  {
    // 30: converge - conbini memory
    text: 'コンビニたのしかった?',
    choices: [
      { text: 'たのしかった!', next: 31 },
      { text: 'おかしかった!', next: 31 },
      { text: 'やすかった!', next: 32 },
    ],
  },
  {
    // 31
    text: 'コンビニ いいよね!',
    choices: [
      { text: 'だいすき!', next: 33 },
      { text: 'べんり!', next: 33 },
      { text: 'またいきたい', next: 33 },
    ],
  },
  {
    // 32: やすい
    text: 'やすいのがいいね!',
    choices: [
      { text: 'そうだね!', next: 33 },
      { text: 'おとく!', next: 33 },
      { text: 'うれしい!', next: 33 },
    ],
  },
  {
    // 33: converge - feelings
    text: 'にほんどうだった?',
    choices: [
      { text: 'だいすき!', next: 34 },
      { text: 'たのしかった!', next: 34 },
      { text: 'さいこう!', next: 35 },
    ],
  },
  {
    // 34
    text: 'うれしいな!',
    choices: [
      { text: 'わたしもうれしい', next: 36 },
      { text: 'ありがとう!', next: 36 },
      { text: 'またきたい!', next: 36 },
    ],
  },
  {
    // 35: さいこう
    text: 'さいこう? やったー!',
    choices: [
      { text: 'ほんとうに!', next: 36 },
      { text: 'だいすき!', next: 36 },
      { text: 'うれしい!', next: 36 },
    ],
  },
  {
    // 36: converge - future
    text: 'またにほんにくる?',
    choices: [
      { text: 'きっとくる!', next: 37 },
      { text: 'やくそく!', next: 37 },
      { text: 'わからない', next: 38 },
    ],
  },
  {
    // 37: きっと
    text: 'まってるよ!',
    choices: [
      { text: 'ありがとう!', next: 39 },
      { text: 'うれしい!', next: 39 },
      { text: 'ぜったいくる!', next: 39 },
    ],
  },
  {
    // 38: わからない
    text: 'きっとまたあえる!',
    choices: [
      { text: 'そうだね!', next: 39 },
      { text: 'ありがとう!', next: 39 },
      { text: 'いつかきっと', next: 39 },
    ],
  },
  {
    // 39: END
    text: 'またあいましょう!',
    choices: [
      { text: 'またね!', next: null },
      { text: 'さようなら!', next: null },
      { text: 'たのしかった!', next: null },
    ],
  },
];

// ---------------------------------------------------------------------------
