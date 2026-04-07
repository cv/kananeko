/**
 * Full game perfect-score test.
 */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import { SCENES } from '@game/scene';

describe('Given the player plays a perfect run', () => {
  it('adds 100 points for every first-try kana answer in a perfect run', () => {
    const runner = new GameRunner().boot().start();
    for (let i = 0; i < SCENES.length; i++) {
      runner.completeDialogueTree();
      for (let j = 0; j < SCENES[i]!.kanaQuestions.length; j++) {
        const before = runner.kanaScore;
        runner.answerKanaCorrectly();
        expect(runner.kanaScore - before).toBe(100);
      }
      runner.frames(10);
    }
    expect(runner.kanaScore).toBeGreaterThanOrEqual(2500);
  });
});
