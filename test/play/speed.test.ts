/** The speed round before the ending */

import { describe, expect, it } from 'vitest';
import { CLOCK_POSITION, KANA_LAYOUT, KANA_MESSAGES, SPEED_SECONDS } from '@game/kana';
import { SPEED_ROUND } from '@game/scene';
import { KanaMode, KanaState } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { type GameRunner } from '../helpers/game-runner';
import { readText, waitForPicture } from '../helpers/screen';

const FRAMES_PER_SECOND = 60;

const atSpeedRound = (): GameRunner =>
  waitForPicture(runnerAt(checkpoint.speedRound).frames(4)).frames(10);
const prompt = (runner: GameRunner): string =>
  readText(runner, KANA_LAYOUT.promptRow, 0, 20)
    .trim()
    .replace(/\s*\d$/u, '');
const clock = (runner: GameRunner): string =>
  readText(runner, CLOCK_POSITION.row, CLOCK_POSITION.col, 1);

describe('Given every scene is cleared', () => {
  it('asks one more question from each scene against the clock', () => {
    expect(SPEED_ROUND).toHaveLength(5);
    const runner = atSpeedRound();
    expect(runner.kanaMode).toBe(KanaMode.SPEED);
    expect(prompt(runner)).toBe(KANA_MESSAGES.hurry);
    expect(clock(runner)).toBe(String(SPEED_SECONDS));
  });

  it('counts the seconds down', () => {
    const runner = atSpeedRound().frames(2 * FRAMES_PER_SECOND);
    expect(clock(runner)).toBe(String(SPEED_SECONDS - 2));
  });

  it('scores a quick answer like a first try', () => {
    const runner = atSpeedRound().resetStreak();
    const score = runner.kanaScore;
    runner.answerKanaCorrectly();
    expect(runner.kanaScore - score).toBe(100);
  });

  it('shows the answer and moves on when time runs out, without costing a life', () => {
    const runner = atSpeedRound();
    const lives = runner.kanaLives;
    runner.frames((SPEED_SECONDS + 1) * FRAMES_PER_SECOND);
    expect(runner.kanaLives).toBe(lives);
    runner.waitForKanaInput();
    expect(runner.kanaQuestionIdx).toBe(1);
    expect(runner.kanaState).toBe(KanaState.AWAITING);
  });
});
