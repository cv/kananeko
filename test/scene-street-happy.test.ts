/**
 * Scene 1 (street) happy-path dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { STREET_HAPPY_PATH } from './helpers/scene-paths';

describe('scene 1: street happy dialogue path', () => {
  it('reaches the kana round via the happy path', { timeout: 60_000 }, () => {
    playDialogueTree(runnerAtScene(1), 1, [...STREET_HAPPY_PATH]);
  });
});
