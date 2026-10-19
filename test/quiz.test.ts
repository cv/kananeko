import { describe, expect, it } from 'vitest';
import type { DialogueNode } from '@game/dialogue';
import {
  distractorsFor,
  generateQuestions,
  matchQuestionFor,
  phrasesOf,
  pick,
  questionFor,
} from '@game/quiz';

const line = (text: string): DialogueNode => ({ text, choices: [{ text: 'はい', next: null }] });

describe('distractorsFor', () => {
  it('offers look-alikes first, then voiced forms and the rest of the row', () => {
    expect(distractorsFor('さ').slice(0, 3)).toEqual(['ち', 'き', 'ざ']);
    expect(distractorsFor('シ').slice(0, 3)).toEqual(['ツ', 'ソ', 'ン']);
  });

  it('stays in the same script and never offers the answer itself', () => {
    for (const ch of ['か', 'ね', 'ロ', 'ワ']) {
      const options = distractorsFor(ch);
      expect(options).not.toContain(ch);
      const katakana = /[\u30a0-\u30ff]/u.test(ch);
      for (const option of options) expect(/[\u30a0-\u30ff]/u.test(option)).toBe(katakana);
    }
  });

  it('never offers small kana or particles read differently', () => {
    for (const ch of ['つ', 'や', 'わ', 'ほ']) {
      expect(distractorsFor(ch)).not.toEqual(expect.arrayContaining(['っ']));
      for (const banned of ['っ', 'ゃ', 'を', 'は', 'へ'])
        expect(distractorsFor(ch)).not.toContain(banned);
    }
  });
});

describe('pick', () => {
  it('wraps the seed around the list', () => {
    expect(pick(['a', 'b', 'c'], 4)).toBe('b');
  });

  it('refuses an empty list', () => {
    expect(() => pick([], 1)).toThrow(RangeError);
  });
});

describe('questionFor', () => {
  it('blanks a kana of the phrase and keeps the phrase whole', () => {
    const question = questionFor('さくらが');
    expect(question?.word).toBe('さくらが');
    expect(Array.from('さくらが')[question?.blankIndex ?? -1]).toBe(question?.correct);
  });

  it('prefers kana it has not asked about yet', () => {
    expect(questionFor('ねこ', new Set(['ね']))?.correct).toBe('こ');
    expect(questionFor('ねこ', new Set(['こ']))?.correct).toBe('ね');
  });

  it('gives up on phrases with nothing to blank', () => {
    expect(questionFor('っー')).toBeUndefined();
  });
});

describe('matchQuestionFor', () => {
  it('pairs a hiragana word with its katakana and blanks a katakana', () => {
    const question = matchQuestionFor('すごい');
    expect(question?.word).toBe('すごい スゴイ');
    expect(question?.prompt).toBe('katakana');
    expect(question?.blankIndex).toBeGreaterThanOrEqual(4);
    expect(Array.from(question?.word ?? '')[question?.blankIndex ?? 0]).toBe(question?.correct);
    for (const option of question?.distractors ?? []) expect(option).toMatch(/[\u30a0-\u30ff]/u);
  });

  it.each([
    ['ありがとう', 'too long to show twice'],
    ['はなが', 'a word plus a particle'],
    ['ラーメン', 'already katakana'],
    ['さんぽ', 'ポ is missing from the font'],
    ['ゃゃゃ', 'nothing to blank'],
  ])('skips %s (%s)', (phrase) => {
    expect(matchQuestionFor(phrase)).toBeUndefined();
  });
});

describe('phrasesOf', () => {
  it('splits lines on spaces and punctuation and keeps short kana-only phrases', () => {
    expect(phrasesOf([line('こんにちは! OK?'), line('ほんとう… ねこ たべもの、すき')])).toEqual([
      'こんにちは',
      'ほんとう',
      'たべもの',
    ]);
  });

  it('drops repeats and phrases too long for the word box', () => {
    expect(phrasesOf([line('ありがとう'), line('ありがとう ありがとうございます')])).toEqual([
      'ありがとう',
    ]);
  });
});

describe('generateQuestions', () => {
  const nodes = [line('おはよう ございます'), line('さくらが きれい'), line('たのしい ですね')];

  it('asks about different phrases and records them', () => {
    const history = { phrases: new Set<string>(), kana: new Set<string>() };
    const questions = generateQuestions(nodes, 2, history);
    expect(questions).toHaveLength(2);
    expect(new Set(questions.map((q) => q.word)).size).toBe(2);
    expect([...history.phrases]).toEqual(questions.map((q) => q.word));
    expect([...history.kana]).toEqual(questions.map((q) => q.correct));
  });

  it('skips phrases already asked and stops when it runs out', () => {
    const history = {
      phrases: new Set(['おはよう', 'ございます', 'さくらが']),
      kana: new Set<string>(),
    };
    expect(
      generateQuestions(nodes, 5, history)
        .map((q) => q.word)
        .sort(),
    ).toEqual(['きれい', 'たのしい', 'ですね'].sort());
  });
});
