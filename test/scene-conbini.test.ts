/**
 * Scene 3 (conbini) tests — dialogue coverage and scene advance.
 */

import { describe, it, expect } from 'vitest';
import { playDialogueTree, repeatChoice, runnerAtScene } from './helpers/dialogue-helpers';

const CONBINI_DIALOGUE_PATHS = [
  ['happy path', repeatChoice(58)],
  ['browse path', [0, 2, 0, ...repeatChoice(55)]],
  ['sweets path', [0, 1, 0, ...repeatChoice(55)]],
] as const;

describe('scene 3: conbini dialogue paths', () => {
  it.each(CONBINI_DIALOGUE_PATHS)(
    'reaches the kana round via the %s',
    { timeout: 120_000 },
    (_pathName, dialogueChoices) => {
      playDialogueTree(runnerAtScene(3), 3, [...dialogueChoices]);
    },
  );
});

describe('scene 3: conbini progression', () => {
  it('advances to scene 4 after the conbini scene is complete', () => {
    const runner = runnerAtScene(3);
    runner.completeScene(3);
    expect(runner.sceneId).toBe(4);
    expect(runner.sceneFlags & 0x0f).toBe(0x0f);
  });
});
