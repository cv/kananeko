/**
 * Kana passwords (あいことば): six kana that bring back a run, shown at game over and
 * typed in from the title menu's つづき.
 *
 * A password holds 30 bits, 5 per kana (PASSWORD_ALPHABET has 32):
 *
 *   check (6 bits) | scene << 2 | hearts (8 bits) | score (16 bits)
 *
 * The check mixes every bit of the rest (see passwordCheck), and every byte is XORed
 * with a mask, so passwords look varied and over 99% of one-kana typos are caught. encodePassword and
 * decodePassword are the reference; the game's routines do the same in assembly.
 */

import { compare, ifThen, loop, repeat } from '../asm/flow';
import { JOY } from '../asm/hardware';
import { MEM } from './ram';
import {
  add,
  bit,
  ld,
  adc,
  and,
  call,
  cp,
  db,
  dec,
  inc,
  jp,
  jr,
  label,
  ldh,
  or,
  pop,
  push,
  ret,
  rl,
  rlca,
  sla,
  swap,
  srl,
  xor,
  invoke,
} from '../asm/sm83';
import { HW } from '../asm/hardware';
import { type Op, type U16, s8, u16, Label, routine } from '../asm/types';
import { hi, lo } from '../asm/util';
import { copyByte, incByte, storeByte, tableEntry, zeroBytes } from '../asm/macros';
import { requireTile, textToTiles } from './font';
import { MAX_SCORE } from './kana-hud';
import { playSfx } from './sound';
import { SPRITE_SLOT, SPRITE_TILE, oamField, runDma } from './sprites';
import { centerStartCol, tilemapAddr } from './tilemap';
import {
  clearScreen,
  drawTiles,
  fadeIn,
  fadeOut,
  frameWait,
  screenOff,
  writeCenteredRow,
} from './video';
import {
  VRAM_PUT,
  JOY_READ,
  SCENE_LOAD,
  TITLE_SCREEN,
  PASS_ENCODE,
  PASS_DECODE,
  PASS_APPLY,
  PASS_DRAW,
  PASSWORD_SCREEN,
} from './labels';
import { gameModule } from '../asm/program';
import { SCENES } from './scene';
import { TITLE_FADE } from './labels';

// Labels placed in this module
const PASS_CHECK = routine('pass_check', { out: ['a'], clobbers: ['b'] });
const PASS_XOR = routine('pass_xor', { clobbers: ['a', 'hl'] });
const PASS_SHIFT = routine('pass_shift', { clobbers: ['hl'] });
const PASS_TILE = routine('pass_tile', { in: ['a'], out: ['a'] });
const PASS_ALPHABET = new Label('pass_alphabet');
const PASS_DRAW_SLOTS = routine('pass_draw_slots', { clobbers: ['a', 'bc', 'de', 'hl'] });
const PASS_CURSOR = routine('pass_cursor', { clobbers: ['a'] });

/** 32 kana, leaving out the easily confused ones (ぬ/め, わ/れ/ね, る/ろ, は/ほ, さ/ち/き...) */
export const PASSWORD_ALPHABET = 'あいうえおかくけこしすせそたてとなのひふへまみむもやゆよらりをん';
export const PASSWORD_LENGTH = 6;
const BITS_PER_KANA = 5;

/** XORed into the check, scene/hearts, score hi and score lo bytes */
const MASKS = [0x2a, 0x5c, 0xb3, 0x6d] as const;
const CHECK_BIAS = 0x2b;
const CHECK_BITS = 0x3f;

export interface Progress {
  /** The scene to continue at */
  readonly scene: number;
  readonly lives: number;
  readonly score: number;
}

const swapNibbles = (x: number): number => ((x << 4) | (x >> 4)) & 0xff;
const rotateLeft2 = (x: number): number => ((x << 2) | (x >> 6)) & 0xff;

/**
 * The check of the scene/hearts byte and the score: every bit of them reaches its
 * 6 bits (x = (hi XOR swap(lo)) + sceneLives; check = x + rotate(x, 2) + bias).
 */
