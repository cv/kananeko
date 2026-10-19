/** The assembled game ROM: header, layout, and embedded data. */

import { describe, expect, it } from 'vitest';
import { ROM_SIZE, globalChecksum, headerChecksum } from '@asm/assembler';
import { ONE_BIT_TILES, buildPackedTileData } from '@game/font';
import {
  sceneBackdropLabel,
  sceneDialogueLabel,
  sceneRoundsLabel,
  sceneTilesLabel,
} from '@game/main';
import { SCENES, buildSceneData } from '@game/scene';
import { SCENE_ENTRY } from '@game/scene-table';
import type { Label } from '@asm/types';
import { rom, symbols, unreferenced } from './helpers/game-runner';

function bytesAt(label: string | Label, length: number): Uint8Array {
  const addr = symbols.get(String(label));
  if (addr === undefined) throw new Error(`Missing label ${String(label)}`);
  return rom.slice(addr, addr + length);
}

describe('Given the ROM has been assembled', () => {
  it('fills exactly one 32 KB bank', () => {
    expect(rom.length).toBe(ROM_SIZE);
  });

  it('has a valid header for "KANANEKO"', () => {
    expect(new TextDecoder().decode(rom.slice(0x0134, 0x013c))).toBe('KANANEKO');
    expect(rom[0x0143]).toBe(0x80); // CGB + DMG
    expect(rom[0x014d]).toBe(headerChecksum(rom));
    expect(((rom[0x014e] ?? 0) << 8) | (rom[0x014f] ?? 0)).toBe(globalChecksum(rom));
  });

  it('has no dead code: every label is referred to', () => {
    // The ending screen is reached by falling through from the last scene
    expect(unreferenced).toEqual(['game_complete']);
  });

  it('starts the program with DI at $0150', () => {
    expect(rom[0x0150]).toBe(0xf3);
  });

  it('defines the entry points the engines call', () => {
    for (const name of [
      'title_screen',
      'scene_load',
      'game_over',
      'joy_read',
      'dlg_open_tree',
      'dlg_open_node',
      'dlg_update',
      'kana_start',
      'kana_update',
      'kana_draw_hud',
      'hud_update',
      'font_1bpp_low',
    ]) {
      expect(symbols.has(name), name).toBe(true);
    }
  });

  it('stores two-shade font tiles at one bit per pixel', () => {
    const { oneBit } = buildPackedTileData();
    expect(bytesAt('font_1bpp_low', 128 * 8)).toEqual(oneBit.slice(0, 128 * 8));
    expect(oneBit.length).toBe(ONE_BIT_TILES * 8);
  });

  it("embeds every scene's dialogue and kana data at its labels", () => {
    buildSceneData().forEach((packed, i) => {
      expect(bytesAt(sceneDialogueLabel(i), packed.dialogueData.length)).toEqual(
        packed.dialogueData,
      );
      expect(bytesAt(sceneRoundsLabel(i), packed.roundsData.length)).toEqual(packed.roundsData);
      expect(bytesAt(sceneBackdropLabel(i), packed.backdropData.length)).toEqual(
        packed.backdropData,
      );
      expect(bytesAt(sceneTilesLabel(i), packed.sceneTileData.length)).toEqual(
        packed.sceneTileData,
      );
    });
    expect(SCENES).toHaveLength(6);
  });

  it("points each scene's scene_table entry at its data", () => {
    const table = symbols.get('scene_table') ?? 0;
    SCENES.forEach((_, i) => {
      const entryAddress = (rom[table + 2 * i] ?? 0) | ((rom[table + 2 * i + 1] ?? 0) << 8);
      const entry = SCENE_ENTRY.decode(rom, entryAddress);
      expect(entry.dialogue).toBe(symbols.get(String(sceneDialogueLabel(i))));
      expect(entry.rounds).toBe(symbols.get(String(sceneRoundsLabel(i))));
      expect(entry.backdrop).toBe(symbols.get(String(sceneBackdropLabel(i))));
      expect(entry.flag).toBe(1 << i);
    });
  });

  // The game is a single 32 KB bank (no mapper). This floor keeps headroom for
  // dialogue and small art changes; outgrowing it means moving to MBC1 banking.
  // (Lowered from 4 KB when kana chances and generated questions moved in, then to
  // 1.5 KB for the sprite cat, the logo, and multi-tile scenery, then to 1 KB for
  // sound, passwords, the kana chart, practice, and the shrine. Dialogue text is
  // most of the ROM; the next big addition should come with MBC1 banking.)
  it('leaves at least 1 KB free for small fixes', () => {
    let end = rom.length;
    while (end > 0 && rom[end - 1] === 0) end--;
    expect(ROM_SIZE - end).toBeGreaterThanOrEqual(1024);
  });
});
