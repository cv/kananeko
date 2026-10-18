/**
 * Whole-game progression. The checkpoints come from one continuous playthrough
 * (see helpers/checkpoints.ts), so these tests check that playthrough's milestones.
 */

import { describe, expect, it } from 'vitest';
import { SCENES, sceneRounds } from '@game/scene';
import { DialogueState, KanaState, MAX_LIVES } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { type GameRunner } from '../helpers/game-runner';
import { readText, waitForPicture } from '../helpers/screen';

const ALL_SCENES = (1 << SCENES.length) - 1;
const SCREEN_COLS = 20;

const ending = (): GameRunner => waitForPicture(runnerAt(checkpoint.gameComplete).frames(4));
const row = (runner: GameRunner, r: number): string => readText(runner, r, 0, SCREEN_COLS).trim();

describe('Given the player plays through the whole game', () => {
  it.each(SCENES.map((_, i) => i))('enters scene %i with every earlier scene completed', (i) => {
    const runner = runnerAt(checkpoint.sceneStart(i));
    expect(runner.sceneId).toBe(i);
    expect(runner.sceneFlags).toBe((1 << i) - 1);
    expect(runner.dlgState).not.toBe(DialogueState.IDLE);
  });

  it.each(SCENES.map((_, i) => i))('reaches the kana round of scene %i at full lives', (i) => {
    const runner = runnerAt(checkpoint.kanaStart(i));
    expect(runner.kanaState).toBe(KanaState.AWAITING);
    expect(runner.kanaQuestionIdx).toBe(0);
    expect(runner.kanaLives).toBe(MAX_LIVES);
  });

  it('completes every scene and keeps the perfect score', () => {
    const runner = runnerAt(checkpoint.gameComplete);
    expect(runner.sceneFlags).toBe(ALL_SCENES);
    const kanaPoints = SCENES.reduce(
      (sum, s) => sum + sceneRounds(s).reduce((n, round) => n + round.questions.length, 0) * 100,
      0,
    );
    expect(runner.kanaScore).toBeGreaterThanOrEqual(kanaPoints);
  });
});

describe('Given the player has finished the game', () => {
  it('congratulates the player', () => {
    expect(row(ending(), 6)).toBe('おめでとう!');
  });

  it('shows the final score', () => {
    const runner = ending();
    expect(row(runner, 10)).toBe(`とくてん ${String(runner.kanaScore).padStart(4, '0')}`);
  });

  it('waits on the ending screen until START', () => {
    const runner = ending().frames(60);
    expect(row(runner, 6)).toBe('おめでとう!');
  });

  it('starts a completely fresh run after START on the ending and title screens', () => {
    const runner = ending().pressStart().frames(10);
    expect(runner.dlgState).toBe(DialogueState.IDLE);
    runner.boot().start();
    expect(runner.sceneId).toBe(0);
    expect(runner.sceneFlags).toBe(0);
    expect(runner.kanaScore).toBe(0);
    expect(runner.kanaLives).toBe(MAX_LIVES);
  });
});
