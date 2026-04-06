import { describe, it, expect, beforeAll } from 'vitest';
import { assemble } from '@asm/assembler';
import { buildProgram } from '@game/title';
import { buildTileData, CHAR_MAP, textToTiles } from '@game/font';

// @ts-expect-error — serverboy has no type declarations
import Gameboy from 'serverboy';

// ---------------------------------------------------------------------------
// Build the ROM once for all tests
// ---------------------------------------------------------------------------

let rom: Uint8Array;
let symbols: Map<string, number>;

beforeAll(() => {
  const result = assemble(buildProgram(), {
    title: 'JRPGEN',
    destinationCode: 0x00,
  });
  rom = result.rom;
  symbols = result.symbols;
});

// ---------------------------------------------------------------------------
// ROM structure tests
// ---------------------------------------------------------------------------

describe('ROM structure', () => {
  it('is exactly 32KB', () => {
    expect(rom.length).toBe(32768);
  });

  it('has a valid entry point (NOP + JP $0150)', () => {
    expect(rom[0x0100]).toBe(0x00); // NOP
    expect(rom[0x0101]).toBe(0xc3); // JP
    expect(rom[0x0102]).toBe(0x50); // lo
    expect(rom[0x0103]).toBe(0x01); // hi
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

  it('has the title "JRPGEN" in the header', () => {
    const title = new TextDecoder().decode(rom.slice(0x0134, 0x0134 + 6));
    expect(title).toBe('JRPGEN');
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
});

// ---------------------------------------------------------------------------
// Assembler / symbol tests
// ---------------------------------------------------------------------------

describe('assembler', () => {
  it('places program code starting at $0150', () => {
    // First instruction is DI ($F3)
    expect(rom[0x0150]).toBe(0xf3);
  });

  it('resolves all expected labels', () => {
    expect(symbols.has('waitVBlank')).toBe(true);
    expect(symbols.has('copyTiles')).toBe(true);
    expect(symbols.has('clearMap')).toBe(true);
    expect(symbols.has('mainLoop')).toBe(true);
    expect(symbols.has('tileData')).toBe(true);
  });

  it('places tileData label in ROM', () => {
    const addr = symbols.get('tileData')!;
    expect(addr).toBeGreaterThan(0x0150);
    expect(addr).toBeLessThan(0x8000);
  });

  it('embeds tile data at the tileData label', () => {
    const addr = symbols.get('tileData')!;
    const tileData = buildTileData();
    // First 16 bytes should be the blank tile (all zeros)
    for (let i = 0; i < 16; i++) {
      expect(rom[addr + i]).toBe(0);
    }
    // Total tile data should match
    for (let i = 0; i < tileData.length; i++) {
      expect(rom[addr + i]).toBe(tileData[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// Font / text encoding tests
// ---------------------------------------------------------------------------

describe('font', () => {
  it('maps all expected characters', () => {
    expect(CHAR_MAP[' ']).toBe(0);
    expect(CHAR_MAP['J']).toBe(1);
    expect(CHAR_MAP['R']).toBe(2);
    expect(CHAR_MAP['P']).toBe(3);
    expect(CHAR_MAP['G']).toBe(4);
    expect(CHAR_MAP['E']).toBe(5);
    expect(CHAR_MAP['N']).toBe(6);
    expect(CHAR_MAP['は']).toBeDefined();
    expect(CHAR_MAP['じ']).toBeDefined();
    expect(CHAR_MAP['め']).toBeDefined();
  });

  it('converts text to tile indices', () => {
    expect(textToTiles('JRPGEN')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(textToTiles('はじめ')).toEqual([CHAR_MAP['は'], CHAR_MAP['じ'], CHAR_MAP['め']]);
  });

  it('generates non-empty tile data for each character', () => {
    const data = buildTileData();
    // Tile 0 is blank
    const blank = data.slice(0, 16);
    expect(blank.every((b) => b === 0)).toBe(true);

    // All other tiles should have at least some non-zero bytes
    for (let t = 1; t <= Object.keys(CHAR_MAP).length - 1; t++) {
      const tile = data.slice(t * 16, (t + 1) * 16);
      expect(tile.some((b) => b !== 0)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Emulator integration tests (serverboy)
// ---------------------------------------------------------------------------

describe('emulator', () => {
  it('boots without crashing (runs 120 frames)', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    // Run 120 frames (~2 seconds of gameplay)
    for (let i = 0; i < 120; i++) {
      gb.doFrame();
    }

    // If we get here without throwing, the ROM runs
    expect(true).toBe(true);
  });

  it('has tile data loaded in VRAM after boot', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    for (let i = 0; i < 120; i++) gb.doFrame();

    const memory = gb.getMemory();

    // VRAM tile area at $8000: tile 0 should be blank
    for (let i = 0; i < 16; i++) {
      expect(memory[0x8000 + i]).toBe(0);
    }

    // Tile 1 (J) should have non-zero data
    let hasData = false;
    for (let i = 0; i < 16; i++) {
      if (memory[0x8010 + i] !== 0) hasData = true;
    }
    expect(hasData).toBe(true);
  });

  it('has instructions to write "JRPGEN" to the tilemap at row 6', () => {
    // Verify the ROM contains LD HL, $98C7 followed by tile writes
    // serverboy doesn't expose tilemap via getMemory(), so we verify the ROM bytes
    const titleAddr = 0x9800 + 6 * 32 + 7; // $98C7
    const expectedTiles = textToTiles('JRPGEN');

    // Find LD HL, $98C7 in ROM (0x21 0xC7 0x98)
    let found = -1;
    for (let i = 0x0150; i < rom.length - 2; i++) {
      if (rom[i] === 0x21 && rom[i + 1] === (titleAddr & 0xff) && rom[i + 2] === titleAddr >> 8) {
        found = i;
        break;
      }
    }
    expect(found).toBeGreaterThan(0);

    // After LD HL, each tile is written as: LD A, n (0x3E, n) + LD [HL+], A (0x22)
    let pc = found + 3;
    for (const tile of expectedTiles) {
      expect(rom[pc]).toBe(0x3e); // LD A, n
      expect(rom[pc + 1]).toBe(tile); // tile index
      expect(rom[pc + 2]).toBe(0x22); // LD [HL+], A
      pc += 3;
    }
  });

  it('has instructions to write "はじめ" to the tilemap at row 10', () => {
    const subAddr = 0x9800 + 10 * 32 + Math.floor((20 - 3) / 2); // $9948
    const expectedTiles = textToTiles('はじめ');

    let found = -1;
    for (let i = 0x0150; i < rom.length - 2; i++) {
      if (rom[i] === 0x21 && rom[i + 1] === (subAddr & 0xff) && rom[i + 2] === subAddr >> 8) {
        found = i;
        break;
      }
    }
    expect(found).toBeGreaterThan(0);

    let pc = found + 3;
    for (const tile of expectedTiles) {
      expect(rom[pc]).toBe(0x3e);
      expect(rom[pc + 1]).toBe(tile);
      expect(rom[pc + 2]).toBe(0x22);
      pc += 3;
    }
  });

  it('produces a non-blank screen', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    for (let i = 0; i < 120; i++) gb.doFrame();

    const screen = gb.getScreen();
    expect(screen.length).toBe(160 * 144 * 4); // RGBA

    // At least some pixels should differ from the first pixel
    // (meaning something is drawn on screen)
    const firstPixel = screen[0];
    let hasDifference = false;
    for (let i = 4; i < screen.length; i += 4) {
      if (screen[i] !== firstPixel) {
        hasDifference = true;
        break;
      }
    }
    expect(hasDifference).toBe(true);
  });
});
