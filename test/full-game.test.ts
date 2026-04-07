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
import { runnerAtScene } from './helpers/dialogue-helpers';

// ---------------------------------------------------------------------------
// Title screen
// ---------------------------------------------------------------------------

describe('title screen', () => {
  it('boots idle', () => {
    expect(new GameRunner().boot().dlgState).toBe(0);
  });

  it('transitions on START', () => {
    const r = new GameRunner().boot().start();
    expect(r.sceneId).toBe(0);
    expect(r.dlgState).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Full game
// ---------------------------------------------------------------------------

describe('full game', () => {
  it('plays all 5 scenes to completion', () => {
    const r = new GameRunner().boot().start();
    for (let i = 0; i < SCENES.length; i++) {
      expect(r.sceneId).toBe(i);
      r.completeScene(i);
    }
    expect(r.sceneFlags).toBe(0x1f);
  });

  it('perfect kana — score increases with each correct answer', () => {
    const r = new GameRunner().boot().start();
    for (let i = 0; i < SCENES.length; i++) {
      r.completeDialogueTree(i);
      for (let j = 0; j < SCENES[i]!.kanaQuestions.length; j++) {
        const before = r.kanaScore;
        r.answerKanaCorrectly();
        expect(r.kanaScore - before).toBe(100);
      }
      r.frames(10);
    }
    expect(r.kanaScore).toBeGreaterThanOrEqual(2500);
  });
});

// ---------------------------------------------------------------------------
// Death paths
// ---------------------------------------------------------------------------

describe('death paths', () => {
  it('dialogue death → kana with 1 life → survive → next scene', () => {
    const r = new GameRunner().boot().start();
    expect(r.kanaLives).toBe(3);

    r.advanceDialogueBad();
    expect(r.kanaLives).toBe(2);
    r.advanceDialogueBad();
    expect(r.kanaLives).toBe(1);
    r.advanceDialogueBad();
    r.waitForKanaInput();
    expect(r.kanaLives).toBe(1);
    expect(r.kanaState).toBe(2);

    r.completeKanaQuestions(0);
    expect(r.sceneId).toBe(1);
  });

  it('dialogue death → kana death → game over → title', () => {
    const r = new GameRunner().boot().start();

    for (let i = 0; i < 3; i++) r.advanceDialogueBad();

    r.waitForKanaInput();
    expect(r.kanaLives).toBe(1);
    r.answerKanaWrong();
    r.answerKanaWrong();
    r.answerKanaWrong();

    r.frames(10).pressStart().frames(10);
    expect(r.kanaLives).toBe(3);
    expect(r.kanaScore).toBe(0);
  });

  it('kana death mid-game → game over → title', () => {
    const r = runnerAtScene(0);
    r.completeDialogueTree(0);
    expect(r.kanaLives).toBe(3);

    for (let death = 0; death < 3; death++) {
      r.answerKanaWrong();
      r.answerKanaWrong();
      r.answerKanaWrong();
    }
    expect(r.kanaLives).toBe(0);

    r.frames(10).pressStart().frames(10);
    expect(r.kanaLives).toBe(3);
    expect(r.kanaScore).toBe(0);

    r.start();
    expect(r.sceneId).toBe(0);
    expect(r.dlgState).toBeGreaterThan(0);
  });

  it('bad choices drain lives, good choices restore them', () => {
    const r = runnerAtScene(0);
    expect(r.kanaLives).toBe(3);

    r.advanceDialogueBad();
    expect(r.kanaLives).toBe(2);

    r.advanceDialogue();
    expect(r.kanaLives).toBe(3);

    r.advanceDialogueBad();
    r.advanceDialogueBad();
    expect(r.kanaLives).toBe(1);
    r.advanceDialogue();
    expect(r.kanaLives).toBe(2);
  });
});
