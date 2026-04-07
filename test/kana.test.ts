/** Kana mini-game tests. */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import { buildKanaData, type KanaQuestion } from '@game/kana';
import { textToTiles } from '@game/font';
import {
  DELTA_MINUS_100,
  DELTA_PLUS_100,
  KANA_AWAITING_INPUT,
  KANA_IDLE,
} from './helpers/test-constants';

describe('kana', () => {
  it('encodes kana question data with the expected length prefix and sentinel', () => {
    const testQ: KanaQuestion[] = [
      { word: 'こんにちは', blankIndex: 0, correct: 'こ', distractors: ['か', 'く', 'き'] },
    ];
    const data = buildKanaData(testQ);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toBe(textToTiles('こんにちは').length);
    expect(data[data.length - 1]).toBe(0); // end sentinel
  });

  it('enters the kana round after the player completes the dialogue tree', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree();
    runner.waitForKanaInput();
    expect(runner.kanaState).toBe(KANA_AWAITING_INPUT);
  });

  it('awards 100 points when the first kana answer is correct', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree();
    const scoreBefore = runner.kanaScore;
    runner.answerKanaCorrectly();
    expect(runner.kanaScore - scoreBefore).toBe(100);
  });

  it('awards 10 points when the second kana answer is correct', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree();
    const scoreBefore = runner.kanaScore;
    runner.answerKanaWrong();
    runner.answerKanaCorrectly();
    expect(runner.kanaScore - scoreBefore).toBe(10);
  });

  it('removes one life after three wrong answers on the same kana question', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree();
    expect(runner.kanaLives).toBe(3);
    runner.answerKanaWrong();
    runner.answerKanaWrong();
    runner.answerKanaWrong();
    expect(runner.kanaLives).toBe(2);
  });

  it('ends the kana round when the player loses the last life', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree();
    expect(runner.kanaLives).toBe(3);
    for (let death = 0; death < 3; death++) {
      runner.answerKanaWrong();
      runner.answerKanaWrong();
      runner.answerKanaWrong();
    }
    expect(runner.kanaLives).toBe(0);
    expect(runner.kanaState).toBe(KANA_IDLE);
  });

  it('returns to the title screen state after START on the game over screen', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree();
    for (let death = 0; death < 3; death++) {
      runner.answerKanaWrong();
      runner.answerKanaWrong();
      runner.answerKanaWrong();
    }
    expect(runner.kanaLives).toBe(0);
    runner.frames(10).pressStart().frames(10);
    expect(runner.kanaLives).toBe(3);
    expect(runner.kanaScore).toBe(0);
  });

  it('advances to the next kana question after a correct answer', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree();
    runner.answerKanaCorrectly();
    expect(runner.kanaQuestionIdx).toBe(1);
    expect(runner.kanaState).toBe(KANA_AWAITING_INPUT);
  });

  it('shows the +100 delta flash after a correct first answer', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree();
    runner.answerKanaCorrectly();
    expect(runner.deltaType).toBe(DELTA_PLUS_100);
  });

  it('shows the -100 delta flash when a wrong answer costs a life', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree();
    runner.answerKanaWrong();
    runner.answerKanaWrong();
    runner.answerKanaWrong();
    expect(runner.deltaType).toBe(DELTA_MINUS_100);
  });
});
