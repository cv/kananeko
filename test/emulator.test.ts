/** Emulator boot and joypad tests. */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import { JOY } from '@asm/hardware';

// ---------------------------------------------------------------------------
// Emulator boot
// ---------------------------------------------------------------------------

describe('emulator', () => {
  it('boots without crashing (120 frames)', () => {
    const runner = new GameRunner();
    runner.frames(120);
    expect(true).toBe(true);
  });

  it('has tile data loaded in VRAM', () => {
    const runner = new GameRunner();
    runner.frames(120);
    const mem = runner.getMemory();
    for (let i = 0; i < 16; i++) expect(mem[0x8000 + i]).toBe(0); // blank tile
    let hasData = false;
    for (let i = 0; i < 16; i++) if (mem[0x8010 + i] !== 0) hasData = true;
    expect(hasData).toBe(true);
  });

  it('produces a non-blank screen', () => {
    const runner = new GameRunner();
    runner.frames(120);
    const screen = runner.getScreen();
    expect(screen.length).toBe(160 * 144 * 4);
    const first = screen[0];
    expect(screen.some((v, i) => i >= 4 && i % 4 === 0 && v !== first)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Joypad
// ---------------------------------------------------------------------------

describe('joypad', () => {
  it('detects START press', () => {
    const runner = new GameRunner().boot().press('START');
    expect(runner.joypadCurrent & JOY.START).toBe(JOY.START);
    expect(runner.joypadNew & JOY.START).toBe(JOY.START);
  });

  it('edge-detects: newly pressed clears on sustained hold', () => {
    const runner = new GameRunner().boot();
    runner.press('A');
    expect(runner.joypadNew & JOY.A).toBe(JOY.A);
    runner.press('A');
    expect(runner.joypadCurrent & JOY.A).toBe(JOY.A);
    expect(runner.joypadNew & JOY.A).toBe(0);
  });

  it('detects d-pad UP', () => {
    const runner = new GameRunner().boot().press('UP');
    expect(runner.joypadCurrent & JOY.UP).toBe(JOY.UP);
  });
});
