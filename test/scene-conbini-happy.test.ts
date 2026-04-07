/**
 * Scene 3 (conbini) happy-path dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { CONBINI_HAPPY_PATH } from './helpers/scene-paths';

describe('scene 3: conbini happy dialogue path', () => {
  it('reaches the kana round via the happy path', { timeout: 120_000 }, () => {
    playDialogueTree(runnerAtScene(3), 3, [...CONBINI_HAPPY_PATH]);
  });
});
