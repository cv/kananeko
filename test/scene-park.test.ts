/**
 * Scene 4 (park) tests — dialogue coverage and final scene flags.
 */

import { describe, it, expect } from 'vitest';
import { playDialogueTree, repeatChoice, runnerAtScene } from './helpers/dialogue-helpers';

const PARK_DIALOGUE_PATHS = [
  ['happy path', repeatChoice(62)],
  ['weather chat path', [0, 0, 0, 1, 0, ...repeatChoice(57)]],
  ['lonely traveler path', [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, ...repeatChoice(51)]],
] as const;

describe('scene 4: park dialogue paths', () => {
  it.each(PARK_DIALOGUE_PATHS)(
    'reaches the kana round via the %s',
    { timeout: 120_000 },
    (_pathName, dialogueChoices) => {
      playDialogueTree(runnerAtScene(4), 4, [...dialogueChoices]);
    },
  );
});

describe('scene 4: park progression', () => {
  it('sets all scene flags after the final scene is complete', () => {
    const runner = runnerAtScene(4);
    runner.completeScene(4);
    expect(runner.sceneFlags & 0x1f).toBe(0x1f);
  });
});
