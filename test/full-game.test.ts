/**
 * Full game playthrough tests.
 *
 * Title screen, full-game playthroughs, and death paths.
 * Per-scene dialogue tests live in separate scene-*.test.ts files
 * so vitest can run them in parallel across workers.
 */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import { SCENES } from '@game/scene';
import {
  loseAllKanaLives,
  returnToTitleAfterGameOver,
  runnerAtScene,
} from './helpers/dialogue-helpers';
import { KANA_AWAITING_INPUT } from './helpers/test-constants';

// ---------------------------------------------------------------------------
// Title screen
// ---------------------------------------------------------------------------

describe('title screen', () => {
  it('stays idle after boot until the player presses START', () => {
    expect(new GameRunner().boot().dlgState).toBe(0);
  });

  it('starts the first scene when the player presses START', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgState).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Full game
// ---------------------------------------------------------------------------

describe('full game', () => {
  it('plays all five scenes to completion in order', () => {
    const runner = new GameRunner().boot().start();
    for (let i = 0; i < SCENES.length; i++) {
      expect(runner.sceneId).toBe(i);
      runner.completeScene(i);
    }
    expect(runner.sceneFlags).toBe(0x1f);
  });

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

// ---------------------------------------------------------------------------
// Death paths
// ---------------------------------------------------------------------------

describe('death paths', () => {
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
