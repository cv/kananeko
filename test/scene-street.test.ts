/**
 * Scene 1 (street) tests — dialogue coverage and scene advance.
 */

import { describe, it, expect } from 'vitest';
import { playDialogueTree, repeatChoice, runnerAtScene } from './helpers/dialogue-helpers';

const STREET_DIALOGUE_PATHS = [
  ['happy path', repeatChoice(58)],
  ['lost tourist path', [0, 2, 0, ...repeatChoice(54)]],
  [
    'return visitor path',
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, ...repeatChoice(39)],
  ],
] as const;

describe('scene 1: street dialogue paths', () => {
  it.each(STREET_DIALOGUE_PATHS)(
    'reaches the kana round via the %s',
    { timeout: 60_000 },
    (_pathName, dialogueChoices) => {
      playDialogueTree(runnerAtScene(1), 1, [...dialogueChoices]);
    },
  );
});

describe('scene 1: street progression', () => {
  it('advances to scene 2 after the street scene is complete', () => {
    const runner = runnerAtScene(1);
    runner.completeScene(1);
    expect(runner.sceneId).toBe(2);
    expect(runner.sceneFlags & 0x03).toBe(0x03);
  });
});
