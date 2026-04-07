/** defineKanaQuestion helper tests. */

import { describe, expect, it } from 'vitest';
import { defineKanaQuestion } from '@game/kana';

describe('defineKanaQuestion', () => {
  it('derives the word and correct answer from the typed kana tuple', () => {
    const question = defineKanaQuestion(['こ', 'ん', 'に', 'ち', 'は'], 2, 'な', 'ぬ', 'ね');

    expect(question.word).toBe('こんにちは');
    expect(question.blankIndex).toBe(2);
    expect(question.correct).toBe('に');
    expect(question.distractors).toEqual(['な', 'ぬ', 'ね']);
  });

  it('throws when a caller bypasses the type system with an invalid blank index', () => {
    expect(() => defineKanaQuestion(['こ', 'ん'] as const, 9 as never, 'か', 'く', 'け')).toThrow(
      /Kana blank index out of range/,
    );
  });
});
