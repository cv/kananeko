/**
 * The title menu: a framed list of choices with the paw cursor beside the highlighted
 * one. Up and down move it (wrapping); A or START picks it.
 */

import { JOY } from '../asm/hardware';
import { MEM } from './ram';
import { add, and, cp, dec, inc, jr, label, ld, or, ret } from '../asm/sm83';
import { type Op, Label } from '../asm/types';
import { storeByte, zeroBytes } from '../asm/macros';
import { textToTiles } from './font';
import { playSfx } from './sound';
import { SPRITE_SLOT, SPRITE_TILE, oamField } from './sprites';
import { centerStartCol } from './tilemap';
import { writeCenteredRow } from './video';
import { MENU_DRAW, MENU_UPDATE } from './labels';
import { gameModule } from '../asm/program';

// Labels placed in this module
const MENU_NO_PICK = new Label('menu_no_pick');
const MENU_UP_DEC = new Label('menu_up_dec');
const MENU_DOWN = new Label('menu_down');
const MENU_MOVE = new Label('menu_move');
const MENU_CURSOR = new Label('menu_cursor');
const MENU_NONE = new Label('menu_none');

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
    label(MENU_DRAW),
    ...writeCenteredRow(MENU_TOP_ROW, textToTiles(`┌${'─'.repeat(BOX_WIDTH - 2)}┐`)),
    ...TITLE_MENU.flatMap((item, i) => writeCenteredRow(MENU_TOP_ROW + 1 + i, itemRow(item))),
    ...writeCenteredRow(bottom, textToTiles(`└${'▁'.repeat(BOX_WIDTH - 2)}┘`)),
    ...zeroBytes(MEM.MENU_CURSOR),
    jr(MENU_CURSOR),

    label(MENU_UPDATE),
    ld('a', [MEM.JOYPAD_NEW]),
    ld('b', 'a'),
    and(JOY.A | JOY.START),
    jr('z', MENU_NO_PICK),
    ld('a', [MEM.MENU_CURSOR]),
    inc('a'),
    ret(),
    label(MENU_NO_PICK),
    ld('a', 'b'),
    and(JOY.DOWN),
    jr('nz', MENU_DOWN),
    ld('a', 'b'),
    and(JOY.UP),
    jr('z', MENU_NONE),
    // Up: the item before, wrapping to the last
    ld('a', [MEM.MENU_CURSOR]),
    or('a'),
    jr('nz', MENU_UP_DEC),
    ld('a', TITLE_MENU.length),
    label(MENU_UP_DEC),
    dec('a'),
    jr(MENU_MOVE),
    label(MENU_DOWN),
    ld('a', [MEM.MENU_CURSOR]),
    inc('a'),
    cp(TITLE_MENU.length),
    jr('c', MENU_MOVE),
    ld('a', 0),
    label(MENU_MOVE),
    ld([MEM.MENU_CURSOR], 'a'),
    ...playSfx('cursor'),
    // menu_cursor: the paw beside the highlighted item
    label(MENU_CURSOR),
    ld('a', [MEM.MENU_CURSOR]),
    add('a'),
    add('a'),
    add('a'),
    add((MENU_TOP_ROW + 1) * 8 + 16),
    ld([oamField(SPRITE_SLOT.cursor, 'y')], 'a'),
    // In the tile before the text, a pixel back from it
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'x'), MENU_TEXT_COL * 8 - 1),
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'tile'), SPRITE_TILE.cursor),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'attr')),
    label(MENU_NONE),
    ld('a', 0),
    ret(),
  ];
}

export const menuModule = gameModule({ name: 'menu', code: buildMenuRoutines });
