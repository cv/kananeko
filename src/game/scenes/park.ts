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
    // 39: bridge to new NPCs
    text: 'またあいましょう!',
    choices: [
      { text: 'またね!', next: 40 },
      { text: 'さようなら!', next: null },
      { text: 'たのしかった!', next: null },
    ],
  },
  // --- NPC 3: Jogger (health/exercise) ---
  {
    // 40
    text: 'ハアハア... やあ!',
    choices: [
      { text: 'こんばんは!', next: 41 },
      { text: 'だいじょうぶ?', next: 41 },
      { text: 'おつかれさま!', next: 41 },
    ],
  },
  {
    // 41
    text: 'はしりちゅう!',
    choices: [
      { text: 'すごいですね!', next: 42 },
      { text: 'がんばって!', next: 42 },
      { text: 'けんこうてき!', next: 42 },
    ],
  },
  {
    // 42
    text: 'まいにち はしるよ!',
    choices: [
      { text: 'えらいですね!', next: 43 },
      { text: 'なんキロ?', next: 44 },
      { text: 'たいへんですね', next: 43 },
    ],
  },
  {
    // 43: えらい path
    text: 'からだにいいよ!',
    choices: [
      { text: 'そうですね!', next: 45 },
      { text: 'けんこうだいじ', next: 45 },
      { text: 'わたしもしたい', next: 45 },
    ],
  },
  {
    // 44: なんキロ path
    text: '5キロ はしった!',
    choices: [
      { text: 'すごい! 5キロ!', next: 45 },
      { text: 'わたしはむり!', next: 45 },
      { text: 'がんばったね!', next: 45 },
    ],
  },
  {
    // 45: converge - exercise talk
    text: 'うんどう すき?',
    choices: [
      { text: 'すきです!', next: 46 },
      { text: 'あまり...', next: 47 },
      { text: 'さんぽがすき', next: 48 },
    ],
  },
  {
    // 46: すき
    text: 'なにがすき?',
    choices: [
      { text: 'テニス!', next: 49 },
      { text: 'ヨガ!', next: 49 },
      { text: 'すいえい!', next: 49 },
    ],
  },
  {
    // 47: あまり
    text: 'さんぽでもいいよ!',
    choices: [
      { text: 'そうですね!', next: 49 },
      { text: 'やってみる!', next: 49 },
      { text: 'ありがとう!', next: 49 },
    ],
  },
  {
    // 48: さんぽ
    text: 'さんぽ いいよね!',
    choices: [
      { text: 'きもちいい!', next: 49 },
      { text: 'だいすき!', next: 49 },
      { text: 'よるのさんぽ!', next: 49 },
    ],
  },
  {
    // 49: converge - health tips
    text: 'みずをのんでね!',
    choices: [
      { text: 'だいじですよね', next: 50 },
      { text: 'はい のみます!', next: 50 },
      { text: 'ありがとう!', next: 50 },
    ],
  },
  {
    // 50
    text: 'ねることもだいじ!',
    choices: [
      { text: 'そうですね!', next: 51 },
      { text: 'ねるのすき!', next: 51 },
      { text: 'はやくねよう', next: 51 },
    ],
  },
  {
    // 51: converge - park beauty
    text: 'よるのこうえん すき',
    choices: [
      { text: 'きれいですね!', next: 52 },
      { text: 'しずかでいい', next: 52 },
      { text: 'ほしがみえる!', next: 52 },
    ],
  },
  {
    // 52: farewell jogger
    text: 'じゃあ またはしる!',
    choices: [
      { text: 'がんばって!', next: 53 },
      { text: 'きをつけて!', next: 53 },
      { text: 'おつかれさま!', next: 53 },
    ],
  },
  {
    // 53
    text: 'バイバイ! げんきで!',
    choices: [
      { text: 'ばいばい!', next: 54 },
      { text: 'またね!', next: 54 },
      { text: 'げんきでね!', next: 54 },
    ],
  },
  {
    // 54: transition to NPC 4
    text: 'あ おんがくがきこえる',
    choices: [
      { text: 'なんだろう?', next: 55 },
      { text: 'いってみよう!', next: 55 },
      { text: 'きれいなおと!', next: 55 },
    ],
  },
  {
    // 55
    text: 'ふえのおとだ!',
    choices: [
      { text: 'すてき!', next: 56 },
      { text: 'ちかくにいこう', next: 56 },
      { text: 'きいてみよう', next: 56 },
    ],
  },
  // --- NPC 4: Musician (art/music) ---
  {
    // 56
    text: 'あ きいてくれた?',
    choices: [
      { text: 'はい すてき!', next: 57 },
      { text: 'じょうずですね!', next: 57 },
      { text: 'きれいなおと!', next: 57 },
    ],
  },
  {
    // 57
    text: 'ありがとう! うれしい',
    choices: [
      { text: 'おんがくすき?', next: 58 },
      { text: 'すごいひと?', next: 59 },
      { text: 'まいにちひく?', next: 58 },
    ],
  },
  {
    // 58: おんがく talk
    text: 'おんがくがいのち!',
    choices: [
      { text: 'かっこいい!', next: 60 },
      { text: 'すてきです!', next: 60 },
      { text: 'わたしもすき!', next: 60 },
    ],
  },
  {
    // 59: すごいひと
    text: 'まだまだだけど!',
    choices: [
      { text: 'じょうずです!', next: 60 },
      { text: 'すごいですよ!', next: 60 },
      { text: 'すてきです!', next: 60 },
    ],
  },
  {
    // 60: converge - genre
    text: 'どんなおんがくすき?',
    choices: [
      { text: 'ピアノ!', next: 61 },
      { text: 'ふえ!', next: 62 },
      { text: 'うた!', next: 61 },
    ],
  },
  {
    // 61: ピアノ/うた
    text: 'いいね! のれるよね',
    choices: [
      { text: 'たのしいよね!', next: 63 },
      { text: 'だいすき!', next: 63 },
      { text: 'げんきがでる!', next: 63 },
    ],
  },
  {
    // 62: ふえ
    text: 'ふえ? すてきだね!',
    choices: [
      { text: 'おちつくよね', next: 63 },
      { text: 'きれいなおと!', next: 63 },
      { text: 'だいすき!', next: 63 },
    ],
  },
  {
    // 63: converge - request
    text: 'リクエスト ある?',
    choices: [
      { text: 'なんでもいい!', next: 64 },
      { text: 'しずかなきょく', next: 65 },
      { text: 'げんきなきょく', next: 64 },
    ],
  },
  {
    // 64: げんき/なんでも
    text: 'じゃあ これ きいて!',
    choices: [
      { text: 'うわあ きれい!', next: 66 },
      { text: 'すてき!', next: 66 },
      { text: 'かんどう!', next: 66 },
    ],
  },
  {
    // 65: しずか
    text: 'しずかなきょく...!',
    choices: [
      { text: 'きれい...', next: 66 },
      { text: 'なみだがでる', next: 66 },
      { text: 'すばらしい!', next: 66 },
    ],
  },
  {
    // 66: converge - reaction
    text: 'たのしんでくれた?',
    choices: [
      { text: 'さいこうです!', next: 67 },
      { text: 'かんどうした!', next: 67 },
      { text: 'だいすき!', next: 67 },
    ],
  },
  {
    // 67
    text: 'おんがくのちから!',
    choices: [
      { text: 'すごいちから!', next: 68 },
      { text: 'こころにひびく', next: 68 },
      { text: 'ありがとう!', next: 68 },
    ],
  },
  {
    // 68: converge - art talk
    text: 'えも かくよ!',
    choices: [
      { text: 'すごい!', next: 69 },
      { text: 'みせて!', next: 70 },
      { text: 'たさいですね!', next: 69 },
    ],
  },
  {
    // 69: すごい
    text: 'こうえんのえがすき',
    choices: [
      { text: 'きれいですね!', next: 71 },
      { text: 'みたいです!', next: 71 },
      { text: 'すてき!', next: 71 },
    ],
  },
  {
    // 70: みせて
    text: 'こんどみせるね!',
    choices: [
      { text: 'たのしみ!', next: 71 },
      { text: 'ありがとう!', next: 71 },
      { text: 'やくそく!', next: 71 },
    ],
  },
  {
    // 71: converge - life advice
    text: 'ゆめをもとうね!',
    choices: [
      { text: 'いいことば!', next: 72 },
      { text: 'がんばります!', next: 72 },
      { text: 'ありがとう!', next: 72 },
    ],
  },
  {
    // 72
    text: 'きょうに かんしゃ!',
    choices: [
      { text: 'そうですね!', next: 73 },
      { text: 'いいひだった!', next: 73 },
      { text: 'しあわせです!', next: 73 },
    ],
  },
  {
    // 73: farewell musician
    text: 'じゃあ もういっきょく',
    choices: [
      { text: 'うれしい!', next: 74 },
      { text: 'ありがとう!', next: 74 },
      { text: 'きかせて!', next: 74 },
    ],
  },
  {
    // 74
    text: 'さいごのきょくです!',
    choices: [
      { text: 'すてき...!', next: 75 },
      { text: 'かんどう!', next: 75 },
      { text: 'きれい...!', next: 75 },
    ],
  },
  {
    // 75: converge - final reflection
    text: 'いいよるだったね!',
    choices: [
      { text: 'さいこうの よる!', next: 76 },
      { text: 'わすれない!', next: 76 },
      { text: 'ありがとう!', next: 76 },
    ],
  },
  {
    // 76
    text: 'またあおうね!',
    choices: [
      { text: 'きっとまた!', next: 77 },
      { text: 'やくそく!', next: 77 },
      { text: 'ぜったいに!', next: 77 },
    ],
  },
  {
    // 77
    text: 'ゆめを おいかけて!',
    choices: [
      { text: 'がんばります!', next: 78 },
      { text: 'あなたも!', next: 78 },
      { text: 'ありがとう!', next: 78 },
    ],
  },
  {
    // 78
    text: 'さようなら!',
    choices: [
      { text: 'さようなら!', next: 79 },
      { text: 'またね!', next: 79 },
      { text: 'げんきでね!', next: 79 },
    ],
  },
  {
    // 79: END
    text: 'またあいましょう!',
    choices: [
      { text: 'ありがとう!', next: null },
      { text: 'さようなら!', next: null },
      { text: 'だいすき にほん!', next: null },
    ],
  },
];
