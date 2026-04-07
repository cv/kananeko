/** Kana question encoding tests. */

import { describe, it, expect } from 'vitest';
import { buildKanaData, type KanaQuestion } from '@game/kana';
import { textToTiles } from '@game/font';

describe('Given kana question data is being encoded', () => {
  it('writes the word length first and terminates the question list with a zero byte', () => {
    const testQuestions: KanaQuestion[] = [
      { word: 'こんにちは', blankIndex: 0, correct: 'こ', distractors: ['か', 'く', 'き'] },
    ];
    const data = buildKanaData(testQuestions);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toBe(textToTiles('こんにちは').length);
    expect(data[data.length - 1]).toBe(0);
  });
});
