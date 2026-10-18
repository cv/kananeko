/** Game over and recovery across dialogue and kana. */

import { describe, expect, it } from 'vitest';
import { DialogueState, KanaState, MAX_LIVES } from '@game/state';
import { CAT_TILES } from '@game/font-data';
import { SCENES } from '@game/scene';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { type GameRunner } from '../helpers/game-runner';
import { asSeenOnScreen, readText, waitForPicture } from '../helpers/screen';
import { loseAllKanaLives, loseDialogueLives, returnToTitleAfterGameOver } from '../helpers/play';

const SCREEN_COLS = 20;
const row = (runner: GameRunner, r: number): string => readText(runner, r, 0, SCREEN_COLS).trim();

describe('Given the game over screen', () => {
  it('shows the sad cat, the final score, and stamps for the scenes cleared so far', () => {
    const runner = waitForPicture(loseAllKanaLives(runnerAt(checkpoint.kanaStart(3))).frames(20));
    expect(row(runner, 6)).toBe('GAME OVER');
    expect(row(runner, 10)).toBe(`とくてん ${String(runner.kanaScore).padStart(4, '0')}`);
    expect(readText(runner, 3, 8, 4)).toBe(CAT_TILES.SAD_ROWS[1].join(''));
    const stamps = SCENES.map((scene) => scene.icon.join(''));
    expect(row(runner, 8)).toBe(asSeenOnScreen(stamps.slice(0, 3).join(' ')));
  });
});

describe('Given the player runs out of lives', () => {
  it('still finishes the scene after a dialogue wipe-out if the kana round goes well', () => {
    const runner = loseDialogueLives(runnerAt(checkpoint.sceneStart(0)), 0, MAX_LIVES);
    runner.waitForKanaInput();
    expect(runner.kanaLives).toBe(1);

    runner.completeKanaQuestions(0);
    expect(runner.sceneId).toBe(1);
  });

  it('resets the run after a dialogue wipe-out followed by a kana game over', () => {
    const runner = loseDialogueLives(runnerAt(checkpoint.sceneStart(0)), 0, MAX_LIVES);
    runner.waitForKanaInput();
    returnToTitleAfterGameOver(loseAllKanaLives(runner));
  });

  it('lets the player start a fresh run after a kana game over', () => {
    const runner = runnerAt(checkpoint.kanaStart(0));
    returnToTitleAfterGameOver(loseAllKanaLives(runner)).start();
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgState).not.toBe(DialogueState.IDLE);
  });

  it('forgets cleared scenes when a new run starts after a later game over', () => {
    const runner = loseAllKanaLives(runnerAt(checkpoint.kanaStart(3)));
    expect(runner.kanaState).toBe(KanaState.IDLE);
    returnToTitleAfterGameOver(runner).start();
    expect(runner.sceneId).toBe(0);
    expect(runner.sceneFlags).toBe(0);
  });
});
