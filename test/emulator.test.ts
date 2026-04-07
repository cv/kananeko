/** Emulator boot and joypad tests. */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import { JOY } from '@asm/hardware';

describe('Given the ROM boots in the emulator', () => {
  it('runs for 120 frames without crashing', () => {
    const runner = new GameRunner();
    runner.frames(120);
    expect(true).toBe(true);
  });

  it('copies tile data into VRAM during startup', () => {
    const runner = new GameRunner();
    runner.frames(120);
    const mem = runner.getMemory();
    for (let i = 0; i < 16; i++) expect(mem[0x8000 + i]).toBe(0);
    let hasData = false;
    for (let i = 0; i < 16; i++) if (mem[0x8010 + i] !== 0) hasData = true;
    expect(hasData).toBe(true);
  });

  it('renders a non-blank screen after boot', () => {
    const runner = new GameRunner();
    runner.frames(120);
    const screen = runner.getScreen();
    expect(screen.length).toBe(160 * 144 * 4);
    const first = screen[0];
    expect(screen.some((value, index) => index >= 4 && index % 4 === 0 && value !== first)).toBe(
      true,
    );
  });
});

describe('Given the player presses buttons', () => {
  it('marks START as both pressed and newly pressed on the first frame', () => {
    const runner = new GameRunner().boot().pressStart();
    expect(runner.joypadCurrent & JOY.START).toBe(JOY.START);
    expect(runner.joypadNew & JOY.START).toBe(JOY.START);
  });

  it('clears the newly pressed bit when A is held across consecutive frames', () => {
    const runner = new GameRunner().boot();
    runner.pressA();
    expect(runner.joypadNew & JOY.A).toBe(JOY.A);
    runner.pressA();
    expect(runner.joypadCurrent & JOY.A).toBe(JOY.A);
    expect(runner.joypadNew & JOY.A).toBe(0);
  });

  it('records an UP press in the current joypad state', () => {
    const runner = new GameRunner().boot().pressUp();
    expect(runner.joypadCurrent & JOY.UP).toBe(JOY.UP);
  });
});
