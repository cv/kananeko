/**
 * Scene 4 (park) tests — dialogue paths and flags.
 */

import { describe, it, expect } from 'vitest';
import { runnerAtScene, playDialogueTree } from './helpers/dialogue-helpers';

describe('scene 4: park', () => {
  it('dialogue paths + flags', { timeout: 120_000 }, () => {
    // Happy path
    playDialogueTree(runnerAtScene(4), 4, Array<number>(62).fill(0));

    // Weather path
    playDialogueTree(runnerAtScene(4), 4, [0, 0, 0, 1, 0, ...Array<number>(57).fill(0)]);

    // Lonely path
    playDialogueTree(runnerAtScene(4), 4, [
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
      ...Array<number>(51).fill(0),
    ]);

    // All flags
    const r = runnerAtScene(4);
    r.completeScene(4);
    expect(r.sceneFlags & 0x1f).toBe(0x1f);
  });
});
