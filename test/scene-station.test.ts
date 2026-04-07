/**
 * Scene 0 (station) tests — dialogue coverage, kana scoring, and scene advance.
 */

import { describe, it, expect } from 'vitest';
import {
  answerKanaAndCheckDelta,
  playDialogueTree,
  repeatChoice,
  runnerAtScene,
} from './helpers/dialogue-helpers';

const STATION_DIALOGUE_PATHS = [
  ['happy path', repeatChoice(52)],
  ['tired clerk path', [0, 2, 0, ...repeatChoice(49)]],
  ['name detour path', [0, 0, 0, 0, 0, 0, 0, 0, 2, 0, ...repeatChoice(43)]],
] as const;

describe('scene 0: station dialogue paths', () => {
  it.each(STATION_DIALOGUE_PATHS)(
    'reaches the kana round via the %s',
    { timeout: 60_000 },
    (_pathName, dialogueChoices) => {
      playDialogueTree(runnerAtScene(0), 0, [...dialogueChoices]);
    },
  );
});

describe('scene 0: station progression', () => {
  it('awards 100 points for each of the first two correct kana answers', () => {
    const runner = runnerAtScene(0);
    runner.completeDialogueTree();
    answerKanaAndCheckDelta(runner, 100);
    answerKanaAndCheckDelta(runner, 100);
  });

  it('advances to scene 1 after the station scene is complete', () => {
    const runner = runnerAtScene(0);
    runner.completeScene(0);
    expect(runner.sceneId).toBe(1);
    expect(runner.sceneFlags & 0x01).toBe(0x01);
  });
});
