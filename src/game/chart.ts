/**
 * The kana chart (かなの きろく): the 46 basic hiragana in gojūon order, showing
 * which ones the player has answered right, and in red (on the Game Boy Color) the
 * ones they've missed. It shows between scenes, with the password for the next,
 * and once more before the ending.
 *
 * Every kana answer counts toward its basic hiragana: カ, が and ガ all count as か.
 */

import { JOY, MEM } from '../asm/hardware';
import {
  add_hl_rr,
  and_n,
  and_r,
  call,
  cp_n,
  db,
  dec_r,
  inc_r,
  inc_rr,
  jr,
  jr_cc,
  label,
  ld_a_de,
  ld_a_nn,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldh_n_a,
  or_r,
  pop,
  push,
  ret,
  ret_cc,
  sla,
  srl,
  ld_hl_n,
} from '../asm/ops';
import { HW } from '../asm/hardware';
import { type Op, ref, u8 } from '../asm/types';
import { storeByte, zeroBytes } from '../asm/macros';
import { paletteOf } from './color';
import { CHAR_MAP, requireTile, textToTiles } from './font';
import { PASSWORD_LABEL, passwordLineCol } from './password';
import { CHART_COLORS } from './scenes/colors';
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

/** The chart's rows (consonants), five vowels each; spaces are gaps */
const CHART_ROWS = [
  'あいうえお',
  'かきくけこ',
  'さしすせそ',
  'たちつてと',
  'なにぬねの',
  'はひふへほ',
  'まみむめも',
  'や ゆ よ',
  'らりるれろ',
  'わ   を',
  'ん',
] as const;

/** The 46 kana, in chart order */
export const CHART_KANA = CHART_ROWS.join('').replaceAll(' ', '');
export const CHART_BYTES = Math.ceil(CHART_KANA.length / 8);

const SMALL_KANA: Readonly<Record<string, string>> = {
  ぁ: 'あ',
  ぃ: 'い',
  ぅ: 'う',
  ぇ: 'え',
  ぉ: 'お',
  っ: 'つ',
  ゃ: 'や',
  ゅ: 'ゆ',
  ょ: 'よ',
  ゎ: 'わ',
};
const KATAKANA_OFFSET = 0x60;

/** The chart entry a kana counts toward (katakana, dakuten and small kana count as their basic hiragana), or -1 */
export function chartIndexOf(kana: string): number {
  let ch = kana.normalize('NFD').replace(/[\u3099\u309a]/gu, '');
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x30a1 && code <= 0x30f6) ch = String.fromCodePoint(code - KATAKANA_OFFSET);
  ch = SMALL_KANA[ch] ?? ch;
  return ch.length === 1 ? CHART_KANA.indexOf(ch) : -1;
}

const LAYOUT = { titleRow: 1, top: 3, leftCol: 1, rightCol: 11, nextRow: 17 } as const;
export const CHART_TITLE = 'かなの きろく';
export const CHART_NEXT = 'つぎへ';
export const CHART_PASSWORD_ROW = 15;
const BLOCK_ROWS = 5;

/** Where chart entry `i` is drawn: two blocks side by side, a space between kana */
export function chartCell(i: number): { row: number; col: number } {
  let seen = 0;
  for (const [r, row] of CHART_ROWS.entries()) {
    for (const [c, ch] of Array.from(row).entries()) {
      if (ch === ' ') continue;
      if (seen++ === i) {
        const right = r >= BLOCK_ROWS;
        return {
          row: LAYOUT.top + 2 * (right ? r - BLOCK_ROWS : r),
          col: (right ? LAYOUT.rightCol : LAYOUT.leftCol) + 2 * c,
        };
      }
    }
  }
  throw new RangeError(`No chart entry ${String(i)}`);
}

const UNSEEN = requireTile('─');
const NO_ENTRY = 0xff;

/** chart_of_tile: tile index → chart entry (NO_ENTRY if not a kana); chart_layout: address, tile */
export function buildChartData(): Op[] {
  const tileCount = Math.max(...Object.values(CHAR_MAP)) + 1;
  const ofTile = Array<number>(tileCount).fill(NO_ENTRY);
  for (const [ch, tile] of Object.entries(CHAR_MAP)) {
    const index = chartIndexOf(ch);
    if (index >= 0) ofTile[tile] = index;
  }
  return [
    label('chart_of_tile'),
    db(ofTile),
    label('chart_layout'),
    db(
      Array.from(CHART_KANA).flatMap((ch, i) => {
        const { row, col } = chartCell(i);
        const address = tilemapAddr(row, col);
        return [address & 0xff, address >> 8, requireTile(ch)];
      }),
    ),
  ];
}

/**
 * chart_seen / chart_missed  mark the answer (KANA_SHUFFLE) right or wrong. Clobber
 *                            A, preserve BC, DE, HL.
 * chart_bit                  A = entry, HL = a bit set → HL = its byte, B = its bit
 * chart_show                 the chart screen; C = 1 to show the password too
 */
