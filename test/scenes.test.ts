/** Scene system tests. */

import { describe, it, expect } from 'vitest';
import { GameRunner, symbols } from './helpers/game-runner';
import { SCENES } from '@game/scene';

describe('Given the scene registry is assembled', () => {
  it('defines five scenes with dialogue and kana content', () => {
    expect(SCENES).toHaveLength(5);
    for (const scene of SCENES) {
      expect(scene.name.length).toBeGreaterThan(0);
      expect(scene.dialogue.length).toBeGreaterThan(0);
      expect(scene.kanaQuestions.length).toBeGreaterThan(0);
    }
  });

  it('emits ROM labels for each scene dialogue and kana block', () => {
    for (let i = 0; i < 5; i++) {
      expect(symbols.has(`scene${String(i)}_dlg`)).toBe(true);
      expect(symbols.has(`scene${String(i)}_kana`)).toBe(true);
    }
  });
});

describe('Given the player starts the game', () => {
  it('loads scene 0 after START', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgState).toBeGreaterThan(0);
  });

  it('advances from scene 0 to scene 1 after the first scene is completed', () => {
    const runner = new GameRunner().boot().start().completeScene(0);
    expect(runner.sceneId).toBe(1);
    expect(runner.sceneFlags & 0x01).toBe(0x01);
  });
});
