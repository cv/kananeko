/**
 * Full game failure/recovery flow tests.
 */

import { describe, it, expect } from 'vitest';
import {
  loseAllKanaLives,
  returnToTitleAfterGameOver,
  runnerAtScene,
} from './helpers/dialogue-helpers';
import { GameRunner } from './helpers/game-runner';
import { KANA_AWAITING_INPUT } from './helpers/test-constants';

describe('Given the player makes critical mistakes', () => {
  it('enters kana with one restocked life after three bad dialogue choices', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.kanaLives).toBe(3);

    runner.advanceDialogueBad();
    expect(runner.kanaLives).toBe(2);
    runner.advanceDialogueBad();
    expect(runner.kanaLives).toBe(1);
    runner.advanceDialogueBad();
    runner.waitForKanaInput();
    expect(runner.kanaLives).toBe(1);
    expect(runner.kanaState).toBe(KANA_AWAITING_INPUT);

    runner.completeKanaQuestions(0);
    expect(runner.sceneId).toBe(1);
  });

  it('returns to title-state values after dialogue death leads to kana death', () => {
    const runner = new GameRunner().boot().start();

    for (let i = 0; i < 3; i++) runner.advanceDialogueBad();

    runner.waitForKanaInput();
    expect(runner.kanaLives).toBe(1);
    loseAllKanaLives(runner);
    returnToTitleAfterGameOver(runner);
  });

  it('returns to the title flow after a mid-game kana game over', () => {
    const runner = runnerAtScene(0);
    runner.completeDialogueTree();
    expect(runner.kanaLives).toBe(3);

    loseAllKanaLives(runner);
    returnToTitleAfterGameOver(runner);

    runner.start();
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgState).toBeGreaterThan(0);
  });

  it('lets good dialogue choices recover lives lost to bad choices', () => {
    const runner = runnerAtScene(0);
    expect(runner.kanaLives).toBe(3);

    runner.advanceDialogueBad();
    expect(runner.kanaLives).toBe(2);

    runner.advanceDialogue();
    expect(runner.kanaLives).toBe(3);

    runner.advanceDialogueBad();
    runner.advanceDialogueBad();
    expect(runner.kanaLives).toBe(1);
    runner.advanceDialogue();
    expect(runner.kanaLives).toBe(2);
  });
});
