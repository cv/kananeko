/**
 * Full game title-screen smoke tests.
 */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';

describe('Given the player is on the title screen', () => {
  it('stays idle after boot until the player presses START', () => {
    expect(new GameRunner().boot().dlgState).toBe(0);
  });

  it('starts the first scene when the player presses START', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgState).toBeGreaterThan(0);
  });
});
