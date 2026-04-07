/**
 * Scene 3 (conbini) browse dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { CONBINI_BROWSE_PATH } from './helpers/scene-paths';

describe('scene 3: conbini browse dialogue path', () => {
  it('reaches the kana round via the browse path', { timeout: 120_000 }, () => {
    playDialogueTree(runnerAtScene(3), 3, [...CONBINI_BROWSE_PATH]);
  });
});
