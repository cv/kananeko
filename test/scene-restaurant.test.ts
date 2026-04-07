/**
 * Scene 2 (restaurant) tests — dialogue coverage and scene advance.
 */

import { describe, it, expect } from 'vitest';
import { playDialogueTree, repeatChoice, runnerAtScene } from './helpers/dialogue-helpers';

const RESTAURANT_DIALOGUE_PATHS = [
  ['happy path', repeatChoice(56)],
  ['curry order path', [0, 0, 0, 0, 1, 0, ...repeatChoice(50)]],
  [
    'tea and sweet path',
    [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, ...repeatChoice(38)],
  ],
] as const;

describe('scene 2: restaurant dialogue paths', () => {
  it.each(RESTAURANT_DIALOGUE_PATHS)(
    'reaches the kana round via the %s',
    { timeout: 60_000 },
    (_pathName, dialogueChoices) => {
      playDialogueTree(runnerAtScene(2), 2, [...dialogueChoices]);
    },
  );
});

describe('scene 2: restaurant progression', () => {
  it('advances to scene 3 after the restaurant scene is complete', () => {
    const runner = runnerAtScene(2);
    runner.completeScene(2);
    expect(runner.sceneId).toBe(3);
    expect(runner.sceneFlags & 0x07).toBe(0x07);
  });
});
