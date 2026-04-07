/**
 * Scene 4 (park) lonely-traveler dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { PARK_LONELY_TRAVELER_PATH } from './helpers/scene-paths';

describe('scene 4: park lonely dialogue path', () => {
  it('reaches the kana round via the lonely traveler path', { timeout: 120_000 }, () => {
    playDialogueTree(runnerAtScene(4), 4, [...PARK_LONELY_TRAVELER_PATH]);
  });
});
