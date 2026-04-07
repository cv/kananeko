/**
 * Scene 3 (conbini) progression tests.
 */

import { describe, it, expect } from 'vitest';
import { runnerAtScene } from './helpers/dialogue-helpers';

describe('scene 3: conbini progression', () => {
  it('advances to scene 4 after the conbini scene is complete', () => {
    const runner = runnerAtScene(3);
    runner.completeScene(3);
    expect(runner.sceneId).toBe(4);
    expect(runner.sceneFlags & 0x0f).toBe(0x0f);
  });
});
