/** Scene system tests. */

import { describe, it, expect } from 'vitest';
import { GameRunner, symbols } from './helpers/game-runner';
import { SCENES } from '@game/scene';

describe('scenes', () => {
  it('has all 5 scenes with dialogue and kana', () => {
    expect(SCENES).toHaveLength(5);
    for (const scene of SCENES) {
      expect(scene.name.length).toBeGreaterThan(0);
      expect(scene.dialogue.length).toBeGreaterThan(0);
      expect(scene.kanaQuestions.length).toBeGreaterThan(0);
    }
  });

  it('has scene data labels for all 5 scenes', () => {
    for (let i = 0; i < 5; i++) {
      expect(symbols.has(`scene${String(i)}_dlg`)).toBe(true);
      expect(symbols.has(`scene${String(i)}_kana`)).toBe(true);
    }
  });

  it('loads scene 0 after START', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgState).toBeGreaterThan(0);
  });

  it('completes scene 0 and advances to scene 1', () => {
    const runner = new GameRunner().boot().start().completeScene(0);
    expect(runner.sceneId).toBe(1);
    expect(runner.sceneFlags & 0x01).toBe(0x01);
  });
});