export function passwordCheck(sceneLives: number, scoreHi: number, scoreLo: number): number {
  const x = ((scoreHi ^ swapNibbles(scoreLo)) + sceneLives) & 0xff;
  return (x + rotateLeft2(x) + CHECK_BIAS) & CHECK_BITS;
}

export function encodePassword({ scene, lives, score }: Progress): string {
  const sceneLives = (scene << 2) | lives;
  const [hi, lo] = [score >> 8, score & 0xff];
  const [checkMask, sceneLivesMask, hiMask, loMask] = MASKS;
  const check = passwordCheck(sceneLives, hi, lo);
  const value =
    (check ^ checkMask) * 2 ** 24 +
    (sceneLives ^ sceneLivesMask) * 2 ** 16 +
    (hi ^ hiMask) * 2 ** 8 +
    (lo ^ loMask);
  return Array.from({ length: PASSWORD_LENGTH }, (_, i) => {
    const shift = BITS_PER_KANA * (PASSWORD_LENGTH - 1 - i);
    return PASSWORD_ALPHABET.charAt(Math.floor(value / 2 ** shift) % 32);
  }).join('');
}

/** The progress a password holds, or undefined if it isn't a valid one */
export function decodePassword(password: string, sceneCount: number): Progress | undefined {
  const kana = Array.from(password);
  if (kana.length !== PASSWORD_LENGTH) return undefined;
  let value = 0;
  for (const ch of kana) {
    const index = PASSWORD_ALPHABET.indexOf(ch);
    if (index < 0) return undefined;
    value = value * 32 + index;
  }
  const [checkMask, sceneLivesMask, hiMask, loMask] = MASKS;
  const byte = (shift: number, mask: number): number =>
    (Math.floor(value / 2 ** shift) & 0xff) ^ mask;
  const check = byte(24, checkMask);
  const sceneLives = byte(16, sceneLivesMask);
  const hi = byte(8, hiMask);
  const lo = byte(0, loMask);
  const progress = { scene: sceneLives >> 2, lives: sceneLives & 3, score: (hi << 8) | lo };
  const valid =
    progress.lives > 0 &&
    progress.scene < sceneCount &&
    progress.score <= MAX_SCORE &&
    check === passwordCheck(sceneLives, hi, lo);
  return valid ? progress : undefined;
}

// ---------------------------------------------------------------------------
// The game's routines
// ---------------------------------------------------------------------------

const acc = (i: number): U16 => MEM.PASS_ACC.at(i);

/**
 * pass_encode  SCENE_ID, KANA_LIVES and the score → PASS_CHARS
 * pass_decode  PASS_CHARS → PASS_ACC; A = 0 (Z set) if it's a valid password
 * pass_apply   PASS_ACC (decoded) → the run: scene, hearts, score, stamps
 * pass_draw    draw PASS_CHARS at HL (vram_put: safe with the LCD on)
 */
