/** Kana round scoring tests. */

import { describe, it, expect } from 'vitest';
import { loseOneKanaLife, runnerInKana } from './helpers/dialogue-helpers';
import { DELTA_MINUS_100, DELTA_PLUS_100 } from './helpers/test-constants';

describe('Given the player answers kana prompts', () => {
  it('awards 100 points when the first kana answer is correct', () => {
    const runner = runnerInKana(0);
    const scoreBefore = runner.kanaScore;
    runner.answerKanaCorrectly();
    expect(runner.kanaScore - scoreBefore).toBe(100);
  });

  it('awards 10 points when the second kana answer is correct', () => {
    const runner = runnerInKana(0);
    const scoreBefore = runner.kanaScore;
    runner.answerKanaWrong();
    runner.answerKanaCorrectly();
    expect(runner.kanaScore - scoreBefore).toBe(10);
  });

  it('shows the +100 delta flash after a correct first answer', () => {
    const runner = runnerInKana(0);
    runner.answerKanaCorrectly();
    expect(runner.deltaType).toBe(DELTA_PLUS_100);
  });

  it('shows the -100 delta flash when a wrong answer costs a life', () => {
    const runner = runnerInKana(0);
    loseOneKanaLife(runner);
    expect(runner.deltaType).toBe(DELTA_MINUS_100);
  });
});
