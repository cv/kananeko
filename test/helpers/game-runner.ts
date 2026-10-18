/**
 * High-level test helper for running the Game Boy emulator.
 *
 * Wraps serverboy with domain-aware methods so tests read like
 * game scenarios instead of raw frame counts and hex addresses.
 */

import Gameboy from 'serverboy';
import { MEM } from '@asm/hardware';
import { buildRom } from '@game/main';
import { SCENES } from '@game/scene';
import { DialogueState, END_OF_CONVERSATION, KanaState } from '@game/state';

// Build the ROM once per worker — shared across all tests
const { rom, symbols } = buildRom();

export { rom, symbols };

type SaveStatePayload = ReturnType<EmulatorCore['saveState']>;

interface EmulatorCore {
  saveState(): unknown[];
  saving(state: unknown[]): void;
}

interface EmulatorInternals {
  gameboy: EmulatorCore;
  frames: number;
  pressed: boolean[];
}

export interface GameRunnerSnapshot {
  readonly state: SaveStatePayload;
  readonly frames: number;
}

function patchRomForServerboy(sourceRom: Uint8Array): Buffer {
  const patchedRom = Buffer.from(sourceRom);
  for (let i = 0x0150; i < 0x0300; i++) {
    // Find: 3E 01 EA FF FF FB (LD A,$01; LD ($FFFF),A; EI)
    if (
      patchedRom[i] === 0x3e &&
      patchedRom[i + 1] === 0x01 &&
      patchedRom[i + 2] === 0xea &&
      patchedRom[i + 3] === 0xff &&
      patchedRom[i + 4] === 0xff &&
      patchedRom[i + 5] === 0xfb
    ) {
      // NOP out the LD A,$01 and LD ($FFFF),A (5 bytes), keep the EI
      patchedRom[i] = 0x00;
      patchedRom[i + 1] = 0x00;
      patchedRom[i + 2] = 0x00;
      patchedRom[i + 3] = 0x00;
      patchedRom[i + 4] = 0x00;
      break;
    }
  }
  return patchedRom;
}

// Direction index → serverboy key mapping (0=UP, 1=DOWN, 2=LEFT, 3=RIGHT)
const DIR_KEYS: number[] = [
  Gameboy.KEYMAP.UP,
  Gameboy.KEYMAP.DOWN,
  Gameboy.KEYMAP.LEFT,
  Gameboy.KEYMAP.RIGHT,
];

/**
 * A test-friendly Game Boy runner with high-level game actions.
 */
export class GameRunner {
  private readonly gb: InstanceType<typeof Gameboy>;
  private readonly internals: EmulatorInternals;

  private static readonly patchedRom = patchRomForServerboy(rom);
  private static interfacePrivateKey: string | undefined;

  constructor(snapshot?: GameRunnerSnapshot) {
    this.gb = new Gameboy();
    this.gb.loadRom(GameRunner.patchedRom);
    this.internals = GameRunner.getInternals(this.gb);

    if (snapshot !== undefined) {
      this.restore(snapshot);
    }
  }

  private static getInternals(gb: InstanceType<typeof Gameboy>): EmulatorInternals {
    GameRunner.interfacePrivateKey ??= Object.getOwnPropertyNames(gb).find((key) =>
      key.startsWith('_'),
    );
    const privateKey = GameRunner.interfacePrivateKey;
    if (privateKey === undefined) {
      throw new Error('Could not locate serverboy internals');
    }
    const internals = (gb as unknown as Record<string, EmulatorInternals | undefined>)[privateKey];
    if (internals === undefined) {
      throw new Error('Could not access serverboy internals');
    }
    return internals;
  }

  static fromSnapshot(snapshot: GameRunnerSnapshot): GameRunner {
    return new GameRunner(snapshot);
  }

  snapshot(): GameRunnerSnapshot {
    return {
      state: this.internals.gameboy.saveState(),
      frames: this.internals.frames,
    };
  }

