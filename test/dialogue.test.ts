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
    runner.waitForDialogueChoices().pressA();
    expect(runner.dlgResult).toBe(0);
  });

  it('navigates choices with DOWN', () => {
    const runner = new GameRunner().boot().start();
    runner.advanceDialogue(); // node 0 → node 1
    runner.waitForDialogueChoices();
    runner.pressDown().frames(3).pressA();
    expect(runner.dlgResult).toBe(1);
  });

  it('good choice: +10 score and regains a life', () => {
    const runner = new GameRunner().boot().start();
    // Lose a life first via bad choice
    runner.waitForDialogueChoices();
    runner.pressDown().frames(3).pressA().frames(3);
    expect(runner.kanaLives).toBe(2);
    // Now good choice should restore the life
    runner.waitForDialogueChoices().pressA().frames(3);
    expect(runner.kanaLives).toBe(3); // restored
    expect(runner.deltaType).toBe(2); // DELTA_PLUS_10
  });

  it('good choice: lives capped at 3', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.kanaLives).toBe(3);
    runner.waitForDialogueChoices().pressA().frames(3);
    expect(runner.kanaLives).toBe(3); // still 3, not 4
  });

  it('bad choice: -5 score and loses a life', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.kanaLives).toBe(3);
    runner.waitForDialogueChoices();
    runner.pressDown().frames(3).pressA().frames(3);
    expect(runner.kanaLives).toBe(2);
    expect(runner.deltaType).toBe(3); // DELTA_MINUS_5
  });

  it('3 bad choices ends dialogue early and enters kana with fresh lives', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.kanaLives).toBe(3);
    // Pick bad choice 3 times in a row
    for (let i = 0; i < 3; i++) {
      runner.waitForDialogueChoices();
      runner.pressDown().frames(3).pressA().frames(5);
    }
    // Dialogue ended — kana starts with 1 restocked life
    runner.waitForKanaInput();
    expect(runner.kanaState).toBe(2);
    expect(runner.kanaLives).toBe(1); // just 1 life — kana is harder now
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
