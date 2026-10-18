/** The assembled game ROM: header, layout, and embedded data. */

import { describe, expect, it } from 'vitest';
import { ROM_SIZE, globalChecksum, headerChecksum } from '@asm/assembler';
import { buildTileData } from '@game/font';
import { sceneDialogueLabel, sceneKanaLabel } from '@game/main';
import { SCENES, buildSceneData } from '@game/scene';
import { rom, symbols } from './helpers/game-runner';

function bytesAt(label: string, length: number): Uint8Array {
  const addr = symbols.get(label);
  if (addr === undefined) throw new Error(`Missing label ${label}`);
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
      'tileData',
    ]) {
      expect(symbols.has(name), name).toBe(true);
    }
  });

  it('embeds the font tiles at tileData', () => {
    const tiles = buildTileData();
    expect(bytesAt('tileData', tiles.length)).toEqual(tiles);
  });

  it("embeds every scene's dialogue and kana data at its labels", () => {
    buildSceneData().forEach((packed, i) => {
      expect(bytesAt(sceneDialogueLabel(i), packed.dialogueData.length)).toEqual(
        packed.dialogueData,
      );
      expect(bytesAt(sceneKanaLabel(i), packed.kanaData.length)).toEqual(packed.kanaData);
    });
    expect(SCENES).toHaveLength(5);
  });

  it('leaves at least 8 KB free for new content', () => {
    let end = rom.length;
    while (end > 0 && rom[end - 1] === 0) end--;
    expect(ROM_SIZE - end).toBeGreaterThanOrEqual(8 * 1024);
  });
});
