/**
 * Scene 2 (restaurant) progression tests.
 */

import { describe, it, expect } from 'vitest';
import { runnerAtScene } from './helpers/dialogue-helpers';

describe('scene 2: restaurant progression', () => {
  it('advances to scene 3 after the restaurant scene is complete', () => {
    const runner = runnerAtScene(2);
    runner.completeScene(2);
    expect(runner.sceneId).toBe(3);
    expect(runner.sceneFlags & 0x07).toBe(0x07);
  });
});
