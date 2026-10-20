/** れんしゅう: practicing missed kana from the title menu, and in the speed round. */

import { CHART_KANA, chartIndexOf } from '@game/chart';
import { menuPick } from '@game/menu';
import { PRACTICE_ROUND } from '@game/practice';
import { SCENES, SPEED_ROUND } from '@game/scene';
import { KanaMode, MAX_LIVES } from '@game/state';
import { describe, expect, it } from 'vitest';

import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { GameRunner } from '../helpers/game-runner';

const SETTLE = 32;

/** Booted to the title, with these chart entries missed, then into practice */
function practice(missed: readonly number[]): GameRunner {
  const runner = new GameRunner().boot();
  runner.waitUntil(() => runner.music === 'title', 'the title').frames(SETTLE);
  runner.setMissed(missed);
  for (let i = 1; i < menuPick('れんしゅう'); i++) runner.pressDown().frames(1);
  return runner.pressA().waitForKanaInput();
}

const entry = (kana: string): number => CHART_KANA.indexOf(kana);

describe('Given practice from the title menu', () => {
  it('asks about the kana the player has missed', () => {
    const missed = [entry('ぬ'), entry('め'), entry('ね')];
    const runner = practice(missed);
    expect(runner.kanaMode).toBe(KanaMode.PRACTICE);
    for (let i = 0; i < PRACTICE_ROUND - 1; i++) {
      expect(missed).toContain(chartIndexOf(runner.waitForKanaInput().kanaAnswer));
      runner.answerKanaWrong(); // one try: it moves on, still missed
    }
  });

  it('clears a miss when it is answered right, without points', () => {
    const runner = practice([entry('ぬ')]);
    expect(runner.kanaAnswer).toBe('ぬ');
    runner.answerKanaCorrectly();
    expect(runner.isMissed(entry('ぬ'))).toBe(false);
    expect(runner.kanaScore).toBe(0);
  });

  it("doesn't cost hearts for a wrong answer, and marks the kana missed", () => {
    const runner = practice([]);
    const kana = runner.kanaAnswer;
    runner.answerKanaWrong();
    expect(runner.kanaLives).toBe(MAX_LIVES);
    expect(runner.isMissed(chartIndexOf(kana))).toBe(true);
  });

  it('keeps going, round after round', () => {
    const runner = practice([]);
    for (let i = 0; i < PRACTICE_ROUND + 2; i++) runner.answerKanaCorrectly();
    expect(runner.kanaMode).toBe(KanaMode.PRACTICE);
  });

  it('goes back to the title on B', () => {
    const runner = practice([]).pressB();
    runner.waitUntil(() => runner.music === 'title', 'the title');
  });
});

describe('Given the speed round', () => {
  it('asks about missed kana first, then its own questions', () => {
    const last = SCENES.length - 1;
    const missed = [entry('ぬ'), entry('ろ')];
    const runner = runnerAt(checkpoint.kanaStart(last)).setMissed(missed);
    runner
      .completeKanaQuestions(last)
      .waitUntil(() => runner.kanaMode === KanaMode.SPEED, 'the speed round');
    const asked = [runner.waitForKanaInput().kanaAnswer];
    runner.answerKanaCorrectly();
    asked.push(runner.waitForKanaInput().kanaAnswer);
    runner.answerKanaCorrectly();
    expect(asked.map(chartIndexOf).sort()).toEqual([...missed].sort());
    expect(runner.waitForKanaInput().kanaAnswer).toBe(SPEED_ROUND[0]?.correct);
  });
});
