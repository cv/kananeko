/** Practice questions: one for every kana on the chart. */

import { CHART_KANA } from '@game/chart';
import { CHAR_MAP } from '@game/font';
import { MAX_KANA_WORD_LENGTH } from '@game/kana';
import { practiceQuestionFor, practiceQuestions } from '@game/practice';
import { describe, expect, it } from 'vitest';

describe('Given the practice questions', () => {
  const questions = practiceQuestions();

  it.each(questions.map((q) => [q.correct, q] as const))(
    'asks %s in a word it is in',
    (kana, q) => {
      expect(Array.from(q.word)[q.blankIndex]).toBe(kana);
      expect(Array.from(q.word).length).toBeLessThanOrEqual(MAX_KANA_WORD_LENGTH);
      expect(new Set([kana, ...q.distractors]).size).toBe(4);
      for (const ch of Array.from(q.word).concat(q.distractors))
        expect(CHAR_MAP[ch], ch).toBeDefined();
    },
  );

  it('has one for each chart kana, in chart order', () => {
    expect(questions.map((q) => q.correct).join('')).toBe(CHART_KANA);
  });

  it('uses the shortest phrase, and a stock word when no line has the kana', () => {
    expect(practiceQuestionFor('こ', ['ねこです', 'ここ']).word).toBe('ここ');
    expect(practiceQuestionFor('ぬ', ['ねこです']).word).toBe('いぬ');
    expect(() => practiceQuestionFor('む', ['ねこです'])).toThrow();
  });
});
