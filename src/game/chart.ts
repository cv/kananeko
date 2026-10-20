/**
 * The kana chart (かなの きろく): the 46 basic hiragana in gojūon order, showing
 * which ones the player has answered right, and in red (on the Game Boy Color) the
 * ones they've missed. It shows between scenes, with the password for the next,
 * and once more before the ending.
 *
 * Every kana answer counts toward its basic hiragana: カ, が and ガ all count as か.
 */

import { pressed } from './joypad';
import { block, doWhile, ifThen, loop } from '../asm/flow';
import { JOY } from '../asm/hardware';
import { MEM } from './ram';
import {
  add,
  and,
  call,
  cp,
  db,
  dec,
  inc,
  jr,
  label,
  ld,
  ldh,
  or,
  pop,
  push,
  ret,
  sla,
  srl,
  cpl,
} from '../asm/sm83';
import { HW } from '../asm/hardware';
import { type Op, Label } from '../asm/types';
import { addAToHl, storeByte, zeroBytes } from '../asm/macros';
import { paletteOf } from './color';
import { CHAR_MAP, requireTile, textToTiles } from './font';
import { PASSWORD_LABEL, passwordLineCol } from './password';
import { CHART_COLORS } from './scenes/colors';
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
  PASS_ENCODE,
  PASS_DRAW,
  JOY_READ,
  CHART_SEEN,
  CHART_MISSED,
  CHART_UNMISS,
  CHART_BIT,
  CHART_SHOW,
} from './labels';
import { gameModule } from '../asm/program';
import { CHART_FADE } from './labels';

// Labels placed in this module
const CHART_OF_TILE = new Label('chart_of_tile');
const CHART_LAYOUT = new Label('chart_layout');
const CHART_WAIT = new Label('chart_wait');

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
    label(CHART_OF_TILE),
    db(ofTile),
    label(CHART_LAYOUT),
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
export function buildChartRoutines(fade: Label): Op[] {
  const markDone = new Label('chart_mark_done');
  const markEntry = new Label('chart_mark');
  const missed = paletteOf(CHART_COLORS, 'missed');
  return [
    label(CHART_SEEN),
    push('hl'),
    ld('hl', MEM.KANA_SEEN.address),
    jr(markEntry),
    label(CHART_MISSED),
    push('hl'),
    ld('hl', MEM.KANA_MISSED.address),
    label(markEntry),
    push('bc'),
    push('de'),
    ld('a', [MEM.KANA_SHUFFLE.at(0)]), // the right answer's tile
    ld('de', CHART_OF_TILE),
    push('hl'),
    ld('l', 'a'),
    ld('h', 0),
    add('hl', 'de'),
    ld('a', ['hl']),
    pop('hl'),
    cp(NO_ENTRY),
    jr('z', markDone),
    call(CHART_BIT),
    ld('a', ['hl']),
    or('b'),
    ld(['hl'], 'a'),
    label(markDone),
    pop('de'),
    pop('bc'),
    pop('hl'),
    ret(),

    // chart_unmiss: the answer (KANA_SHUFFLE) was practiced right: clear its miss
    label(CHART_UNMISS),
    push('hl'),
    push('bc'),
    push('de'),
    ld('a', [MEM.KANA_SHUFFLE.at(0)]),
    ld('de', CHART_OF_TILE),
    ld('l', 'a'),
    ld('h', 0),
    add('hl', 'de'),
    ld('a', ['hl']),
    cp(NO_ENTRY),
    jr('z', markDone),
    ld('hl', MEM.KANA_MISSED.address),
    call(CHART_BIT),
    ld('a', 'b'),
    cpl(),
    and(['hl']),
    ld(['hl'], 'a'),
    jr(markDone),

    label(CHART_BIT),
    ld('b', 'a'),
    srl('a'),
    srl('a'),
    srl('a'),
    ...addAToHl(),
    ld('a', 'b'),
    and(7),
    ld('b', 1),
    ...loop((again) => [or('a'), ret('z'), sla('b'), dec('a'), jr(again)]),

    label(CHART_SHOW),
    push('bc'),
    ...fadeOut(),
    ...screenOff(),
    ...clearScreen(),
    ...writeCenteredRow(LAYOUT.titleRow, textToTiles(CHART_TITLE)),
    ...writeCenteredRow(LAYOUT.nextRow, textToTiles(CHART_NEXT)),
    // Each kana: itself if answered right, a dash if not yet; red if ever missed
    ld('de', CHART_LAYOUT),
    ld('c', 0),
    ...doWhile('nz', [
      ld('a', ['de']),
      inc('de'),
      ld('l', 'a'),
      ld('a', ['de']),
      inc('de'),
      ld('h', 'a'),
      push('hl'), // the cell's address
      push('de'),
      ld('a', 'c'),
      ld('hl', MEM.KANA_SEEN.address),
      call(CHART_BIT),
      ld('a', ['hl']),
      and('b'),
      pop('de'),
      pop('hl'),
      ld('a', ['de']), // the kana's tile
      inc('de'),
      ...ifThen('z', [ld('a', UNSEEN)]),
      ld(['hl'], 'a'),
      // On the GBC, the missed ones' cells get the red palette (VRAM bank 1)
      ld('a', [MEM.IS_CGB]),
      or('a'),
      ...block((done) => [
        jr('z', done),
        push('hl'),
        push('de'),
        ld('a', 'c'),
        ld('hl', MEM.KANA_MISSED.address),
        call(CHART_BIT),
        ld('a', ['hl']),
        and('b'),
        pop('de'),
        pop('hl'),
        jr('z', done),
        ld('a', 1),
        ldh([HW.VBK], 'a'),
        ld(['hl'], missed),
        ld('a', 0),
        ldh([HW.VBK], 'a'),
      ]),
      inc('c'),
      ld('a', 'c'),
      cp(CHART_KANA.length),
    ]),

    // The password for what comes next
    pop('bc'),
    ld('a', 'c'),
    or('a'),
    ...ifThen('nz', [
      call(PASS_ENCODE),
      ...drawTiles(
        tilemapAddr(CHART_PASSWORD_ROW, passwordLineCol()),
        textToTiles(`${PASSWORD_LABEL} `),
      ),
      call(PASS_DRAW),
    ]),
    ...fadeIn(fade),
    // The paw beside つぎへ
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'y'), LAYOUT.nextRow * 8 + 16),
    ...storeByte(
      oamField(SPRITE_SLOT.cursor, 'x'),
      centerStartCol(Array.from(CHART_NEXT).length) * 8 - 1,
    ),
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'tile'), SPRITE_TILE.cursor),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'attr')),
    ...storeByte(MEM.CHART_WAIT, 1),
    label(CHART_WAIT),
    ...frameWait(),
    ...runDma(),
    call(JOY_READ),
    ...pressed(JOY.A | JOY.START),
    jr('z', CHART_WAIT),
    ...zeroBytes(MEM.CHART_WAIT),
    ...playSfx('confirm'),
    ret(),
  ];
}

export const chartModule = gameModule({
  name: 'chart',
  code: () => buildChartRoutines(CHART_FADE),
  data: buildChartData,
});
