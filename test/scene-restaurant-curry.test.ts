/**
 * Scene 2 (restaurant) curry-order dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { RESTAURANT_CURRY_PATH } from './helpers/scene-paths';

describe('scene 2: restaurant curry dialogue path', () => {
  it('reaches the kana round via the curry order path', { timeout: 60_000 }, () => {
    playDialogueTree(runnerAtScene(2), 2, [...RESTAURANT_CURRY_PATH]);
  });
});
