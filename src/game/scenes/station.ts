import { type DialogueNode } from '../dialogue';

// ---------------------------------------------------------------------------

export const STATION_DIALOGUE: DialogueNode[] = [
  // --- NPC 1: Ticket clerk ---
  {
    // 0
    text: 'こんにちは!',
    choices: [
      { text: 'こんにちは!', next: 1 },
      { text: 'はい...', next: 1, hint: 'こんにちは!' },
      { text: '...', next: 1, hint: 'こんにちは!' },
    ],
  },
  {
    // 1
    text: 'おげんきですか?',
    choices: [
      { text: 'げんきです!', next: 2 },
      { text: 'まあまあです', next: 4 },
      { text: 'つかれました', next: 3 },
    ],
  },
  {
    // 2: げんき path
    text: 'いいですね!',
    choices: [
      { text: 'はい!', next: 5 },
      { text: 'ありがとう', next: 5 },
      { text: 'きょうもげんき', next: 5 },
    ],
  },
  {
    // 3: つかれた path
    text: 'だいじょうぶですか?',
    choices: [
      { text: 'だいじょうぶです', next: 5 },
      { text: 'すこしだけ', next: 5 },
      { text: 'みず ください', next: 5, hint: 'みずはいいですね' },
    ],
  },
  {
    // 4: まあまあ path
    text: 'そうですか...',
    choices: [
      { text: 'でもげんき!', next: 5 },
      { text: 'だいじょうぶ', next: 5 },
      { text: 'ちょっとだけ', next: 5 },
    ],
  },
  {
    // 5: converge - where to?
    text: 'どこにいきますか?',
    choices: [
      { text: 'まちにいきます', next: 6 },
      { text: 'えきはどこ?', next: 8, hint: 'ここがえきです!' },
      { text: 'わかりません', next: 9, hint: 'まちがいいですよ' },
    ],
  },
  {
    // 6: まち path
    text: 'まちはいいですよ!',
    choices: [
      { text: 'そうですか!', next: 7 },
      { text: 'なにがある?', next: 10 },
      { text: 'たのしみです', next: 7 },
    ],
  },
  {
    // 7: directions
    text: 'まちはあちらです!',
    choices: [
      { text: 'ありがとう!', next: 11 },
      { text: 'みぎですか?', next: 11, hint: 'あちらです!' },
      { text: 'ひだりですか?', next: 11, hint: 'あちらです!' },
    ],
  },
  {
    // 8: えき detour
    text: 'ここがえきですよ!',
    choices: [
      { text: 'あ! そうですか', next: 7 },
      { text: 'しりませんでした', next: 7 },
      { text: 'はずかしい!', next: 7 },
    ],
  },
  {
    // 9: わからない detour
    text: 'まちがおすすめ!',
    choices: [
      { text: 'いきます!', next: 7 },
      { text: 'いいですね', next: 7 },
      { text: 'おねがいします', next: 7 },
    ],
  },
  {
    // 10: なにがある?
    text: 'おみせがたくさん!',
    choices: [
      { text: 'いいですね!', next: 7 },
      { text: 'たべものも?', next: 7, hint: 'はい あります!' },
      { text: 'たのしそう!', next: 7 },
    ],
  },
  {
    // 11: きっぷ
    text: 'きっぷはいりますか?',
    choices: [
      { text: 'はい ください', next: 12 },
      { text: 'いくらですか?', next: 13 },
      { text: 'いいえ だいじょうぶ', next: 14 },
    ],
  },
  {
    // 12: きっぷ path
    text: 'はい どうぞ!',
    choices: [
      { text: 'ありがとう!', next: 15 },
      { text: 'やさしいですね', next: 15 },
      { text: 'すみません', next: 15 },
    ],
  },
  {
    // 13: いくら?
    text: 'ひゃくえんです!',
    choices: [
      { text: 'やすいですね!', next: 12 },
      { text: 'はい ください', next: 12 },
      { text: 'ちょっとたかい', next: 12, hint: 'やすいですよ!' },
    ],
  },
  {
    // 14: いらない
    text: 'わかりました!',
    choices: [
      { text: 'すみません', next: 15 },
      { text: 'ありがとう', next: 15 },
      { text: 'だいじょうぶです', next: 15 },
    ],
  },
  {
    // 15: おなまえ
    text: 'おなまえは?',
    choices: [
      { text: 'カナネコです', next: 16 },
      { text: 'ひみつです', next: 16 },
      { text: 'あなたは?', next: 17 },
    ],
  },
  {
    // 16: いいなまえ
    text: 'いいなまえですね!',
    choices: [
      { text: 'ありがとう!', next: 18 },
      { text: 'そうですか?', next: 18 },
      { text: 'えへへ', next: 18 },
    ],
  },
  {
    // 17: たなかです
    text: 'たなかです!',
    choices: [
      { text: 'はじめまして!', next: 16 },
      { text: 'よろしく!', next: 16 },
      { text: 'いいなまえ!', next: 16 },
    ],
  },
  {
    // 18: clerk farewell
    text: 'いってらっしゃい!',
    choices: [
      { text: 'いってきます!', next: 19 },
      { text: 'ありがとう!', next: 19 },
      { text: 'さようなら!', next: 19 },
    ],
  },
  {
    // 19: transition to NPC 2
    text: 'あ! あのひとも...',
    choices: [
      { text: 'だれですか?', next: 20 },
      { text: 'ともだち?', next: 20 },
      { text: 'みてみます', next: 20 },
    ],
  },
  // --- NPC 2: Fellow passenger みき ---
  {
    // 20
    text: 'あ! こんにちは!',
    choices: [
      { text: 'こんにちは!', next: 21 },
      { text: 'はじめまして', next: 21 },
      { text: 'だれですか?', next: 21 },
    ],
  },
  {
    // 21
    text: 'わたしはみきです!',
    choices: [
      { text: 'はじめまして!', next: 22 },
      { text: 'よろしく!', next: 22 },
      { text: 'みきさん?', next: 22 },
    ],
  },
  {
    // 22
    text: 'どこにいくの?',
    choices: [
      { text: 'まちにいきます', next: 23 },
      { text: 'わかりません', next: 25 },
      { text: 'さんぽです', next: 24 },
    ],
  },
  {
    // 23: まち path
    text: 'わたしもまちへ!',
    choices: [
      { text: 'いっしょに?', next: 26 },
      { text: 'ほんとう?', next: 26 },
      { text: 'うれしい!', next: 26 },
    ],
  },
  {
    // 24: さんぽ path
    text: 'さんぽ? いいね!',
    choices: [
      { text: 'たのしいです', next: 26 },
      { text: 'すきなんです', next: 26 },
      { text: 'てんきがいい!', next: 26 },
    ],
  },
  {
    // 25: わからない path
    text: 'まちがおすすめ!',
    choices: [
      { text: 'いきます!', next: 26 },
      { text: 'おしえて!', next: 26 },
      { text: 'そうしよう', next: 26 },
    ],
  },
  {
    // 26: converge - hobby
    text: 'しゅみはなに?',
    choices: [
      { text: 'にほんごです', next: 27 },
      { text: 'おんがくです', next: 28 },
      { text: 'りょこうです', next: 29 },
    ],
  },
  {
    // 27: にほんご path
    text: 'にほんご? すごい!',
    choices: [
      { text: 'ありがとう!', next: 30 },
      { text: 'まだまだです', next: 30 },
      { text: 'べんきょうちゅう', next: 30 },
    ],
  },
  {
    // 28: おんがく path
    text: 'おんがくがすき!',
    choices: [
      { text: 'わたしも!', next: 30 },
      { text: 'なにがすき?', next: 30 },
      { text: 'いいですよね', next: 30 },
    ],
  },
  {
    // 29: りょこう path
    text: 'りょこう? いいね!',
    choices: [
      { text: 'だいすき!', next: 30 },
      { text: 'たのしい!', next: 30 },
      { text: 'いろいろみたい', next: 30 },
    ],
  },
  {
    // 30: converge - feelings
    text: 'たのしいですか?',
    choices: [
      { text: 'たのしいです!', next: 31 },
      { text: 'まだわからない', next: 33 },
      { text: 'ワクワクです', next: 32 },
    ],
  },
  {
    // 31: たのしい
    text: 'わたしもたのしい!',
    choices: [
      { text: 'うれしい!', next: 34 },
      { text: 'よかった!', next: 34 },
      { text: 'いいきもち!', next: 34 },
    ],
  },
  {
    // 32: ドキドキ
    text: 'ワクワク? かわいい!',
    choices: [
      { text: 'えへへ', next: 34 },
      { text: 'はずかしい', next: 34 },
      { text: 'ありがとう', next: 34 },
    ],
  },
  {
    // 33: わからない
    text: 'きっとたのしいよ!',
    choices: [
      { text: 'そうだね!', next: 34 },
      { text: 'ありがとう', next: 34 },
      { text: 'がんばる!', next: 34 },
    ],
  },
  {
    // 34: converge - plan
    text: 'まちでなにする?',
    choices: [
      { text: 'ごはんたべたい', next: 35 },
      { text: 'かいものしたい', next: 36 },
      { text: 'あるきたい', next: 37 },
    ],
  },
  {
    // 35: ごはん
    text: 'おいしいおみせある!',
    choices: [
      { text: 'いきたい!', next: 38 },
      { text: 'おしえて!', next: 38 },
      { text: 'ありがとう!', next: 38 },
    ],
  },
  {
    // 36: かいもの
    text: 'いいおみせがある!',
    choices: [
      { text: 'たのしみ!', next: 38 },
      { text: 'なにがある?', next: 38 },
      { text: 'いっしょに!', next: 38 },
    ],
  },
  {
    // 37: あるく
    text: 'いいさんぽみちだよ!',
    choices: [
      { text: 'うれしい!', next: 38 },
      { text: 'いこう!', next: 38 },
      { text: 'たのしそう!', next: 38 },
    ],
  },
  {
    // 38: converge - farewell
    text: 'じゃあ いこう!',
    choices: [
      { text: 'うん! いこう!', next: 39 },
      { text: 'ありがとう!', next: 39 },
      { text: 'よろしくね!', next: 39 },
    ],
  },
  {
    // 39: END
    text: 'いってきまーす!',
    choices: [
      { text: 'いってきます!', next: null },
      { text: 'たのしもう!', next: null },
      { text: 'さあ いこう!', next: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 1: Street (みち) — 40 nodes, hiragana + easy katakana signs
//
// NPC 1 (lost tourist): asking/giving directions (nodes 0-19)
// NPC 2 (shopkeeper さくら): intro, local sights, farewell (nodes 20-39)
// ---------------------------------------------------------------------------
