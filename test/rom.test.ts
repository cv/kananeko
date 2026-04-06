import { describe, it, expect, beforeAll } from 'vitest';
import { assemble } from '@asm/assembler';
import { buildProgram } from '@game/main';
import { buildTileData, CHAR_MAP, textToTiles } from '@game/font';
import { JOY } from '@asm/hardware';
import { buildDialogueData } from '@game/dialogue';
import { buildKanaData, KANA_QUESTIONS } from '@game/kana';
import { SCENES } from '@game/scene';

// @ts-expect-error — serverboy has no type declarations
import Gameboy from 'serverboy';

// ---------------------------------------------------------------------------
// Build the ROM once for all tests
// ---------------------------------------------------------------------------

let rom: Uint8Array;
let symbols: Map<string, number>;

beforeAll(() => {
  const result = assemble(buildProgram(), {
    title: 'KANANEKO',
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
    expect(symbols.has('init_vblank')).toBe(true);
    expect(symbols.has('init_copy')).toBe(true);
    expect(symbols.has('title_screen')).toBe(true);
    expect(symbols.has('title_loop')).toBe(true);
    expect(symbols.has('tileData')).toBe(true);
    expect(symbols.has('joy_read')).toBe(true);
    expect(symbols.has('dlg_open')).toBe(true);
    expect(symbols.has('dlg_update')).toBe(true);
    expect(symbols.has('kana_start')).toBe(true);
    expect(symbols.has('kana_update')).toBe(true);
    expect(symbols.has('scene_load')).toBe(true);
    expect(symbols.has('scene0_dlg')).toBe(true);
    expect(symbols.has('scene0_kana')).toBe(true);
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
    // Characters now sorted by Object.keys order from font-data.ts
    // Just verify they exist and are unique non-zero indices
    for (const ch of ['A', 'J', 'R', 'P', 'G', 'E', 'N', 'S', 'T']) {
      expect(CHAR_MAP[ch]).toBeDefined();
      expect(CHAR_MAP[ch]).toBeGreaterThan(0);
    }
    for (const ch of ['は', 'じ', 'め', 'こ', 'ん', 'に', 'ち']) {
      expect(CHAR_MAP[ch]).toBeDefined();
      expect(CHAR_MAP[ch]).toBeGreaterThan(0);
    }
    // Katakana
    for (const ch of ['ラ', 'メ', 'ン']) {
      expect(CHAR_MAP[ch]).toBeDefined();
      expect(CHAR_MAP[ch]).toBeGreaterThan(0);
    }
    // Border tiles
    expect(CHAR_MAP['┌']).toBeDefined();
    expect(CHAR_MAP['▶']).toBeDefined();
  });

  it('converts text to tile indices', () => {
    const kananeko = textToTiles('カナネコ');
    expect(kananeko).toHaveLength(4);
    // Each character maps to a unique tile
    expect(new Set(kananeko).size).toBe(4);
    // All non-zero
    expect(kananeko.every((t) => t > 0)).toBe(true);

    const hajime = textToTiles('はじめ');
    expect(hajime).toEqual([CHAR_MAP['は'], CHAR_MAP['じ'], CHAR_MAP['め']]);
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

  it('has instructions to write "カナネコ" to the tilemap at row 7', () => {
    // Verify the ROM contains LD HL followed by tile writes
    // serverboy doesn't expose tilemap via getMemory(), so we verify the ROM bytes
    const titleAddr = 0x9800 + 7 * 32 + Math.floor((20 - 4) / 2); // centered 4-char title
    const expectedTiles = textToTiles('カナネコ');

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

  it('has instructions to write "はじめ" to the tilemap at row 11', () => {
    const subAddr = 0x9800 + 11 * 32 + Math.floor((20 - 3) / 2); // $9948
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

// ---------------------------------------------------------------------------
// Joypad input tests
// ---------------------------------------------------------------------------

describe('joypad', () => {
  it('detects START press in WRAM', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    // Run a few frames to get past init
    for (let i = 0; i < 10; i++) gb.doFrame();

    // Press START
    gb.pressKey(Gameboy.KEYMAP.START);
    gb.doFrame();

    const memory = gb.getMemory();
    // Joypad current at $C000 should have START bit set
    expect(memory[0xc000] & JOY.START).toBe(JOY.START);
    // Newly pressed at $C002 should also have it
    expect(memory[0xc002] & JOY.START).toBe(JOY.START);
  });

  it('edge-detects: newly pressed clears on sustained hold', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    for (let i = 0; i < 10; i++) gb.doFrame();

    // Press A for one frame
    gb.pressKey(Gameboy.KEYMAP.A);
    gb.doFrame();

    let memory = gb.getMemory();
    expect(memory[0xc002] & JOY.A).toBe(JOY.A); // newly pressed

    // Hold A for another frame
    gb.pressKey(Gameboy.KEYMAP.A);
    gb.doFrame();

    memory = gb.getMemory();
    expect(memory[0xc000] & JOY.A).toBe(JOY.A); // still held
    expect(memory[0xc002] & JOY.A).toBe(0); // NOT newly pressed
  });

  it('detects d-pad UP', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    for (let i = 0; i < 10; i++) gb.doFrame();

    gb.pressKey(Gameboy.KEYMAP.UP);
    gb.doFrame();

    const memory = gb.getMemory();
    expect(memory[0xc000] & JOY.UP).toBe(JOY.UP);
  });

  it('detects simultaneous d-pad and button press', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    for (let i = 0; i < 10; i++) gb.doFrame();

    gb.pressKeys([Gameboy.KEYMAP.RIGHT, Gameboy.KEYMAP.A]);
    gb.doFrame();

    const memory = gb.getMemory();
    expect(memory[0xc000] & JOY.RIGHT).toBe(JOY.RIGHT);
    expect(memory[0xc000] & JOY.A).toBe(JOY.A);
  });
});

// ---------------------------------------------------------------------------
// Dialogue engine tests
// ---------------------------------------------------------------------------

describe('dialogue', () => {
  it('encodes dialogue data correctly', () => {
    const { data, offsets } = buildDialogueData([
      { text: 'こんにちは', choices: ['はい', 'いいえ'] },
    ]);
    expect(offsets).toHaveLength(1);
    expect(offsets[0]).toBe(0);
    // Data should contain tile indices for the text, null, choice count, then choices
    expect(data.length).toBeGreaterThan(0);
    // Find the null terminator after the text
    const tiles = textToTiles('こんにちは');
    for (let i = 0; i < tiles.length; i++) {
      expect(data[i]).toBe(tiles[i]);
    }
    expect(data[tiles.length]).toBe(0); // null terminator
    expect(data[tiles.length + 1]).toBe(2); // 2 choices
  });

  it('opens dialogue after START press (dlg_state becomes 1)', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    // Get past init to title screen
    for (let i = 0; i < 10; i++) gb.doFrame();

    // Press START to open dialogue
    gb.pressKey(Gameboy.KEYMAP.START);
    gb.doFrame();

    // Run a few more frames for dlg_open to complete
    for (let i = 0; i < 5; i++) gb.doFrame();

    const memory = gb.getMemory();
    // dlg_state at $C020 should be non-zero (printing or later)
    expect(memory[0xc020]).toBeGreaterThan(0);
  });

  it('reveals text and transitions to choosing state', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    for (let i = 0; i < 10; i++) gb.doFrame();

    // Open dialogue
    gb.pressKey(Gameboy.KEYMAP.START);
    gb.doFrame();

    // Run enough frames for text to fully reveal
    // "こんにちは!" = 6 chars, REVEAL_DELAY=3, so ~18 frames + overhead
    for (let i = 0; i < 60; i++) gb.doFrame();

    const memory = gb.getMemory();
    // Should be in choosing state (3) since the dialogue has 2 choices
    expect(memory[0xc020]).toBe(3);
  });

  it('confirms choice with A button and returns to idle', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    for (let i = 0; i < 10; i++) gb.doFrame();

    // Open dialogue
    gb.pressKey(Gameboy.KEYMAP.START);
    gb.doFrame();

    // Wait for choices
    for (let i = 0; i < 60; i++) gb.doFrame();

    // Press A to confirm first choice
    gb.pressKey(Gameboy.KEYMAP.A);
    gb.doFrame();

    const memory = gb.getMemory();
    // dlg_state should be 0 (idle)
    expect(memory[0xc020]).toBe(0);
    // dlg_result should be 0 (first choice)
    expect(memory[0xc029]).toBe(0);
  });

  it('navigates choices with DOWN and selects second option', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    for (let i = 0; i < 10; i++) gb.doFrame();

    // Open dialogue
    gb.pressKey(Gameboy.KEYMAP.START);
    gb.doFrame();

    // Wait for choices
    for (let i = 0; i < 60; i++) gb.doFrame();

    // Press DOWN to move to second choice
    gb.pressKey(Gameboy.KEYMAP.DOWN);
    gb.doFrame();

    // Confirm with A
    gb.pressKey(Gameboy.KEYMAP.A);
    gb.doFrame();

    const memory = gb.getMemory();
    expect(memory[0xc020]).toBe(0); // idle
    expect(memory[0xc029]).toBe(1); // second choice
  });
});

