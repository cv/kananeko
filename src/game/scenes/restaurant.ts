import { type DialogueNode } from '../dialogue';

// ---------------------------------------------------------------------------

export const RESTAURANT_DIALOGUE: DialogueNode[] = [
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
    // 39: END
    text: 'ごちそうさまでした!',
    choices: [
      { text: 'ごちそうさま!', next: null },
      { text: 'おいしかった!', next: null },
      { text: 'またきます!', next: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scene 3: Convenience Store (コンビニ) — 40 nodes, mixed + numbers
//
// NPC 1 (clerk): shopping, prices, items (nodes 0-19)
// NPC 2 (friend from restaurant): comparing snacks, farewell (nodes 20-39)
// ---------------------------------------------------------------------------
