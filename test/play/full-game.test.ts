/**
 * Whole-game progression. The checkpoints come from one continuous playthrough
 * (see helpers/checkpoints.ts), so these tests check that playthrough's milestones.
 */

import { describe, expect, it } from 'vitest';
import { SCENES } from '@game/scene';
import { DialogueState, KanaState, MAX_LIVES } from '@game/state';
import { checkpoint, runnerAt } from '../helpers/checkpoints';

const ALL_SCENES = (1 << SCENES.length) - 1;

describe('Given the player plays through the whole game', () => {
  it.each(SCENES.map((_, i) => i))('enters scene %i with every earlier scene completed', (i) => {
    const runner = runnerAt(checkpoint.sceneStart(i));
    expect(runner.sceneId).toBe(i);
    expect(runner.sceneFlags).toBe((1 << i) - 1);
    expect(runner.dlgState).not.toBe(DialogueState.IDLE);
  });

  it.each(SCENES.map((_, i) => i))('reaches the kana round of scene %i at full lives', (i) => {
    const runner = runnerAt(checkpoint.kanaStart(i));
    expect(runner.kanaState).toBe(KanaState.AWAITING);
    expect(runner.kanaQuestionIdx).toBe(0);
    expect(runner.kanaLives).toBe(MAX_LIVES);
  });

  it('completes every scene and keeps the perfect score', () => {
    const runner = runnerAt(checkpoint.gameComplete);
    expect(runner.sceneFlags).toBe(ALL_SCENES);
    const kanaPoints = SCENES.reduce((sum, s) => sum + s.kanaQuestions.length * 100, 0);
    expect(runner.kanaScore).toBeGreaterThanOrEqual(kanaPoints);
  });

  it('returns to the title screen, where START begins a new run', () => {
    const runner = runnerAt(checkpoint.gameComplete).frames(30);
    expect(runner.dlgState).toBe(DialogueState.IDLE);
    runner.start();
    expect(runner.sceneId).toBe(0);
  });
});
