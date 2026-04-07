/**
 * Scene 3 (conbini) sweets dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { CONBINI_SWEETS_PATH } from './helpers/scene-paths';

describe('scene 3: conbini sweets dialogue path', () => {
  it('reaches the kana round via the sweets path', { timeout: 120_000 }, () => {
    playDialogueTree(runnerAtScene(3), 3, [...CONBINI_SWEETS_PATH]);
  });
});
