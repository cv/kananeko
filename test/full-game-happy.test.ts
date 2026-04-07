/**
 * Full game completion-order test.
 */

import { describe, it, expect } from 'vitest';
import { runnerAtScene } from './helpers/dialogue-helpers';
import { SCENES } from '@game/scene';

describe('Given the player plays from start to finish', () => {
  it('plays all five scenes to completion in order', () => {
    const runner = runnerAtScene(0);
    for (let i = 0; i < SCENES.length; i++) {
      expect(runner.sceneId).toBe(i);
      runner.completeScene(i);
    }
    expect(runner.sceneFlags).toBe(0x1f);
  });
});