// ---------------------------------------------------------------------------
// Kana mini-game tests
// ---------------------------------------------------------------------------

describe('kana', () => {
  it('encodes kana question data correctly', () => {
    const data = buildKanaData(KANA_QUESTIONS);
    expect(data.length).toBeGreaterThan(0);
    // First byte is word_length of first question
    const firstWordLen = data[0];
    expect(firstWordLen).toBe(textToTiles(KANA_QUESTIONS[0]!.word).length);
    // Last byte should be 0x00 sentinel
    expect(data[data.length - 1]).toBe(0);
  });

  /** Helper: advance through title → dialogue → kana */
  function enterKanaGame(gb: InstanceType<typeof Gameboy>): void {
    // Boot and get to title
    for (let i = 0; i < 10; i++) gb.doFrame();

    // Press START to open dialogue
    gb.pressKey(Gameboy.KEYMAP.START);
    gb.doFrame();

    // Wait for dialogue to reach choices
    for (let i = 0; i < 60; i++) gb.doFrame();

    // Confirm first choice with A
    gb.pressKey(Gameboy.KEYMAP.A);
    gb.doFrame();

    // Run a few frames to let kana game start
    for (let i = 0; i < 5; i++) gb.doFrame();
  }

  it('enters kana game after dialogue closes', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));
    enterKanaGame(gb);

    const memory = gb.getMemory();
    // kana_state at $C030 should be 2 (awaiting input)
    expect(memory[0xc030]).toBe(2);
  });

  it('awards score for correct answer', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));
    enterKanaGame(gb);

    // First question correct direction is 'up' (dir=0)
    gb.pressKey(Gameboy.KEYMAP.UP);
    gb.doFrame();

    const memory = gb.getMemory();
    // Score at $C033 should be 4 (SCORE_PER_CORRECT)
    expect(memory[0xc033]).toBe(4);
    // State should be feedback (3)
    expect(memory[0xc030]).toBe(3);
  });

  it('does not award score for wrong answer', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));
    enterKanaGame(gb);

    // First question correct is UP, press DOWN instead
    gb.pressKey(Gameboy.KEYMAP.DOWN);
    gb.doFrame();

    const memory = gb.getMemory();
    // Score should remain 0
    expect(memory[0xc033]).toBe(0);
    // But state should still transition to feedback
    expect(memory[0xc030]).toBe(3);
  });

  it('advances to next question after feedback', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));
    enterKanaGame(gb);

    // Answer correctly
    gb.pressKey(Gameboy.KEYMAP.UP);
    gb.doFrame();

    // Wait for feedback (30 frames)
    for (let i = 0; i < 35; i++) gb.doFrame();

    const memory = gb.getMemory();
    // Question index at $C034 should be 1 (moved to second question)
    expect(memory[0xc034]).toBe(1);
    // State should be awaiting input again (2)
    expect(memory[0xc030]).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Scene system tests
