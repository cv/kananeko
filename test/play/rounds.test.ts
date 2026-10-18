/** Kana rounds between conversations */

import { describe, expect, it } from 'vitest';
import { SCENES, sceneRounds } from '@game/scene';
import { KanaState } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { type GameRunner } from '../helpers/game-runner';

const STATION = SCENES[0];
const FIRST_BREAK = sceneRounds(STATION)[0];
if (FIRST_BREAK === undefined) throw new Error('station has no kana rounds');

/** Play the good answers until the dialogue reaches the first conversation break */
function playToFirstBreak(): GameRunner {
  const runner = runnerAt(checkpoint.sceneStart(0));
  // Stop as soon as the break node is reached: choosing again would answer the round
  for (let step = 0; step < 100 && runner.dlgNodeId !== FIRST_BREAK?.at; step++) {
    runner.chooseDialogueChoice(0);
  }
  return runner;
}

describe('Given the first conversation at the station ends', () => {
  it('starts a kana round before the dialogue moves on', () => {
    const runner = playToFirstBreak().waitForKanaInput();
    expect(runner.kanaState).toBe(KanaState.AWAITING);
    expect(runner.dlgNodeId).toBe(FIRST_BREAK.at);
  });

  it('resumes the dialogue at that node once the round is over', () => {
    const runner = playToFirstBreak().waitForKanaInput();
    const before = runner.kanaScore;
    FIRST_BREAK.questions.forEach(() => runner.answerKanaCorrectly());
    runner.waitForDialogueChoices();
    expect(runner.kanaScore - before).toBe(100 * FIRST_BREAK.questions.length);
    expect(runner.kanaState).toBe(KanaState.IDLE);
    expect(runner.dlgNodeId).toBe(FIRST_BREAK.at);
  });
});
