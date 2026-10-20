/** Kana round scoring, retries, and lives. */

import { FEEDBACK_FRAMES } from '@game/kana';
import { DELTA_MINUS_100, DELTA_PLUS_10, DELTA_PLUS_100 } from '@game/kana-hud';
import { KanaState, MAX_LIVES } from '@game/state';
import { describe, expect, it } from 'vitest';

import { checkpoint, runnerAt } from '../helpers/checkpoints';
import type { GameRunner } from '../helpers/game-runner';
import { answerKanaAndCheckDelta, loseAllKanaLives, loseOneKanaLife } from '../helpers/play';

const kanaRound = (): GameRunner => runnerAt(checkpoint.kanaStart(0));

describe('Given the player answers kana prompts', () => {
  it('awards 100 points and moves on after a correct first answer', () => {
    const runner = kanaRound();
    answerKanaAndCheckDelta(runner.resetStreak(), 100);
    expect(runner.deltaType).toBe(DELTA_PLUS_100);
    expect(runner.kanaQuestionIdx).toBe(1);
    expect(runner.kanaState).toBe(KanaState.AWAITING);
  });

  it('starts without a leftover dialogue score flash', () => {
    expect(kanaRound().deltaVisible).toBe(false);
  });

  it('re-prompts the same question after a wrong answer, without a score flash', () => {
    const runner = kanaRound().answerKanaWrong();
    expect(runner.deltaVisible).toBe(false);
    expect(runner.kanaQuestionIdx).toBe(0);
    expect(runner.kanaAttempts).toBe(1);
    expect(runner.kanaState).toBe(KanaState.AWAITING);
  });

  it('awards 10 points when the second answer is correct', () => {
    const runner = kanaRound().answerKanaWrong();
    answerKanaAndCheckDelta(runner, 10);
    expect(runner.deltaType).toBe(DELTA_PLUS_10);
  });

  it('awards nothing, and flashes nothing, when the third answer is correct', () => {
    const runner = kanaRound().answerKanaWrong().answerKanaWrong();
    answerKanaAndCheckDelta(runner, 0);
    expect(runner.deltaVisible).toBe(false);
  });
});

describe('Given the player misses kana prompts repeatedly', () => {
  it('takes a life and 100 points after three wrong answers, then moves on', () => {
    const runner = kanaRound();
    const before = runner.kanaScore;
    loseOneKanaLife(runner);
    expect(runner.kanaLives).toBe(MAX_LIVES - 1);
    expect(runner.kanaScore - before).toBe(-100);
    expect(runner.deltaType).toBe(DELTA_MINUS_100);
    expect(runner.kanaQuestionIdx).toBe(1);
  });

  it('moves to the next question right after the feedback, without blanking the screen', () => {
    const runner = kanaRound().resetStreak();
    runner.pressKanaAnswer(true);
    let frames = 0;
    let screenWentOff = false;
    while (!(runner.kanaQuestionIdx === 1 && runner.kanaState === KanaState.AWAITING)) {
      runner.frames(1);
      frames++;
      if ((runner.readMem(0xff40) & 0x80) === 0) screenWentOff = true;
      if (frames > 300) throw new Error('the next question never came');
    }
    expect(screenWentOff).toBe(false);
    expect(frames, `frames from answer to next question: ${String(frames)}`).toBeLessThan(
      FEEDBACK_FRAMES + 10,
    );
  });

  it('ends the round when the last life is lost', () => {
    const runner = loseAllKanaLives(kanaRound().setLives(1));
    expect(runner.kanaLives).toBe(0);
    expect(runner.kanaState).toBe(KanaState.IDLE);
  });
});