export function buildPasswordRoutines(sceneCount: number): Op[] {
  const invalid = new Label('pass_bad');
  return [
    // pass_check: A = the check of PASS_ACC bytes 1-3
    label(PASS_CHECK),
    ld('a', [acc(3)]),
    swap('a'),
    ld('b', 'a'),
    ld('a', [acc(2)]),
    xor('b'),
    ld('b', 'a'),
    ld('a', [acc(1)]),
    add('b'),
    ld('b', 'a'),
    rlca(),
    rlca(),
    add('b'),
    add(CHECK_BIAS),
    and(CHECK_BITS),
    ret(),

    // pass_xor: apply (or undo) the masks
    label(PASS_XOR),
    ld('hl', MEM.PASS_ACC.address),
    ...MASKS.flatMap((mask) => [ld('a', ['hl']), xor(mask), ld(['hl+'], 'a')]),
    ret(),

    // pass_shift: shift PASS_ACC left a bit, carry in at the bottom, out at the top
    label(PASS_SHIFT),
    ld('hl', acc(3)),
    rl(['hl']),
    dec('hl'),
    rl(['hl']),
    dec('hl'),
    rl(['hl']),
    dec('hl'),
    rl(['hl']),
    ret(),

    label(PASS_ENCODE),
    ld('a', [MEM.KANA_LIVES]),
    ld('b', 'a'),
    ld('a', [MEM.SCENE_ID]),
    add('a'),
    add('a'),
    or('b'),
    ld([acc(1)], 'a'),
    ...copyByte(acc(2), MEM.KANA_SCORE.hi),
    ...copyByte(acc(3), MEM.KANA_SCORE.lo),
    call(PASS_CHECK),
    ld([acc(0)], 'a'),
    call(PASS_XOR),
    // The 30 bits sit at the bottom: shift the top 2 (zeros) out, then take 5 a kana
    ...[0, 1].flatMap(() => [xor('a'), call(PASS_SHIFT)]),
    ld('de', MEM.PASS_CHARS.address),
    ...repeat(PASSWORD_LENGTH, [
      ld('c', 0),
      ...Array.from({ length: BITS_PER_KANA }, () => [
        xor('a'), // carry in: 0
        call(PASS_SHIFT),
        rl('c'),
      ]).flat(),
      ld('a', 'c'),
      ld(['de'], 'a'),
      inc('de'),
    ]),
    ret(),

    label(PASS_DECODE),
    ...zeroBytes(acc(0), acc(1), acc(2), acc(3)),
    ld('de', MEM.PASS_CHARS.address),
    ...repeat(PASSWORD_LENGTH, [
      ld('a', ['de']),
      inc('de'),
      add('a'),
      add('a'),
      add('a'), // its 5 bits at the top of A
      ld('c', 'a'),
      ...Array.from({ length: BITS_PER_KANA }, () => [sla('c'), call(PASS_SHIFT)]).flat(),
    ]),
    call(PASS_XOR),
    // Hearts 1 to 3, a scene that exists, a score within the cap, and the check
    ld('a', [acc(1)]),
    and(3),
    jr('z', invalid),
    ld('a', [acc(1)]),
    cp(sceneCount << 2),
    jr('nc', invalid),
    ld('a', [acc(2)]),
    cp(hi(MAX_SCORE)),
    ...ifThen('nc', [
      jr('nz', invalid),
      ld('a', [acc(3)]),
      cp(lo(MAX_SCORE) + 1),
      jr('nc', invalid),
    ]),
    call(PASS_CHECK),
    ld('b', 'a'),
    ld('a', [acc(0)]),
    cp('b'),
    jr('nz', invalid),
    xor('a'),
    ret(),
    label(invalid),
    ld('a', 1),
    or('a'),
    ret(),

    label(PASS_APPLY),
    ld('a', [acc(1)]),
    and(3),
    ld([MEM.KANA_LIVES], 'a'),
    ld('a', [acc(1)]),
    srl('a'),
    srl('a'),
    ld([MEM.SCENE_ID], 'a'),
    // Stamps for every scene before it: (1 << scene) - 1
    ld('b', 'a'),
    ld('a', 1),
    inc('b'),
    ...loop((again, done) => [dec('b'), jr('z', done), add('a'), jr(again)]),
    dec('a'),
    ld([MEM.SCENE_FLAGS], 'a'),
    ...copyByte(MEM.KANA_SCORE.hi, acc(2)),
    ...copyByte(MEM.KANA_SCORE.lo, acc(3)),
    ...zeroBytes(MEM.DELTA_TYPE, MEM.DELTA_TIMER, MEM.KANA_STREAK),
    ret(),

    // pass_draw: HL = tilemap address
    label(PASS_DRAW),
    ld('de', MEM.PASS_CHARS.address),
    ld('b', PASSWORD_LENGTH),
    ...loop((again) => [
      ld('a', ['de']),
      inc('de'),
      ...invoke(PASS_TILE, { a: 'a' }),
      ...invoke(VRAM_PUT, { a: 'a', hl: 'hl' }),
      dec('b'),
      ret('z'),
      jr(again),
    ]),

    // pass_tile: A = the tile of kana A (an alphabet index); preserves HL
    label(PASS_TILE),
    push('hl'),
    ld('hl', PASS_ALPHABET),
    add('l'),
    ld('l', 'a'),
    ld('a', 'h'),
    adc(0),
    ld('h', 'a'),
    ld('a', ['hl']),
    pop('hl'),
    ret(),
  ];
}

