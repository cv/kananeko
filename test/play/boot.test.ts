/** Boot, title screen, and joypad input. */

import { JOY } from '@asm/hardware';
import { buildTileData, TILE_COUNT } from '@game/font';
import { BUFFERS, MEM, VARIABLES } from '@game/ram';
import { DialogueState } from '@game/state';
import { bgTileAddr } from '@game/video';
import { describe, expect, it } from 'vitest';

import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { GameRunner } from '../helpers/game-runner';

const BOOT_FRAMES = 120;
const TILE_BYTES = 16;

describe('Given the ROM boots in the emulator', () => {
  it('copies BG tiles to $9000/$8800 (blank tile 0) and sprite tiles to $8000', () => {
    const mem = new GameRunner().frames(BOOT_FRAMES).getMemory();
    const tile = (addr: number): Uint8Array => mem.slice(addr, addr + TILE_BYTES);
    expect(tile(MEM.BG_TILES_LOW).every((b) => b === 0)).toBe(true);
    expect(tile(MEM.BG_TILES_LOW + TILE_BYTES).some((b) => b !== 0)).toBe(true);
    expect(tile(MEM.BG_TILES_HIGH).some((b) => b !== 0)).toBe(true); // BG tile 128
    expect(tile(MEM.OBJ_TILES).some((b) => b !== 0)).toBe(true); // sprite tile 0: cursor
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

describe('Given RAM starts with garbage, as on real hardware', () => {
  it('clears its variables at boot and still reaches the title', () => {
    const runner = new GameRunner();
    const memory = runner.getMemory();
    memory.fill(0xa5, BUFFERS.start, BUFFERS.limit);
    memory.fill(0xa5, VARIABLES.start, VARIABLES.limit);
    runner.boot();
    expect(runner.readMem(MEM.FRAMES_MISSED)).toBe(0);
    expect(runner.readMem(MEM.SCENE_FLAGS)).toBe(0);
    expect(runner.catVisible).toBe(true);
    runner.start();
    expect(runner.sceneId).toBe(0);
  });
});

describe('Given the game has booted', () => {
  it('has every font tile in VRAM, the 1-bit ones expanded to ink', () => {
    const runner = new GameRunner().boot();
    const memory = runner.getMemory();
    const tiles = buildTileData();
    for (let tile = 0; tile <= TILE_COUNT; tile++) {
      const address = bgTileAddr(tile);
      expect(Array.from(memory.slice(address, address + 16)), `tile ${String(tile)}`).toEqual(
        Array.from(tiles.slice(tile * 16, tile * 16 + 16)),
      );
    }
  });
});

describe('Given the title screen is idle', () => {
  it('shows the cat, which blinks and opens its eyes again', () => {
    const runner = new GameRunner().boot();
    expect(runner.catVisible).toBe(true);
    expect(runner.catFace).toBe('neutral');
    runner.waitUntil(() => runner.catFace === 'blink', 'the cat to blink');
    runner.waitUntil(() => runner.catFace === 'neutral', 'the cat to open its eyes');
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
