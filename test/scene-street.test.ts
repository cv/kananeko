/**
 * Scene 1 (street) tests — dialogue paths and scene advance.
 */

import { describe, it, expect } from 'vitest';
import { runnerAtScene, playDialogueTree } from './helpers/dialogue-helpers';

describe('scene 1: street', () => {
  it('dialogue paths + advance', { timeout: 60_000 }, () => {
    // Happy path
    playDialogueTree(runnerAtScene(1), 1, Array<number>(57).fill(0));

    // Lost path
    playDialogueTree(runnerAtScene(1), 1, [0, 2, 0, ...Array<number>(54).fill(0)]);

    // Return visitor
    playDialogueTree(runnerAtScene(1), 1, [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      ...Array<number>(38).fill(0),
    ]);

    // Advance
    const r = runnerAtScene(1);
    r.completeScene(1);
    expect(r.sceneId).toBe(2);
    expect(r.sceneFlags & 0x03).toBe(0x03);
  });
});
