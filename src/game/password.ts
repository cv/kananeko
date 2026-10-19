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

import { JOY, MEM } from '../asm/hardware';
import {
  add_hl_rr,
  bit,
  ld_de_a,
  add_n,
  add_r,
  adc_n,
  and_n,
  call,
  cp_n,
  cp_r,
  db,
  dec_r,
  dec_rr,
  inc_r,
  inc_rr,
  jp,
  jp_cc,
  jr,
  jr_cc,
  label,
  ld_a_de,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldh_n_a,
  ldi_hl_a,
  or_r,
  pop,
  push,
  ret,
  ret_cc,
  rl,
  rlca,
  sla,
  swap,
  srl,
  xor_n,
  xor_r,
} from '../asm/ops';
import { HW } from '../asm/hardware';
import { type Op, type U16, s8, u8, u16, Label } from '../asm/types';
import { hi, lo } from '../asm/util';
import { storeByte, zeroBytes } from '../asm/macros';
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

// Labels placed in this module
const PASS_CHECK = new Label('pass_check');
const PASS_XOR = new Label('pass_xor');
const PASS_SHIFT = new Label('pass_shift');
const PASS_ENCODE_KANA = new Label('pass_encode_kana');
const PASS_DECODE_KANA = new Label('pass_decode_kana');
const PASS_SCORE_OK = new Label('pass_score_ok');
const PASS_BAD = new Label('pass_bad');
const PASS_APPLY_FLAGS = new Label('pass_apply_flags');
const PASS_APPLY_FLAGS_DONE = new Label('pass_apply_flags_done');
const PASS_DRAW_KANA = new Label('pass_draw_kana');
const PASS_TILE = new Label('pass_tile');
const PASS_ALPHABET = new Label('pass_alphabet');
const PASSWORD_LOOP = new Label('password_loop');
const PASSWORD_MOVE = new Label('password_move');
const PASSWORD_ADD = new Label('password_add');
const PASSWORD_WRONG = new Label('password_wrong');
const PASSWORD_DELETE = new Label('password_delete');
const PASSWORD_BACK = new Label('password_back');
const PASS_DRAW_SLOTS = new Label('pass_draw_slots');
const PASS_SLOT = new Label('pass_slot');
const PASS_SLOT_DRAW = new Label('pass_slot_draw');
const PASS_CURSOR = new Label('pass_cursor');

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

const acc = (i: number): U16 => u16(MEM.PASS_ACC + i);

/**
 * pass_encode  SCENE_ID, KANA_LIVES and the score → PASS_CHARS
 * pass_decode  PASS_CHARS → PASS_ACC; A = 0 (Z set) if it's a valid password
 * pass_apply   PASS_ACC (decoded) → the run: scene, hearts, score, stamps
 * pass_draw    draw PASS_CHARS at HL (vram_put: safe with the LCD on)
 */
