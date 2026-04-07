/** Dialogue engine tests. */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import { buildDialogueTree } from '@game/dialogue';

describe('dialogue', () => {
  it('encodes dialogue tree correctly', () => {
    const data = buildDialogueTree([
      {
        text: 'こんにちは',
        choices: [
          { text: 'はい', next: 1 },
          { text: 'いいえ', next: null, hint: 'はい!' },
        ],
      },
      { text: 'さようなら', choices: [{ text: 'またね', next: null }] },
    ]);
    expect(data[0]).toBe(2); // node count
    const node0Offset = (data[1] ?? 0) | ((data[2] ?? 0) << 8);
    expect(node0Offset).toBe(5); // header = 1 + 2*2
  });

  it('opens dialogue after START', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.dlgState).toBeGreaterThan(0);
  });

  it('reveals text and transitions to choosing', () => {
    const runner = new GameRunner().boot().start();
    runner.waitForDialogueChoices();
    expect(runner.dlgState).toBe(3);
  });

  it('confirms choice and stores result', () => {
    const runner = new GameRunner().boot().start();
    runner.waitForDialogueChoices().press('A');
    expect(runner.dlgResult).toBe(0);
  });

  it('navigates choices with DOWN', () => {
    const runner = new GameRunner().boot().start();
    runner.advanceDialogue(); // node 0 → node 1
    runner.waitForDialogueChoices();
    runner.press('DOWN').frames(3).press('A');
    expect(runner.dlgResult).toBe(1);
  });

  it('branches to next node after choice', () => {
    const runner = new GameRunner().boot().start();
    runner.advanceDialogue(); // node 0 → node 1
    expect(runner.dlgNodeId).toBe(1);
    runner.advanceDialogue(); // node 1 → node 2
    expect(runner.dlgNodeId).toBe(2);
    runner.completeDialogueTree(0);
    expect(runner.dlgNodeId).toBe(0xff);
  });
});
