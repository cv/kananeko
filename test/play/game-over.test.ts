/** Game over and recovery across dialogue and kana. */

import { describe, expect, it } from 'vitest';
import { DialogueState, KanaState, MAX_LIVES } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { loseAllKanaLives, returnToTitleAfterGameOver } from '../helpers/play';

describe('Given the player runs out of lives', () => {
  it('still finishes the scene after a dialogue wipe-out if the kana round goes well', () => {
    const runner = runnerAt(checkpoint.sceneStart(0));
    for (let i = 0; i < MAX_LIVES; i++) runner.advanceDialogueBad();
    runner.waitForKanaInput();
    expect(runner.kanaLives).toBe(1);

    runner.completeKanaQuestions(0);
    expect(runner.sceneId).toBe(1);
  });

  it('resets the run after a dialogue wipe-out followed by a kana game over', () => {
    const runner = runnerAt(checkpoint.sceneStart(0));
    for (let i = 0; i < MAX_LIVES; i++) runner.advanceDialogueBad();
    runner.waitForKanaInput();
    returnToTitleAfterGameOver(loseAllKanaLives(runner));
  });

  it('lets the player start a fresh run after a kana game over', () => {
    const runner = runnerAt(checkpoint.kanaStart(0));
    returnToTitleAfterGameOver(loseAllKanaLives(runner)).start();
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgState).not.toBe(DialogueState.IDLE);
  });

  it('shows the game over screen in a later scene too', () => {
    const runner = loseAllKanaLives(runnerAt(checkpoint.kanaStart(3)));
    expect(runner.kanaState).toBe(KanaState.IDLE);
    returnToTitleAfterGameOver(runner);
  });
});