export function buildChartRoutines(fade: string): Op[] {
  const missed = paletteOf(CHART_COLORS, 'missed');
  return [
    label('chart_seen'),
    push('hl'),
    ld_rr_nn('hl', MEM.KANA_SEEN),
    jr(ref('chart_mark')),
    label('chart_missed'),
    push('hl'),
    ld_rr_nn('hl', MEM.KANA_MISSED),
    label('chart_mark'),
    push('bc'),
    push('de'),
    ld_a_nn(MEM.KANA_SHUFFLE), // the right answer's tile
    ld_rr_nn('de', ref('chart_of_tile')),
    push('hl'),
    ld_r_r('l', 'a'),
    ld_r_n('h', u8(0)),
    add_hl_rr('de'),
    ld_r_r('a', 'hl_ptr'),
    pop('hl'),
    cp_n(u8(NO_ENTRY)),
    jr_cc('z', ref('chart_mark_done')),
    call(ref('chart_bit')),
    ld_r_r('a', 'hl_ptr'),
    or_r('b'),
    ld_r_r('hl_ptr', 'a'),
    label('chart_mark_done'),
    pop('de'),
    pop('bc'),
    pop('hl'),
    ret(),

    label('chart_bit'),
    ld_r_r('b', 'a'),
    srl('a'),
    srl('a'),
    srl('a'),
    ld_r_r('e', 'a'),
    ld_r_n('d', u8(0)),
    add_hl_rr('de'),
    ld_r_r('a', 'b'),
    and_n(u8(7)),
    ld_r_n('b', u8(1)),
    label('chart_bit_shift'),
    or_r('a'),
    ret_cc('z'),
    sla('b'),
    dec_r('a'),
    jr(ref('chart_bit_shift')),

    label('chart_show'),
    push('bc'),
    ...fadeOut(),
    ...screenOff('chart_vblank'),
    ...clearScreen(),
    ...writeCenteredRow(LAYOUT.titleRow, textToTiles(CHART_TITLE)),
    ...writeCenteredRow(LAYOUT.nextRow, textToTiles(CHART_NEXT)),
    // Each kana: itself if answered right, a dash if not yet; red if ever missed
    ld_rr_nn('de', ref('chart_layout')),
    ld_r_n('c', u8(0)),
    label('chart_entry'),
    ld_a_de(),
    inc_rr('de'),
    ld_r_r('l', 'a'),
    ld_a_de(),
    inc_rr('de'),
    ld_r_r('h', 'a'),
    push('hl'), // the cell's address
    push('de'),
    ld_r_r('a', 'c'),
    ld_rr_nn('hl', MEM.KANA_SEEN),
    call(ref('chart_bit')),
    ld_r_r('a', 'hl_ptr'),
    and_r('b'),
    pop('de'),
    pop('hl'),
    ld_a_de(), // the kana's tile
    inc_rr('de'),
    jr_cc('nz', ref('chart_entry_draw')),
    ld_r_n('a', u8(UNSEEN)),
    label('chart_entry_draw'),
    ld_r_r('hl_ptr', 'a'),
    // On the GBC, the missed ones' cells get the red palette (VRAM bank 1)
    ld_a_nn(MEM.IS_CGB),
    or_r('a'),
    jr_cc('z', ref('chart_entry_next')),
    push('hl'),
    push('de'),
    ld_r_r('a', 'c'),
    ld_rr_nn('hl', MEM.KANA_MISSED),
    call(ref('chart_bit')),
    ld_r_r('a', 'hl_ptr'),
    and_r('b'),
    pop('de'),
    pop('hl'),
    jr_cc('z', ref('chart_entry_next')),
    ld_r_n('a', u8(1)),
    ldh_n_a(HW.VBK),
    ld_hl_n(u8(missed)),
    ld_r_n('a', u8(0)),
    ldh_n_a(HW.VBK),
    label('chart_entry_next'),
    inc_r('c'),
    ld_r_r('a', 'c'),
    cp_n(u8(CHART_KANA.length)),
    jr_cc('nz', ref('chart_entry')),

    // The password for what comes next
    pop('bc'),
    ld_r_r('a', 'c'),
    or_r('a'),
    jr_cc('z', ref('chart_no_password')),
    call(ref('pass_encode')),
    ...drawTiles(
      tilemapAddr(CHART_PASSWORD_ROW, passwordLineCol()),
      textToTiles(`${PASSWORD_LABEL} `),
    ),
    call(ref('pass_draw')),
    label('chart_no_password'),
    ...fadeIn(fade),
    // The paw beside つぎへ
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'y'), LAYOUT.nextRow * 8 + 16),
    ...storeByte(
      oamField(SPRITE_SLOT.cursor, 'x'),
      centerStartCol(Array.from(CHART_NEXT).length) * 8 - 1,
    ),
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'tile'), SPRITE_TILES.cursor),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'attr')),
    ...storeByte(MEM.CHART_WAIT, 1),
    label('chart_wait'),
    ...frameWait(),
    ...runDma(),
    call(ref('joy_read')),
    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.A | JOY.START)),
    jr_cc('z', ref('chart_wait')),
    ...zeroBytes(MEM.CHART_WAIT),
    ...playSfx('confirm'),
    ret(),
  ];
}
