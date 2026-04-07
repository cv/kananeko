/** Kana round failure/game-over tests. */

import { describe, it, expect } from 'vitest';
import {
  loseAllKanaLives,
  loseOneKanaLife,
  returnToTitleAfterGameOver,
  runnerInKana,
} from './helpers/dialogue-helpers';
import { KANA_IDLE } from './helpers/test-constants';

describe('Given the player misses kana prompts repeatedly', () => {
  it('removes one life after three wrong answers on the same kana question', () => {
    const runner = runnerInKana(0);
    expect(runner.kanaLives).toBe(3);
    loseOneKanaLife(runner);
    expect(runner.kanaLives).toBe(2);
  });

  it('ends the kana round when the player loses the last life', () => {
    const runner = runnerInKana(0);
    expect(runner.kanaLives).toBe(3);
    loseAllKanaLives(runner);
    expect(runner.kanaLives).toBe(0);
    expect(runner.kanaState).toBe(KANA_IDLE);
  });

  it('returns to the title screen state after START on the game over screen', () => {
    const runner = runnerInKana(0);
    loseAllKanaLives(runner);
    returnToTitleAfterGameOver(runner);
  });
});
