/**
 * Scene 1 (street) progression tests.
 */

import { describe, it, expect } from 'vitest';
import { runnerAtScene } from './helpers/dialogue-helpers';

describe('scene 1: street progression', () => {
  it('advances to scene 2 after the street scene is complete', () => {
    const runner = runnerAtScene(1);
    runner.completeScene(1);
    expect(runner.sceneId).toBe(2);
    expect(runner.sceneFlags & 0x03).toBe(0x03);
  });
});
