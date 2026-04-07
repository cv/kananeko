/** Kana mini-game tests. */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import { buildKanaData, type KanaQuestion } from '@game/kana';
import { textToTiles } from '@game/font';

describe('kana', () => {
  it('encodes question data correctly', () => {
    const testQ: KanaQuestion[] = [
      { word: 'こんにちは', blankIndex: 0, correct: 'こ', distractors: ['か', 'く', 'き'] },
    ];
    const data = buildKanaData(testQ);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toBe(textToTiles('こんにちは').length);
    expect(data[data.length - 1]).toBe(0); // end sentinel
  });

  it('enters kana game after dialogue', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    runner.waitForKanaInput();
    expect(runner.kanaState).toBe(2);
  });

  it('awards 100 points for correct first try', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    const scoreBefore = runner.kanaScore;
    runner.answerKanaCorrectly();
    expect(runner.kanaScore - scoreBefore).toBe(100);
  });

  it('awards 10 points for correct second try', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    const scoreBefore = runner.kanaScore;
    runner.answerKanaWrong();
    runner.answerKanaCorrectly();
    expect(runner.kanaScore - scoreBefore).toBe(10);
  });

  it('loses a life after 3 wrong answers', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    expect(runner.kanaLives).toBe(3);
    runner.answerKanaWrong(); // attempt 1
    runner.answerKanaWrong(); // attempt 2
    runner.answerKanaWrong(); // attempt 3 = death
    expect(runner.kanaLives).toBe(2);
  });

  it('ends kana round when lives reach 0', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    expect(runner.kanaLives).toBe(3);
    // Die 3 times (each death = 3 wrong answers)
    for (let death = 0; death < 3; death++) {
      runner.answerKanaWrong();
      runner.answerKanaWrong();
      runner.answerKanaWrong();
    }
    expect(runner.kanaLives).toBe(0);
    expect(runner.kanaState).toBe(0); // kana round ended
  });

  it('advances to next question after correct answer', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    runner.answerKanaCorrectly();
    expect(runner.kanaQuestionIdx).toBe(1);
    expect(runner.kanaState).toBe(2); // awaiting next
  });
});
