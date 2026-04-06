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
    // 39: bridge to new NPCs
    text: 'いってらっしゃい!',
    choices: [
      { text: 'いってきます!', next: 40 },
      { text: 'ばいばい!', next: null },
      { text: 'またね!', next: null },
    ],
  },
  // --- NPC 3: Elderly person (local history) ---
  {
    // 40
    text: 'おや? わかいひと!',
    choices: [
      { text: 'こんにちは!', next: 41 },
      { text: 'はじめまして', next: 41 },
      { text: 'すみません', next: 41 },
    ],
  },
  {
    // 41
    text: 'このまち すきかい?',
    choices: [
      { text: 'はい すきです!', next: 42 },
      { text: 'はじめてです', next: 43 },
      { text: 'きれいなまち!', next: 42 },
    ],
  },
  {
    // 42: すき path
    text: 'うれしいのう!',
    choices: [
      { text: 'いいまちですね', next: 44 },
      { text: 'すてきです', next: 44 },
      { text: 'だいすきです', next: 44 },
    ],
  },
  {
    // 43: はじめて path
    text: 'そうかい はじめて!',
    choices: [
      { text: 'おしえてください', next: 44 },
      { text: 'たのしいです', next: 44 },
      { text: 'きれいですね', next: 44 },
    ],
  },
  {
    // 44: converge - history
    text: 'むかし うみだった!',
    choices: [
      { text: 'ほんとうですか?', next: 45 },
      { text: 'すごいですね!', next: 46 },
      { text: 'しりませんでした', next: 46 },
    ],
  },
  {
    // 45: ほんとう path
    text: 'ほんとうだよ!',
    choices: [
      { text: 'おもしろい!', next: 46 },
      { text: 'びっくり!', next: 46 },
      { text: 'すごいです', next: 46 },
    ],
  },
  {
    // 46: converge - landmark
    text: 'あのタワー みえる?',
    choices: [
      { text: 'はい みえます!', next: 47 },
      { text: 'たかいですね!', next: 47 },
      { text: 'どこですか?', next: 48 },
    ],
  },
  {
    // 47: みえる
    text: 'ひゃくねんまえから!',
    choices: [
      { text: 'ふるいですね!', next: 49 },
      { text: 'すごい!', next: 49 },
      { text: 'きれいですね', next: 49 },
    ],
  },
  {
    // 48: どこ
    text: 'あちらの たかいの!',
    choices: [
      { text: 'あ みえました!', next: 49 },
      { text: 'おおきいですね', next: 49 },
      { text: 'わかりました!', next: 49 },
    ],
  },
  {
    // 49: converge - seasons
    text: 'はるがいちばん!',
    choices: [
      { text: 'さくらきれい!', next: 50 },
      { text: 'わたしもはる!', next: 50 },
      { text: 'あきもいいです', next: 51 },
    ],
  },
  {
    // 50: はる
    text: 'さくらがさくよ!',
    choices: [
      { text: 'みたいです!', next: 52 },
      { text: 'きれいですね!', next: 52 },
      { text: 'すてき!', next: 52 },
    ],
  },
  {
    // 51: あき
    text: 'あきもいいのう!',
    choices: [
      { text: 'もみじきれい!', next: 52 },
      { text: 'すずしいですね', next: 52 },
      { text: 'だいすきです', next: 52 },
    ],
  },
  {
    // 52: converge - farewell elderly
    text: 'げんきでね!',
    choices: [
      { text: 'ありがとう!', next: 53 },
      { text: 'おげんきで!', next: 53 },
      { text: 'またきます!', next: 53 },
    ],
  },
  {
    // 53: transition
    text: 'あ こどもがいる!',
    choices: [
      { text: 'はなしかけよう', next: 54 },
      { text: 'みてみよう', next: 54 },
      { text: 'なにしてる?', next: 54 },
    ],
  },
  {
    // 54
    text: 'いいてんきだね!',
    choices: [
      { text: 'そうだね!', next: 55 },
      { text: 'きもちいい!', next: 55 },
      { text: 'あたたかい!', next: 55 },
    ],
  },
  // --- NPC 4: Child (playing) ---
  {
    // 55
    text: 'ねえ ねえ!',
    choices: [
      { text: 'なあに?', next: 56 },
      { text: 'こんにちは!', next: 56 },
      { text: 'どうしたの?', next: 56 },
    ],
  },
  {
    // 56
    text: 'あそぼう!',
    choices: [
      { text: 'いいよ!', next: 57 },
      { text: 'なにする?', next: 58 },
      { text: 'ちょっとだけ', next: 57 },
    ],
  },
  {
    // 57: いいよ
    text: 'やったー!',
    choices: [
      { text: 'たのしそう!', next: 59 },
      { text: 'なにであそぶ?', next: 59 },
      { text: 'うれしい!', next: 59 },
    ],
  },
  {
    // 58: なにする
    text: 'なわとび あるよ!',
    choices: [
      { text: 'なわとびすき!', next: 59 },
      { text: 'いいね!', next: 59 },
      { text: 'やろう!', next: 59 },
    ],
  },
  {
    // 59: converge - game
    text: 'しりとり しよう!',
    choices: [
      { text: 'いいね!', next: 60 },
      { text: 'しりとり?', next: 61, hint: 'ことばあそびだよ' },
      { text: 'やろう!', next: 60 },
    ],
  },
  {
    // 60: しりとり start
    text: 'りんご!',
    choices: [
      { text: 'ごりら!', next: 62 },
      { text: 'ごはん!', next: 62 },
      { text: 'ごま!', next: 62 },
    ],
  },
  {
    // 61: しりとり explain
    text: 'ことばであそぶの!',
    choices: [
      { text: 'おもしろい!', next: 60 },
      { text: 'やってみる!', next: 60 },
      { text: 'わかった!', next: 60 },
    ],
  },
  {
    // 62: しりとり continue
    text: 'じょうず! らっぱ!',
    choices: [
      { text: 'ぱんだ!', next: 63 },
      { text: 'ぱん!', next: 63 },
      { text: 'ぱいなっぷる!', next: 63 },
    ],
  },
  {
    // 63
    text: 'すごい! たのしい!',
    choices: [
      { text: 'うん たのしい!', next: 64 },
      { text: 'もっとやろう!', next: 64 },
      { text: 'じょうずだね!', next: 64 },
    ],
  },
  {
    // 64: converge - favourite
    text: 'すきなたべものは?',
    choices: [
      { text: 'カレー!', next: 65 },
      { text: 'ラーメン!', next: 66 },
      { text: 'おにぎり!', next: 67 },
    ],
  },
  {
    // 65: カレー
    text: 'カレー おいしいね!',
    choices: [
      { text: 'だいすき!', next: 68 },
      { text: 'あなたは?', next: 68 },
      { text: 'おいしいよね', next: 68 },
    ],
  },
  {
    // 66: ラーメン
    text: 'ラーメン すき!',
    choices: [
      { text: 'わたしも!', next: 68 },
      { text: 'おいしいよね', next: 68 },
      { text: 'だいすき!', next: 68 },
    ],
  },
  {
    // 67: おにぎり
    text: 'おにぎり いいね!',
    choices: [
      { text: 'うん おいしい!', next: 68 },
      { text: 'まいにちたべる', next: 68 },
      { text: 'だいすき!', next: 68 },
    ],
  },
  {
    // 68: converge - animal
    text: 'すきなどうぶつは?',
    choices: [
      { text: 'ねこ!', next: 69 },
      { text: 'いぬ!', next: 70 },
      { text: 'うさぎ!', next: 70 },
    ],
  },
  {
    // 69: ねこ
    text: 'ねこ かわいいよね!',
    choices: [
      { text: 'だいすき!', next: 71 },
      { text: 'かわいい!', next: 71 },
      { text: 'もふもふ!', next: 71 },
    ],
  },
  {
    // 70: いぬ/うさぎ
    text: 'いいね! かわいい!',
    choices: [
      { text: 'うん!', next: 71 },
      { text: 'だいすき!', next: 71 },
      { text: 'ふわふわ!', next: 71 },
    ],
  },
  {
    // 71: converge - dream
    text: 'おおきくなったら?',
    choices: [
      { text: 'せんせい!', next: 72 },
      { text: 'わからない', next: 73 },
      { text: 'パンやさん!', next: 72 },
    ],
  },
  {
    // 72: ゆめある
    text: 'すごいね! がんばれ!',
    choices: [
      { text: 'ありがとう!', next: 74 },
      { text: 'がんばる!', next: 74 },
      { text: 'うれしい!', next: 74 },
    ],
  },
  {
    // 73: わからない
    text: 'きっとみつかるよ!',
    choices: [
      { text: 'そうだね!', next: 74 },
      { text: 'ありがとう!', next: 74 },
      { text: 'たのしみ!', next: 74 },
    ],
  },
  {
    // 74: converge - time to go
    text: 'もういくの?',
    choices: [
      { text: 'うん いかなきゃ', next: 75 },
      { text: 'もうすこし!', next: 76 },
      { text: 'ざんねん...', next: 75 },
    ],
  },
  {
    // 75: いく path
    text: 'さびしいなあ...',
    choices: [
      { text: 'またあそぼう!', next: 77 },
      { text: 'ごめんね', next: 77 },
      { text: 'たのしかった!', next: 77 },
    ],
  },
  {
    // 76: もうすこし
    text: 'やったー! もっと!',
    choices: [
      { text: 'たのしい!', next: 77 },
      { text: 'うれしい!', next: 77 },
      { text: 'あそぼう!', next: 77 },
    ],
  },
  {
    // 77: converge - farewell child
    text: 'またあそぼうね!',
    choices: [
      { text: 'やくそく!', next: 78 },
      { text: 'きっとまた!', next: 78 },
      { text: 'ありがとう!', next: 78 },
    ],
  },
  {
    // 78
    text: 'ばいばーい!',
    choices: [
      { text: 'ばいばい!', next: 79 },
      { text: 'またね!', next: 79 },
      { text: 'げんきでね!', next: 79 },
    ],
  },
  {
    // 79: END
    text: 'たのしかったー!',
    choices: [
      { text: 'たのしかった!', next: null },
      { text: 'またあおうね!', next: null },
      { text: 'さようなら!', next: null },
    ],
  },
];
