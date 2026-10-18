/** Kana round scoring, retries, and lives. */

import { describe, expect, it } from 'vitest';
import { DELTA_MINUS_100, DELTA_PLUS_10, DELTA_PLUS_100 } from '@game/kana-hud';
import { KanaState, MAX_LIVES } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { type GameRunner } from '../helpers/game-runner';
import { answerKanaAndCheckDelta, loseAllKanaLives, loseOneKanaLife } from '../helpers/play';

const kanaRound = (): GameRunner => runnerAt(checkpoint.kanaStart(0));

describe('Given the player answers kana prompts', () => {
  it('awards 100 points and moves on after a correct first answer', () => {
    const runner = kanaRound();
    answerKanaAndCheckDelta(runner, 100);
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

  it('ends the round when the last life is lost', () => {
    const runner = loseAllKanaLives(kanaRound().setLives(1));
    expect(runner.kanaLives).toBe(0);
    expect(runner.kanaState).toBe(KanaState.IDLE);
  });
});