export function buildPasswordData(): Op[] {
  return [label(PASS_ALPHABET), db(textToTiles(PASSWORD_ALPHABET))];
}

// ---------------------------------------------------------------------------
// The entry screen
// ---------------------------------------------------------------------------

export const PASSWORD_LAYOUT = {
  promptRow: 2,
  /** The entered kana, a space apart */
  slotsRow: 5,
  slotsCol: 4,
  /** The 4 x 8 grid of kana to pick from, a space apart */
  gridRow: 8,
  gridCol: 3,
  gridCols: 8,
  messageRow: 16,
} as const;

export const PASSWORD_PROMPT = 'あいことばを いれてね';
export const PASSWORD_WRONG_TEXT = 'ちがうよ';
const EMPTY_SLOT = requireTile('─');

const GRID_ROWS = PASSWORD_ALPHABET.length / PASSWORD_LAYOUT.gridCols;

/** The kana grid's rows: 8 kana a space apart */
function gridRowTiles(row: number): number[] {
  const kana = Array.from(PASSWORD_ALPHABET).slice(
    row * PASSWORD_LAYOUT.gridCols,
    (row + 1) * PASSWORD_LAYOUT.gridCols,
  );
  return textToTiles(kana.join(' '));
}

/**
 * password_screen: type a password in, then continue the run it holds. B on an
 * empty password goes back to the title. `fade` is the fade-in's palette label.
 */
