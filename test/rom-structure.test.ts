/** ROM binary structure, assembler, and font tests. */

import { describe, it, expect } from 'vitest';
import { rom, symbols } from './helpers/game-runner';
import { buildTileData, CHAR_MAP, textToTiles } from '@game/font';

// ---------------------------------------------------------------------------
// ROM structure
// ---------------------------------------------------------------------------

describe('ROM structure', () => {
  it('is exactly 32KB', () => {
    expect(rom.length).toBe(32768);
  });

  it('has a valid entry point (NOP + JP $0150)', () => {
    expect(rom[0x0100]).toBe(0x00);
    expect(rom[0x0101]).toBe(0xc3);
    expect(rom[0x0102]).toBe(0x50);
    expect(rom[0x0103]).toBe(0x01);
  });

  it('has the correct Nintendo logo', () => {
    const expected = [
      0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00,
      0x0d, 0x00, 0x08, 0x11, 0x1f, 0x88, 0x89, 0x00, 0x0e, 0xdc, 0xcc, 0x6e, 0xe6, 0xdd, 0xdd,
      0xd9, 0x99, 0xbb, 0xbb, 0x67, 0x63, 0x6e, 0x0e, 0xec, 0xcc, 0xdd, 0xdc, 0x99, 0x9f, 0xbb,
      0xb9, 0x33, 0x3e,
    ];
    for (let i = 0; i < expected.length; i++) {
      expect(rom[0x0104 + i]).toBe(expected[i]);
    }
  });

  it('has the title "KANANEKO" in the header', () => {
    const title = new TextDecoder().decode(rom.slice(0x0134, 0x0134 + 8));
    expect(title).toBe('KANANEKO');
  });

  it('has a valid header checksum', () => {
    let sum = 0;
    for (let i = 0x0134; i <= 0x014c; i++) {
      sum = (sum - (rom[i] ?? 0) - 1) & 0xff;
    }
    expect(rom[0x014d]).toBe(sum);
  });

  it('has a valid global checksum', () => {
    let sum = 0;
    for (let i = 0; i < rom.length; i++) {
      if (i === 0x014e || i === 0x014f) continue;
      sum = (sum + (rom[i] ?? 0)) & 0xffff;
    }
    const stored = ((rom[0x014e] ?? 0) << 8) | (rom[0x014f] ?? 0);
    expect(stored).toBe(sum);
  });

  it('fits comfortably within 32KB', () => {
    let lastNonZero = 0;
    for (let i = rom.length - 1; i >= 0; i--) {
      if ((rom[i] ?? 0) !== 0) {
        lastNonZero = i;
        break;
      }
    }
    expect(lastNonZero).toBeLessThan(24576);
  });
});

// ---------------------------------------------------------------------------
// Assembler
// ---------------------------------------------------------------------------

describe('assembler', () => {
  it('places program code starting at $0150', () => {
    expect(rom[0x0150]).toBe(0xf3); // DI
  });

  it('resolves all expected labels', () => {
    for (const lbl of [
      'init_vblank',
      'init_copy',
      'title_screen',
      'title_loop',
      'tileData',
      'joy_read',
      'dlg_open',
      'dlg_update',
      'dlg_open_tree',
      'dlg_open_node',
      'kana_start',
      'kana_update',
      'scene_load',
      'scene0_dlg',
      'scene0_kana',
    ]) {
      expect(symbols.has(lbl)).toBe(true);
    }
  });

  it('embeds tile data at the tileData label', () => {
    const addr = symbols.get('tileData')!;
    const tileData = buildTileData();
    for (let i = 0; i < 16; i++) {
      expect(rom[addr + i]).toBe(0); // blank tile
    }
    for (let i = 0; i < tileData.length; i++) {
      expect(rom[addr + i]).toBe(tileData[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// Font
// ---------------------------------------------------------------------------

describe('font', () => {
  it('maps all game characters', () => {
    expect(CHAR_MAP[' ']).toBe(0);
    for (const ch of ['A', 'J', 'R', 'P', 'G', 'E', 'N', 'S', 'T']) {
      expect(CHAR_MAP[ch]).toBeGreaterThan(0);
    }
    for (const ch of ['は', 'じ', 'め', 'こ', 'ん', 'に', 'ち']) {
      expect(CHAR_MAP[ch]).toBeGreaterThan(0);
    }
    for (const ch of ['ラ', 'メ', 'ン', '┌', '▶']) {
      expect(CHAR_MAP[ch]).toBeGreaterThan(0);
    }
  });

  it('converts text to unique tile indices', () => {
    const tiles = textToTiles('カナネコ');
    expect(tiles).toHaveLength(4);
    expect(new Set(tiles).size).toBe(4);
    expect(tiles.every((t) => t > 0)).toBe(true);
  });

  it('generates non-empty tile data for each character', () => {
    const data = buildTileData();
    expect(data.slice(0, 16).every((b) => b === 0)).toBe(true); // blank
    for (let t = 1; t <= Object.keys(CHAR_MAP).length - 1; t++) {
      const tile = data.slice(t * 16, (t + 1) * 16);
      expect(tile.some((b) => b !== 0)).toBe(true);
    }
  });
});
