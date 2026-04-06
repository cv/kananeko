import { describe, it, expect } from 'vitest';
import { GameRunner, rom, symbols } from './helpers/game-runner';
import { buildTileData, CHAR_MAP, textToTiles } from '@game/font';
import { buildDialogueTree } from '@game/dialogue';
import { buildKanaData, type KanaQuestion } from '@game/kana';
import { JOY } from '@asm/hardware';
import { SCENES } from '@game/scene';

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
    for (const label of [
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
      expect(symbols.has(label)).toBe(true);
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

// ---------------------------------------------------------------------------
// Dialogue
// ---------------------------------------------------------------------------

describe('dialogue', () => {
  it('encodes dialogue tree correctly', () => {
    const data = buildDialogueTree([
      {
        text: 'こんにちは',
        choices: [
          { text: 'はい', next: 1 },
          { text: 'いいえ', next: null, hint: 'はい!' },
        ],
      },
      { text: 'さようなら', choices: [{ text: 'またね', next: null }] },
    ]);
    expect(data[0]).toBe(2); // node count
    const node0Offset = (data[1] ?? 0) | ((data[2] ?? 0) << 8);
    expect(node0Offset).toBe(5); // header = 1 + 2*2
  });

  it('opens dialogue after START', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.dlgState).toBeGreaterThan(0);
  });

  it('reveals text and transitions to choosing', () => {
    const runner = new GameRunner().boot().start();
    runner.waitForDialogueChoices();
    expect(runner.dlgState).toBe(3);
  });

  it('confirms choice and stores result', () => {
    const runner = new GameRunner().boot().start();
    runner.waitForDialogueChoices().press('A');
    expect(runner.dlgResult).toBe(0);
  });

  it('navigates choices with DOWN', () => {
    const runner = new GameRunner().boot().start();
    // Use advanceDialogue to get to node 1 (skip node 0 which might auto-confirm)
    runner.advanceDialogue(); // node 0 → node 1
    runner.waitForDialogueChoices();
    runner.press('DOWN').frames(3).press('A');
    expect(runner.dlgResult).toBe(1);
  });

  it('branches to next node after choice', () => {
    const runner = new GameRunner().boot().start();
    runner.advanceDialogue(); // node 0 → node 1
    expect(runner.dlgNodeId).toBe(1);
    runner.advanceDialogue(); // node 1 → node 2
    expect(runner.dlgNodeId).toBe(2);
    // Keep going until conversation ends
    runner.completeDialogueTree(0);
    expect(runner.dlgNodeId).toBe(0xff);
  });
});

// ---------------------------------------------------------------------------
// Kana mini-game
// ---------------------------------------------------------------------------

describe('kana', () => {
  it('encodes question data correctly', () => {
    const testQ: KanaQuestion[] = [
      { word: 'こんにちは', blankIndex: 0, correct: 'こ', distractors: ['か', 'く', 'き'] },
    ];
    const data = buildKanaData(testQ);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toBe(textToTiles('こんにちは').length);
    expect(data[data.length - 1]).toBe(0); // end sentinel
  });

  it('enters kana game after dialogue', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    runner.waitForKanaInput();
    expect(runner.kanaState).toBe(2);
  });

  it('awards 100 points for correct first try', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    runner.answerKanaCorrectly();
    expect(runner.kanaScore).toBe(100);
  });

  it('awards 10 points for correct second try', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    runner.answerKanaWrong(); // attempt 1 wrong
    runner.answerKanaCorrectly(); // attempt 2 correct
    expect(runner.kanaScore).toBe(10);
  });

  it('loses a life after 3 wrong answers', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    expect(runner.kanaLives).toBe(3);
    runner.answerKanaWrong(); // attempt 1
    runner.answerKanaWrong(); // attempt 2
    runner.answerKanaWrong(); // attempt 3 = death
    expect(runner.kanaLives).toBe(2);
  });

  it('advances to next question after correct answer', () => {
    const runner = new GameRunner().boot().start().completeDialogueTree(0);
    runner.answerKanaCorrectly();
    expect(runner.kanaQuestionIdx).toBe(1);
    expect(runner.kanaState).toBe(2); // awaiting next
  });
});

// ---------------------------------------------------------------------------
// Scene system
// ---------------------------------------------------------------------------

describe('scenes', () => {
  it('has all 5 scenes with dialogue and kana', () => {
    expect(SCENES).toHaveLength(5);
    for (const scene of SCENES) {
      expect(scene.name.length).toBeGreaterThan(0);
      expect(scene.dialogue.length).toBeGreaterThan(0);
      expect(scene.kanaQuestions.length).toBeGreaterThan(0);
    }
  });

  it('has scene data labels for all 5 scenes', () => {
    for (let i = 0; i < 5; i++) {
      expect(symbols.has(`scene${String(i)}_dlg`)).toBe(true);
      expect(symbols.has(`scene${String(i)}_kana`)).toBe(true);
    }
  });

  it('loads scene 0 after START', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgState).toBeGreaterThan(0);
  });

  it('completes scene 0 and advances to scene 1', () => {
    const runner = new GameRunner().boot().start().completeScene(0);
    expect(runner.sceneId).toBe(1);
    expect(runner.sceneFlags & 0x01).toBe(0x01);
  });
});
