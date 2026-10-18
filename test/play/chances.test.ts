/** One-question kana chances inside a conversation */

import { describe, expect, it } from 'vitest';
import { type DialogueNode } from '@game/dialogue';
import { choiceRating } from '@game/dialogue-data';
import { SCENES, sceneQuiz } from '@game/scene';
import { REDEEM_KEY } from '@game/rounds';
import { KanaMode, KanaState, MAX_LIVES } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { type GameRunner } from '../helpers/game-runner';

const STATION = SCENES[0];
const OPENING: DialogueNode = STATION.dialogue[0];
const BAD = OPENING.choices.findIndex((choice, i) => choiceRating(choice, i) === 'bad');
const REDEMPTION = sceneQuiz(STATION).chances.find((chance) => chance.key === (0 | REDEEM_KEY));

/** Give a bad answer to the opening line and wait for the chance to win the life back */
function afterBadAnswer(): GameRunner {
  const runner = runnerAt(checkpoint.sceneStart(0)).chooseDialogueChoice(BAD).waitForKanaInput();
  expect(runner.kanaLives).toBe(MAX_LIVES - 1);
  return runner;
}

describe('Given a bad answer in a conversation', () => {
  it('offers one kana question about that line', () => {
    expect(REDEMPTION).toBeDefined();
    const runner = afterBadAnswer();
    expect(runner.kanaMode).toBe(KanaMode.REDEEM);
    expect(runner.kanaState).toBe(KanaState.AWAITING);
  });

  it('wins the life back with a correct answer, without points', () => {
    const runner = afterBadAnswer();
    const score = runner.kanaScore;
    runner.answerKanaCorrectly();
    expect(runner.kanaLives).toBe(MAX_LIVES);
    expect(runner.kanaScore).toBe(score);
  });

  it('costs nothing more after a wrong answer, and the conversation goes on', () => {
    const runner = afterBadAnswer();
    runner.missRedemptions = true;
    runner.waitForDialogueChoices();
    expect(runner.kanaLives).toBe(MAX_LIVES - 1);
    expect(runner.kanaState).toBe(KanaState.IDLE);
    expect(runner.dlgNodeId).toBe(OPENING.choices[BAD]?.next);
  });
});
