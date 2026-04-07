/**
 * Scene 1 (street) return-visitor dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { STREET_RETURN_VISITOR_PATH } from './helpers/scene-paths';

describe('scene 1: street return dialogue path', () => {
  it('reaches the kana round via the return visitor path', { timeout: 60_000 }, () => {
    playDialogueTree(runnerAtScene(1), 1, [...STREET_RETURN_VISITOR_PATH]);
  });
});
