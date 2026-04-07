/**
 * Scene 2 (restaurant) happy-path dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { RESTAURANT_HAPPY_PATH } from './helpers/scene-paths';

describe('scene 2: restaurant happy dialogue path', () => {
  it('reaches the kana round via the happy path', { timeout: 60_000 }, () => {
    playDialogueTree(runnerAtScene(2), 2, [...RESTAURANT_HAPPY_PATH]);
  });
});
