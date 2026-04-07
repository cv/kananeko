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

function runnerAtOpeningDialogue(): GameRunner {
  return new GameRunner().boot().start();
}

describe('Given the dialogue tree is being encoded into ROM data', () => {
  it('stores the node count in the header and points the first node after the offset table', () => {
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
    expect(data[0]).toBe(2);
    const node0Offset = (data[1] ?? 0) | ((data[2] ?? 0) << 8);
    expect(node0Offset).toBe(5);
  });
});

describe('Given the player has started the opening conversation', () => {
  it('opens the first dialogue after the player presses START', () => {
    const runner = runnerAtOpeningDialogue();
    expect(runner.dlgState).toBeGreaterThan(0);
  });

  it('reveals the opening text and enters the choice-selection state', () => {
    const runner = runnerAtOpeningDialogue();
    runner.waitForDialogueChoices();
    expect(runner.dlgState).toBe(DIALOGUE_CHOOSING);
  });

  it('stores the selected choice index when the player confirms a choice', () => {
    const runner = runnerAtOpeningDialogue();
    runner.waitForDialogueChoices().pressA();
    expect(runner.dlgResult).toBe(0);
  });

  it('moves the dialogue cursor down before confirming the selected choice', () => {
    const runner = runnerAtOpeningDialogue();
    runner.advanceDialogue();
    runner.waitForDialogueChoices();
    runner.pressDown().frames(3).pressA();
    expect(runner.dlgResult).toBe(1);
  });

  it('restores one life and shows a positive delta after a good choice', () => {
    const runner = runnerAtOpeningDialogue();
    runner.waitForDialogueChoices();
    runner.pressDown().frames(3).pressA().frames(3);
    expect(runner.kanaLives).toBe(2);

    runner.waitForDialogueChoices().pressA().frames(3);
    expect(runner.kanaLives).toBe(3);
    expect(runner.deltaType).toBe(DELTA_PLUS_10);
  });

  it('does not increase lives above the cap after a good choice', () => {
    const runner = runnerAtOpeningDialogue();
    expect(runner.kanaLives).toBe(3);
    runner.waitForDialogueChoices().pressA().frames(3);
    expect(runner.kanaLives).toBe(3);
  });

  it('removes one life and shows a negative delta after a bad choice', () => {
    const runner = runnerAtOpeningDialogue();
    expect(runner.kanaLives).toBe(3);
    runner.waitForDialogueChoices();
    runner.pressDown().frames(3).pressA().frames(3);
    expect(runner.kanaLives).toBe(2);
    expect(runner.deltaType).toBe(DELTA_MINUS_5);
  });

  it('ends the dialogue early after three bad choices and restocks one kana life', () => {
    const runner = runnerAtOpeningDialogue();
    expect(runner.kanaLives).toBe(3);

    for (let i = 0; i < 3; i++) {
      runner.waitForDialogueChoices();
      runner.pressDown().frames(3).pressA().frames(5);
    }

    runner.waitForKanaInput();
    expect(runner.kanaState).toBe(KANA_AWAITING_INPUT);
    expect(runner.kanaLives).toBe(1);
  });

  it('branches to the next dialogue node after each confirmed choice', () => {
    const runner = runnerAtOpeningDialogue();
    runner.advanceDialogue();
    expect(runner.dlgNodeId).toBe(1);
    runner.advanceDialogue();
    expect(runner.dlgNodeId).toBe(2);
    runner.completeDialogueTree();
    expect(runner.dlgNodeId).toBe(DIALOGUE_END_NODE);
  });
});
