/** Kana round entry/progression tests. */

import { describe, it, expect } from 'vitest';
import { runnerInKana } from './helpers/dialogue-helpers';
import { KANA_AWAITING_INPUT } from './helpers/test-constants';

describe('Given the player has reached the kana round', () => {
  it('enters the kana round after the player completes the dialogue tree', () => {
    const runner = runnerInKana(0);
    expect(runner.kanaState).toBe(KANA_AWAITING_INPUT);
  });

  it('advances to the next kana question after a correct answer', () => {
    const runner = runnerInKana(0);
    runner.answerKanaCorrectly();
    expect(runner.kanaQuestionIdx).toBe(1);
    expect(runner.kanaState).toBe(KANA_AWAITING_INPUT);
  });
});
