/**
 * The title menu: a framed list of choices with the paw cursor beside the highlighted
 * one. Up and down move it (wrapping); A or START picks it.
 */

import { JOY, MEM } from '../asm/hardware';
import {
  add_n,
  add_r,
  and_n,
  cp_n,
  dec_r,
  inc_r,
  jr,
  jr_cc,
  label,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  or_r,
  ret,
} from '../asm/ops';
import { type Op, ref, u8 } from '../asm/types';
import { storeByte, zeroBytes } from '../asm/macros';
import { textToTiles } from './font';
import { playSfx } from './sound';
import { SPRITE_SLOT, SPRITE_TILES, oamField } from './sprites';
import { centerStartCol } from './tilemap';
import { writeCenteredRow } from './video';

/** The menu's items, in order; menu_update returns an item's index + 1 when it's picked */
export const TITLE_MENU = ['はじめる', 'つづき', 'れんしゅう'] as const;

export type MenuItem = (typeof TITLE_MENU)[number];

/** The value menu_update returns when `item` is picked */
export function menuPick(item: MenuItem): number {
  return TITLE_MENU.indexOf(item) + 1;
}

const BOX_WIDTH = 14;
/** The box's top border; the items follow, one a row */
export const MENU_TOP_ROW = 12;
const BOX_COL = centerStartCol(BOX_WIDTH);
/** Where the items' text starts (the paw sits in the tile before) */
export const MENU_TEXT_COL = BOX_COL + 3;

function itemRow(item: string): number[] {
  const text = `  ${item}`;
  return textToTiles(`│${text.padEnd(BOX_WIDTH - 2, ' ')}▕`);
}

/**
 * menu_draw    draw the box and its items, highlighting the first (LCD off)
 * menu_update  move the cursor on the d-pad; A = the picked item's index + 1, or 0
 */
export function buildMenuRoutines(): Op[] {
  const bottom = MENU_TOP_ROW + TITLE_MENU.length + 1;
  return [
    label('menu_draw'),
    ...writeCenteredRow(MENU_TOP_ROW, textToTiles(`┌${'─'.repeat(BOX_WIDTH - 2)}┐`)),
    ...TITLE_MENU.flatMap((item, i) => writeCenteredRow(MENU_TOP_ROW + 1 + i, itemRow(item))),
    ...writeCenteredRow(bottom, textToTiles(`└${'▁'.repeat(BOX_WIDTH - 2)}┘`)),
    ...zeroBytes(MEM.MENU_CURSOR),
    jr(ref('menu_cursor')),

    label('menu_update'),
    ld_a_nn(MEM.JOYPAD_NEW),
    ld_r_r('b', 'a'),
    and_n(u8(JOY.A | JOY.START)),
    jr_cc('z', ref('menu_no_pick')),
    ld_a_nn(MEM.MENU_CURSOR),
    inc_r('a'),
    ret(),
    label('menu_no_pick'),
    ld_r_r('a', 'b'),
    and_n(u8(JOY.DOWN)),
    jr_cc('nz', ref('menu_down')),
    ld_r_r('a', 'b'),
    and_n(u8(JOY.UP)),
    jr_cc('z', ref('menu_none')),
    // Up: the item before, wrapping to the last
    ld_a_nn(MEM.MENU_CURSOR),
    or_r('a'),
    jr_cc('nz', ref('menu_up_dec')),
    ld_r_n('a', u8(TITLE_MENU.length)),
    label('menu_up_dec'),
    dec_r('a'),
    jr(ref('menu_move')),
    label('menu_down'),
    ld_a_nn(MEM.MENU_CURSOR),
    inc_r('a'),
    cp_n(u8(TITLE_MENU.length)),
    jr_cc('c', ref('menu_move')),
    ld_r_n('a', u8(0)),
    label('menu_move'),
    ld_nn_a(MEM.MENU_CURSOR),
    ...playSfx('cursor'),
    // menu_cursor: the paw beside the highlighted item
    label('menu_cursor'),
    ld_a_nn(MEM.MENU_CURSOR),
    add_r('a'),
    add_r('a'),
    add_r('a'),
    add_n(u8((MENU_TOP_ROW + 1) * 8 + 16)),
    ld_nn_a(oamField(SPRITE_SLOT.cursor, 'y')),
    // In the tile before the text, a pixel back from it
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'x'), MENU_TEXT_COL * 8 - 1),
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'tile'), SPRITE_TILES.cursor),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'attr')),
    label('menu_none'),
    ld_r_n('a', u8(0)),
    ret(),
  ];
}
