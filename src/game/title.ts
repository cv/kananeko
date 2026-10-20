/**
 * The title screen: the logo, the menu, and the blinking START prompt the result
 * screens share. The game starts here, and comes back after a run.
 */

import { compare, doWhile, ifThen } from '../asm/flow';
import { MEM } from './ram';
import { gameModule } from '../asm/program';
import {
  TITLE_FADE,
  CAT_REST,
  CAT_TICK,
  JOY_READ,
  KANA_DRAW_HUD,
  MENU_DRAW,
  MENU_UPDATE,
  PASSWORD_SCREEN,
  PRACTICE_START,
  TITLE_SCREEN,
} from './labels';
import { CAT_SPOTS, catFace, placeCat } from './cat';
import { menuPick } from './menu';
import { playMusic, playSfx } from './sound';
import { runDma } from './sprites';
import {
  cgbAttributes,
  clearScreen,
  fadeIn,
  frameWait,
  fillAttributes,
  writeCenteredRow,
} from './video';
import { incByte, zeroBytes } from '../asm/macros';
import { and, call, cp, jp, label, ld, or, ret, db } from '../asm/sm83';
import { type Op, routine } from '../asm/types';
import { textToTiles } from './font';
import { centerStartCol } from './tilemap';
import { paletteOf, buildPaletteSet } from './color';
import { LOGO_ROWS } from './logo';
import { TITLE_COLORS } from './scenes/colors';

export const DRAW_START_BOX = routine('draw_start_box', { clobbers: ['a', 'hl'] });
export const TITLE_BLINK = routine('title_blink', { clobbers: ['a', 'b', 'hl'] });

/** Rows of the two-row カナネコ logo */
const LOGO_TOP_ROW = 6;
const LOGO_WIDTH = Array.from(LOGO_ROWS[0]).length;
const SUBTITLE = 'ねこと にほんごの たび';

const START_BOX_TOP = textToTiles('┌────────────┐');
const START_BOX_ON = textToTiles('│ スタートを おしてね ▕');
const START_BOX_OFF = textToTiles('│            ▕');
const START_BOX_BOTTOM = textToTiles('└▁▁▁▁▁▁▁▁▁▁▁▁┘');
const START_PROMPT_ROW = 13;
/** TITLE_TIMER bit that toggles the START prompt (every 32 frames) */
const BLINK_BIT = 0x20;

/** Subroutine: draw the framed PRESS START prompt (LCD off). */
function buildDrawStartBox(): Op[] {
  return [
    label(DRAW_START_BOX),
    ...writeCenteredRow(START_PROMPT_ROW - 1, START_BOX_TOP),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_ON),
    ...writeCenteredRow(START_PROMPT_ROW + 1, START_BOX_BOTTOM),
    ret(),
  ];
}

/** Subroutine: tick TITLE_TIMER and redraw the START prompt when its blink phase flips. */
function buildTitleBlink(): Op[] {
  return [
    label(TITLE_BLINK),
    ...incByte(MEM.TITLE_TIMER),
    ld('b', 'a'),
    and(BLINK_BIT - 1),
    ret('nz'),
    ld('a', 'b'),
    and(BLINK_BIT),
    ...ifThen('nz', [...writeCenteredRow(START_PROMPT_ROW, START_BOX_OFF), ret()]),
    ...writeCenteredRow(START_PROMPT_ROW, START_BOX_ON),
    ret(),
  ];
}

/** The title screen, entered with the LCD off: carries on when はじめる starts a run */
export function titleScreen(): Op[] {
  return [
    // ==== Title Screen (entered with the LCD off) ====
    label(TITLE_SCREEN),
    ...playMusic('title'),
    ...clearScreen(),

    // Reset title animation state so the prompt always starts visible.
    ...zeroBytes(MEM.TITLE_TIMER),

    // Score HUD on row 0, title card, and prompt frame (the cat comes after the fade)
    call(KANA_DRAW_HUD),
    ...LOGO_ROWS.flatMap((row, i) => writeCenteredRow(LOGO_TOP_ROW + i, textToTiles(row))),
    ...cgbAttributes(
      fillAttributes(
        LOGO_TOP_ROW,
        centerStartCol(LOGO_WIDTH),
        LOGO_ROWS.length,
        LOGO_WIDTH,
        paletteOf(TITLE_COLORS, 'cat'),
      ),
    ),
    ...writeCenteredRow(10, textToTiles(SUBTITLE)),
    call(MENU_DRAW),
    ...fadeIn(TITLE_FADE),
    ...catFace(CAT_REST, 'neutral'),
    ...placeCat(CAT_SPOTS.portrait),

    // Wait for all buttons to be released (debounce boot ROM START press)
    ...doWhile('nz', [...frameWait(), ...runDma(), call(JOY_READ), ...compare(MEM.JOYPAD_CUR, 0)]),

    // The menu: はじめる starts a run, つづき takes a password
    ...doWhile('z', [
      ...frameWait(),
      ...runDma(),
      call(JOY_READ),
      call(CAT_TICK),
      call(MENU_UPDATE),
      or('a'),
    ]),
    cp(menuPick('はじめる')),
    ...ifThen('nz', [
      ...playSfx('confirm'),
      cp(menuPick('つづき')),
      jp('z', PASSWORD_SCREEN),
      jp(PRACTICE_START),
    ]),
    ...playSfx('start'),
  ];
}

export const titleModule = gameModule({
  name: 'title',
  code: () => [...buildTitleBlink(), ...buildDrawStartBox()],
  data: () => [label(TITLE_FADE), db(buildPaletteSet(TITLE_COLORS))],
});
