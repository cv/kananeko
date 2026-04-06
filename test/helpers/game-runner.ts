/**
 * High-level test helper for running the Game Boy emulator.
 *
 * Wraps serverboy with domain-aware methods so tests read like
 * game scenarios instead of raw frame counts and hex addresses.
 */

// @ts-expect-error — serverboy has no type declarations
import Gameboy from 'serverboy';
import { assemble } from '@asm/assembler';
import { buildProgram } from '@game/main';
import { MEM } from '@asm/hardware';
import { SCENES } from '@game/scene';
import type { KanaDir } from '@game/kana';

// Build the ROM once — shared across all tests
const { rom, symbols } = assemble(buildProgram(), {
  title: 'KANANEKO',
  cgbFlag: 0x80,
  destinationCode: 0x00,
});

export { rom, symbols };

// Direction → serverboy key mapping
const DIR_KEYS: Record<KanaDir, number> = {
  up: Gameboy.KEYMAP.UP as number,
  down: Gameboy.KEYMAP.DOWN as number,
  left: Gameboy.KEYMAP.LEFT as number,
  right: Gameboy.KEYMAP.RIGHT as number,
};

/**
 * A test-friendly Game Boy runner with high-level game actions.
 */
export class GameRunner {
  private readonly gb: InstanceType<typeof Gameboy>;

  constructor() {
    this.gb = new Gameboy();
    this.gb.loadRom(Buffer.from(rom));
  }

  // ---------------------------------------------------------------------------
  // Low-level
  // ---------------------------------------------------------------------------

  /** Advance N frames */
  frames(n: number): this {
    for (let i = 0; i < n; i++) this.gb.doFrame();
    return this;
  }

  /** Press a key for one frame */
  press(key: string): this {
    const keyMap: Record<string, number> = {
      A: Gameboy.KEYMAP.A as number,
      B: Gameboy.KEYMAP.B as number,
      START: Gameboy.KEYMAP.START as number,
      SELECT: Gameboy.KEYMAP.SELECT as number,
      UP: Gameboy.KEYMAP.UP as number,
      DOWN: Gameboy.KEYMAP.DOWN as number,
      LEFT: Gameboy.KEYMAP.LEFT as number,
      RIGHT: Gameboy.KEYMAP.RIGHT as number,
    };
    const k = keyMap[key];
    if (k === undefined) throw new Error(`Unknown key: ${key}`);
    this.gb.pressKey(k);
    this.gb.doFrame();
    return this;
  }

  /** Read a WRAM byte by its MEM constant */
  readMem(addr: number): number {
    return this.gb.getMemory()[addr] as number;
  }

  /** Get the full screen buffer */
  getScreen(): number[] {
    return this.gb.getScreen() as number[];
  }

  /** Get the full memory array */
  getMemory(): number[] {
    return this.gb.getMemory() as number[];
  }

  // ---------------------------------------------------------------------------
  // Game state readers
  // ---------------------------------------------------------------------------

  get joypadCurrent(): number {
    return this.readMem(MEM.JOYPAD_CUR);
  }

  get joypadNew(): number {
    return this.readMem(MEM.JOYPAD_NEW);
  }

  get dlgState(): number {
    return this.readMem(MEM.DLG_STATE);
  }

  get dlgResult(): number {
    return this.readMem(MEM.DLG_RESULT);
  }

  get dlgNodeId(): number {
    return this.readMem(MEM.DLG_NODE_ID);
  }

  get kanaState(): number {
    return this.readMem(MEM.KANA_STATE);
  }

  get kanaScore(): number {
    return this.readMem(MEM.KANA_SCORE);
  }

  get kanaQuestionIdx(): number {
    return this.readMem(MEM.KANA_Q_IDX);
  }

  get sceneId(): number {
    return this.readMem(MEM.SCENE_ID);
  }

  get sceneFlags(): number {
    return this.readMem(MEM.SCENE_FLAGS);
  }

  // ---------------------------------------------------------------------------
  // State-machine waits (no magic frame numbers)
  // ---------------------------------------------------------------------------

  private static readonly MAX_WAIT = 500; // safety limit for all waits
  private static readonly INPUT_DEBOUNCE = 10; // frames for joypad edge detector to clear

  /** Wait until a predicate on game state is true, or throw after MAX_WAIT frames */
  waitUntil(predicate: () => boolean, description: string): this {
    for (let i = 0; i < GameRunner.MAX_WAIT; i++) {
      this.frames(1);
      if (predicate()) return this;
    }
    throw new Error(`Timed out waiting for: ${description}`);
  }

  /** Wait until dialogue reaches choosing (3) or wait-for-input (2) state */
  waitForDialogueChoices(): this {
    return this.waitUntil(() => this.dlgState >= 2, 'dialogue choosing/wait state').frames(
      GameRunner.INPUT_DEBOUNCE,
    );
  }

  /** Wait until kana game reaches awaiting-input (2) state */
  waitForKanaInput(): this {
    return this.waitUntil(() => this.kanaState === 2, 'kana awaiting input');
  }

  /** Wait until dialogue is idle (0) and node signals end (0xFF) */
  waitForDialogueEnd(): this {
    return this.waitUntil(() => this.dlgState === 0 && this.dlgNodeId === 0xff, 'dialogue end');
  }

  // ---------------------------------------------------------------------------
  // High-level game actions
  // ---------------------------------------------------------------------------

  /** Boot past the title screen debounce (needs ~200 frames for init + LCD setup) */
  boot(): this {
    // The ROM needs real frames to: init registers, copy tiles, draw title,
    // wait for VBlank, and debounce boot-ROM input. 200 frames is reliable.
    return this.frames(200);
  }

  /** Press START to begin the game from the title screen */
  start(): this {
    return this.press('START').frames(GameRunner.INPUT_DEBOUNCE);
  }

  /** Wait for dialogue choices to appear, then pick first choice */
  advanceDialogue(): this {
    return this.waitForDialogueChoices().press('A').frames(GameRunner.INPUT_DEBOUNCE);
  }

  /** Complete an entire dialogue tree (always choosing first option until conversation ends) */
  completeDialogueTree(_sceneIndex: number): this {
    for (let safety = 0; safety < 50; safety++) {
      this.advanceDialogue();
      if (this.dlgNodeId === 0xff && this.dlgState === 0) break;
    }
    return this.frames(GameRunner.INPUT_DEBOUNCE);
  }

  /** Answer a kana question with a d-pad direction */
  answerKana(dir: KanaDir): this {
    this.waitForKanaInput();
    const key = DIR_KEYS[dir];
    this.gb.pressKey(key);
    this.gb.doFrame();
    // Wait for feedback to complete and next question (or end) to load
    return this.waitUntil(() => this.kanaState !== 3, 'kana feedback complete');
  }

  /** Complete all kana questions for a scene (correct answers) */
  completeKanaQuestions(sceneIndex: number): this {
    const questions = SCENES[sceneIndex]?.kanaQuestions ?? [];
    for (const q of questions) {
      this.answerKana(q.correctDir);
    }
    return this.frames(10);
  }

  /** Play through an entire scene: dialogue tree + kana questions */
  completeScene(sceneIndex: number): this {
    return this.completeDialogueTree(sceneIndex).completeKanaQuestions(sceneIndex);
  }
}
