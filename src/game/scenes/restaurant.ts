import { defineDialogueTree } from '../dialogue';

// ---------------------------------------------------------------------------

export const RESTAURANT_DIALOGUE = defineDialogueTree([
  // --- NPC 1: Waiter ---
  {
    // 0
    text: 'いらっしゃいませ!',
    choices: [
      { text: 'こんにちは!', next: 1 },
      { text: 'ひとりです', next: 1 },
      { text: '...', next: 1, hint: 'こんにちは!' },
    ],
  },
  {
    // 1: seating
    text: 'なんめいですか?',
    choices: [
      { text: 'ひとりです', next: 2 },
      { text: 'ふたりです', next: 3 },
      { text: 'わかりません', next: 2, hint: 'ひとりですか?' },
    ],
  },
  {
    // 2: ひとり seat
    text: 'こちらにどうぞ!',
    choices: [
      { text: 'ありがとう!', next: 4 },
      { text: 'いいせきですね', next: 4 },
      { text: 'すみません', next: 4 },
    ],
  },
  {
    // 3: ふたり seat
    text: 'おくのせきへ!',
    choices: [
      { text: 'ありがとう!', next: 4 },
      { text: 'ひろいですね', next: 4 },
      { text: 'いいですね', next: 4 },
    ],
  },
  {
    // 4: menu converge
    text: 'メニューです!',
    choices: [
      { text: 'ありがとう!', next: 5 },
      { text: 'おすすめは?', next: 6 },
      { text: 'みせてください', next: 5 },
    ],
  },
  {
    // 5: ordering
    text: 'なにがいいですか?',
    choices: [
      { text: 'ラーメン ください', next: 7 },
      { text: 'カレー ください', next: 8 },
      { text: 'おちゃ ください', next: 9 },
    ],
  },
  {
    // 6: おすすめ
    text: 'ラーメンがおすすめ!',
    choices: [
      { text: 'じゃあ それで!', next: 7 },
      { text: 'カレーがいい', next: 8 },
      { text: 'おちゃだけ', next: 9 },
    ],
  },
  {
    // 7: ラーメン
    text: 'ラーメンですね!',
    choices: [
      { text: 'はい!', next: 10 },
      { text: 'おおもり!', next: 10 },
      { text: 'からいの?', next: 10, hint: 'すこしからいです' },
    ],
  },
  {
    // 8: カレー
    text: 'カレーですね!',
    choices: [
      { text: 'はい!', next: 10 },
      { text: 'からくない?', next: 10, hint: 'ちょうどいいです' },
      { text: 'おおもり!', next: 10 },
    ],
  },
  {
    // 9: おちゃ
    text: 'おちゃですね!',
    choices: [
      { text: 'はい おねがい', next: 10 },
      { text: 'あたたかいの?', next: 10, hint: 'あたたかいですよ' },
      { text: 'つめたいの?', next: 10, hint: 'つめたいもある' },
    ],
  },
  {
    // 10: のみもの
    text: 'のみものは?',
    choices: [
      { text: 'みず ください', next: 11 },
      { text: 'おちゃ ください', next: 12 },
      { text: 'だいじょうぶです', next: 13 },
    ],
  },
  {
    // 11: みず
    text: 'おみず どうぞ!',
    choices: [
      { text: 'ありがとう!', next: 14 },
      { text: 'つめたい!', next: 14 },
      { text: 'おいしい!', next: 14 },
    ],
  },
  {
    // 12: おちゃ drink
    text: 'おちゃ どうぞ!',
    choices: [
      { text: 'ありがとう!', next: 14 },
      { text: 'いいかおり!', next: 14 },
      { text: 'あたたかい!', next: 14 },
    ],
  },
  {
    // 13: いらない
    text: 'わかりました!',
    choices: [
      { text: 'ありがとう', next: 14 },
      { text: 'すみません', next: 14 },
      { text: 'おねがいします', next: 14 },
    ],
  },
  {
    // 14: wait
    text: 'おまちください!',
    choices: [
      { text: 'はい!', next: 15 },
      { text: 'たのしみです!', next: 15 },
      { text: 'ありがとう', next: 15 },
    ],
  },
  {
    // 15: food arrives
    text: 'おまたせしました!',
    choices: [
      { text: 'ありがとう!', next: 16 },
      { text: 'おいしそう!', next: 16 },
      { text: 'いいにおい!', next: 16 },
    ],
  },
  {
    // 16: taste check
    text: 'おあじはどう?',
    choices: [
      { text: 'おいしい!', next: 17 },
      { text: 'からい!', next: 18, hint: 'みずをどうぞ' },
      { text: 'あつい!', next: 17 },
    ],
  },
  {
    // 17: good taste
    text: 'よかったです!',
    choices: [
      { text: 'ありがとう!', next: 19 },
      { text: 'だいすき!', next: 19 },
      { text: 'おかわりしたい', next: 19 },
    ],
  },
  {
    // 18: spicy
    text: 'みずをどうぞ!',
    choices: [
      { text: 'ありがとう!', next: 19 },
      { text: 'たすかります', next: 19 },
      { text: 'おいしいけど!', next: 19 },
    ],
  },
  {
    // 19: transition to NPC 2
    text: 'ごゆっくり!',
    choices: [
      { text: 'ありがとう!', next: 20 },
      { text: 'はい!', next: 20 },
      { text: 'おいしいです!', next: 20 },
    ],
  },
  // --- NPC 2: Another customer ---
  {
    // 20
    text: 'こんにちは!',
    choices: [
      { text: 'こんにちは!', next: 21 },
      { text: 'はじめまして', next: 21 },
      { text: 'あ どうも!', next: 21 },
    ],
  },
  {
    // 21
    text: 'なにたべてるの?',
    choices: [
      { text: 'ラーメンです', next: 22 },
      { text: 'カレーです', next: 23 },
      { text: 'おちゃだけ', next: 24 },
    ],
  },
  {
    // 22: ラーメン chat
    text: 'ラーメンすき!',
    choices: [
      { text: 'わたしも!', next: 25 },
      { text: 'おいしいよね', next: 25 },
      { text: 'だいすき!', next: 25 },
    ],
  },
  {
    // 23: カレー chat
    text: 'カレーおいしいよね!',
    choices: [
      { text: 'そう おいしい!', next: 25 },
      { text: 'だいすき!', next: 25 },
      { text: 'からいけど!', next: 25 },
    ],
  },
  {
    // 24: おちゃ chat
    text: 'おちゃ? いいね!',
    choices: [
      { text: 'おちつくよね', next: 25 },
      { text: 'すきなんです', next: 25 },
      { text: 'のんでみて!', next: 25 },
    ],
  },
  {
    // 25: converge - adjectives
    text: 'あじはどう?',
    choices: [
      { text: 'あつくておいしい', next: 26 },
      { text: 'つめたくてあまい', next: 27 },
      { text: 'からい!', next: 28 },
    ],
  },
  {
    // 26: あつい
    text: 'あついのがすき?',
    choices: [
      { text: 'だいすきです!', next: 29 },
      { text: 'すこしだけ', next: 29 },
      { text: 'おいしいです!', next: 29 },
    ],
  },
  {
    // 27: つめたい/あまい
    text: 'あまいのすき?',
    choices: [
      { text: 'だいすき!', next: 29 },
      { text: 'すこしあまい', next: 29 },
      { text: 'おいしい!', next: 29 },
    ],
  },
  {
    // 28: からい
    text: 'からいの? がんばれ!',
    choices: [
      { text: 'だいじょうぶ!', next: 29 },
      { text: 'みずのみたい', next: 29 },
      { text: 'おいしいけど!', next: 29 },
    ],
  },
  {
    // 29: converge - おかわり
    text: 'おかわりする?',
    choices: [
      { text: 'おなかいっぱい', next: 30 },
      { text: 'もうひとつ!', next: 31 },
      { text: 'みず ください', next: 30 },
    ],
  },
  {
    // 30: いっぱい
    text: 'そうだよね!',
    choices: [
      { text: 'おいしかった!', next: 32 },
      { text: 'しあわせ!', next: 32 },
      { text: 'ごちそうさま', next: 32 },
    ],
  },
  {
    // 31: おかわり
    text: 'いいね! たべよう!',
    choices: [
      { text: 'うん!', next: 32 },
      { text: 'おいしいもん!', next: 32 },
      { text: 'もっとたべる!', next: 32 },
    ],
  },
  {
    // 32: converge - おかいけい
    text: 'おかいけいする?',
    choices: [
      { text: 'はい そうしよう', next: 33 },
      { text: 'いくらかな?', next: 34 },
      { text: 'まだいいかな', next: 33 },
    ],
  },
  {
    // 33: pay
    text: 'ごひゃくえんだって!',
    choices: [
      { text: 'やすいですね!', next: 35 },
      { text: 'はい どうぞ', next: 35 },
      { text: 'おいしかった!', next: 35 },
    ],
  },
  {
    // 34: いくら
    text: 'ごひゃくえんです!',
    choices: [
      { text: 'やすい!', next: 35 },
      { text: 'はい どうぞ', next: 35 },
      { text: 'ちょうどいい!', next: 35 },
    ],
  },
  {
    // 35: converge - next plan
    text: 'このあとどうする?',
    choices: [
      { text: 'コンビニにいく', next: 36 },
      { text: 'さんぽする', next: 37 },
      { text: 'わからない', next: 36 },
    ],
  },
  {
    // 36: コンビニ
    text: 'コンビニ いいね!',
    choices: [
      { text: 'いっしょに?', next: 38 },
      { text: 'おかしかいたい', next: 38 },
      { text: 'なにかかう', next: 38 },
    ],
  },
  {
    // 37: さんぽ
    text: 'こうえん いこう!',
    choices: [
      { text: 'いいね!', next: 38 },
      { text: 'たのしそう!', next: 38 },
      { text: 'いきたい!', next: 38 },
    ],
  },
  {
    // 38: farewell
    text: 'じゃあ いこう!',
    choices: [
      { text: 'うん! いこう!', next: 39 },
      { text: 'ありがとう!', next: 39 },
      { text: 'たのしかった!', next: 39 },
    ],
  },
  {
    // 39: bridge to new NPCs
    text: 'ごちそうさまでした!',
    choices: [
      { text: 'ごちそうさま!', next: 40 },
      { text: 'おいしかった!', next: null },
      { text: 'またきます!', next: null },
    ],
  },
  // --- NPC 3: Chef (kitchen talk) ---
  {
    // 40
    text: 'おきゃくさん!',
    choices: [
      { text: 'はい?', next: 41 },
      { text: 'だれですか?', next: 41 },
      { text: 'こんにちは!', next: 41 },
    ],
  },
  {
    // 41
    text: 'りょうりにんです!',
    choices: [
      { text: 'はじめまして!', next: 42 },
      { text: 'すごいですね!', next: 42 },
      { text: 'おいしかった!', next: 42 },
    ],
  },
  {
    // 42
    text: 'あじ どうだった?',
    choices: [
      { text: 'おいしかった!', next: 43 },
      { text: 'さいこうです!', next: 44 },
      { text: 'からかった!', next: 45 },
    ],
  },
  {
    // 43: おいしい path
    text: 'うれしいなあ!',
    choices: [
      { text: 'ありがとう!', next: 46 },
      { text: 'だいすきです', next: 46 },
      { text: 'またたべたい!', next: 46 },
    ],
  },
  {
    // 44: さいこう path
    text: 'さいこう? やったー!',
    choices: [
      { text: 'ほんとうです!', next: 46 },
      { text: 'すばらしい!', next: 46 },
      { text: 'すごいあじ!', next: 46 },
    ],
  },
  {
    // 45: からい path
    text: 'からかった? ごめん!',
    choices: [
      { text: 'だいじょうぶ!', next: 46 },
      { text: 'でもおいしい!', next: 46 },
      { text: 'すこしだけ', next: 46 },
    ],
  },
  {
    // 46: converge - recipe talk
    text: 'ひみつのレシピ!',
    choices: [
      { text: 'おしえて!', next: 47 },
      { text: 'ひみつ?', next: 48 },
      { text: 'きになる!', next: 47 },
    ],
  },
  {
    // 47: おしえて
    text: 'バター がだいじ!',
    choices: [
      { text: 'バター? なるほど', next: 49 },
      { text: 'おいしそう!', next: 49 },
      { text: 'すごいですね!', next: 49 },
    ],
  },
  {
    // 48: ひみつ
    text: 'ちょっとだけね!',
    choices: [
      { text: 'ありがとう!', next: 49 },
      { text: 'うれしい!', next: 49 },
      { text: 'たのしみ!', next: 49 },
    ],
  },
  {
    // 49: converge - ingredients
    text: 'やさいがだいじ!',
    choices: [
      { text: 'やさいすき!', next: 50 },
      { text: 'なにやさい?', next: 51 },
      { text: 'けんこうてき!', next: 50 },
    ],
  },
  {
    // 50: やさいすき
    text: 'トマトがいちばん!',
    choices: [
      { text: 'トマトすき!', next: 52 },
      { text: 'おいしいよね!', next: 52 },
      { text: 'あかいですね!', next: 52 },
    ],
  },
  {
    // 51: なにやさい
    text: 'たまねぎとにんじん!',
    choices: [
      { text: 'おいしそう!', next: 52 },
      { text: 'すきです!', next: 52 },
      { text: 'いいですね!', next: 52 },
    ],
  },
  {
    // 52: converge - cooking dream
    text: 'りょうり すきかい?',
    choices: [
      { text: 'だいすきです!', next: 53 },
      { text: 'すこしだけ', next: 54 },
      { text: 'たべるのがすき', next: 54 },
    ],
  },
  {
    // 53: だいすき
    text: 'いっしょにつくる?',
    choices: [
      { text: 'やりたい!', next: 55 },
      { text: 'うれしい!', next: 55 },
      { text: 'ほんとう?', next: 55 },
    ],
  },
  {
    // 54: すこし/たべる
    text: 'たべるのもだいじ!',
    choices: [
      { text: 'そうですね!', next: 55 },
      { text: 'おいしいもの!', next: 55 },
      { text: 'しあわせ!', next: 55 },
    ],
  },
  {
    // 55: converge - chef farewell
    text: 'またきてね!',
    choices: [
      { text: 'かならず!', next: 56 },
      { text: 'ありがとう!', next: 56 },
      { text: 'たのしかった!', next: 56 },
    ],
  },
  {
    // 56: transition to NPC 4
    text: 'あ ともだちがいるよ',
    choices: [
      { text: 'ほんとうだ!', next: 57 },
      { text: 'だれだろう?', next: 57 },
      { text: 'みてみよう', next: 57 },
    ],
  },
  {
    // 57
    text: 'いっしょにすわろう!',
    choices: [
      { text: 'いいね!', next: 58 },
      { text: 'うん!', next: 58 },
      { text: 'たのしそう!', next: 58 },
    ],
  },
  // --- NPC 4: Friend at table (opinions) ---
  {
    // 58
    text: 'やあ! きたんだ!',
    choices: [
      { text: 'うん きたよ!', next: 59 },
      { text: 'ひさしぶり!', next: 59 },
      { text: 'こんにちは!', next: 59 },
    ],
  },
  {
    // 59: what to order
    text: 'なに たのむ?',
    choices: [
      { text: 'ケーキ!', next: 60 },
      { text: 'コーヒー!', next: 61 },
      { text: 'ジュース!', next: 62 },
    ],
  },
  {
    // 60: ケーキ
    text: 'ケーキがおすすめ!',
    choices: [
      { text: 'たべたい!', next: 63 },
      { text: 'おいしそう!', next: 63 },
      { text: 'いいね!', next: 63 },
    ],
  },
  {
    // 61: コーヒー
    text: 'コーヒーいいね!',
    choices: [
      { text: 'すきなんだ', next: 63 },
      { text: 'のみたい!', next: 63 },
      { text: 'いいかおり!', next: 63 },
    ],
  },
  {
    // 62: ジュース
    text: 'ジュース? いいよ!',
    choices: [
      { text: 'つめたいの!', next: 63 },
      { text: 'あまいのがいい', next: 63 },
      { text: 'オレンジ!', next: 63 },
    ],
  },
  {
    // 63: converge - opinion talk
    text: 'このおみせ どう?',
    choices: [
      { text: 'だいすき!', next: 64 },
      { text: 'おいしいね!', next: 64 },
      { text: 'すてきなおみせ', next: 65 },
    ],
  },
  {
    // 64: だいすき/おいしい
    text: 'わたしもだいすき!',
    choices: [
      { text: 'おなじだね!', next: 66 },
      { text: 'うれしい!', next: 66 },
      { text: 'よくくるの?', next: 66 },
    ],
  },
  {
    // 65: すてき
    text: 'ふんいきがいいよね',
    choices: [
      { text: 'そうだね!', next: 66 },
      { text: 'おちつくね', next: 66 },
      { text: 'きれいだね', next: 66 },
    ],
  },
  {
    // 66: converge - memories
    text: 'おもいでつくろう!',
    choices: [
      { text: 'いいね!', next: 67 },
      { text: 'うん!', next: 67 },
      { text: 'たのしい!', next: 67 },
    ],
  },
  {
    // 67: photo
    text: 'しゃしん とろう!',
    choices: [
      { text: 'いいね!', next: 68 },
      { text: 'はい ニコリ!', next: 68 },
      { text: 'たのしい!', next: 68 },
    ],
  },
  {
    // 68
    text: 'いいしゃしん!',
    choices: [
      { text: 'うれしい!', next: 69 },
      { text: 'きれい!', next: 69 },
      { text: 'おもいでだね', next: 69 },
    ],
  },
  {
    // 69: converge - next plan
    text: 'つぎ どこいく?',
    choices: [
      { text: 'コンビニ!', next: 70 },
      { text: 'こうえん!', next: 71 },
      { text: 'あなたは?', next: 70 },
    ],
  },
  {
    // 70: コンビニ
    text: 'コンビニ いこう!',
    choices: [
      { text: 'うん!', next: 72 },
      { text: 'おかしかいたい', next: 72 },
      { text: 'たのしみ!', next: 72 },
    ],
  },
  {
    // 71: こうえん
    text: 'こうえん いいね!',
    choices: [
      { text: 'いこう!', next: 72 },
      { text: 'たのしそう!', next: 72 },
      { text: 'あるきたい!', next: 72 },
    ],
  },
  {
    // 72: converge - pay
    text: 'おかいけい しよう!',
    choices: [
      { text: 'うん!', next: 73 },
      { text: 'いくらかな?', next: 74 },
      { text: 'はい!', next: 73 },
    ],
  },
  {
    // 73: pay
    text: 'わたしがだすよ!',
    choices: [
      { text: 'ありがとう!', next: 75 },
      { text: 'いいの?', next: 75 },
      { text: 'やさしい!', next: 75 },
    ],
  },
  {
    // 74: いくら
    text: 'はっぴゃくえん!',
    choices: [
      { text: 'はんぶんずつ?', next: 75 },
      { text: 'わたしがだす!', next: 75 },
      { text: 'おねがいします', next: 75 },
    ],
  },
  {
    // 75: converge
    text: 'おいしかったね!',
    choices: [
      { text: 'さいこう!', next: 76 },
      { text: 'ほんとうに!', next: 76 },
      { text: 'しあわせだった', next: 76 },
    ],
  },
  {
    // 76: farewell friend
    text: 'またいっしょに!',
    choices: [
      { text: 'やくそく!', next: 77 },
      { text: 'きっとまた!', next: 77 },
      { text: 'たのしみ!', next: 77 },
    ],
  },
  {
    // 77
    text: 'じゃあ いこう!',
    choices: [
      { text: 'うん! いこう!', next: 78 },
      { text: 'ありがとう!', next: 78 },
      { text: 'たのしかった!', next: 78 },
    ],
  },
  {
    // 78
    text: 'ありがとう!',
    choices: [
      { text: 'こちらこそ!', next: 79 },
      { text: 'またね!', next: 79 },
      { text: 'たのしかった!', next: 79 },
    ],
  },
  {
    // 79: END
    text: 'またあおうね!',
    choices: [
      { text: 'またね!', next: null },
      { text: 'やくそく!', next: null },
      { text: 'ばいばい!', next: null },
    ],
  },
] as const);