export function buildPasswordRoutines(sceneCount: number): Op[] {
  return [
    // pass_check: A = the check of PASS_ACC bytes 1-3
    label(PASS_CHECK),
    ld_a_nn(acc(3)),
    swap('a'),
    ld_r_r('b', 'a'),
    ld_a_nn(acc(2)),
    xor_r('b'),
    ld_r_r('b', 'a'),
    ld_a_nn(acc(1)),
    add_r('b'),
    ld_r_r('b', 'a'),
    rlca(),
    rlca(),
    add_r('b'),
    add_n(u8(CHECK_BIAS)),
    and_n(u8(CHECK_BITS)),
    ret(),

    // pass_xor: apply (or undo) the masks
    label(PASS_XOR),
    ld_rr_nn('hl', MEM.PASS_ACC),
    ...MASKS.flatMap((mask) => [ld_r_r('a', 'hl_ptr'), xor_n(u8(mask)), ldi_hl_a()]),
    ret(),

    // pass_shift: shift PASS_ACC left a bit, carry in at the bottom, out at the top
    label(PASS_SHIFT),
    ld_rr_nn('hl', acc(3)),
    rl('hl_ptr'),
    dec_rr('hl'),
    rl('hl_ptr'),
    dec_rr('hl'),
    rl('hl_ptr'),
    dec_rr('hl'),
    rl('hl_ptr'),
    ret(),

    label(PASS_ENCODE),
    ld_a_nn(MEM.KANA_LIVES),
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.SCENE_ID),
    add_r('a'),
    add_r('a'),
    or_r('b'),
    ld_nn_a(acc(1)),
    ld_a_nn(MEM.KANA_SCORE_HI),
    ld_nn_a(acc(2)),
    ld_a_nn(MEM.KANA_SCORE_LO),
    ld_nn_a(acc(3)),
    call(PASS_CHECK),
    ld_nn_a(acc(0)),
    call(PASS_XOR),
    // The 30 bits sit at the bottom: shift the top 2 (zeros) out, then take 5 a kana
    ...[0, 1].flatMap(() => [xor_r('a'), call(PASS_SHIFT)]),
    ld_rr_nn('de', MEM.PASS_CHARS),
    ld_r_n('b', u8(PASSWORD_LENGTH)),
    label(PASS_ENCODE_KANA),
    ld_r_n('c', u8(0)),
    ...Array.from({ length: BITS_PER_KANA }, () => [
      xor_r('a'), // carry in: 0
      call(PASS_SHIFT),
      rl('c'),
    ]).flat(),
    ld_r_r('a', 'c'),
    ld_de_a(),
    inc_rr('de'),
    dec_r('b'),
    jr_cc('nz', PASS_ENCODE_KANA),
    ret(),

    label(PASS_DECODE),
    ...zeroBytes(acc(0), acc(1), acc(2), acc(3)),
    ld_rr_nn('de', MEM.PASS_CHARS),
    ld_r_n('b', u8(PASSWORD_LENGTH)),
    label(PASS_DECODE_KANA),
    ld_a_de(),
    inc_rr('de'),
    add_r('a'),
    add_r('a'),
    add_r('a'), // its 5 bits at the top of A
    ld_r_r('c', 'a'),
    ...Array.from({ length: BITS_PER_KANA }, () => [sla('c'), call(PASS_SHIFT)]).flat(),
    dec_r('b'),
    jr_cc('nz', PASS_DECODE_KANA),
    call(PASS_XOR),
    // Hearts 1 to 3, a scene that exists, a score within the cap, and the check
    ld_a_nn(acc(1)),
    and_n(u8(3)),
    jr_cc('z', PASS_BAD),
    ld_a_nn(acc(1)),
    cp_n(u8(sceneCount << 2)),
    jr_cc('nc', PASS_BAD),
    ld_a_nn(acc(2)),
    cp_n(hi(MAX_SCORE)),
    jr_cc('c', PASS_SCORE_OK),
    jr_cc('nz', PASS_BAD),
    ld_a_nn(acc(3)),
    cp_n(u8(lo(MAX_SCORE) + 1)),
    jr_cc('nc', PASS_BAD),
    label(PASS_SCORE_OK),
    call(PASS_CHECK),
    ld_r_r('b', 'a'),
    ld_a_nn(acc(0)),
    cp_r('b'),
    jr_cc('nz', PASS_BAD),
    xor_r('a'),
    ret(),
    label(PASS_BAD),
    ld_r_n('a', u8(1)),
    or_r('a'),
    ret(),

    label(PASS_APPLY),
    ld_a_nn(acc(1)),
    and_n(u8(3)),
    ld_nn_a(MEM.KANA_LIVES),
    ld_a_nn(acc(1)),
    srl('a'),
    srl('a'),
    ld_nn_a(MEM.SCENE_ID),
    // Stamps for every scene before it: (1 << scene) - 1
    ld_r_r('b', 'a'),
    ld_r_n('a', u8(1)),
    inc_r('b'),
    label(PASS_APPLY_FLAGS),
    dec_r('b'),
    jr_cc('z', PASS_APPLY_FLAGS_DONE),
    add_r('a'),
    jr(PASS_APPLY_FLAGS),
    label(PASS_APPLY_FLAGS_DONE),
    dec_r('a'),
    ld_nn_a(MEM.SCENE_FLAGS),
    ld_a_nn(acc(2)),
    ld_nn_a(MEM.KANA_SCORE_HI),
    ld_a_nn(acc(3)),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ...zeroBytes(MEM.DELTA_TYPE, MEM.DELTA_TIMER, MEM.KANA_STREAK),
    ret(),

    // pass_draw: HL = tilemap address
    label(PASS_DRAW),
    ld_rr_nn('de', MEM.PASS_CHARS),
    ld_r_n('b', u8(PASSWORD_LENGTH)),
    label(PASS_DRAW_KANA),
    ld_a_de(),
    inc_rr('de'),
    call(PASS_TILE),
    call(VRAM_PUT),
    dec_r('b'),
    ret_cc('z'),
    jr(PASS_DRAW_KANA),

    // pass_tile: A = the tile of kana A (an alphabet index); preserves HL
    label(PASS_TILE),
    push('hl'),
    ld_rr_nn('hl', PASS_ALPHABET),
    add_r('l'),
    ld_r_r('l', 'a'),
    ld_r_r('a', 'h'),
    adc_n(u8(0)),
    ld_r_r('h', 'a'),
    ld_r_r('a', 'hl_ptr'),
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
  const { promptRow, slotsRow, slotsCol, gridRow, gridCol, messageRow } = PASSWORD_LAYOUT;
  const wrong = textToTiles(PASSWORD_WRONG_TEXT);
  return [
    label(PASSWORD_SCREEN),
    ...fadeOut(),
    ...screenOff('password_vblank'),
    ...clearScreen(),
    ...zeroBytes(MEM.PASS_LEN, MEM.PASS_CURSOR),
    ...writeCenteredRow(promptRow, textToTiles(PASSWORD_PROMPT)),
    ...Array.from({ length: GRID_ROWS }, (_, r) =>
      drawTiles(tilemapAddr(gridRow + 2 * r, gridCol), gridRowTiles(r)),
    ).flat(),
    call(PASS_DRAW_SLOTS),
    ...fadeIn(fade),
    call(PASS_CURSOR),

    label(PASSWORD_LOOP),
    ...frameWait(),
    ...runDma(),
    call(JOY_READ),
    ld_a_nn(MEM.JOYPAD_NEW),
    ld_r_r('b', 'a'),
    and_n(u8(JOY.A)),
    jp_cc('nz', PASSWORD_ADD),
    ld_r_r('a', 'b'),
    and_n(u8(JOY.B)),
    jp_cc('nz', PASSWORD_DELETE),
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
        ld_r_r('a', 'b'),
        and_n(u8(button)),
        jr_cc('z', next),
        ld_a_nn(MEM.PASS_CURSOR),
        add_n(s8(step)),
        jp(PASSWORD_MOVE),
        label(next),
      ];
    }),
    jp(PASSWORD_LOOP),

    label(PASSWORD_MOVE),
    and_n(u8(PASSWORD_ALPHABET.length - 1)),
    ld_nn_a(MEM.PASS_CURSOR),
    ...playSfx('cursor'),
    call(PASS_CURSOR),
    jp(PASSWORD_LOOP),

    label(PASSWORD_ADD),
    ld_a_nn(MEM.PASS_LEN),
    cp_n(u8(PASSWORD_LENGTH)),
    jp_cc('nc', PASSWORD_LOOP), // full (and wrong): B to fix it
    ld_r_r('e', 'a'),
    ld_r_n('d', u8(0)),
    ld_rr_nn('hl', MEM.PASS_CHARS),
    add_hl_rr('de'),
    ld_a_nn(MEM.PASS_CURSOR),
    ld_r_r('hl_ptr', 'a'),
    ld_a_nn(MEM.PASS_LEN),
    inc_r('a'),
    ld_nn_a(MEM.PASS_LEN),
    ...playSfx('confirm'),
    call(PASS_DRAW_SLOTS),
    ld_a_nn(MEM.PASS_LEN),
    cp_n(u8(PASSWORD_LENGTH)),
    jp_cc('nz', PASSWORD_LOOP),
    // All six in: check it
    call(PASS_DECODE),
    jp_cc('nz', PASSWORD_WRONG),
    ...playSfx('start'),
    call(PASS_APPLY),
    xor_r('a'),
    ldh_n_a(HW.DIV), // like a new game: the same shuffles whenever it's typed
    jp(SCENE_LOAD),

    label(PASSWORD_WRONG),
    ...playSfx('wrong'),
    ...writeCenteredRow(messageRow, wrong),
    jp(PASSWORD_LOOP),

    label(PASSWORD_DELETE),
    ld_a_nn(MEM.PASS_LEN),
    or_r('a'),
    jr_cc('z', PASSWORD_BACK),
    dec_r('a'),
    ld_nn_a(MEM.PASS_LEN),
    ...playSfx('cursor'),
    call(PASS_DRAW_SLOTS),
    ...writeCenteredRow(
      messageRow,
      wrong.map(() => requireTile(' ')),
    ),
    jp(PASSWORD_LOOP),

    label(PASSWORD_BACK),
    ...playSfx('cursor'),
    ...fadeOut(),
    ...screenOff('password_to_title'),
    jp(TITLE_SCREEN),

    // pass_draw_slots: the kana entered so far, then a dash for each still to come
    label(PASS_DRAW_SLOTS),
    ld_rr_nn('hl', u16(tilemapAddr(slotsRow, slotsCol))),
    ld_rr_nn('de', MEM.PASS_CHARS),
    ld_a_nn(MEM.PASS_LEN),
    ld_r_r('c', 'a'),
    ld_r_n('b', u8(PASSWORD_LENGTH)),
    label(PASS_SLOT),
    ld_a_de(),
    inc_rr('de'),
    call(PASS_TILE),
    dec_r('c'),
    bit(7, 'c'), // past the entered kana?
    jr_cc('z', PASS_SLOT_DRAW),
    ld_r_n('a', u8(EMPTY_SLOT)),
    label(PASS_SLOT_DRAW),
    call(VRAM_PUT),
    inc_rr('hl'), // a space between
    dec_r('b'),
    jr_cc('nz', PASS_SLOT),
    ret(),

    // pass_cursor: the paw beside the highlighted kana
    label(PASS_CURSOR),
    ld_a_nn(MEM.PASS_CURSOR),
    and_n(u8(PASSWORD_LAYOUT.gridCols - 1)),
    add_r('a'),
    add_n(u8(gridCol)),
    add_r('a'),
    add_r('a'),
    add_r('a'), // OAM x = column * 8: the tile before the kana...
    dec_r('a'),
    dec_r('a'), // ...2 pixels back from it
    ld_nn_a(oamField(SPRITE_SLOT.cursor, 'x')),
    ld_a_nn(MEM.PASS_CURSOR),
    and_n(u8(0x18)), // the grid row * 8
    add_r('a'),
    add_n(u8(gridRow * 8 + 16)),
    ld_nn_a(oamField(SPRITE_SLOT.cursor, 'y')),
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
