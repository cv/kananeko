/**
 * Scene 0 (station) tests — dialogue paths, kana scoring, scene advance.
 */

import { describe, it, expect } from 'vitest';
import {
  runnerAtScene,
  playDialogueTree,
  answerKanaAndCheckDelta,
} from './helpers/dialogue-helpers';

describe('scene 0: station', () => {
  it('dialogue paths + kana + advance', { timeout: 60_000 }, () => {
    const r = runnerAtScene(0);

    // Happy path
    playDialogueTree(runnerAtScene(0), 0, Array<number>(52).fill(0));

    // Tired path
    playDialogueTree(runnerAtScene(0), 0, [0, 2, 0, ...Array<number>(49).fill(0)]);

    // Name detour
    playDialogueTree(runnerAtScene(0), 0, [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      2,
      0,
      ...Array<number>(43).fill(0),
    ]);

    // Kana scoring
    r.completeDialogueTree();
    answerKanaAndCheckDelta(r, 100);
    answerKanaAndCheckDelta(r, 100);
  });

  it('advances to scene 1', () => {
    const r = runnerAtScene(0);
    r.completeScene(0);
    expect(r.sceneId).toBe(1);
    expect(r.sceneFlags & 0x01).toBe(0x01);
  });
});
