/**
 * Shared dialogue and scenario helpers for emulator-driven tests.
 */

import { expect } from 'vitest';
import { GameRunner } from './game-runner';
import { SCENES } from '@game/scene';
import { DIALOGUE_CHOOSING, DIALOGUE_END_NODE, KANA_AWAITING_INPUT } from './test-constants';

const GAME_OVER_RESET_FRAMES = 10;

/** Repeat the same dialogue choice index N times. */
export function repeatChoice(count: number, choiceIdx = 0): number[] {
  return Array<number>(count).fill(choiceIdx);
}

/** Advance runner to the start of the given scene (completes all prior scenes). */
export function runnerAtScene(sceneIdx: number): GameRunner {
  const runner = new GameRunner().boot().start();
  for (let i = 0; i < sceneIdx; i++) runner.completeScene(i);
  return runner;
}

/** Advance runner to a scene and enter its kana round via the default dialogue path. */
export function runnerInKana(sceneIdx: number): GameRunner {
  return runnerAtScene(sceneIdx).completeDialogueTree().waitForKanaInput();
}

/** Play a full dialogue path and assert it reaches the kana round. */
export function playDialogueTree(
  runner: GameRunner,
  sceneIdx: number,
  choicePerNode: number[],
): void {
  const tree = SCENES[sceneIdx]?.dialogue;
  if (tree === undefined) {
    throw new Error(`Missing scene dialogue for scene ${String(sceneIdx)}`);
  }

  let nodeIdx = 0;

  for (const choiceIdx of choicePerNode) {
    const node = tree[nodeIdx];
    if (node === undefined) {
      throw new Error(`Missing dialogue node ${String(nodeIdx)} in scene ${String(sceneIdx)}`);
    }

    const choice = node.choices[choiceIdx];
    if (choice === undefined) {
      throw new Error(
        `Missing choice ${String(choiceIdx)} at node ${String(nodeIdx)} in scene ${String(sceneIdx)}`,
      );
    }

    runner.waitForDialogueChoices();
    expect(runner.dlgState).toBe(DIALOGUE_CHOOSING);

    for (let i = 0; i < choiceIdx; i++) {
      runner.pressDown().frames(1);
    }
    runner.pressA().frames(5);

    if (choice.next === null) {
      expect(runner.dlgNodeId).toBe(DIALOGUE_END_NODE);
      runner.waitForKanaInput();
      expect(runner.kanaState).toBe(KANA_AWAITING_INPUT);
      return;
    }

    expect(runner.dlgNodeId).toBe(choice.next);
    nodeIdx = choice.next;
  }

  throw new Error(
    `Dialogue path for scene ${String(sceneIdx)} ended before reaching a terminal choice`,
  );
}

/** Answer kana correctly and check score increased by expected delta. */
export function answerKanaAndCheckDelta(runner: GameRunner, expectedDelta: number): void {
  const before = runner.kanaScore;
  runner.answerKanaCorrectly();
  expect(runner.kanaScore - before).toBe(expectedDelta);
}

/** Lose exactly one kana life by answering the same prompt incorrectly three times. */
export function loseOneKanaLife(runner: GameRunner): GameRunner {
  const before = runner.kanaLives;
  runner.answerKanaWrong();
  runner.answerKanaWrong();
  runner.answerKanaWrong();
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

/** Leave the game-over screen and assert the title-state values were restored. */
export function returnToTitleAfterGameOver(runner: GameRunner): GameRunner {
  expect(runner.kanaLives).toBe(0);
  runner.frames(GAME_OVER_RESET_FRAMES).pressStart().frames(GAME_OVER_RESET_FRAMES);
  expect(runner.kanaLives).toBe(3);
  expect(runner.kanaScore).toBe(0);
  return runner;
}
