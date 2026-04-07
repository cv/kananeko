import { defineDialogueTree } from '../dialogue';

// ---------------------------------------------------------------------------

export const CONBINI_DIALOGUE = defineDialogueTree([
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
    // 39: bridge to new NPCs
    text: 'こうえんにつくよ!',
    choices: [
      { text: 'やった!', next: 40 },
      { text: 'たのしみ!', next: null },
      { text: 'いこう!', next: null },
    ],
  },
  // --- NPC 3: Delivery person (work talk) ---
  {
    // 40
    text: 'すみません!',
    choices: [
      { text: 'はい?', next: 41 },
      { text: 'なんですか?', next: 41 },
      { text: 'どうしました?', next: 41 },
    ],
  },
  {
    // 41
    text: 'はいたつの ものです',
    choices: [
      { text: 'おつかれさま!', next: 42 },
      { text: 'はいたつ?', next: 42, hint: 'ものをはこぶ!' },
      { text: 'がんばって!', next: 42 },
    ],
  },
  {
    // 42
    text: 'きょう いそがしい!',
    choices: [
      { text: 'たいへんですね', next: 43 },
      { text: 'なんこある?', next: 44 },
      { text: 'がんばって!', next: 43 },
    ],
  },
  {
    // 43: たいへん path
    text: 'でも たのしいよ!',
    choices: [
      { text: 'すごいですね!', next: 45 },
      { text: 'えらいです!', next: 45 },
      { text: 'すてきです!', next: 45 },
    ],
  },
  {
    // 44: なんこ path
    text: '50こ はこんだ!',
    choices: [
      { text: 'すごい!', next: 45 },
      { text: 'たくさん!', next: 45 },
      { text: 'がんばった!', next: 45 },
    ],
  },
  {
    // 45: converge - what's inside
    text: 'なかみ なにかな?',
    choices: [
      { text: 'おかし?', next: 46 },
      { text: 'ジュース?', next: 47 },
      { text: 'おべんとう?', next: 48 },
    ],
  },
  {
    // 46: おかし
    text: 'あたり! おかしだよ!',
    choices: [
      { text: 'すごい!', next: 49 },
      { text: 'おいしそう!', next: 49 },
      { text: 'いいな!', next: 49 },
    ],
  },
  {
    // 47: ジュース
    text: 'おしい! ちがうよ!',
    choices: [
      { text: 'なんだろう?', next: 49 },
      { text: 'おしえて!', next: 49 },
      { text: 'むずかしい!', next: 49 },
    ],
  },
  {
    // 48: おべんとう
    text: 'ちがうけど いいね!',
    choices: [
      { text: 'なにかな?', next: 49 },
      { text: 'おしえて!', next: 49 },
      { text: 'きになる!', next: 49 },
    ],
  },
  {
    // 49: converge - delivery facts
    text: 'まいにち 100こ!',
    choices: [
      { text: 'すごい! 100!', next: 50 },
      { text: 'たいへんですね', next: 50 },
      { text: 'がんばりますね', next: 50 },
    ],
  },
  {
    // 50
    text: 'くるまではこぶ!',
    choices: [
      { text: 'くるま? すごい!', next: 51 },
      { text: 'おおきいですね', next: 51 },
      { text: 'かっこいい!', next: 51 },
    ],
  },
  {
    // 51: converge - hobby
    text: 'やすみは なにする?',
    choices: [
      { text: 'あそび!', next: 52 },
      { text: 'さんぽ!', next: 53 },
      { text: 'ねる!', next: 53 },
    ],
  },
  {
    // 52: あそび
    text: 'あそび すき!',
    choices: [
      { text: 'なに あそび?', next: 54 },
      { text: 'わたしも!', next: 54 },
      { text: 'たのしいよね', next: 54 },
    ],
  },
  {
    // 53: さんぽ/ねる
    text: 'いいね! のんびり!',
    choices: [
      { text: 'だいすき!', next: 54 },
      { text: 'きもちいい!', next: 54 },
      { text: 'さいこう!', next: 54 },
    ],
  },
  {
    // 54: converge - farewell delivery
    text: 'じゃあ しごとに!',
    choices: [
      { text: 'がんばって!', next: 55 },
      { text: 'おつかれさま!', next: 55 },
      { text: 'ありがとう!', next: 55 },
    ],
  },
  {
    // 55: transition
    text: 'あ あのひとは...',
    choices: [
      { text: 'だれかな?', next: 56 },
      { text: 'みてみよう', next: 56 },
      { text: 'はなしかけよう', next: 56 },
    ],
  },
  {
    // 56
    text: 'こまってるみたい',
    choices: [
      { text: 'たすけよう!', next: 57 },
      { text: 'だいじょうぶ?', next: 57 },
      { text: 'きになるね', next: 57 },
    ],
  },
  // --- NPC 4: Tourist (asking for help) ---
  {
    // 57
    text: 'すみません!',
    choices: [
      { text: 'はい!', next: 58 },
      { text: 'どうしました?', next: 58 },
      { text: 'こんにちは!', next: 58 },
    ],
  },
  {
    // 58
    text: 'にほんご すこし...',
    choices: [
      { text: 'だいじょうぶ!', next: 59 },
      { text: 'がんばって!', next: 59 },
      { text: 'ゆっくりどうぞ', next: 59 },
    ],
  },
  {
    // 59: what do they need
    text: 'ホテル どこですか?',
    choices: [
      { text: 'あちらですよ!', next: 60 },
      { text: 'ちかいですよ', next: 61 },
      { text: 'わかりません', next: 62 },
    ],
  },
  {
    // 60: あちら
    text: 'あちら? ありがとう!',
    choices: [
      { text: 'まっすぐいって', next: 63 },
      { text: 'みぎにまがって', next: 63 },
      { text: 'すぐそこです', next: 63 },
    ],
  },
  {
    // 61: ちかい
    text: 'ちかい? よかった!',
    choices: [
      { text: 'あるいて5ふん', next: 63 },
      { text: 'すぐそこです', next: 63 },
      { text: 'いっしょにいく?', next: 63 },
    ],
  },
  {
    // 62: わからない
    text: 'そうですか...',
    choices: [
      { text: 'いっしょにさがす?', next: 63 },
      { text: 'すみません', next: 63 },
      { text: 'スマホでみよう', next: 63 },
    ],
  },
  {
    // 63: converge - more help
    text: 'スーパー もある?',
    choices: [
      { text: 'あります!', next: 64 },
      { text: 'コンビニなら!', next: 65 },
      { text: 'わかりません', next: 64 },
    ],
  },
  {
    // 64: ある
    text: 'どこですか?',
    choices: [
      { text: 'えきのちかく!', next: 66 },
      { text: 'あるいて10ぷん', next: 66 },
      { text: 'ちょっととおい', next: 66 },
    ],
  },
  {
    // 65: コンビニ
    text: 'コンビニ? いいね!',
    choices: [
      { text: 'ここにあるよ!', next: 66 },
      { text: 'べんりだよ!', next: 66 },
      { text: 'やすいよ!', next: 66 },
    ],
  },
  {
    // 66: converge - food recs
    text: 'おすすめ たべもの?',
    choices: [
      { text: 'ラーメン!', next: 67 },
      { text: 'おにぎり!', next: 68 },
      { text: 'おすし!', next: 67 },
    ],
  },
  {
    // 67: ラーメン/おすし
    text: 'おいしそう!',
    choices: [
      { text: 'だいすきです!', next: 69 },
      { text: 'おいしいよ!', next: 69 },
      { text: 'ぜひたべて!', next: 69 },
    ],
  },
  {
    // 68: おにぎり
    text: 'おにぎり? なにそれ?',
    choices: [
      { text: 'おこめのたべもの', next: 69 },
      { text: 'おいしいよ!', next: 69 },
      { text: 'コンビニにある!', next: 69 },
    ],
  },
  {
    // 69: converge - gratitude
    text: 'とてもやさしいね!',
    choices: [
      { text: 'ありがとう!', next: 70 },
      { text: 'いいえいいえ', next: 70 },
      { text: 'たのしいです!', next: 70 },
    ],
  },
  {
    // 70
    text: 'にほん だいすき!',
    choices: [
      { text: 'うれしいです!', next: 71 },
      { text: 'わたしも!', next: 71 },
      { text: 'いいくにだよ!', next: 71 },
    ],
  },
  {
    // 71: converge - exchange
    text: 'なまえ おしえて?',
    choices: [
      { text: 'カナネコです!', next: 72 },
      { text: 'ひみつです!', next: 72 },
      { text: 'あなたは?', next: 73 },
    ],
  },
  {
    // 72
    text: 'いいなまえ!',
    choices: [
      { text: 'ありがとう!', next: 74 },
      { text: 'えへへ', next: 74 },
      { text: 'そうですか?', next: 74 },
    ],
  },
  {
    // 73: あなたは
    text: 'マイクです!',
    choices: [
      { text: 'はじめまして!', next: 72 },
      { text: 'いいなまえ!', next: 72 },
      { text: 'よろしく!', next: 72 },
    ],
  },
  {
    // 74: converge - farewell tourist
    text: 'ほんとうにありがとう',
    choices: [
      { text: 'どういたしまして', next: 75 },
      { text: 'たのしかった!', next: 75 },
      { text: 'よいたびを!', next: 75 },
    ],
  },
  {
    // 75
    text: 'またあいたいな!',
    choices: [
      { text: 'きっとまた!', next: 76 },
      { text: 'やくそく!', next: 76 },
      { text: 'またね!', next: 76 },
    ],
  },
  {
    // 76: farewell
    text: 'サンキュー!',
    choices: [
      { text: 'ばいばい!', next: 77 },
      { text: 'またね!', next: 77 },
      { text: 'きをつけてね!', next: 77 },
    ],
  },
  {
    // 77
    text: 'げんきでね!',
    choices: [
      { text: 'あなたも!', next: 78 },
      { text: 'ありがとう!', next: 78 },
      { text: 'げんきで!', next: 78 },
    ],
  },
  {
    // 78
    text: 'じゃあ いこう!',
    choices: [
      { text: 'うん! いこう!', next: 79 },
      { text: 'こうえんへ!', next: 79 },
      { text: 'たのしみ!', next: 79 },
    ],
  },
  {
    // 79: END
    text: 'こうえんにいこう!',
    choices: [
      { text: 'いこう!', next: null },
      { text: 'たのしみ!', next: null },
      { text: 'やった!', next: null },
    ],
  },
] as const);
