/** Holding B fast-forwards the dialogue text. */

import { describe, expect, it } from 'vitest';
import { DIALOGUE_LAYOUT } from '@game/dialogue';
import { DialogueState } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { type GameRunner } from '../helpers/game-runner';
import { readText } from '../helpers/screen';

const LIMIT = 600;
const TEXT_LENGTH = 16;

const choosing = (runner: GameRunner) => (): boolean => runner.dlgState === DialogueState.CHOOSING;

/** Frames until the opening line has been revealed, without pressing anything */
function framesToRevealUnaided(runner: GameRunner): number {
  for (let i = 0; i < LIMIT; i++) {
    if (choosing(runner)()) return i;
    runner.frames(1);
  }
  throw new Error('The text never finished');
}

const shownText = (runner: GameRunner): string =>
  readText(runner, DIALOGUE_LAYOUT.text.row, DIALOGUE_LAYOUT.text.col, TEXT_LENGTH);

describe('Given a line of dialogue is appearing', () => {
  it('reveals it several times faster while B is held', () => {
    const slow = framesToRevealUnaided(runnerAt(checkpoint.sceneStart(0)));
    const fast = runnerAt(checkpoint.sceneStart(0));
    const held = fast.holdBUntil(choosing(fast), LIMIT);
    expect(held * 5).toBeLessThan(slow);
  });

  it('shows the same text either way', () => {
    const slow = runnerAt(checkpoint.sceneStart(0));
    framesToRevealUnaided(slow);
    const fast = runnerAt(checkpoint.sceneStart(0));
    fast.holdBUntil(choosing(fast), LIMIT);
    fast.frames(2);
    slow.frames(2);
    expect(shownText(fast)).toBe(shownText(slow));
    expect(shownText(fast).trim()).not.toBe('');
  });

  it("doesn't pick a reply when B is held past the end", () => {
    const runner = runnerAt(checkpoint.sceneStart(0));
    runner.holdBUntil(choosing(runner), LIMIT);
    const node = runner.dlgNodeId;
    runner.holdB(30);
    expect(runner.dlgState).toBe(DialogueState.CHOOSING);
    expect(runner.dlgNodeId).toBe(node);
  });
});
