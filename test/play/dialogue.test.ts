/** Dialogue engine behavior in the opening conversation. */

import { type ChoiceRating, choiceRating, type DialogueNode } from '@game/dialogue-data';
import { DELTA_MINUS_5, DELTA_PLUS_10 } from '@game/kana-hud';
import { SCENES } from '@game/scene';
import { DialogueState, END_OF_CONVERSATION, KanaState, MAX_LIVES } from '@game/state';
import { describe, expect, it } from 'vitest';

import { checkpoint, runnerAt } from '../helpers/checkpoints';
import type { GameRunner } from '../helpers/game-runner';
import { loseDialogueLives } from '../helpers/play';

const openingDialogue = (): GameRunner => runnerAt(checkpoint.sceneStart(0));

const STATION: readonly DialogueNode[] = SCENES[0].dialogue;
const OPENING: DialogueNode = SCENES[0].dialogue[0];

/** Check the effect of answering the opening line with the given logical choice. */
function expectOutcomeOf(runner: GameRunner, logicalChoice: number | undefined): void {
  const choice = OPENING.choices[logicalChoice ?? -1];
  if (choice === undefined) throw new Error(`No opening choice ${String(logicalChoice)}`);
  const rating = choiceRating(choice, logicalChoice ?? 0);
  if (rating === 'bad') {
    expect(runner.kanaLives).toBe(MAX_LIVES - 1);
    expect(runner.deltaType).toBe(DELTA_MINUS_5);
  } else {
    expect(runner.kanaLives).toBe(MAX_LIVES);
    if (rating === 'good') expect(runner.deltaType).toBe(DELTA_PLUS_10);
    else expect(runner.deltaVisible).toBe(false);
  }
}

/** Index of the first choice with this rating at a node of the station dialogue */
function choiceRated(node: number, rating: ChoiceRating): number {
  const index = STATION[node]?.choices.findIndex((c, i) => choiceRating(c, i) === rating);
  if (index === undefined || index < 0)
    throw new Error(`Node ${String(node)} has no ${rating} choice`);
  return index;
}

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

  it('confirms the choice shown on the highlighted row', () => {
    const runner = openingDialogue().waitForDialogueChoices();
    const [topChoice] = runner.dlgChoiceOrder;
    runner.pressA().frames(3);
    expectOutcomeOf(runner, topChoice);
  });

  it('branches to the next node of the chosen answer', () => {
    const runner = openingDialogue();
    runner.advanceDialogue();
    expect(runner.dlgNodeId).toBe(1);
    runner.advanceDialogue();
    expect(runner.dlgNodeId).toBe(2);
  });

  it('wraps the cursor from the first row up to the last', () => {
    const runner = openingDialogue().waitForDialogueChoices();
    const bottomChoice = runner.dlgChoiceOrder[2];
    runner.pressUp().frames(1).pressA().frames(3);
    expectOutcomeOf(runner, bottomChoice);
  });
});

describe('Given the player picks good, ok, or bad answers', () => {
  it('removes a life and flashes -5 after a bad choice', () => {
    const runner = openingDialogue().chooseDialogueChoice(choiceRated(0, 'bad'));
    expect(runner.kanaLives).toBe(MAX_LIVES - 1);
    expect(runner.deltaType).toBe(DELTA_MINUS_5);
  });

  it('restores a life and flashes +10 after a good choice', () => {
    const runner = openingDialogue().chooseDialogueChoice(choiceRated(0, 'bad'));
    runner.chooseDialogueChoice(choiceRated(1, 'good'));
    expect(runner.kanaLives).toBe(MAX_LIVES);
    expect(runner.deltaType).toBe(DELTA_PLUS_10);
  });

  it('changes nothing after a reply that is fine but not the model answer', () => {
    const runner = openingDialogue().chooseDialogueChoice(choiceRated(0, 'good'));
    const score = runner.kanaScore;
    runner.chooseDialogueChoice(choiceRated(1, 'ok'));
    expect(runner.kanaLives).toBe(MAX_LIVES);
    expect(runner.kanaScore).toBe(score);
    expect(runner.deltaVisible).toBe(false);
  });

  it('never lets the score drop below zero', () => {
    const runner = openingDialogue().chooseDialogueChoice(choiceRated(0, 'bad'));
    expect(runner.kanaScore).toBe(0);
    runner.chooseDialogueChoice(choiceRated(1, 'good'));
    expect(runner.kanaScore).toBe(10);
  });

  it('never raises lives above the cap', () => {
    const runner = openingDialogue().chooseDialogueChoice(0);
    expect(runner.kanaLives).toBe(MAX_LIVES);
  });

  it('ends the conversation at zero lives and restocks one life for kana', () => {
    const runner = loseDialogueLives(openingDialogue(), 0, MAX_LIVES);
    expect(runner.dlgNodeId).toBe(END_OF_CONVERSATION);
    runner.waitForKanaInput();
    expect(runner.kanaState).toBe(KanaState.AWAITING);
    expect(runner.kanaLives).toBe(1);
  });
});
