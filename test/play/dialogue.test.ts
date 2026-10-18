/** Dialogue engine behavior in the opening conversation. */

import { describe, expect, it } from 'vitest';
import { DELTA_MINUS_5, DELTA_PLUS_10 } from '@game/kana-hud';
import { DialogueState, END_OF_CONVERSATION, KanaState, MAX_LIVES } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { type GameRunner } from '../helpers/game-runner';

const openingDialogue = (): GameRunner => runnerAt(checkpoint.sceneStart(0));

describe('Given the player is in a conversation', () => {
  it('reveals the text and then offers choices', () => {
    const runner = openingDialogue();
    expect(runner.dlgState).toBe(DialogueState.PRINTING);
    runner.waitForDialogueChoices();
    expect(runner.dlgState).toBe(DialogueState.CHOOSING);
  });

  it('shows the choices in a shuffled order that covers every choice', () => {
    const order = openingDialogue().waitForDialogueChoices().dlgChoiceOrder;
    expect([...order].sort()).toEqual([0, 1, 2]);
  });

  it('records the confirmed display row', () => {
    const runner = openingDialogue().waitForDialogueChoices().pressA();
    expect(runner.dlgResult).toBe(0);
  });

  it('branches to the next node of the chosen answer', () => {
    const runner = openingDialogue();
    runner.advanceDialogue();
    expect(runner.dlgNodeId).toBe(1);
    runner.advanceDialogue();
    expect(runner.dlgNodeId).toBe(2);
  });

  it('wraps the cursor from the first row up to the last', () => {
    const runner = openingDialogue().waitForDialogueChoices().pressUp().frames(1).pressA();
    expect(runner.dlgResult).toBe(2);
  });
});

describe('Given the player picks good or bad answers', () => {
  it('removes a life and flashes -5 after a bad choice', () => {
    const runner = openingDialogue().chooseDialogueChoice(1);
    expect(runner.kanaLives).toBe(MAX_LIVES - 1);
    expect(runner.deltaType).toBe(DELTA_MINUS_5);
  });

  it('restores a life and flashes +10 after a good choice', () => {
    const runner = openingDialogue().chooseDialogueChoice(1).chooseDialogueChoice(0);
    expect(runner.kanaLives).toBe(MAX_LIVES);
    expect(runner.deltaType).toBe(DELTA_PLUS_10);
  });

  it('never raises lives above the cap', () => {
    const runner = openingDialogue().chooseDialogueChoice(0);
    expect(runner.kanaLives).toBe(MAX_LIVES);
  });

  it('ends the conversation at zero lives and restocks one life for kana', () => {
    const runner = openingDialogue();
    for (let i = 0; i < MAX_LIVES; i++) runner.chooseDialogueChoice(1);
    expect(runner.dlgNodeId).toBe(END_OF_CONVERSATION);
    runner.waitForKanaInput();
    expect(runner.kanaState).toBe(KanaState.AWAITING);
    expect(runner.kanaLives).toBe(1);
  });
});
