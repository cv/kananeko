/**
 * Shared dialogue-tree helpers for scene tests.
 */

import { expect } from 'vitest';
import { GameRunner } from './game-runner';
import { SCENES } from '@game/scene';

/** Advance runner to the start of the given scene (completes all prior scenes) */
export function runnerAtScene(sceneIdx: number): GameRunner {
  const r = new GameRunner().boot().start();
  for (let i = 0; i < sceneIdx; i++) r.completeScene(i);
  return r;
}

export function playDialogueTree(
  runner: GameRunner,
  sceneIdx: number,
  choicePerNode: number[],
): void {
  const tree = SCENES[sceneIdx]!.dialogue;
  let nodeIdx = 0;

  for (const choiceIdx of choicePerNode) {
    const node = tree[nodeIdx]!;
    runner.waitForDialogueChoices();
    expect(runner.dlgState).toBe(3);

    for (let i = 0; i < choiceIdx; i++) {
      runner.pressDown().frames(1);
    }
    runner.pressA().frames(5);

    const choice = node.choices[choiceIdx]!;
    if (choice.next === null) {
      expect(runner.dlgNodeId).toBe(0xff);
      return;
    }
    nodeIdx = choice.next;
  }
}

/** Answer kana correctly and check score increased by expected delta */
export function answerKanaAndCheckDelta(runner: GameRunner, expectedDelta: number): void {
  const before = runner.kanaScore;
  runner.answerKanaCorrectly();
  expect(runner.kanaScore - before).toBe(expectedDelta);
}
