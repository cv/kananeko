/**
 * Shared emulator test suite for one scene: dialogue paths plus the kana round.
 */

import { sceneRounds, SCENES } from '@game/scene';
import { describe, expect, it } from 'vitest';

import { checkpoint, runnerAt } from './checkpoints';
import { answerKanaAndCheckDelta, type Detours, firstTryPoints, playDialoguePath } from './play';

export interface DialoguePath {
  /** What the path explores, e.g. "tired clerk" */
  readonly name: string;
  /** Non-default choices by node id (see Detours) */
  readonly detours: Detours;
}

const FIRST_TRY_POINTS = 100;
const SCENE_ADVANCE_FRAMES = 10;
const TIMEOUT = 60_000;

/**
 * The always-good path is implied; list only the detours worth exercising. The
 * scene is named (its place in SCENES can change as scenes are added).
 */
export function describeScene(sceneName: string, paths: readonly DialoguePath[]): void {
  const sceneIdx = SCENES.findIndex((s) => s.name === sceneName);
  const scene = SCENES[sceneIdx];
  if (scene === undefined) throw new Error(`No scene named ${sceneName}`);
  const isLast = sceneIdx === SCENES.length - 1;
  const doneFlags = (1 << (sceneIdx + 1)) - 1;

  describe(`scene ${String(sceneIdx)} (${scene.name})`, () => {
    it.each([{ name: 'happy', detours: {} }, ...paths])(
      'reaches the kana round via the $name path',
      { timeout: TIMEOUT },
      ({ detours }) => {
        playDialoguePath(runnerAt(checkpoint.sceneStart(sceneIdx)), sceneIdx, detours);
      },
    );

    it(
      `awards ${String(FIRST_TRY_POINTS)} per first-try kana answer, then ${isLast ? 'finishes the game' : 'advances'}`,
      { timeout: TIMEOUT },
      () => {
        const runner = runnerAt(checkpoint.kanaStart(sceneIdx));
        sceneRounds(scene)
          .at(-1)
          ?.questions.forEach(() => {
            answerKanaAndCheckDelta(runner, firstTryPoints(runner));
          });
        runner.frames(SCENE_ADVANCE_FRAMES);
        expect(runner.sceneFlags & doneFlags).toBe(doneFlags);
        if (!isLast) expect(runner.sceneId).toBe(sceneIdx + 1);
      },
    );
  });
}
