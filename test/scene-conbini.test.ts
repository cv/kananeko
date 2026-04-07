/**
 * Scene 3 (conbini) tests — dialogue paths and scene advance.
 */

import { describe, it, expect } from 'vitest';
import { runnerAtScene, playDialogueTree } from './helpers/dialogue-helpers';

describe('scene 3: conbini', () => {
  it('dialogue paths + advance', { timeout: 120_000 }, () => {
    // Happy path
    playDialogueTree(runnerAtScene(3), 3, Array<number>(58).fill(0));

    // Browse path
    playDialogueTree(runnerAtScene(3), 3, [0, 2, 0, ...Array<number>(55).fill(0)]);

    // Sweets path
    playDialogueTree(runnerAtScene(3), 3, [0, 1, 0, ...Array<number>(55).fill(0)]);

    // Advance
    const r = runnerAtScene(3);
    r.completeScene(3);
    expect(r.sceneId).toBe(4);
    expect(r.sceneFlags & 0x0f).toBe(0x0f);
  });
});
