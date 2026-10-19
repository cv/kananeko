/** Which sound effect plays when, in the game itself. */

import { describe, expect, it } from 'vitest';
import { MAX_LIVES } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { GameRunner } from '../helpers/game-runner';
import { loseOneKanaLife } from '../helpers/play';

/** A few frames for the HUD and the sound to catch up */
const SETTLE = 4;

describe('Given the title screen', () => {
  it('is quiet until START, which plays a jingle', () => {
    const runner = new GameRunner().boot();
    expect(runner.sfx).toBe('none');
    runner.pressStart().frames(1);
    expect(runner.sfx).toBe('start');
  });
});

describe('Given a conversation', () => {
  it('blips as the letters appear', () => {
    expect(runnerAt(checkpoint.sceneStart(0)).frames(30).sfx).toBe('blip');
  });

  it('clicks when the cursor moves and chimes when a reply is picked', () => {
    const runner = runnerAt(checkpoint.sceneStart(0)).waitForDialogueChoices();
    runner.pressDown().frames(1);
    expect(runner.sfx).toBe('cursor');
    runner.pressA().frames(1);
    expect(runner.sfx).toBe('confirm');
  });

  it('plays the heart sound when a good reply wins a heart back', () => {
    const runner = runnerAt(checkpoint.sceneStart(0))
      .setLives(MAX_LIVES - 1)
      .frames(SETTLE);
    runner.waitForDialogueChoices().chooseDialogueChoice(0).frames(SETTLE);
    expect(runner.kanaLives).toBe(MAX_LIVES);
    expect(runner.sfx).toBe('heartUp');
  });
});

describe('Given a kana question', () => {
  const kanaRound = (): GameRunner => runnerAt(checkpoint.kanaStart(0)).resetStreak();

  it('chimes for a right answer', () => {
    expect(kanaRound().answerKanaCorrectly().sfx).toBe('correct');
  });

  it('buzzes for a wrong one', () => {
    expect(kanaRound().answerKanaWrong().sfx).toBe('wrong');
  });

  it('plays the lost-heart sound when misses cost a heart', () => {
    const runner = kanaRound();
    loseOneKanaLife(runner);
    runner.frames(SETTLE);
    expect(runner.sfx).toBe('heartDown');
  });

  it('plays a fanfare for a streak, over the right-answer chime', () => {
    const runner = kanaRound().answerKanaCorrectly().answerKanaCorrectly();
    expect(runner.sfx).toBe('correct');
    expect(runner.answerKanaCorrectly().sfx).toBe('streak');
  });

  it('ticks the speed round clock every second', () => {
    expect(runnerAt(checkpoint.speedRound).frames(65).sfx).toBe('tick');
  });
});
