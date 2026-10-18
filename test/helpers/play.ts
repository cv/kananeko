/**
 * Scenario helpers for emulator-driven tests.
 */

import { expect } from 'vitest';
import { type DialogueNode } from '@game/dialogue';
import { SCENES } from '@game/scene';
import { DialogueState, END_OF_CONVERSATION, KanaState, MAX_LIVES } from '@game/state';
import { type GameRunner } from './game-runner';

const GAME_OVER_RESET_FRAMES = 10;
const MAX_DIALOGUE_STEPS = 500;

/** Non-default choices by node id; every other node takes choice 0 (the good answer). */
export type Detours = Readonly<Record<number, number>>;

function sceneDialogue(sceneIdx: number): readonly DialogueNode[] {
  const scene = SCENES[sceneIdx];
  if (scene === undefined) throw new Error(`No scene ${String(sceneIdx)}`);
  return scene.dialogue;
}

/**
 * Play a scene's dialogue from node 0, taking `detours` where given and the good
 * answer elsewhere. Asserts the engine follows every edge and reaches the kana round.
 */
export function playDialoguePath(
  runner: GameRunner,
  sceneIdx: number,
  detours: Detours = {},
): void {
  const tree = sceneDialogue(sceneIdx);
  const unused = new Set(Object.keys(detours).map(Number));
  let nodeIdx = 0;

  for (let step = 0; step < MAX_DIALOGUE_STEPS; step++) {
    const choiceIdx = detours[nodeIdx] ?? 0;
    unused.delete(nodeIdx);
    const choice = tree[nodeIdx]?.choices[choiceIdx];
    if (choice === undefined) {
      throw new Error(`No choice ${String(choiceIdx)} at node ${String(nodeIdx)}`);
    }

    runner.waitForDialogueChoices();
    expect(runner.dlgState).toBe(DialogueState.CHOOSING);
    runner.chooseDialogueChoice(choiceIdx).frames(2);

    if (choice.next === null) {
      expect(runner.dlgNodeId).toBe(END_OF_CONVERSATION);
      runner.waitForKanaInput();
      expect(runner.kanaState).toBe(KanaState.AWAITING);
      expect([...unused], 'detours at nodes the path never visited').toEqual([]);
      return;
    }

    expect(runner.dlgNodeId).toBe(choice.next);
    nodeIdx = choice.next;
  }
  throw new Error(`Dialogue in scene ${String(sceneIdx)} did not end`);
}

/** Answer kana correctly and check the score changed by the expected amount. */
export function answerKanaAndCheckDelta(runner: GameRunner, expectedDelta: number): void {
  const before = runner.kanaScore;
  runner.answerKanaCorrectly();
  expect(runner.kanaScore - before).toBe(expectedDelta);
}

/** Lose exactly one kana life by answering the same prompt incorrectly three times. */
export function loseOneKanaLife(runner: GameRunner): GameRunner {
  const before = runner.kanaLives;
  runner.answerKanaWrong().answerKanaWrong().answerKanaWrong();
  expect(runner.kanaLives).toBe(Math.max(0, before - 1));
  return runner;
}

/** Lose every remaining kana life. */
export function loseAllKanaLives(runner: GameRunner): GameRunner {
  while (runner.kanaLives > 0) {
    loseOneKanaLife(runner);
  }
  return runner;
}

/** Leave the game-over screen and assert the run state was reset. */
export function returnToTitleAfterGameOver(runner: GameRunner): GameRunner {
  expect(runner.kanaLives).toBe(0);
  runner.frames(GAME_OVER_RESET_FRAMES).pressStart().frames(GAME_OVER_RESET_FRAMES);
  expect(runner.kanaLives).toBe(MAX_LIVES);
  expect(runner.kanaScore).toBe(0);
  return runner;
}
