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
  or_n,
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
import { type Op, type U16, ref, u8, u16 } from '../asm/types';
import { storeByte, zeroBytes } from '../asm/macros';
import { requireTile, textToTiles } from './font';
import { MAX_LIVES } from './state';
import { MAX_SCORE } from './kana-hud';
import { playSfx } from './sound';
import { SPRITE_SLOT, SPRITE_TILES, oamField, runDma } from './sprites';
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
 * pass_encode  SCENE_ID, full hearts and the score → PASS_CHARS
 * pass_decode  PASS_CHARS → PASS_ACC; A = 0 (Z set) if it's a valid password
 * pass_apply   PASS_ACC (decoded) → the run: scene, hearts, score, stamps
 * pass_draw    draw PASS_CHARS at HL (vram_put: safe with the LCD on)
 */
export function buildPasswordRoutines(sceneCount: number): Op[] {
  return [
    // pass_check: A = the check of PASS_ACC bytes 1-3
    label('pass_check'),
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
    label('pass_xor'),
    ld_rr_nn('hl', MEM.PASS_ACC),
    ...MASKS.flatMap((mask) => [ld_r_r('a', 'hl_ptr'), xor_n(u8(mask)), ldi_hl_a()]),
    ret(),

    // pass_shift: shift PASS_ACC left a bit, carry in at the bottom, out at the top
    label('pass_shift'),
    ld_rr_nn('hl', acc(3)),
    rl('hl_ptr'),
    dec_rr('hl'),
    rl('hl_ptr'),
    dec_rr('hl'),
    rl('hl_ptr'),
    dec_rr('hl'),
    rl('hl_ptr'),
    ret(),

    label('pass_encode'),
    ld_a_nn(MEM.SCENE_ID),
    add_r('a'),
    add_r('a'),
    or_n(u8(MAX_LIVES)),
    ld_nn_a(acc(1)),
    ld_a_nn(MEM.KANA_SCORE_HI),
    ld_nn_a(acc(2)),
    ld_a_nn(MEM.KANA_SCORE_LO),
    ld_nn_a(acc(3)),
    call(ref('pass_check')),
    ld_nn_a(acc(0)),
    call(ref('pass_xor')),
    // The 30 bits sit at the bottom: shift the top 2 (zeros) out, then take 5 a kana
    ...[0, 1].flatMap(() => [xor_r('a'), call(ref('pass_shift'))]),
    ld_rr_nn('de', MEM.PASS_CHARS),
    ld_r_n('b', u8(PASSWORD_LENGTH)),
    label('pass_encode_kana'),
    ld_r_n('c', u8(0)),
    ...Array.from({ length: BITS_PER_KANA }, () => [
      xor_r('a'), // carry in: 0
      call(ref('pass_shift')),
      rl('c'),
    ]).flat(),
    ld_r_r('a', 'c'),
    ld_de_a(),
    inc_rr('de'),
    dec_r('b'),
    jr_cc('nz', ref('pass_encode_kana')),
    ret(),

    label('pass_decode'),
    ...zeroBytes(acc(0), acc(1), acc(2), acc(3)),
    ld_rr_nn('de', MEM.PASS_CHARS),
    ld_r_n('b', u8(PASSWORD_LENGTH)),
    label('pass_decode_kana'),
    ld_a_de(),
    inc_rr('de'),
    add_r('a'),
    add_r('a'),
    add_r('a'), // its 5 bits at the top of A
    ld_r_r('c', 'a'),
    ...Array.from({ length: BITS_PER_KANA }, () => [sla('c'), call(ref('pass_shift'))]).flat(),
    dec_r('b'),
    jr_cc('nz', ref('pass_decode_kana')),
    call(ref('pass_xor')),
    // Hearts 1 to 3, a scene that exists, a score within the cap, and the check
    ld_a_nn(acc(1)),
    and_n(u8(3)),
    jr_cc('z', ref('pass_bad')),
    ld_a_nn(acc(1)),
    cp_n(u8(sceneCount << 2)),
    jr_cc('nc', ref('pass_bad')),
    ld_a_nn(acc(2)),
    cp_n(u8(MAX_SCORE >> 8)),
    jr_cc('c', ref('pass_score_ok')),
    jr_cc('nz', ref('pass_bad')),
    ld_a_nn(acc(3)),
    cp_n(u8((MAX_SCORE & 0xff) + 1)),
    jr_cc('nc', ref('pass_bad')),
    label('pass_score_ok'),
    call(ref('pass_check')),
    ld_r_r('b', 'a'),
    ld_a_nn(acc(0)),
    cp_r('b'),
    jr_cc('nz', ref('pass_bad')),
    xor_r('a'),
    ret(),
    label('pass_bad'),
    ld_r_n('a', u8(1)),
    or_r('a'),
    ret(),

    label('pass_apply'),
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
    label('pass_apply_flags'),
    dec_r('b'),
    jr_cc('z', ref('pass_apply_flags_done')),
    add_r('a'),
    jr(ref('pass_apply_flags')),
    label('pass_apply_flags_done'),
    dec_r('a'),
    ld_nn_a(MEM.SCENE_FLAGS),
    ld_a_nn(acc(2)),
    ld_nn_a(MEM.KANA_SCORE_HI),
    ld_a_nn(acc(3)),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ...zeroBytes(MEM.DELTA_TYPE, MEM.DELTA_TIMER, MEM.KANA_STREAK),
    ret(),

    // pass_draw: HL = tilemap address
    label('pass_draw'),
    ld_rr_nn('de', MEM.PASS_CHARS),
    ld_r_n('b', u8(PASSWORD_LENGTH)),
    label('pass_draw_kana'),
    ld_a_de(),
    inc_rr('de'),
    call(ref('pass_tile')),
    call(ref('vram_put')),
    dec_r('b'),
    ret_cc('z'),
    jr(ref('pass_draw_kana')),

    // pass_tile: A = the tile of kana A (an alphabet index); preserves HL
    label('pass_tile'),
    push('hl'),
    ld_rr_nn('hl', ref('pass_alphabet')),
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
  return [label('pass_alphabet'), db(textToTiles(PASSWORD_ALPHABET))];
}

// ---------------------------------------------------------------------------
// The entry screen
// ---------------------------------------------------------------------------

export const PASSWORD_SCREEN = {
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
export const PASSWORD_WRONG = 'ちがうよ';
const EMPTY_SLOT = requireTile('─');

const GRID_ROWS = PASSWORD_ALPHABET.length / PASSWORD_SCREEN.gridCols;

/** The kana grid's rows: 8 kana a space apart */
function gridRowTiles(row: number): number[] {
  const kana = Array.from(PASSWORD_ALPHABET).slice(
    row * PASSWORD_SCREEN.gridCols,
    (row + 1) * PASSWORD_SCREEN.gridCols,
  );
  return textToTiles(kana.join(' '));
}

/**
 * password_screen: type a password in, then continue the run it holds. B on an
 * empty password goes back to the title. `fade` is the fade-in's palette label.
 */
export function buildPasswordScreen(fade: string): Op[] {
  const { promptRow, slotsRow, slotsCol, gridRow, gridCol, messageRow } = PASSWORD_SCREEN;
  const wrong = textToTiles(PASSWORD_WRONG);
  return [
    label('password_screen'),
    ...fadeOut(),
    ...screenOff('password_vblank'),
    ...clearScreen(),
    ...zeroBytes(MEM.PASS_LEN, MEM.PASS_CURSOR),
    ...writeCenteredRow(promptRow, textToTiles(PASSWORD_PROMPT)),
    ...Array.from({ length: GRID_ROWS }, (_, r) =>
      drawTiles(tilemapAddr(gridRow + 2 * r, gridCol), gridRowTiles(r)),
    ).flat(),
    call(ref('pass_draw_slots')),
    ...fadeIn(fade),
    call(ref('pass_cursor')),

    label('password_loop'),
    ...frameWait(),
    ...runDma(),
    call(ref('joy_read')),
    ld_a_nn(MEM.JOYPAD_NEW),
    ld_r_r('b', 'a'),
    and_n(u8(JOY.A)),
    jp_cc('nz', ref('password_add')),
    ld_r_r('a', 'b'),
    and_n(u8(JOY.B)),
    jp_cc('nz', ref('password_delete')),
    // The d-pad moves around the grid, wrapping (32 cells: AND 31)
    ...(
      [
        [JOY.RIGHT, 1],
        [JOY.LEFT, -1],
        [JOY.DOWN, PASSWORD_SCREEN.gridCols],
        [JOY.UP, -PASSWORD_SCREEN.gridCols],
      ] as const
    ).flatMap(([button, step], i) => [
      ld_r_r('a', 'b'),
      and_n(u8(button)),
      jr_cc('z', ref(`password_dpad_${String(i)}`)),
      ld_a_nn(MEM.PASS_CURSOR),
      add_n(u8(step & 0xff)),
      jp(ref('password_move')),
      label(`password_dpad_${String(i)}`),
    ]),
    jp(ref('password_loop')),

    label('password_move'),
    and_n(u8(PASSWORD_ALPHABET.length - 1)),
    ld_nn_a(MEM.PASS_CURSOR),
    ...playSfx('cursor'),
    call(ref('pass_cursor')),
    jp(ref('password_loop')),

    label('password_add'),
    ld_a_nn(MEM.PASS_LEN),
    cp_n(u8(PASSWORD_LENGTH)),
    jp_cc('nc', ref('password_loop')), // full (and wrong): B to fix it
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
    call(ref('pass_draw_slots')),
    ld_a_nn(MEM.PASS_LEN),
    cp_n(u8(PASSWORD_LENGTH)),
    jp_cc('nz', ref('password_loop')),
    // All six in: check it
    call(ref('pass_decode')),
    jp_cc('nz', ref('password_wrong')),
    ...playSfx('start'),
    call(ref('pass_apply')),
    xor_r('a'),
    ldh_n_a(HW.DIV), // like a new game: the same shuffles whenever it's typed
    jp(ref('scene_load')),

    label('password_wrong'),
    ...playSfx('wrong'),
    ...writeCenteredRow(messageRow, wrong),
    jp(ref('password_loop')),

    label('password_delete'),
    ld_a_nn(MEM.PASS_LEN),
    or_r('a'),
    jr_cc('z', ref('password_back')),
    dec_r('a'),
    ld_nn_a(MEM.PASS_LEN),
    ...playSfx('cursor'),
    call(ref('pass_draw_slots')),
    ...writeCenteredRow(
      messageRow,
      wrong.map(() => requireTile(' ')),
    ),
    jp(ref('password_loop')),

    label('password_back'),
    ...playSfx('cursor'),
    ...fadeOut(),
    ...screenOff('password_to_title'),
    jp(ref('title_screen')),

    // pass_draw_slots: the kana entered so far, then a dash for each still to come
    label('pass_draw_slots'),
    ld_rr_nn('hl', u16(tilemapAddr(slotsRow, slotsCol))),
    ld_rr_nn('de', MEM.PASS_CHARS),
    ld_a_nn(MEM.PASS_LEN),
    ld_r_r('c', 'a'),
    ld_r_n('b', u8(PASSWORD_LENGTH)),
    label('pass_slot'),
    ld_a_de(),
    inc_rr('de'),
    call(ref('pass_tile')),
    dec_r('c'),
    bit(7, 'c'), // past the entered kana?
    jr_cc('z', ref('pass_slot_draw')),
    ld_r_n('a', u8(EMPTY_SLOT)),
    label('pass_slot_draw'),
    call(ref('vram_put')),
    inc_rr('hl'), // a space between
    dec_r('b'),
    jr_cc('nz', ref('pass_slot')),
    ret(),

    // pass_cursor: the paw beside the highlighted kana
    label('pass_cursor'),
    ld_a_nn(MEM.PASS_CURSOR),
    and_n(u8(PASSWORD_SCREEN.gridCols - 1)),
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
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'tile'), SPRITE_TILES.cursor),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'attr')),
    ret(),
  ];
}

/** Centered column of the game over screen's password line (label, space, kana) */
export const PASSWORD_LABEL = 'あいことば';
export function passwordLineCol(): number {
  return centerStartCol(Array.from(PASSWORD_LABEL).length + 1 + PASSWORD_LENGTH);
}
