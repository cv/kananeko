/** What the kana round shows, read back off the LCD. */

import { describe, expect, it } from 'vitest';
import { CAT_TILES } from '@game/font-data';
import { KANA_LAYOUT, KANA_MESSAGES, type KanaQuestion } from '@game/kana';
import { SCENES } from '@game/scene';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { type GameRunner } from '../helpers/game-runner';
import { loseOneKanaLife } from '../helpers/play';
import { readText, waitForPicture } from '../helpers/screen';

const SCREEN_COLS = 20;
const FEEDBACK_SHOWN = 5; // frames into the feedback pause

function prompt(runner: GameRunner): string {
  return readText(runner, KANA_LAYOUT.promptRow, 0, SCREEN_COLS).trim();
}

function word(runner: GameRunner): string {
  const { row, col, width } = KANA_LAYOUT.word;
  return readText(runner, row, col, width).trim();
}

function catFace(runner: GameRunner): string {
  return readText(runner, KANA_LAYOUT.cat.row, KANA_LAYOUT.cat.col, 1);
}

function options(runner: GameRunner): string[] {
  return KANA_LAYOUT.options.map(({ row, col }) => readText(runner, row, col, 1));
}

function firstQuestion(sceneIdx: number): KanaQuestion {
  const question = SCENES[sceneIdx]?.kanaQuestions[0];
  if (question === undefined) throw new Error('scene has no kana questions');
  return question;
}

function withBlank(text: string, index: number): string {
  const chars = Array.from(text);
  chars[index] = CAT_TILES.BLANK;
  return chars.join('');
}

describe.each(SCENES.map((scene, i) => [scene.name, i] as const))(
  'Given the kana round of %s',
  (_name, sceneIdx) => {
    const question = firstQuestion(sceneIdx);
    const atRound = (): GameRunner =>
      waitForPicture(runnerAt(checkpoint.kanaStart(sceneIdx)).frames(1));

    it('asks the question with the word blanked and four options on the d-pad', () => {
      const runner = atRound();
      expect(prompt(runner)).toBe(KANA_MESSAGES.prompt);
      expect(word(runner)).toBe(withBlank(question.word, question.blankIndex));
      const shown = options(runner);
      expect([...shown].sort()).toEqual([question.correct, ...question.distractors].sort());
      expect(shown[runner.kanaCorrectPos]).toBe(question.correct);
      expect(catFace(runner)).toBe(CAT_TILES.FACE_NEUTRAL);
    });
  },
);

describe('Given the player answers the first station question', () => {
  const question = firstQuestion(0);
  const atRound = (): GameRunner => waitForPicture(runnerAt(checkpoint.kanaStart(0)).frames(1));

  it('celebrates a correct answer and fills in the word', () => {
    const runner = atRound().pressKanaAnswer(true).frames(FEEDBACK_SHOWN);
    expect(prompt(runner)).toBe(KANA_MESSAGES.correct);
    expect(word(runner)).toBe(question.word);
    expect(catFace(runner)).toBe(CAT_TILES.FACE_HAPPY);
  });

  it('asks again after a wrong answer, keeping the blank', () => {
    const runner = atRound().pressKanaAnswer(false).frames(FEEDBACK_SHOWN);
    expect(prompt(runner)).toBe(KANA_MESSAGES.retry);
    expect(word(runner)).toBe(withBlank(question.word, question.blankIndex));
    expect(catFace(runner)).toBe(CAT_TILES.FACE_SAD);

    runner.waitForKanaInput().frames(FEEDBACK_SHOWN);
    expect(prompt(runner)).toBe(KANA_MESSAGES.prompt);
    expect(catFace(runner)).toBe(CAT_TILES.FACE_NEUTRAL);
  });

  it('reveals the answer after the third miss', () => {
    const runner = atRound().answerKanaWrong().answerKanaWrong().pressKanaAnswer(false);
    runner.frames(FEEDBACK_SHOWN);
    expect(prompt(runner)).toBe(KANA_MESSAGES.reveal);
    expect(word(runner)).toBe(question.word);
  });

  it('moves on to a fresh question after losing a life', () => {
    const runner = loseOneKanaLife(atRound()).frames(4);
    waitForPicture(runner);
    expect(prompt(runner)).toBe(KANA_MESSAGES.prompt);
  });
});
