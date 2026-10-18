/** Boot, title screen, and joypad input. */

import { describe, expect, it } from 'vitest';
import { JOY, MEM } from '@asm/hardware';
import { DialogueState } from '@game/state';
import { GameRunner } from '../helpers/game-runner';
import { checkpoint, runnerAt } from '../helpers/checkpoints';

const BOOT_FRAMES = 120;
const TILE_BYTES = 16;

describe('Given the ROM boots in the emulator', () => {
  it('copies tile data into VRAM, keeping tile 0 blank', () => {
    const mem = new GameRunner().frames(BOOT_FRAMES).getMemory();
    const tile0 = mem.slice(MEM.VRAM_TILES, MEM.VRAM_TILES + TILE_BYTES);
    const tile1 = mem.slice(MEM.VRAM_TILES + TILE_BYTES, MEM.VRAM_TILES + 2 * TILE_BYTES);
    expect(tile0.every((b) => b === 0)).toBe(true);
    expect(tile1.some((b) => b !== 0)).toBe(true);
  });

  it('renders a non-blank screen', () => {
    const screen = new GameRunner().frames(BOOT_FRAMES).getScreen();
    expect(screen.length).toBe(160 * 144 * 4);
    const first = screen[0];
    expect(screen.some((value, i) => i % 4 === 0 && value !== first)).toBe(true);
  });

  it('stays on the title screen until the player presses START', () => {
    expect(new GameRunner().boot().dlgState).toBe(DialogueState.IDLE);
  });

  it('starts the first scene when the player presses START', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgState).not.toBe(DialogueState.IDLE);
  });
});

describe('Given the player presses buttons', () => {
  it('marks START as both pressed and newly pressed on the first frame', () => {
    const runner = new GameRunner().boot().pressStart();
    expect(runner.joypadCurrent & JOY.START).toBe(JOY.START);
    expect(runner.joypadNew & JOY.START).toBe(JOY.START);
  });

  it('clears the newly pressed bit when A is held across consecutive frames', () => {
    const runner = runnerAt(checkpoint.sceneStart(0)).pressA();
    expect(runner.joypadNew & JOY.A).toBe(JOY.A);
    runner.pressA();
    expect(runner.joypadCurrent & JOY.A).toBe(JOY.A);
    expect(runner.joypadNew & JOY.A).toBe(0);
  });

  it('records d-pad presses in the high nibble', () => {
    const runner = runnerAt(checkpoint.sceneStart(0)).pressUp();
    expect(runner.joypadCurrent & JOY.UP).toBe(JOY.UP);
    runner.pressDown();
    expect(runner.joypadCurrent & JOY.DOWN).toBe(JOY.DOWN);
  });
});
