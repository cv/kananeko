/**
 * Scene 4 (park) progression tests.
 */

import { describe, it, expect } from 'vitest';
import { runnerAtScene } from './helpers/dialogue-helpers';

describe('scene 4: park progression', () => {
  it('sets all scene flags after the final scene is complete', { timeout: 60_000 }, () => {
    const runner = runnerAtScene(4);
    runner.completeScene(4);
    expect(runner.sceneFlags & 0x1f).toBe(0x1f);
  });
});