// ---------------------------------------------------------------------------

describe('scene system', () => {
  it('has all 5 scenes defined', () => {
    expect(SCENES).toHaveLength(5);
    for (const scene of SCENES) {
      expect(scene.name.length).toBeGreaterThan(0);
      expect(scene.dialogues.length).toBeGreaterThan(0);
      expect(scene.kanaQuestions.length).toBeGreaterThan(0);
    }
  });

  it('has scene data labels in ROM for all 5 scenes', () => {
    for (let i = 0; i < 5; i++) {
      expect(symbols.has(`scene${String(i)}_dlg`)).toBe(true);
      expect(symbols.has(`scene${String(i)}_kana`)).toBe(true);
    }
  });

  it('loads scene 0 after START press', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    // Boot to title
    for (let i = 0; i < 10; i++) gb.doFrame();

    // Press START
    gb.pressKey(Gameboy.KEYMAP.START);
    gb.doFrame();

    // Run frames for scene to load
    for (let i = 0; i < 10; i++) gb.doFrame();

    const memory = gb.getMemory();
    // Scene ID at $C010 should be 0
    expect(memory[0xc010]).toBe(0);
    // Dialogue state should be active (non-zero)
    expect(memory[0xc020]).toBeGreaterThan(0);
  });

  it('completes scene 0 and advances to scene 1', () => {
    const gb = new Gameboy();
    gb.loadRom(Buffer.from(rom));

    // Boot to title
    for (let i = 0; i < 10; i++) gb.doFrame();

    // START to begin
    gb.pressKey(Gameboy.KEYMAP.START);
    gb.doFrame();

    // Scene 0 dialogue: complete all dialogues
    // Each dialogue: wait for text reveal, then press A to confirm choice
    for (let d = 0; d < SCENES[0]!.dialogues.length; d++) {
      // Wait for text to reveal and choices to appear
      for (let i = 0; i < 60; i++) gb.doFrame();
      // Select first choice
      gb.pressKey(Gameboy.KEYMAP.A);
      gb.doFrame();
      // If there are more dialogues, the next one should auto-start
      // (Actually in current implementation, dialogue ends after one entry)
    }

    // Should be in kana game now
    for (let i = 0; i < 5; i++) gb.doFrame();
    let memory = gb.getMemory();
    expect(memory[0xc030]).toBe(2); // kana awaiting input

    // Complete both kana questions for scene 0
    const scene0 = SCENES[0]!;
    for (const q of scene0.kanaQuestions) {
      // Press correct direction
      const keyMap: Record<string, number> = {
        up: Gameboy.KEYMAP.UP,
        down: Gameboy.KEYMAP.DOWN,
        left: Gameboy.KEYMAP.LEFT,
        right: Gameboy.KEYMAP.RIGHT,
      };
      gb.pressKey(keyMap[q.correctDir]);
      gb.doFrame();
      // Wait for feedback
      for (let i = 0; i < 35; i++) gb.doFrame();
    }

    // After all kana done, should advance to scene 1
    for (let i = 0; i < 10; i++) gb.doFrame();
    memory = gb.getMemory();

    // Scene ID should be 1
    expect(memory[0xc010]).toBe(1);
    // Scene 0 completion flag should be set (bit 0)
    expect(memory[0xc011] & 0x01).toBe(0x01);
  });

  it('ROM fits within 32KB', () => {
    // Find the last non-zero byte in the ROM
    let lastNonZero = 0;
    for (let i = rom.length - 1; i >= 0; i--) {
      if ((rom[i] ?? 0) !== 0) {
        lastNonZero = i;
        break;
      }
    }
    // Should be well under 32KB — verify at least 50% headroom
    expect(lastNonZero).toBeLessThan(16384); // less than 16KB used
  });
});
