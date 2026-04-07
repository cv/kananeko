import { defineDialogueTree } from '../dialogue';

// ---------------------------------------------------------------------------

export const STATION_DIALOGUE = defineDialogueTree([
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
    // 39: bridge to new NPCs
    text: 'いってきまーす!',
    choices: [
      { text: 'いってきます!', next: 40 },
      { text: 'たのしもう!', next: null },
      { text: 'さあ いこう!', next: null },
    ],
  },
  // --- NPC 3: Station guard (directions) ---
  {
    // 40
    text: 'ちょっとまって!',
    choices: [
      { text: 'はい なんですか?', next: 41 },
      { text: 'だれですか?', next: 41 },
      { text: '...', next: 41, hint: 'はい がいいですよ' },
    ],
  },
  {
    // 41
    text: 'えきのあんないです',
    choices: [
      { text: 'よろしく!', next: 42 },
      { text: 'あんない?', next: 42, hint: 'みちをおしえます' },
      { text: 'ありがとう', next: 42 },
    ],
  },
  {
    // 42
    text: 'どこにいきたい?',
    choices: [
      { text: 'にしぐちです', next: 43 },
      { text: 'ひがしぐちです', next: 44 },
      { text: 'わかりません', next: 45 },
    ],
  },
  {
    // 43: にしぐち path
    text: 'にしぐちはこちら!',
    choices: [
      { text: 'ありがとう!', next: 46 },
      { text: 'とおいですか?', next: 46, hint: 'すぐそこです' },
      { text: 'わかりました', next: 46 },
    ],
  },
  {
    // 44: ひがしぐち path
    text: 'ひがしはあちら!',
    choices: [
      { text: 'みえました!', next: 46 },
      { text: 'ありがとう!', next: 46 },
      { text: 'すぐいきます', next: 46 },
    ],
  },
  {
    // 45: わからない path
    text: 'なにがしたい?',
    choices: [
      { text: 'でんしゃにのる', next: 46 },
      { text: 'おみせにいく', next: 46 },
      { text: 'さんぽしたい', next: 46 },
    ],
  },
  {
    // 46: converge - platform info
    text: 'のりばはしってる?',
    choices: [
      { text: 'はい しってます', next: 47 },
      { text: 'いいえ', next: 48 },
      { text: 'のりば?', next: 48, hint: 'でんしゃのばしょ' },
    ],
  },
  {
    // 47: しってる
    text: 'すごいですね!',
    choices: [
      { text: 'ありがとう!', next: 49 },
      { text: 'よくきます', next: 49 },
      { text: 'すきなんです', next: 49 },
    ],
  },
  {
    // 48: しらない
    text: 'いちばんのりばです!',
    choices: [
      { text: 'わかりました!', next: 49 },
      { text: 'ありがとう!', next: 49 },
      { text: 'いちばん?', next: 49, hint: 'さいしょのばしょ' },
    ],
  },
  {
    // 49: converge - schedule
    text: 'つぎは なんじ?',
    choices: [
      { text: 'さんじです', next: 50 },
      { text: 'わかりません', next: 51 },
      { text: 'もうすぐ?', next: 51 },
    ],
  },
  {
    // 50: さんじ
    text: 'さんじ? もうすぐ!',
    choices: [
      { text: 'よかった!', next: 52 },
      { text: 'はやい!', next: 52 },
      { text: 'まにあう!', next: 52 },
    ],
  },
  {
    // 51: わからない
    text: 'あと すこしですよ!',
    choices: [
      { text: 'ありがとう!', next: 52 },
      { text: 'たすかります', next: 52 },
      { text: 'うれしいです', next: 52 },
    ],
  },
  {
    // 52: converge - manners
    text: 'きをつけてね!',
    choices: [
      { text: 'はい!', next: 53 },
      { text: 'ありがとう!', next: 53 },
      { text: 'やさしいですね', next: 53 },
    ],
  },
  {
    // 53: guard farewell
    text: 'いいたびを!',
    choices: [
      { text: 'ありがとう!', next: 54 },
      { text: 'がんばります!', next: 54 },
      { text: 'またきます!', next: 54 },
    ],
  },
  {
    // 54: converge - meet NPC 4
    text: 'あのひと だれだろう?',
    choices: [
      { text: 'はなしかけよう', next: 55 },
      { text: 'きになる', next: 55 },
      { text: 'いってみよう', next: 55 },
    ],
  },
  {
    // 55: dummy bridging node to fix index alignment
    text: 'あ おみせがある!',
    choices: [
      { text: 'みてみよう', next: 56 },
      { text: 'なにかな?', next: 56 },
      { text: 'はいろう!', next: 56 },
    ],
  },
  // --- NPC 4: Vendor (buying a ticket) ---
  {
    // 56
    text: 'いらっしゃい!',
    choices: [
      { text: 'こんにちは!', next: 57 },
      { text: 'すみません', next: 57 },
      { text: 'なにがある?', next: 57 },
    ],
  },
  {
    // 57
    text: 'きっぷ うりますよ!',
    choices: [
      { text: 'ほしいです!', next: 58 },
      { text: 'いくらですか?', next: 59 },
      { text: 'みるだけです', next: 60 },
    ],
  },
  {
    // 58: ほしい path
    text: 'どこまでですか?',
    choices: [
      { text: 'まちまでです', next: 61 },
      { text: 'うみまでです', next: 62 },
      { text: 'やままでです', next: 63 },
    ],
  },
  {
    // 59: いくら path
    text: 'にひゃくえんから!',
    choices: [
      { text: 'やすいですね!', next: 58 },
      { text: 'ちょうどいい', next: 58 },
      { text: 'かいます!', next: 58 },
    ],
  },
  {
    // 60: みるだけ
    text: 'ゆっくりどうぞ!',
    choices: [
      { text: 'ありがとう', next: 58 },
      { text: 'やっぱりかう!', next: 58 },
      { text: 'すみません', next: 58 },
    ],
  },
  {
    // 61: まち
    text: 'まちは にひゃくえん!',
    choices: [
      { text: 'はい どうぞ!', next: 64 },
      { text: 'やすい!', next: 64 },
      { text: 'おねがいします', next: 64 },
    ],
  },
  {
    // 62: うみ
    text: 'うみは さんびゃく!',
    choices: [
      { text: 'はい どうぞ!', next: 64 },
      { text: 'いいですね', next: 64 },
      { text: 'おねがいします', next: 64 },
    ],
  },
  {
    // 63: やま
    text: 'やまは よんひゃく!',
    choices: [
      { text: 'はい どうぞ!', next: 64 },
      { text: 'たかい!', next: 64, hint: 'やまはとおいです' },
      { text: 'おねがいします', next: 64 },
    ],
  },
  {
    // 64: converge - payment
    text: 'はい きっぷです!',
    choices: [
      { text: 'ありがとう!', next: 65 },
      { text: 'うれしいです!', next: 65 },
      { text: 'たすかります', next: 65 },
    ],
  },
  {
    // 65: おまけ
    text: 'おまけに ちず!',
    choices: [
      { text: 'ありがとう!', next: 66 },
      { text: 'うれしい!', next: 66 },
      { text: 'やさしいですね', next: 66 },
    ],
  },
  {
    // 66: ちず説明
    text: 'ちずがあるとべんり!',
    choices: [
      { text: 'そうですね!', next: 67 },
      { text: 'たすかります', next: 67 },
      { text: 'つかいます!', next: 67 },
    ],
  },
  {
    // 67: travel tips
    text: 'でんしゃ たのしい?',
    choices: [
      { text: 'だいすき!', next: 68 },
      { text: 'はじめてです', next: 69 },
      { text: 'まあまあです', next: 70 },
    ],
  },
  {
    // 68: だいすき
    text: 'わたしもだいすき!',
    choices: [
      { text: 'おなじですね!', next: 71 },
      { text: 'うれしい!', next: 71 },
      { text: 'でんしゃいいね', next: 71 },
    ],
  },
  {
    // 69: はじめて
    text: 'はじめて? いいなあ!',
    choices: [
      { text: 'どきどきです', next: 71 },
      { text: 'たのしみです', next: 71 },
      { text: 'うきうきです', next: 71 },
    ],
  },
  {
    // 70: まあまあ
    text: 'そうですか!',
    choices: [
      { text: 'でもたのしい!', next: 71 },
      { text: 'すきになりたい', next: 71 },
      { text: 'けしきがいい', next: 71 },
    ],
  },
  {
    // 71: converge - recommendation
    text: 'まどぎわがいいよ!',
    choices: [
      { text: 'わかりました!', next: 72 },
      { text: 'けしきみたい!', next: 72 },
      { text: 'ありがとう!', next: 72 },
    ],
  },
  {
    // 72: おべんとう
    text: 'おべんとう いる?',
    choices: [
      { text: 'ほしいです!', next: 73 },
      { text: 'もうたべた', next: 74 },
      { text: 'いくらですか?', next: 75 },
    ],
  },
  {
    // 73: ほしい
    text: 'はい どうぞ!',
    choices: [
      { text: 'ありがとう!', next: 76 },
      { text: 'おいしそう!', next: 76 },
      { text: 'うれしい!', next: 76 },
    ],
  },
  {
    // 74: もうたべた
    text: 'そうですか!',
    choices: [
      { text: 'おなかいっぱい', next: 76 },
      { text: 'おいしかった!', next: 76 },
      { text: 'ありがとう', next: 76 },
    ],
  },
  {
    // 75: いくら
    text: 'さんびゃくえんです!',
    choices: [
      { text: 'かいます!', next: 73 },
      { text: 'やすい!', next: 73 },
      { text: 'やめておきます', next: 76 },
    ],
  },
  {
    // 76: converge - farewell vendor
    text: 'たのしいたびを!',
    choices: [
      { text: 'ありがとう!', next: 77 },
      { text: 'またきます!', next: 77 },
      { text: 'やさしいですね', next: 77 },
    ],
  },
  {
    // 77
    text: 'いつでもきてね!',
    choices: [
      { text: 'はい!', next: 78 },
      { text: 'きっとまた!', next: 78 },
      { text: 'やくそく!', next: 78 },
    ],
  },
  {
    // 78
    text: 'じゃあ いってらっしゃい',
    choices: [
      { text: 'いってきます!', next: 79 },
      { text: 'ありがとう!', next: 79 },
      { text: 'さようなら!', next: 79 },
    ],
  },
  {
    // 79: END
    text: 'きをつけてね!',
    choices: [
      { text: 'いってきます!', next: null },
      { text: 'たのしみます!', next: null },
      { text: 'さあ いこう!', next: null },
    ],
  },
] as const);
