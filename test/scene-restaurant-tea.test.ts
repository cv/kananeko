/**
 * Scene 2 (restaurant) tea-and-sweet dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { RESTAURANT_TEA_PATH } from './helpers/scene-paths';

describe('scene 2: restaurant tea dialogue path', () => {
  it('reaches the kana round via the tea and sweet path', { timeout: 60_000 }, () => {
    playDialogueTree(runnerAtScene(2), 2, [...RESTAURANT_TEA_PATH]);
  });
});
