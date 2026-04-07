/**
 * Scene 1 (street) lost-tourist dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { STREET_LOST_TOURIST_PATH } from './helpers/scene-paths';

describe('scene 1: street tourist dialogue path', () => {
  it('reaches the kana round via the lost tourist path', { timeout: 60_000 }, () => {
    playDialogueTree(runnerAtScene(1), 1, [...STREET_LOST_TOURIST_PATH]);
  });
});