export function buildPasswordScreen(fade: Label): Op[] {
  const moveCursor = new Label('password_move');
  const deleteChar = new Label('password_delete');
  const addChar = new Label('password_add');
  const screenLoop = new Label('password_loop');
  const { promptRow, slotsRow, slotsCol, gridRow, gridCol, messageRow } = PASSWORD_LAYOUT;
  const wrong = textToTiles(PASSWORD_WRONG_TEXT);
  return [
    label(PASSWORD_SCREEN),
    ...fadeOut(),
    ...screenOff(),
    ...clearScreen(),
    ...zeroBytes(MEM.PASS_LEN, MEM.PASS_CURSOR),
    ...writeCenteredRow(promptRow, textToTiles(PASSWORD_PROMPT)),
    ...Array.from({ length: GRID_ROWS }, (_, r) =>
      drawTiles(tilemapAddr(gridRow + 2 * r, gridCol), gridRowTiles(r)),
    ).flat(),
    call(PASS_DRAW_SLOTS),
    ...fadeIn(fade),
    call(PASS_CURSOR),

    label(screenLoop),
    ...frameWait(),
    ...runDma(),
    call(JOY_READ),
    ld('a', [MEM.JOYPAD_NEW]),
    ld('b', 'a'),
    and(JOY.A),
    jp('nz', addChar),
    ld('a', 'b'),
    and(JOY.B),
    jp('nz', deleteChar),
    // The d-pad moves around the grid, wrapping (32 cells: AND 31)
    ...(
      [
        [JOY.RIGHT, 1],
        [JOY.LEFT, -1],
        [JOY.DOWN, PASSWORD_LAYOUT.gridCols],
        [JOY.UP, -PASSWORD_LAYOUT.gridCols],
      ] as const
    ).flatMap(([button, step], i) => {
      const next = new Label(`password_dpad_${String(i)}`);
      return [
        ld('a', 'b'),
        and(button),
        jr('z', next),
        ld('a', [MEM.PASS_CURSOR]),
        add(s8(step)),
        jp(moveCursor),
        label(next),
      ];
    }),
    jp(screenLoop),

    label(moveCursor),
    and(PASSWORD_ALPHABET.length - 1),
    ld([MEM.PASS_CURSOR], 'a'),
    ...playSfx('cursor'),
    call(PASS_CURSOR),
    jp(screenLoop),

    label(addChar),
    ...compare(MEM.PASS_LEN, PASSWORD_LENGTH),
    jp('nc', screenLoop), // full (and wrong): B to fix it
    ...tableEntry(MEM.PASS_CHARS.address),
    ld('a', [MEM.PASS_CURSOR]),
    ld(['hl'], 'a'),
    ...incByte(MEM.PASS_LEN),
    ...playSfx('confirm'),
    call(PASS_DRAW_SLOTS),
    ...compare(MEM.PASS_LEN, PASSWORD_LENGTH),
    jp('nz', screenLoop),
    // All six in: check it
    call(PASS_DECODE),
    ...ifThen('z', [
      ...playSfx('start'),
      call(PASS_APPLY),
      xor('a'),
      ldh([HW.DIV], 'a'), // like a new game: the same shuffles whenever it's typed
      jp(SCENE_LOAD),
    ]),
    ...playSfx('wrong'),
    ...writeCenteredRow(messageRow, wrong),
    jp(screenLoop),

    label(deleteChar),
    ld('a', [MEM.PASS_LEN]),
    or('a'),
    ...ifThen('nz', [
      dec('a'),
      ld([MEM.PASS_LEN], 'a'),
      ...playSfx('cursor'),
      call(PASS_DRAW_SLOTS),
      ...writeCenteredRow(
        messageRow,
        wrong.map(() => requireTile(' ')),
      ),
      jp(screenLoop),
    ]),
    ...playSfx('cursor'),
    ...fadeOut(),
    ...screenOff(),
    jp(TITLE_SCREEN),

    // pass_draw_slots: the kana entered so far, then a dash for each still to come
    label(PASS_DRAW_SLOTS),
    ld('hl', u16(tilemapAddr(slotsRow, slotsCol))),
    ld('de', MEM.PASS_CHARS.address),
    ld('a', [MEM.PASS_LEN]),
    ld('c', 'a'),
    ...repeat(PASSWORD_LENGTH, [
      ld('a', ['de']),
      inc('de'),
      ...invoke(PASS_TILE, { a: 'a' }),
      dec('c'),
      bit(7, 'c'), // past the entered kana?
      ...ifThen('nz', [ld('a', EMPTY_SLOT)]),
      ...invoke(VRAM_PUT, { a: 'a', hl: 'hl' }),
      inc('hl'),
    ]),
    ret(),

    // pass_cursor: the paw beside the highlighted kana
    label(PASS_CURSOR),
    ld('a', [MEM.PASS_CURSOR]),
    and(PASSWORD_LAYOUT.gridCols - 1),
    add('a'),
    add(gridCol),
    add('a'),
    add('a'),
    add('a'), // OAM x = column * 8: the tile before the kana...
    dec('a'),
    dec('a'), // ...2 pixels back from it
    ld([oamField(SPRITE_SLOT.cursor, 'x')], 'a'),
    ld('a', [MEM.PASS_CURSOR]),
    and(0x18), // the grid row * 8
    add('a'),
    add(gridRow * 8 + 16),
    ld([oamField(SPRITE_SLOT.cursor, 'y')], 'a'),
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'tile'), SPRITE_TILE.cursor),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'attr')),
    ret(),
  ];
}

/** Centered column of the game over screen's password line (label, space, kana) */
export const PASSWORD_LABEL = 'あいことば';
export function passwordLineCol(): number {
  return centerStartCol(Array.from(PASSWORD_LABEL).length + 1 + PASSWORD_LENGTH);
}

export const passwordModule = gameModule({
  name: 'password',
  code: () => [...buildPasswordRoutines(SCENES.length), ...buildPasswordScreen(TITLE_FADE)],
  data: buildPasswordData,
});
