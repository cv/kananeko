/** Dialogue engine tests. */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import {
  DELTA_MINUS_5,
  DELTA_PLUS_10,
  DIALOGUE_CHOOSING,
  DIALOGUE_END_NODE,
  KANA_AWAITING_INPUT,
} from './helpers/test-constants';
import { buildDialogueTree } from '@game/dialogue';

describe('dialogue', () => {
  it('encodes a dialogue tree with the expected header and node offsets', () => {
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

  it('opens the first dialogue after the player presses START', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.dlgState).toBeGreaterThan(0);
  });

  it('reveals the opening text and enters the choice-selection state', () => {
    const runner = new GameRunner().boot().start();
    runner.waitForDialogueChoices();
    expect(runner.dlgState).toBe(DIALOGUE_CHOOSING);
  });

  it('stores the selected choice index when the player confirms a choice', () => {
    const runner = new GameRunner().boot().start();
    runner.waitForDialogueChoices().pressA();
    expect(runner.dlgResult).toBe(0);
  });

  it('moves the dialogue cursor down before confirming the selected choice', () => {
    const runner = new GameRunner().boot().start();
    runner.advanceDialogue(); // node 0 → node 1
    runner.waitForDialogueChoices();
    runner.pressDown().frames(3).pressA();
    expect(runner.dlgResult).toBe(1);
  });

  it('restores one life and shows a positive delta after a good choice', () => {
    const runner = new GameRunner().boot().start();
    // Lose a life first via bad choice
    runner.waitForDialogueChoices();
    runner.pressDown().frames(3).pressA().frames(3);
    expect(runner.kanaLives).toBe(2);
    // Now good choice should restore the life
    runner.waitForDialogueChoices().pressA().frames(3);
    expect(runner.kanaLives).toBe(3); // restored
    expect(runner.deltaType).toBe(DELTA_PLUS_10);
  });

  it('does not increase lives above the cap after a good choice', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.kanaLives).toBe(3);
    runner.waitForDialogueChoices().pressA().frames(3);
    expect(runner.kanaLives).toBe(3); // still 3, not 4
  });

  it('removes one life and shows a negative delta after a bad choice', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.kanaLives).toBe(3);
    runner.waitForDialogueChoices();
    runner.pressDown().frames(3).pressA().frames(3);
    expect(runner.kanaLives).toBe(2);
    expect(runner.deltaType).toBe(DELTA_MINUS_5);
  });

  it('ends the dialogue early after three bad choices and restocks one kana life', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.kanaLives).toBe(3);
    // Pick bad choice 3 times in a row
    for (let i = 0; i < 3; i++) {
      runner.waitForDialogueChoices();
      runner.pressDown().frames(3).pressA().frames(5);
    }
    // Dialogue ended — kana starts with 1 restocked life
    runner.waitForKanaInput();
    expect(runner.kanaState).toBe(KANA_AWAITING_INPUT);
    expect(runner.kanaLives).toBe(1); // just 1 life — kana is harder now
  });

  it('branches to the next dialogue node after each confirmed choice', () => {
    const runner = new GameRunner().boot().start();
    runner.advanceDialogue(); // node 0 → node 1
    expect(runner.dlgNodeId).toBe(1);
    runner.advanceDialogue(); // node 1 → node 2
    expect(runner.dlgNodeId).toBe(2);
    runner.completeDialogueTree();
    expect(runner.dlgNodeId).toBe(DIALOGUE_END_NODE);
  });
});
