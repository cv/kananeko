/**
 * High-level test helper for running the Game Boy emulator.
 *
 * Wraps serverboy with domain-aware methods so tests read like
 * game scenarios instead of raw frame counts and hex addresses.
 */

import { CHAR_MAP } from '@game/font';
import { PASSWORD_ALPHABET } from '@game/password';
import { MUSIC_NONE, SFX, SFX_NONE, SONGS, type SfxName, type SongName } from '@game/sound';
import Gameboy from 'serverboy';
import { MEM } from '@game/ram';
import { CAT_FACES, type CatFace, faceTile } from '@game/cat';
import { SPRITE_SLOT, oamField } from '@game/sprites';
import { buildRom } from '@game/main';
import { SCENES, sceneRounds } from '@game/scene';
import { DialogueState, END_OF_CONVERSATION, KanaMode, KanaState } from '@game/state';

// Build the ROM once per worker — shared across all tests
const { rom, symbols, unreferenced } = buildRom();

export { rom, symbols, unreferenced };

type SaveStatePayload = ReturnType<EmulatorCore['saveState']>;

interface EmulatorCore {
  stackPointer: number;
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

const SFX_ORDER = Object.keys(SFX) as SfxName[];
const SONG_ORDER = Object.keys(SONGS) as SongName[];

function patchRomForServerboy(sourceRom: Uint8Array): Buffer {
  const patchedRom = Buffer.from(sourceRom);
  for (let i = 0x0150; i < 0x0300; i++) {
    // Find: 3E 01 E0 FF FB (LD A,$01; LDH ($FF),A; EI)
    if (
      patchedRom[i] === 0x3e &&
      patchedRom[i + 1] === 0x01 &&
      patchedRom[i + 2] === 0xe0 &&
      patchedRom[i + 3] === 0xff &&
      patchedRom[i + 4] === 0xfb
    ) {
      // NOP out the LD A,$01 and LDH ($FF),A (4 bytes), keep the EI
      patchedRom.fill(0x00, i, i + 4);
      return patchedRom;
    }
  }
  throw new Error('The ROM no longer enables interrupts with LD A,1; LDH (IE),A; EI');
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

  /** Hold B for `frames` frames */
  holdB(frames: number): this {
    for (let i = 0; i < frames; i++) {
      this.gb.pressKey(Gameboy.KEYMAP.B);
      this.gb.doFrame();
    }
    return this;
  }

  /** Hold B (fast-forward) until `done`, or for at most `frames` frames; returns the frames held */
  holdBUntil(done: () => boolean, frames: number): number {
    for (let i = 0; i < frames; i++) {
      if (done()) return i;
      this.gb.pressKey(Gameboy.KEYMAP.B);
      this.gb.doFrame();
    }
    throw new Error(`Still not done after holding B for ${String(frames)} frames`);
  }

  /** Press a key for one frame */
  private pressKey(key: number): this {
    this.gb.pressKey(key);
    this.gb.doFrame();
    return this;
  }

  pressB(): this {
    return this.pressKey(Gameboy.KEYMAP.B);
  }

  pressRight(): this {
    return this.pressKey(Gameboy.KEYMAP.RIGHT);
  }

  /** On the password screen: walk the cursor to each kana and press A on it */
  typePassword(password: string): this {
    for (const kana of password) {
      const target = PASSWORD_ALPHABET.indexOf(kana);
      if (target < 0) throw new Error(`Not a password kana: ${kana}`);
      const moves = (target - this.readMem(MEM.PASS_CURSOR)) & (PASSWORD_ALPHABET.length - 1);
      for (let i = 0; i < moves; i++) this.pressRight().frames(1);
      this.pressA().frames(1);
    }
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
  /** The sound effect playing last ('none' before any) */
  get sfx(): SfxName | 'none' {
    const id = this.readMem(MEM.SFX_ID);
    return id === SFX_NONE ? 'none' : (SFX_ORDER[id - 1] ?? 'none');
  }

  /** Whether the kana chart is up, waiting for a button */
  get chartWaiting(): boolean {
    return this.readMem(MEM.CHART_WAIT) !== 0;
  }

  /** The song playing ('none' for silence) */
  get music(): SongName | 'none' {
    const id = this.readMem(MEM.MUSIC_ID);
    return id === MUSIC_NONE ? 'none' : (SONG_ORDER[id - 1] ?? 'none');
  }

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

  /** The CPU's stack pointer */
  get stackPointer(): number {
    return this.internals.gameboy.stackPointer;
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
      this.readMem(MEM.DLG_ORDER.at(0)),
      this.readMem(MEM.DLG_ORDER.at(1)),
      this.readMem(MEM.DLG_ORDER.at(2)),
    ];
  }

  get kanaState(): number {
    return this.readMem(MEM.KANA_STATE);
  }

  get kanaScore(): number {
    return this.readMem(MEM.KANA_SCORE.lo) | (this.readMem(MEM.KANA_SCORE.hi) << 8);
  }

  get kanaLives(): number {
    return this.readMem(MEM.KANA_LIVES);
  }

  get kanaMode(): number {
    return this.readMem(MEM.KANA_MODE);
  }

  /**
   * How dialogue helpers answer a chance to win a life back after a bad answer:
   * correctly (default) or not, for tests that want lives to stay lost.
   */
  missRedemptions = false;

  /** The cat's face, from the tile of the first sprite of its middle row */
  get catFace(): CatFace | undefined {
    const tile = this.readMem(oamField(SPRITE_SLOT.cat + 4, 'tile'));
    return CAT_FACES.find((face) => faceTile(face) === tile);
  }

  /** Whether the cat is on screen (its first sprite has a y position) */
  get catVisible(): boolean {
    return this.readMem(oamField(SPRITE_SLOT.cat, 'y')) !== 0;
  }

  get kanaStreak(): number {
    return this.readMem(MEM.KANA_STREAK);
  }

  /** Test shortcut: start counting first-try answers in a row from zero */
  resetStreak(): this {
    this.getMemory()[MEM.KANA_STREAK] = 0;
    return this;
  }

  /** Test shortcut: set the lives left by writing WRAM directly */
  /** Mark chart entries as missed (and nothing else) */
  setMissed(entries: readonly number[]): this {
    const memory = this.getMemory();
    for (let i = 0; i < 6; i++) memory[MEM.KANA_MISSED.at(i)] = 0;
    for (const i of entries) {
      const address = MEM.KANA_MISSED.address + (i >> 3);
      memory[address] = (memory[address] ?? 0) | (1 << (i & 7));
    }
    return this;
  }

  /** Whether chart entry `i` is marked missed */
  isMissed(i: number): boolean {
    return (this.readMem(MEM.KANA_MISSED.address + (i >> 3)) & (1 << (i & 7))) !== 0;
  }

  /** The current kana question's answer */
  get kanaAnswer(): string {
    const tile = this.readMem(MEM.KANA_SHUFFLE.at(0));
    return Object.entries(CHAR_MAP).find(([, t]) => t === tile)?.[0] ?? '?';
  }

  setLives(lives: number): this {
    this.getMemory()[MEM.KANA_LIVES] = lives;
    return this;
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
      // The kana chart between scenes waits for a button: carry on past it
      if (this.chartWaiting) this.pressA();
      else this.frames(1);
      if (predicate()) return this;
    }
    throw new Error(`Timed out waiting for: ${description}`);
  }

  /** Wait until dialogue has finished printing and waits for input or a choice */
  waitForDialogueChoices(): this {
    const choosing = (): boolean =>
      this.dlgState === DialogueState.WAITING || this.dlgState === DialogueState.CHOOSING;
    // A conversation break may run a kana round first: answer it correctly
    for (let round = 0; ; round++) {
      this.waitUntil(
        () => choosing() || this.kanaState === KanaState.AWAITING,
        'dialogue choosing/wait state',
      );
      if (choosing()) break;
      if (round > 16) throw new Error('Kana round never gave way to the dialogue');
      this.answerKana(!(this.missRedemptions && this.kanaMode === KanaMode.REDEEM));
    }
    return this.frames(GameRunner.INPUT_DEBOUNCE);
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
    const scene = SCENES[sceneIndex];
    const questions = scene ? (sceneRounds(scene).at(-1)?.questions ?? []) : [];
    for (let i = 0; i < questions.length; i++) {
      this.answerKanaCorrectly();
    }
    return this.frames(10);
  }
}
