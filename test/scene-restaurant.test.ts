/**
 * Scene 2 (restaurant) tests — dialogue paths and scene advance.
 */

import { describe, it, expect } from 'vitest';
import { runnerAtScene, playDialogueTree } from './helpers/dialogue-helpers';

describe('scene 2: restaurant', () => {
  it('dialogue paths + advance', { timeout: 60_000 }, () => {
    // Happy path
    playDialogueTree(runnerAtScene(2), 2, Array<number>(56).fill(0));

    // Curry path
    playDialogueTree(runnerAtScene(2), 2, [0, 0, 0, 0, 1, 0, ...Array<number>(50).fill(0)]);

    // Tea + sweet path
    playDialogueTree(runnerAtScene(2), 2, [
      0,
      0,
      0,
      0,
      2,
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
    const r = runnerAtScene(2);
    r.completeScene(2);
    expect(r.sceneId).toBe(3);
    expect(r.sceneFlags & 0x07).toBe(0x07);
  });
});
