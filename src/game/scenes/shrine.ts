import { defineDialogueTree } from '../dialogue';

// ---------------------------------------------------------------------------
// The shrine: how to pray, a fortune, a wish, and the shrine's cat
// ---------------------------------------------------------------------------

export const SHRINE_DIALOGUE = defineDialogueTree([
  {
    // 0: みこ
    text: 'ようこそ じんじゃへ!',
    choices: [
      { text: 'こんにちは!', next: 1 },
      { text: 'おじゃまします', next: 1 },
      { text: 'やあ!', next: 1 },
    ],
  },
  {
    // 1
    text: 'はじめてですか?',
    choices: [
      { text: 'はい はじめてです', next: 2 },
      { text: 'にかいめです', next: 3 },
      { text: 'わかりません', next: 2 },
    ],
  },
  {
    // 2
    text: 'おまいりの しかたを おしえますね',
    choices: [
      { text: 'おねがいします!', next: 4 },
      { text: 'ありがとう!', next: 4 },
      { text: 'いいです', next: 10 },
    ],
  },
  {
    // 3: にかいめ
    text: 'おかえりなさい!',
    choices: [
      { text: 'ただいま!', next: 10 },
      { text: 'また きました!', next: 10 },
      { text: 'こんにちは!', next: 10 },
    ],
  },
  {
    // 4
    text: 'まず てを あらいます',
    choices: [
      { text: 'どこで?', next: 5 },
      { text: 'みずで?', next: 5 },
      { text: 'はい!', next: 6 },
    ],
  },
  {
    // 5
    text: 'あそこの ちょうずやで',
    choices: [
      { text: 'わかりました!', next: 6 },
      { text: 'きれいな みず!', next: 6 },
      { text: 'つめたそう!', next: 6 },
    ],
  },
  {
    // 6
    text: 'つぎに おさいせんを いれます',
    choices: [
      { text: 'いくら?', next: 7 },
      { text: 'ごえん!', next: 8 },
      { text: 'はい!', next: 8 },
    ],
  },
  {
    // 7
    text: 'いくらでも いいですよ',
    choices: [
      { text: 'じゃあ ごえん!', next: 8 },
      { text: 'ひゃくえん!', next: 8 },
      { text: 'いちえん!', next: 8 },
    ],
  },
  {
    // 8
    text: 'にれい にはくしゅ いちれい',
    choices: [
      { text: 'やってみます!', next: 9 },
      { text: 'むずかしい!', next: 9 },
      { text: 'もういちど!', next: 8 },
    ],
  },
  {
    // 9
    text: 'じょうずですね!',
    choices: [
      { text: 'ありがとう!', next: 10 },
      { text: 'たのしい!', next: 10 },
      { text: 'よかった!', next: 10 },
    ],
  },
  {
    // 10
    text: 'おみくじも ありますよ',
    choices: [
      { text: 'ひきたい!', next: 15 },
      { text: 'なんですか?', next: 11 },
      { text: 'いいです', next: 12 },
    ],
  },
  {
    // 11
    text: 'うらないの かみです',
    choices: [
      { text: 'おもしろそう!', next: 15 },
      { text: 'ひきます!', next: 15 },
      { text: 'こわいです', next: 12 },
    ],
  },
  {
    // 12
    text: 'では えまは どうですか?',
    choices: [
      { text: 'えま?', next: 13 },
      { text: 'みたい!', next: 13 },
      { text: 'やっぱり おみくじ!', next: 15 },
    ],
  },
  {
    // 13
    text: 'ねがいごとを かく いたです',
    choices: [
      { text: 'かきたい!', next: 14 },
      { text: 'すてき!', next: 14 },
      { text: 'あとで!', next: 14 },
    ],
  },
  {
    // 14
    text: 'あそこに こどもが いますよ',
    choices: [
      { text: 'いってみます!', next: 30 },
      { text: 'ありがとう!', next: 30 },
      { text: 'またね!', next: 30 },
    ],
  },
  {
    // 15: おみくじ
    text: 'ひゃくえんです',
    choices: [
      { text: 'はい どうぞ!', next: 16 },
      { text: 'たかい!', next: 16, rating: 'bad' },
      { text: 'やすい!', next: 16 },
    ],
  },
  {
    // 16
    text: 'はこを ふって ください',
    choices: [
      { text: 'がらがら!', next: 17 },
      { text: 'ふります!', next: 17 },
      { text: 'どうやって?', next: 18 },
    ],
  },
  {
    // 17
    text: 'ぼうの ばんごうは?',
    choices: [
      { text: 'じゅうはち!', next: 19 },
      { text: 'さん!', next: 20 },
      { text: 'なな!', next: 21 },
    ],
  },
  {
    // 18
    text: 'はこを さかさに します',
    choices: [
      { text: 'こう?', next: 17 },
      { text: 'わかった!', next: 17 },
      { text: 'がんばる!', next: 17 },
    ],
  },
  {
    // 19
    text: 'だいきちです!',
    choices: [
      { text: 'やった!', next: 22 },
      { text: 'すごい!', next: 22 },
      { text: 'ほんとう?', next: 22 },
    ],
  },
  {
    // 20
    text: 'きちです!',
    choices: [
      { text: 'よかった!', next: 22 },
      { text: 'まあまあ!', next: 22 },
      { text: 'うれしい!', next: 22 },
    ],
  },
  {
    // 21
    text: 'きょうです...',
    choices: [
      { text: 'えー!', next: 23 },
      { text: 'ざんねん...', next: 23 },
      { text: 'だいじょうぶ!', next: 23 },
    ],
  },
  {
    // 22
    text: 'いいことが ありますよ!',
    choices: [
      { text: 'たのしみ!', next: 24 },
      { text: 'ありがとう!', next: 24 },
      { text: 'もういっかい!', next: 15 },
    ],
  },
  {
    // 23
    text: 'きに むすびましょう',
    choices: [
      { text: 'むすびます!', next: 24 },
      { text: 'どこに?', next: 24 },
      { text: 'なぜ?', next: 24 },
    ],
  },
  {
    // 24
    text: 'なにが かいて ありますか?',
    choices: [
      { text: 'ねがいごと かなう', next: 25 },
      { text: 'まちびと きたる', next: 25 },
      { text: 'よめません...', next: 26 },
    ],
  },
  {
    // 25
    text: 'すてきですね!',
    choices: [
      { text: 'うれしい!', next: 28 },
      { text: 'ほんとう!', next: 28 },
      { text: 'たのしみ!', next: 28 },
    ],
  },
  {
    // 26
    text: 'いっしょに よみましょう',
    choices: [
      { text: 'おねがいします', next: 27 },
      { text: 'ありがとう!', next: 27 },
      { text: 'たすかります', next: 27 },
    ],
  },
  {
    // 27
    text: 'りょこう よし ですって!',
    choices: [
      { text: 'やった!', next: 28 },
      { text: 'うれしい!', next: 28 },
      { text: 'よかった!', next: 28 },
    ],
  },
  {
    // 28
    text: 'えまも かきますか?',
    choices: [
      { text: 'かきます!', next: 29 },
      { text: 'えま?', next: 29 },
      { text: 'はい!', next: 29 },
    ],
  },
  {
    // 29
    text: 'あの こに きいて ください',
    choices: [
      { text: 'はい!', next: 30 },
      { text: 'ありがとう!', next: 30 },
      { text: 'またね!', next: 30 },
    ],
  },
  {
    // 30: こども
    text: 'こんにちは!',
    choices: [
      { text: 'こんにちは!', next: 31 },
      { text: 'なにしてるの?', next: 31 },
      { text: 'かわいい!', next: 31 },
    ],
  },
  {
    // 31
    text: 'えまを かいてるの',
    choices: [
      { text: 'なにを かくの?', next: 32 },
      { text: 'じょうずだね!', next: 33 },
      { text: 'みせて!', next: 32 },
    ],
  },
  {
    // 32
    text: 'ねこが ほしいって かいたの',
    choices: [
      { text: 'かわいい ねがい!', next: 33 },
      { text: 'ねこ すき?', next: 34 },
      { text: 'ここに いるよ!', next: 35 },
    ],
  },
  {
    // 33
    text: 'ありがとう!',
    choices: [
      { text: 'えまって なに?', next: 36 },
      { text: 'いいね!', next: 37 },
      { text: 'がんばって!', next: 37 },
    ],
  },
  {
    // 34
    text: 'だいすき!',
    choices: [
      { text: 'わたしも!', next: 37 },
      { text: 'いいね!', next: 37 },
      { text: 'どうして?', next: 36 },
    ],
  },
  {
    // 35
    text: 'え! ねこだ!',
    choices: [
      { text: 'にゃー!', next: 38 },
      { text: 'こんにちは!', next: 38 },
      { text: 'ねこです!', next: 38 },
    ],
  },
  {
    // 36
    text: 'ねがいごとを かく いただよ',
    choices: [
      { text: 'すてき!', next: 37 },
      { text: 'わかった!', next: 37 },
      { text: 'へえ!', next: 37 },
    ],
  },
  {
    // 37
    text: 'あなたも かいて!',
    choices: [
      { text: 'なにを かこう?', next: 39 },
      { text: 'かきます!', next: 39 },
      { text: 'いいよ!', next: 39 },
    ],
  },
  {
    // 38
    text: 'なでて いい?',
    choices: [
      { text: 'いいよ!', next: 40 },
      { text: 'すこしだけ', next: 40 },
      { text: 'だめ!', next: 40, rating: 'bad' },
    ],
  },
  {
    // 39
    text: 'なにを おねがいする?',
    choices: [
      { text: 'にほんごが じょうずに', next: 41 },
      { text: 'また きたい!', next: 41 },
      { text: 'みんな げんきで!', next: 41 },
    ],
  },
  {
    // 40
    text: 'ふわふわ!',
    choices: [
      { text: 'ありがとう!', next: 37 },
      { text: 'くすぐったい!', next: 37 },
      { text: 'にゃー!', next: 37 },
    ],
  },
  {
    // 41
    text: 'かなうと いいね!',
    choices: [
      { text: 'ありがとう!', next: 42 },
      { text: 'きっと!', next: 42 },
      { text: 'あなたも!', next: 42 },
    ],
  },
  {
    // 42
    text: 'あっちに ねこが いるよ',
    choices: [
      { text: 'ほんとう?', next: 43 },
      { text: 'みたい!', next: 43 },
      { text: 'ありがとう!', next: 43 },
    ],
  },
  {
    // 43
    text: 'おばあちゃんの ねこ!',
    choices: [
      { text: 'いってくるね!', next: 45 },
      { text: 'またね!', next: 44 },
      { text: 'ありがとう!', next: 45 },
    ],
  },
  {
    // 44
    text: 'ばいばい!',
    choices: [
      { text: 'ばいばい!', next: 45 },
      { text: 'またね!', next: 45 },
      { text: 'げんきでね!', next: 45 },
    ],
  },
  {
    // 45: おばあさん
    text: 'あら いらっしゃい',
    choices: [
      { text: 'こんにちは!', next: 46 },
      { text: 'ねこは どこ?', next: 47 },
      { text: 'やあ!', next: 46, rating: 'bad' },
    ],
  },
  {
    // 46
    text: 'いい おてんきね',
    choices: [
      { text: 'そうですね!', next: 47 },
      { text: 'あたたかいですね', next: 47 },
      { text: 'あついです', next: 47 },
    ],
  },
  {
    // 47
    text: 'この こが みけよ',
    choices: [
      { text: 'かわいい!', next: 48 },
      { text: 'みけ?', next: 49 },
      { text: 'ねてる!', next: 48 },
    ],
  },
  {
    // 48
    text: 'じんじゃの ねこなの',
    choices: [
      { text: 'いいですね!', next: 50 },
      { text: 'まいにち ここに?', next: 50 },
      { text: 'すてき!', next: 50 },
    ],
  },
  {
    // 49
    text: 'みけねこの みけ!',
    choices: [
      { text: 'いい なまえ!', next: 48 },
      { text: 'かわいい!', next: 48 },
      { text: 'そのまま!', next: 48, rating: 'bad' },
    ],
  },
  {
    // 50
    text: 'まいにち ここで ねてるの',
    choices: [
      { text: 'しあわせそう!', next: 51 },
      { text: 'いいなあ!', next: 51 },
      { text: 'わたしも ねたい', next: 51 },
    ],
  },
  {
    // 51
    text: 'あなたも ねこ?',
    choices: [
      { text: 'はい ねこです!', next: 52 },
      { text: 'にゃー!', next: 52 },
      { text: 'ないしょです', next: 52 },
    ],
  },
  {
    // 52
    text: 'みけと なかよくね',
    choices: [
      { text: 'はい!', next: 53 },
      { text: 'なかよし!', next: 53 },
      { text: 'がんばる!', next: 53 },
    ],
  },
  {
    // 53
    text: 'たびは たのしい?',
    choices: [
      { text: 'とても!', next: 54 },
      { text: 'たのしいです!', next: 54 },
      { text: 'つかれました', next: 55 },
    ],
  },
  {
    // 54
    text: 'それは よかった!',
    choices: [
      { text: 'ありがとう!', next: 56 },
      { text: 'はい!', next: 56 },
      { text: 'えへへ', next: 56 },
    ],
  },
  {
    // 55
    text: 'すこし やすんでね',
    choices: [
      { text: 'ありがとう!', next: 56 },
      { text: 'はい!', next: 56 },
      { text: 'だいじょうぶ!', next: 56 },
    ],
  },
  {
    // 56
    text: 'つぎは どこへ?',
    choices: [
      { text: 'ごはんを たべに!', next: 57 },
      { text: 'まだ ひみつ!', next: 57 },
      { text: 'わかりません', next: 57 },
    ],
  },
  {
    // 57
    text: 'きをつけてね',
    choices: [
      { text: 'はい!', next: 58 },
      { text: 'ありがとう!', next: 58 },
      { text: 'おばあちゃんも!', next: 58 },
    ],
  },
  {
    // 58
    text: 'みけも ばいばいって',
    choices: [
      { text: 'みけ ばいばい!', next: 59 },
      { text: 'にゃー!', next: 59 },
      { text: 'またね!', next: 59 },
    ],
  },
  {
    // 59: END
    text: 'また おいでね!',
    choices: [
      { text: 'また きます!', next: null },
      { text: 'ありがとう!', next: null },
      { text: 'さようなら!', next: null },
    ],
  },
] as const);
