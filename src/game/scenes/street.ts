import { type DialogueNode } from '../dialogue';

// ---------------------------------------------------------------------------

export const STREET_DIALOGUE: DialogueNode[] = [
  // --- NPC 1: Lost tourist ---
  {
    // 0
    text: 'すみません!',
    choices: [
      { text: 'はい?', next: 1 },
      { text: 'なんですか?', next: 1 },
      { text: '...', next: 1, hint: 'はい がいいですよ' },
    ],
  },
  {
    // 1
    text: 'レストランはどこ?',
    choices: [
      { text: 'あちらです!', next: 2 },
      { text: 'ちかいですよ', next: 2 },
      { text: 'わかりません', next: 4 },
    ],
  },
  {
    // 2: しる path
    text: 'ほんとうですか?',
    choices: [
      { text: 'まっすぐいって', next: 3 },
      { text: 'みぎにまがって', next: 5 },
      { text: 'ひだりですよ', next: 6 },
    ],
  },
  {
    // 3: まっすぐ details
    text: 'まっすぐですね!',
    choices: [
      { text: 'はい そうです', next: 7 },
      { text: 'ちかいですよ', next: 7 },
      { text: 'あるいて すぐ', next: 7 },
    ],
  },
  {
    // 4: わからない path
    text: 'そうですか...',
    choices: [
      { text: 'すみません', next: 7 },
      { text: 'がんばって!', next: 7 },
      { text: 'コンビニできく?', next: 7, hint: 'いいですね!' },
    ],
  },
  {
    // 5: みぎ details
    text: 'みぎですね!',
    choices: [
      { text: 'はい みぎです', next: 7 },
      { text: 'あのかどです', next: 7 },
      { text: 'すぐわかります', next: 7 },
    ],
  },
  {
    // 6: ひだり details
    text: 'ひだりですか!',
    choices: [
      { text: 'はい そうです', next: 7 },
      { text: 'あのかどです', next: 7 },
      { text: 'すぐそこです', next: 7 },
    ],
  },
  {
    // 7: ありがとう converge
    text: 'ありがとうございます!',
    choices: [
      { text: 'どういたしまして', next: 8 },
      { text: 'いいえ', next: 8, hint: 'どういたしまして!' },
      { text: 'がんばって!', next: 8 },
    ],
  },
  {
    // 8: コンビニ
    text: 'コンビニもある?',
    choices: [
      { text: 'はい あります', next: 9 },
      { text: 'あちらです', next: 9 },
      { text: 'ちかいですよ', next: 9 },
    ],
  },
  {
    // 9: もっと details
    text: 'コンビニはどこ?',
    choices: [
      { text: 'みぎにあります', next: 10 },
      { text: 'えきのちかく', next: 11 },
      { text: 'あるいて すぐ', next: 10 },
    ],
  },
  {
    // 10: みぎ konbini
    text: 'みぎですね!',
    choices: [
      { text: 'はい そうです', next: 12 },
      { text: 'おおきいおみせ', next: 12 },
      { text: 'すぐわかります', next: 12 },
    ],
  },
  {
    // 11: えきのちかく
    text: 'えきのちかく?',
    choices: [
      { text: 'はい ちかいです', next: 12 },
      { text: 'あるいて すぐ', next: 12 },
      { text: 'みえますよ', next: 12 },
    ],
  },
  {
    // 12: name exchange
    text: 'おなまえは?',
    choices: [
      { text: 'カナネコです', next: 13 },
      { text: 'ひみつです', next: 13 },
      { text: 'あなたは?', next: 14 },
    ],
  },
  {
    // 13
    text: 'いいなまえですね!',
    choices: [
      { text: 'ありがとう!', next: 15 },
      { text: 'そうですか?', next: 15 },
      { text: 'えへへ', next: 15 },
    ],
  },
  {
    // 14: they introduce
    text: 'たろうです!',
    choices: [
      { text: 'はじめまして!', next: 13 },
      { text: 'よろしく!', next: 13 },
      { text: 'いいなまえ!', next: 13 },
    ],
  },
  {
    // 15: where from
    text: 'どこからきた?',
    choices: [
      { text: 'とおいまちから', next: 16 },
      { text: 'えきから', next: 16 },
      { text: 'ひみつです!', next: 16 },
    ],
  },
  {
    // 16
    text: 'そうですか!',
    choices: [
      { text: 'はい!', next: 17 },
      { text: 'あなたは?', next: 17 },
      { text: 'たのしいまち!', next: 17 },
    ],
  },
  {
    // 17: farewell NPC1
    text: 'たのしいたびを!',
    choices: [
      { text: 'ありがとう!', next: 18 },
      { text: 'またね!', next: 18 },
      { text: 'がんばって!', next: 18 },
    ],
  },
  {
    // 18
    text: 'じゃあまたね!',
    choices: [
      { text: 'ばいばい!', next: 19 },
      { text: 'さようなら!', next: 19 },
      { text: 'またね!', next: 19 },
    ],
  },
  {
    // 19: transition to NPC 2
    text: 'あ おみせがある!',
    choices: [
      { text: 'はいってみよう', next: 20 },
      { text: 'みてみよう', next: 20 },
      { text: 'なにかな?', next: 20 },
    ],
  },
  // --- NPC 2: Shopkeeper さくら ---
  {
    // 20
    text: 'いらっしゃいませ!',
    choices: [
      { text: 'こんにちは!', next: 21 },
      { text: 'すみません', next: 21 },
      { text: 'はじめまして', next: 21 },
    ],
  },
  {
    // 21
    text: 'さくらです!',
    choices: [
      { text: 'はじめまして!', next: 22 },
      { text: 'よろしく!', next: 22 },
      { text: 'いいなまえ!', next: 22 },
    ],
  },
  {
    // 22
    text: 'はじめてのまち?',
    choices: [
      { text: 'はい はじめて', next: 23 },
      { text: 'にかいめです', next: 25 },
      { text: 'わかりません', next: 23 },
    ],
  },
  {
    // 23: はじめて path
    text: 'おすすめがある!',
    choices: [
      { text: 'おしえて!', next: 26 },
      { text: 'なんですか?', next: 26 },
      { text: 'たのしみ!', next: 26 },
    ],
  },
  {
    // 24: レストラン recommend
    text: 'レストランもいい!',
    choices: [
      { text: 'いきたい!', next: 30 },
      { text: 'なにがおいしい?', next: 30 },
      { text: 'ありがとう!', next: 30 },
    ],
  },
  {
    // 25: にかいめ path
    text: 'おかえり!',
    choices: [
      { text: 'ただいま!', next: 26 },
      { text: 'ありがとう!', next: 26 },
      { text: 'うれしい!', next: 26 },
    ],
  },
  {
    // 26: converge - recommend
    text: 'こうえんがすてき!',
    choices: [
      { text: 'いきたい!', next: 27 },
      { text: 'どこですか?', next: 28 },
      { text: 'レストランは?', next: 24 },
    ],
  },
  {
    // 27: こうえん info
    text: 'きれいなはなが!',
    choices: [
      { text: 'すてきですね!', next: 30 },
      { text: 'みたい!', next: 30 },
      { text: 'はなすき!', next: 30 },
    ],
  },
  {
    // 28: どこ park
    text: 'まっすぐ いって!',
    choices: [
      { text: 'わかりました!', next: 29 },
      { text: 'ありがとう!', next: 29 },
      { text: 'ちかいですか?', next: 29, hint: 'すぐそこです' },
    ],
  },
  {
    // 29
    text: 'すぐそこですよ!',
    choices: [
      { text: 'いいですね!', next: 30 },
      { text: 'いきます!', next: 30 },
      { text: 'たのしみ!', next: 30 },
    ],
  },
  {
    // 30: converge - weather
    text: 'きょうはいいてんき!',
    choices: [
      { text: 'そうですね!', next: 31 },
      { text: 'あたたかい!', next: 32 },
      { text: 'すこしさむい', next: 33 },
    ],
  },
  {
    // 31: いいてんき
    text: 'おさんぽびより!',
    choices: [
      { text: 'たのしい!', next: 34 },
      { text: 'あるきたい!', next: 34 },
      { text: 'いいきもち!', next: 34 },
    ],
  },
  {
    // 32: あたたかい
    text: 'あたたかいですね!',
    choices: [
      { text: 'きもちいい!', next: 34 },
      { text: 'はるみたい!', next: 34 },
      { text: 'すきです!', next: 34 },
    ],
  },
  {
    // 33: さむい
    text: 'おちゃどうですか?',
    choices: [
      { text: 'のみたい!', next: 34 },
      { text: 'ありがとう!', next: 34 },
      { text: 'あたたまりたい', next: 34 },
    ],
  },
  {
    // 34: converge - hobby
    text: 'にほんがすきですか?',
    choices: [
      { text: 'だいすき!', next: 35 },
      { text: 'はい すきです', next: 35 },
      { text: 'はじめてです', next: 36 },
    ],
  },
  {
    // 35
    text: 'うれしいです!',
    choices: [
      { text: 'ありがとう!', next: 37 },
      { text: 'わたしもです!', next: 37 },
      { text: 'いいくに!', next: 37 },
    ],
  },
  {
    // 36: はじめて
    text: 'たのしんでね!',
    choices: [
      { text: 'はい!', next: 37 },
      { text: 'ありがとう!', next: 37 },
      { text: 'がんばります!', next: 37 },
    ],
  },
  {
    // 37: farewell prep
    text: 'またきてね!',
    choices: [
      { text: 'はい きっと!', next: 38 },
      { text: 'ありがとう!', next: 38 },
      { text: 'やくそく!', next: 38 },
    ],
  },
  {
    // 38
    text: 'たのしいたびを!',
    choices: [
      { text: 'ありがとう!', next: 39 },
      { text: 'またきます!', next: 39 },
      { text: 'さようなら!', next: 39 },
    ],
  },
  {
    // 39: END
    text: 'いってらっしゃい!',
    choices: [
      { text: 'いってきます!', next: null },
      { text: 'ばいばい!', next: null },
      { text: 'またね!', next: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 2: Restaurant (レストラン) — 40 nodes, katakana food + hiragana
//
// NPC 1 (waiter): seating, ordering, eating (nodes 0-19)
// NPC 2 (another customer): food chat, adjectives, farewell (nodes 20-39)
// ---------------------------------------------------------------------------
