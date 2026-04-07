/**
 * Scene 4 (park) happy-path dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { PARK_HAPPY_PATH } from './helpers/scene-paths';

describe('scene 4: park happy dialogue path', () => {
  it('reaches the kana round via the happy path', { timeout: 120_000 }, () => {
    playDialogueTree(runnerAtScene(4), 4, [...PARK_HAPPY_PATH]);
  });
});