  private restore(snapshot: GameRunnerSnapshot): void {
    this.internals.gameboy.saving(snapshot.state);
    this.internals.frames = snapshot.frames;
    this.internals.pressed.fill(false);
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
  private pressKey(key: number): this {
    this.gb.pressKey(key);
    this.gb.doFrame();
    return this;
  }

  pressA(): this {
    return this.pressKey(Gameboy.KEYMAP.A);
  }
  pressStart(): this {
    return this.pressKey(Gameboy.KEYMAP.START);
  }
  pressUp(): this {
    return this.pressKey(Gameboy.KEYMAP.UP);
  }
  pressDown(): this {
    return this.pressKey(Gameboy.KEYMAP.DOWN);
  }

  /** Read a WRAM byte by its MEM constant */
  readMem(addr: number): number {
    const value = this.gb.getMemory()[addr];
    if (value === undefined) throw new RangeError(`Address out of range: ${String(addr)}`);
    return value;
  }

  /** Get the full screen buffer */
  getScreen(): number[] {
    return this.gb.getScreen();
  }

  /** Get the full memory array */
  getMemory(): Uint8Array {
    return this.gb.getMemory();
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

  get dlgChoiceOrder(): [number, number, number] {
    return [
      this.readMem(MEM.DLG_ORDER0),
      this.readMem(MEM.DLG_ORDER1),
      this.readMem(MEM.DLG_ORDER2),
    ];
  }

  get kanaState(): number {
    return this.readMem(MEM.KANA_STATE);
  }

  get kanaScore(): number {
    return this.readMem(MEM.KANA_SCORE_LO) | (this.readMem(MEM.KANA_SCORE_HI) << 8);
  }

  get kanaLives(): number {
    return this.readMem(MEM.KANA_LIVES);
  }

  get kanaAttempts(): number {
    return this.readMem(MEM.KANA_ATTEMPTS);
  }

  get kanaCorrectPos(): number {
    return this.readMem(MEM.KANA_CORRECT_POS);
  }

  get kanaQuestionIdx(): number {
    return this.readMem(MEM.KANA_Q_IDX);
  }

  get deltaType(): number {
    return this.readMem(MEM.DELTA_TYPE);
  }

  /** Whether the HUD is currently flashing a score delta */
  get deltaVisible(): boolean {
    return this.readMem(MEM.DELTA_TIMER) > 0;
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
  private static readonly INPUT_DEBOUNCE = 3; // frames for joypad edge detector to clear

  /** Wait until a predicate on game state is true, or throw after MAX_WAIT frames */
  waitUntil(predicate: () => boolean, description: string): this {
    if (predicate()) {
      return this;
    }
    for (let i = 0; i < GameRunner.MAX_WAIT; i++) {
      this.frames(1);
      if (predicate()) return this;
    }
    throw new Error(`Timed out waiting for: ${description}`);
  }

  /** Wait until dialogue has finished printing and waits for input or a choice */
  waitForDialogueChoices(): this {
    return this.waitUntil(
      () => this.dlgState === DialogueState.WAITING || this.dlgState === DialogueState.CHOOSING,
      'dialogue choosing/wait state',
    ).frames(GameRunner.INPUT_DEBOUNCE);
  }

  /** Wait until the kana round awaits a d-pad answer */
  waitForKanaInput(): this {
    return this.waitUntil(() => this.kanaState === KanaState.AWAITING, 'kana awaiting input');
  }

  /** Whether the current conversation has ended */
  get dialogueEnded(): boolean {
    return this.dlgState === DialogueState.IDLE && this.dlgNodeId === END_OF_CONVERSATION;
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
    this.pressStart();
    return this.waitUntil(() => this.dlgState !== DialogueState.IDLE, 'opening dialogue').frames(
      GameRunner.INPUT_DEBOUNCE,
    );
  }

  dialogueDisplayIndexForChoice(logicalChoice: number): number {
    const displayIndex = this.dlgChoiceOrder.indexOf(logicalChoice);
    if (displayIndex === -1) {
      throw new Error(
        `Choice ${String(logicalChoice)} is not visible in the current dialogue node`,
      );
    }
    return displayIndex;
  }

  chooseDialogueChoice(logicalChoice: number): this {
    this.waitForDialogueChoices();
    const displayIndex = this.dialogueDisplayIndexForChoice(logicalChoice);
    for (let i = 0; i < displayIndex; i++) {
      this.pressDown().frames(1);
    }
    return this.pressA().frames(GameRunner.INPUT_DEBOUNCE);
  }

  /** Wait for dialogue choices to appear, then pick first authored choice (good) */
  advanceDialogue(): this {
    return this.chooseDialogueChoice(0);
  }

  /** Wait for dialogue choices to appear, then pick second authored choice (bad) */
  advanceDialogueBad(): this {
    return this.chooseDialogueChoice(1);
  }

  /** Complete an entire dialogue tree (always choosing first option until conversation ends) */
  completeDialogueTree(): this {
    for (let safety = 0; safety < 100; safety++) {
      this.advanceDialogue();
      if (this.dialogueEnded) break;
    }
    return this.frames(GameRunner.INPUT_DEBOUNCE);
  }

  /** Press the d-pad direction of a right or wrong answer for one frame, without waiting */
  pressKanaAnswer(correct: boolean): this {
    this.waitForKanaInput();
    const direction = correct ? this.kanaCorrectPos : (this.kanaCorrectPos + 1) & 3;
    const key = DIR_KEYS[direction];
    if (key === undefined) throw new Error(`Invalid kana direction: ${String(direction)}`);
    return this.pressKey(key);
  }

  /** Answer the current kana question and wait out the feedback */
  private answerKana(correct: boolean): this {
    this.pressKanaAnswer(correct);
    return this.waitUntil(() => this.kanaState !== KanaState.AWAITING, 'kana answer registration')
      .waitUntil(
        () => this.kanaState === KanaState.AWAITING || this.kanaState === KanaState.IDLE,
        'kana feedback',
      )
      .frames(GameRunner.INPUT_DEBOUNCE);
  }

  /** Answer the current kana question correctly (reads the randomized position from WRAM) */
  answerKanaCorrectly(): this {
    return this.answerKana(true);
  }

  /** Answer the current kana question with a wrong direction */
  answerKanaWrong(): this {
    return this.answerKana(false);
  }

  /** Complete all kana questions for a scene (correct on first try) */
  completeKanaQuestions(sceneIndex: number): this {
    const questions = SCENES[sceneIndex]?.kanaQuestions ?? [];
    for (let i = 0; i < questions.length; i++) {
      this.answerKanaCorrectly();
    }
    return this.frames(10);
  }
}
