/** One-question kana chances inside a conversation */

import { describe, expect, it } from 'vitest';
import type { DialogueNode } from '@game/dialogue';
import { choiceRating } from '@game/dialogue-data';
import { SCENES, sceneQuiz } from '@game/scene';
import { FILL_IN_BLANK, REDEEM_KEY } from '@game/rounds';
import { DIALOGUE_LAYOUT } from '@game/dialogue';
import { asSeenOnScreen, readText } from '../helpers/screen';
import { KanaMode, KanaState, MAX_LIVES } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import type { GameRunner } from '../helpers/game-runner';

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

const SAY_IT = sceneQuiz(STATION).chances.find((chance) => (chance.key & REDEEM_KEY) === 0);
if (SAY_IT === undefined) throw new Error('the station has no fill-in reply');
const FILL_IN_REPLY = sceneQuiz(STATION).dialogue[SAY_IT.key]?.choices[0]?.text ?? '';

/** Choices (logical indices) leading from node 0 to `target`, shortest first */
function routeTo(tree: readonly DialogueNode[], target: number): number[] {
  const routes = new Map<number, number[]>([[0, []]]);
  const queue = [0];
  for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
    const route = routes.get(node) ?? [];
    if (node === target) return route;
    tree[node]?.choices.forEach((choice, i) => {
      if (choice.next !== null && !routes.has(choice.next)) {
        routes.set(choice.next, [...route, i]);
        queue.push(choice.next);
      }
    });
  }
  throw new Error(`Node ${String(target)} is unreachable`);
}

/** Play up to the first fill-in reply */
function atFillIn(): GameRunner {
  const runner = runnerAt(checkpoint.sceneStart(0));
  for (const choice of routeTo(STATION.dialogue, SAY_IT?.key ?? 0))
    runner.chooseDialogueChoice(choice);
  return runner.waitForDialogueChoices();
}

describe('Given a reply to fill in', () => {
  it('shows the reply with a kana blanked out', () => {
    expect(FILL_IN_REPLY).toContain(FILL_IN_BLANK);
    const runner = atFillIn();
    const rows = DIALOGUE_LAYOUT.choiceRows.map((row) =>
      readText(runner, row, DIALOGUE_LAYOUT.choiceCol, Array.from(FILL_IN_REPLY).length),
    );
    expect(rows).toContain(asSeenOnScreen(FILL_IN_REPLY));
  });

  it('asks for the missing kana once the reply is picked, scoring a first-try answer', () => {
    const runner = atFillIn().chooseDialogueChoice(0).waitForKanaInput();
    expect(runner.kanaMode).toBe(KanaMode.SAY_IT);
    const score = runner.kanaScore;
    runner.answerKanaCorrectly();
    expect(runner.kanaScore - score).toBe(100);
  });

  it('just shows the answer after a miss, and the conversation goes on', () => {
    const runner = atFillIn().chooseDialogueChoice(0).waitForKanaInput();
    const { kanaScore, kanaLives } = runner;
    runner.answerKanaWrong();
    expect(runner.kanaScore).toBe(kanaScore);
    expect(runner.kanaLives).toBe(kanaLives);
    runner.waitForDialogueChoices();
    expect(runner.dlgNodeId).toBe(STATION.dialogue[SAY_IT.key]?.choices[0]?.next);
  });
});

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
