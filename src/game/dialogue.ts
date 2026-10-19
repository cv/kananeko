/**
 * Dialogue engine for the Game Boy.
 *
 * Renders a text box at the bottom of the screen (rows 11-17),
 * reveals text character-by-character, presents shuffled response choices,
 * and handles cursor navigation with d-pad + A confirm.
 *
 * The tree data format is documented in dialogue-data.ts (buildDialogueTree).
 * Choosing the first authored choice of a node is "good" (+10 score, +1 life);
 * any other choice is "bad" (-5 score, -1 life, conversation ends at 0 lives).
 */

import { playSfx } from './sound';
import { HW, JOY } from '../asm/hardware';
import { MEM } from './ram';
import {
  countDownOrReturn,
  loadPointer,
  storeByte,
  storePointer,
  switchCases,
  zeroBytes,
} from '../asm/macros';
import {
  adc_r,
  add_hl_rr,
  add_n,
  add_r,
  and_n,
  call,
  cp_n,
  cp_r,
  dec_r,
  inc_r,
  inc_rr,
  jp,
  jp_cc,
  jr,
  jr_cc,
  label,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldh_a_n,
  ldi_a_hl,
  ldi_hl_a,
  ret,
  ret_cc,
  sub_n,
  or_r,
  pop,
  push,
  xor_r,
} from '../asm/ops';
import { type Op, u8, u16, Label } from '../asm/types';
import { at, hi, lo } from '../asm/util';
import { BAD_CHOICE_FLAG, NEXT_END, TEXT_END } from './dialogue-data';
import type { Triple } from './fixed';
import { requireTile } from './font';
import {
  DELTA_MINUS_5,
  DELTA_PLUS_10,
  buildAddScore,
  buildClearDelta,
  buildSetDelta,
  buildSubScore,
} from './kana-hud';
import { DialogueState, END_OF_CONVERSATION, MAX_LIVES } from './state';
import { SCREEN_COLS, type TilePosition, tilePos, tilemapAddr } from './tilemap';
import { OAM_X_OFFSET, OAM_Y_OFFSET, SPRITE_SLOT, SPRITE_TILE, oamField } from './sprites';
import { vramPut } from './video';
import { catFace } from './cat';
import {
  FILL_TILES,
  CAT_REACT,
  TEXT_DICT,
  NPC_UPDATE,
  NPC_SELECT,
  ANIM_TICK,
  DLG_DRAW_BOX,
  TEXT_NEXT,
  DLG_UPDATE,
  DLG_OPEN_TREE,
  DLG_OPEN_NODE,
} from './labels';

// Labels placed in this module
const DLG_ORDER_TWO = new Label('dlg_order_two');
const DLG_ORDER_THREE = new Label('dlg_order_three');
const DLG_ORDER_THREE_DISPATCH = new Label('dlg_order_three_dispatch');
const DLG_CLEAR_BOX = new Label('dlg_clear_box');
const DLG_CLEAR_ROW = new Label('dlg_clear_row');
const DLG_CLEAR_CELL = new Label('dlg_clear_cell');
const DLG_CLEAR_NC = new Label('dlg_clear_nc');
const TEXT_NEXT_RAW = new Label('text_next_raw');
const TEXT_NEXT_EXPAND = new Label('text_next_expand');
const TEXT_NEXT_DONE = new Label('text_next_done');
const DLG_OPEN = new Label('dlg_open');
const DLG_DO_PRINT = new Label('dlg_do_print');
const DLG_PRINT_SLOW = new Label('dlg_print_slow');
const DLG_PRINT_CHAR = new Label('dlg_print_char');
const DLG_TEXT_DONE = new Label('dlg_text_done');
const DLG_SETUP_CHOICES = new Label('dlg_setup_choices');
const DLG_DRAW_CHOICE_LOOP = new Label('dlg_draw_choice_loop');
const DLG_CHOICE_CHAR = new Label('dlg_choice_char');
const DLG_CHOICE_STR_DONE = new Label('dlg_choice_str_done');
const DLG_DO_WAIT = new Label('dlg_do_wait');
const DLG_DO_CHOOSE = new Label('dlg_do_choose');
const DLG_BOUNCE_SET = new Label('dlg_bounce_set');
const DLG_CURSOR_DOWN = new Label('dlg_cursor_down');
const DLG_CURSOR_UP = new Label('dlg_cursor_up');
const DLG_CURSOR_UP_DEC = new Label('dlg_cursor_up_dec');
const DLG_CURSOR_SAVE = new Label('dlg_cursor_save');
const DLG_CONFIRM_CHOICE = new Label('dlg_confirm_choice');
const DLG_NEXT_STORE = new Label('dlg_next_store');
const DLG_GOOD_CHOICE = new Label('dlg_good_choice');
const DLG_BAD_CHOICE = new Label('dlg_bad_choice');
const DLG_SCORE_DONE = new Label('dlg_score_done');
const DLG_DRAW_CURSOR = new Label('dlg_draw_cursor');

// Re-export data types and encoder from dialogue-data.ts
export { buildDialogueTree, defineDialogueTree } from './dialogue-data';
export type { DialogueNode, DialogueTree } from './dialogue-data';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const BOX_TOP_ROW = 9;
const BOX_ROWS = 9; // rows 9-17
const TEXT_ROW_1 = 10;
const CHOICE_START_ROW = 12;
/** Choices sit on every other row so they don't run together */
const CHOICE_ROW_STEP = 2;
const REVEAL_DELAY = 3; // frames between each character reveal
/** Characters revealed each frame while B is held (fast-forward) */
export const FAST_REVEAL_CHARS = 3;

const TEXT_START = tilePos(TEXT_ROW_1, 2);
const CHOICE_TEXT_POSITIONS: Triple<TilePosition> = [
  tilePos(CHOICE_START_ROW, 3),
  tilePos(CHOICE_START_ROW + CHOICE_ROW_STEP, 3),
  tilePos(CHOICE_START_ROW + 2 * CHOICE_ROW_STEP, 3),
];
const CHOICE_CURSOR_COL = 2;

/** Widest text that fits in the box: NPC text starts at col 2, choices at col 3, border at col 19. */
export const MAX_NPC_TEXT_WIDTH = SCREEN_COLS - 1 - TEXT_START.col;
export const MAX_CHOICE_TEXT_WIDTH = SCREEN_COLS - 1 - CHOICE_TEXT_POSITIONS[0].col;

/** Textbox geometry, for the scene loader, tests, and tools */
export const DIALOGUE_LAYOUT = {
  boxTop: BOX_TOP_ROW,
  text: TEXT_START,
  choiceRows: CHOICE_TEXT_POSITIONS.map((p) => p.row),
  choiceCol: CHOICE_TEXT_POSITIONS[0].col,
  /** Column where a location name label (name plus a space either side) starts, right-aligned in the top border */
  nameCol: (nameLength: number): number => SCREEN_COLS - 2 - (nameLength + 2),
} as const;

// Tile indices for border characters
const BORDER_TL = requireTile('┌');
const BORDER_TR = requireTile('┐');
const BORDER_BL = requireTile('└');
const BORDER_BR = requireTile('┘');
const BORDER_TOP = requireTile('─');
const BORDER_LEFT = requireTile('│');
const BORDER_RIGHT = requireTile('▕'); // with the shadow
const BORDER_BOTTOM = requireTile('▁'); // with the shadow

/** Cursor sprite position for the first choice row (OAM coordinates) */
const CURSOR_Y = CHOICE_START_ROW * 8 + OAM_Y_OFFSET;
/** One pixel left of its column: a 1-pixel gap before the choice text (the bounce closes it) */
const CURSOR_X = CHOICE_CURSOR_COL * 8 + OAM_X_OFFSET - 1;
/** Bit of DLG_BOUNCE that nudges the cursor (toggles every 8 frames) */
const CURSOR_BOUNCE_FRAMES = 8;

const DLG_ORDER = [MEM.DLG_ORDER0, MEM.DLG_ORDER1, MEM.DLG_ORDER2] as const;

/** Display orders for three choices: row → logical choice. Index 0 is the identity. */
const THREE_CHOICE_ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const;
const TWO_CHOICE_SWAPPED = [1, 0] as const;

// ---------------------------------------------------------------------------
// Assembly helpers
// ---------------------------------------------------------------------------

/** HL = text position of the display row whose DLG_ORDER entry equals B */
function buildLoadChoicePositionForLogicalChoice(name: string): Op[] {
  return switchCases(
    CHOICE_TEXT_POSITIONS.map((position) => [ld_rr_nn('hl', u16(tilemapAddr(position)))]),
    { name, compare: (row) => [ld_a_nn(at(DLG_ORDER, row)), cp_r('b')] },
  );
}

/** A = DLG_ORDER[A]: map a display row (cursor) to its logical choice */
function buildLoadLogicalChoiceFromCursor(name: string): Op[] {
  return switchCases(
    DLG_ORDER.map((addr) => [ld_a_nn(addr)]),
    { name },
  );
}

/** Write a display order to DLG_ORDER, skipping rows already at their identity value. */
function writeChoiceOrder(order: readonly number[]): Op[] {
  return order.flatMap((choice, row) => {
    if (choice === row) return [];
    return [choice === 0 ? xor_r('a') : ld_r_n('a', u8(choice)), ld_nn_a(at(DLG_ORDER, row))];
  });
}

/** Shuffle the display order of the current node's choices using DIV as entropy. */
function buildInitChoiceOrder(): Op[] {
  const done = new Label('dlg_order_done');
  return [
    // Identity order: row i shows choice i
    xor_r('a'),
    ld_nn_a(MEM.DLG_ORDER0),
    inc_r('a'),
    ld_nn_a(MEM.DLG_ORDER1),
    inc_r('a'),
    ld_nn_a(MEM.DLG_ORDER2),

    ld_a_nn(MEM.DLG_CHOICE_CNT),
    cp_n(u8(2)),
    jr_cc('z', DLG_ORDER_TWO),
    cp_n(u8(3)),
    jr_cc('z', DLG_ORDER_THREE),
    jp(done),

    // Two choices: swap on an odd DIV
    label(DLG_ORDER_TWO),
    ldh_a_n(HW.DIV),
    and_n(u8(1)),
    jr_cc('z', done),
    ...writeChoiceOrder(TWO_CHOICE_SWAPPED),
    jp(done),

    // Three choices: DIV & 7, folded into 0..5, picks a permutation
    label(DLG_ORDER_THREE),
    ldh_a_n(HW.DIV),
    and_n(u8(7)),
    cp_n(u8(THREE_CHOICE_ORDERS.length)),
    jr_cc('c', DLG_ORDER_THREE_DISPATCH),
    sub_n(u8(THREE_CHOICE_ORDERS.length)),
    label(DLG_ORDER_THREE_DISPATCH),
    ...switchCases(THREE_CHOICE_ORDERS.map(writeChoiceOrder), {
      name: 'dlg_order_perm',
      branch: 'jr',
      exit: 'jp',
    }),

    label(done),
  ];
}

/** One textbox row: left tile, interior (fill tile or cleared), right tile */
function buildTextboxRow(row: number, left: number, fill: number | 'clear', right: number): Op[] {
  const interior = SCREEN_COLS - 2;
  return [
    ld_rr_nn('hl', u16(tilemapAddr(row, 0))),
    ld_r_n('a', u8(left)),
    ldi_hl_a(),
    fill === 'clear' ? xor_r('a') : ld_r_n('a', u8(fill)),
    ld_r_n('b', u8(interior)),
    call(FILL_TILES),
    ld_r_n('a', u8(right)),
    ldi_hl_a(),
  ];
}

/** Subroutine dlg_draw_box: draw the whole textbox, border and blank interior (LCD off) */
function buildDrawTextbox(): Op[] {
  const bottomRow = BOX_TOP_ROW + BOX_ROWS - 1;
  const middleRows = Array.from({ length: BOX_ROWS - 2 }, (_, i) => BOX_TOP_ROW + 1 + i);
  return [
    label(DLG_DRAW_BOX),
    ...buildTextboxRow(BOX_TOP_ROW, BORDER_TL, BORDER_TOP, BORDER_TR),
    ...middleRows.flatMap((row) => buildTextboxRow(row, BORDER_LEFT, 'clear', BORDER_RIGHT)),
    ...buildTextboxRow(bottomRow, BORDER_BL, BORDER_BOTTOM, BORDER_BR),
    ret(),
  ];
}

const BOX_INTERIOR_COLS = SCREEN_COLS - 2;

/** Subroutine dlg_clear_box: blank the textbox interior with the LCD on (via vram_put) */
function buildClearTextbox(): Op[] {
  return [
    label(DLG_CLEAR_BOX),
    ld_rr_nn('hl', u16(tilemapAddr(BOX_TOP_ROW + 1, 1))),
    ld_r_n('b', u8(BOX_ROWS - 2)),
    label(DLG_CLEAR_ROW),
    ld_r_n('c', u8(BOX_INTERIOR_COLS)),
    label(DLG_CLEAR_CELL),
    xor_r('a'),
    ...vramPut(),
    dec_r('c'),
    jr_cc('nz', DLG_CLEAR_CELL),
    // Skip to column 1 of the next row
    ld_r_r('a', 'l'),
    add_n(u8(32 - BOX_INTERIOR_COLS)),
    ld_r_r('l', 'a'),
    jr_cc('nc', DLG_CLEAR_NC),
    inc_r('h'),
    label(DLG_CLEAR_NC),
    dec_r('b'),
    jr_cc('nz', DLG_CLEAR_ROW),
    ret(),
  ];
}

// ---------------------------------------------------------------------------
// Assembly: dialogue engine subroutines
// ---------------------------------------------------------------------------

/**
 * Build the dialogue engine assembly subroutines.
 *
 * dlg_open_tree: DE = pointer to tree data. Opens node 0.
 * dlg_open_node: Opens node DLG_NODE_ID of the current tree.
 * dlg_update: Call each frame. When state returns to idle, check DLG_NODE_ID:
 *   END_OF_CONVERSATION = conversation over, else = next node to open.
 */
/**
 * Subroutine text_next: A = the next tile of the text at DLG_STR, expanding dictionary
 * codes (`base` and up, see text-codec.ts) through TEXT_STACK; TEXT_END comes through
 * as is. Advances DLG_STR. Preserves BC, DE, HL.
 */
export function buildTextNext(base: number): Op[] {
  return [
    label(TEXT_NEXT),
    push('bc'),
    push('de'),
    push('hl'),
    ld_a_nn(MEM.TEXT_SP),
    or_r('a'),
    jr_cc('z', TEXT_NEXT_RAW),
    // A right half waiting on the stack comes first
    dec_r('a'),
    ld_nn_a(MEM.TEXT_SP),
    ld_r_r('e', 'a'),
    ld_r_n('d', u8(0)),
    ld_rr_nn('hl', MEM.TEXT_STACK),
    add_hl_rr('de'),
    ld_r_r('a', 'hl_ptr'),
    jr(TEXT_NEXT_EXPAND),
    label(TEXT_NEXT_RAW),
    ...loadPointer('hl', MEM.DLG_STR_LO, MEM.DLG_STR_HI),
    ldi_a_hl(),
    ld_r_r('b', 'a'),
    ...storePointer('hl', MEM.DLG_STR_LO, MEM.DLG_STR_HI),
    ld_r_r('a', 'b'),
    label(TEXT_NEXT_EXPAND),
    cp_n(u8(base)),
    jr_cc('c', TEXT_NEXT_DONE), // a tile
    cp_n(u8(TEXT_END)),
    jr_cc('z', TEXT_NEXT_DONE),
    // A code: push its right half, go on with its left half
    sub_n(u8(base)),
    ld_r_r('l', 'a'),
    ld_r_n('h', u8(0)),
    add_hl_rr('hl'),
    ld_rr_nn('de', TEXT_DICT),
    add_hl_rr('de'),
    ldi_a_hl(),
    ld_r_r('b', 'a'), // left half
    ld_r_r('c', 'hl_ptr'), // right half
    ld_a_nn(MEM.TEXT_SP),
    ld_r_r('e', 'a'),
    inc_r('a'),
    ld_nn_a(MEM.TEXT_SP),
    ld_r_n('d', u8(0)),
    ld_rr_nn('hl', MEM.TEXT_STACK),
    add_hl_rr('de'),
    ld_r_r('hl_ptr', 'c'),
    ld_r_r('a', 'b'),
    jr(TEXT_NEXT_EXPAND),
    label(TEXT_NEXT_DONE),
    pop('hl'),
    pop('de'),
    pop('bc'),
    ret(),
  ];
}

export function buildDialogueEngine(): Op[] {
  return [
    // =================================================================
    // dlg_open — Start showing a dialogue node. DE = pointer to node data.
    // Clears the textbox (drawn at scene load) without turning the LCD off.
    // =================================================================
    label(DLG_OPEN),
    call(DLG_CLEAR_BOX),

    // Store node data pointer; no compressed text is half-read
    ...storePointer('de', MEM.DLG_STR_LO, MEM.DLG_STR_HI),
    ...zeroBytes(MEM.TEXT_SP),

    // Set VRAM write position to the start of the text area (inside border)
    ...storeByte(MEM.DLG_VRAM_LO, lo(tilemapAddr(TEXT_START))),
    ...storeByte(MEM.DLG_VRAM_HI, hi(tilemapAddr(TEXT_START))),

    // Init state
    ...storeByte(MEM.DLG_STATE, DialogueState.PRINTING),
    ...zeroBytes(MEM.DLG_CHAR_IDX),
    ...storeByte(MEM.DLG_DELAY, REVEAL_DELAY),
    ...zeroBytes(MEM.DLG_CURSOR, MEM.DLG_RESULT),

    ret(),

    // =================================================================
    // dlg_update — Called each frame. Dispatches based on dlg_state.
    // =================================================================
    label(DLG_UPDATE),
    call(NPC_UPDATE), // idle bob of the speaker
    call(ANIM_TICK), // animated backdrop tile
    ld_a_nn(MEM.DLG_STATE),
    cp_n(u8(DialogueState.IDLE)),
    ret_cc('z'),
    cp_n(u8(DialogueState.PRINTING)),
    jp_cc('z', DLG_DO_PRINT),
    cp_n(u8(DialogueState.WAITING)),
    jp_cc('z', DLG_DO_WAIT),
    cp_n(u8(DialogueState.CHOOSING)),
    jp(DLG_DO_CHOOSE),

    // =================================================================
    // dlg_do_print — Reveal one character per REVEAL_DELAY frames, or
    // FAST_REVEAL_CHARS every frame while B is held
    // =================================================================
    label(DLG_DO_PRINT),
    ld_a_nn(MEM.JOYPAD_CUR),
    and_n(u8(JOY.B)),
    jr_cc('z', DLG_PRINT_SLOW),
    ...Array.from({ length: FAST_REVEAL_CHARS - 1 }, () => [
      call(DLG_PRINT_CHAR),
      ld_a_nn(MEM.DLG_STATE),
      cp_n(u8(DialogueState.PRINTING)),
      ret_cc('nz'), // the text ended
    ]).flat(),
    jr(DLG_PRINT_CHAR),

    label(DLG_PRINT_SLOW),
    ...countDownOrReturn(MEM.DLG_DELAY),
    ...storeByte(MEM.DLG_DELAY, REVEAL_DELAY),

    label(DLG_PRINT_CHAR),
    // Read the next tile (expanding the compression) and advance the string pointer
    call(TEXT_NEXT),

    // Check for text terminator (not 0x00, because tile 0 = space)
    cp_n(u8(TEXT_END)),
    jr_cc('z', DLG_TEXT_DONE),

    // Write the tile at the VRAM cursor and advance it
    ld_r_r('b', 'a'),
    ...loadPointer('hl', MEM.DLG_VRAM_LO, MEM.DLG_VRAM_HI),
    ld_r_r('a', 'b'),
    ...vramPut(),
    ...storePointer('hl', MEM.DLG_VRAM_LO, MEM.DLG_VRAM_HI),
    // A soft blip for each letter (not for spaces)
    ld_r_r('a', 'b'),
    or_r('a'),
    ret_cc('z'),
    ...playSfx('blip'),
    ret(),

    // --- Text finished: read choice count and transition ---
    label(DLG_TEXT_DONE),
    // String pointer now points to choice_count byte
    ...loadPointer('hl', MEM.DLG_STR_LO, MEM.DLG_STR_HI),
    ldi_a_hl(), // A = choice count
    ld_nn_a(MEM.DLG_CHOICE_CNT),

    // HL now points to the next_node lookup table. Save this position.
    ...storePointer('hl', MEM.DLG_META0_LO, MEM.DLG_META0_HI),

    // Skip past the next_node table (choice_count bytes)
    ld_a_nn(MEM.DLG_CHOICE_CNT),
    ld_r_r('c', 'a'),
    ld_r_n('b', u8(0)),
    add_hl_rr('bc'),

    // Save pointer to first choice text
    ...storePointer('hl', MEM.DLG_STR_LO, MEM.DLG_STR_HI),

    // If 0 choices, go to wait-for-A mode
    ld_a_nn(MEM.DLG_CHOICE_CNT),
    cp_n(u8(0)),
    jr_cc('nz', DLG_SETUP_CHOICES),
    ...storeByte(MEM.DLG_STATE, DialogueState.WAITING),
    ret(),

    // --- Set up choices ---
    label(DLG_SETUP_CHOICES),
    ...storeByte(MEM.DLG_STATE, DialogueState.CHOOSING),
    ...buildInitChoiceOrder(),

    // Draw each choice on its shuffled row (DLG_STR walks through their texts)

    ld_a_nn(MEM.DLG_CHOICE_CNT),
    ld_r_r('c', 'a'), // C = remaining choices
    ld_r_n('b', u8(0)), // B = choice index

    label(DLG_DRAW_CHOICE_LOOP),
    // HL = text position of the display row showing logical choice B
    ...buildLoadChoicePositionForLogicalChoice('dlg_choice_pos'),

    // Copy the choice's tiles to [HL] until the text terminator
    label(DLG_CHOICE_CHAR),
    call(TEXT_NEXT),
    cp_n(u8(TEXT_END)),
    jr_cc('z', DLG_CHOICE_STR_DONE),
    ...vramPut(),
    jr(DLG_CHOICE_CHAR),

    label(DLG_CHOICE_STR_DONE),
    inc_r('b'), // next choice index
    dec_r('c'), // remaining--
    jr_cc('nz', DLG_DRAW_CHOICE_LOOP),

    // Cursor sprite on the first row
    ...zeroBytes(MEM.DLG_CURSOR, MEM.DLG_BOUNCE),
    call(DLG_DRAW_CURSOR),

    ret(),

    // =================================================================
    // dlg_do_wait — Wait for A button press, then set idle
    // =================================================================
    label(DLG_DO_WAIT),
    ld_a_nn(MEM.JOYPAD_NEW),
    and_n(u8(JOY.A)),
    ret_cc('z'), // not pressed
    // A pressed — close dialogue
    xor_r('a'),
    ld_nn_a(MEM.DLG_STATE), // state = idle
    ret(),

    // =================================================================
    // dlg_do_choose — Navigate choices with UP/DOWN, confirm with A
    // =================================================================
    label(DLG_DO_CHOOSE),
    // Bounce the cursor one pixel right every CURSOR_BOUNCE_FRAMES frames
    ld_a_nn(MEM.DLG_BOUNCE),
    inc_r('a'),
    ld_nn_a(MEM.DLG_BOUNCE),
    and_n(u8(CURSOR_BOUNCE_FRAMES)),
    ld_r_n('a', u8(CURSOR_X)),
    jr_cc('z', DLG_BOUNCE_SET),
    inc_r('a'),
    label(DLG_BOUNCE_SET),
    ld_nn_a(oamField(SPRITE_SLOT.cursor, 'x')),

    ld_a_nn(MEM.JOYPAD_NEW),

    // Check A button
    ld_r_r('b', 'a'), // save joypad in B
    and_n(u8(JOY.A)),
    jr_cc('nz', DLG_CONFIRM_CHOICE),

    // Check DOWN
    ld_r_r('a', 'b'),
    and_n(u8(JOY.DOWN)),
    jr_cc('nz', DLG_CURSOR_DOWN),

    // Check UP
    ld_r_r('a', 'b'),
    and_n(u8(JOY.UP)),
    jr_cc('nz', DLG_CURSOR_UP),

    ret(), // no relevant input

    // --- Move cursor down ---
    label(DLG_CURSOR_DOWN),
    // Increment cursor, wrap around
    ld_a_nn(MEM.DLG_CURSOR),
    inc_r('a'),
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.DLG_CHOICE_CNT),
    ld_r_r('c', 'a'), // C = choice count
    ld_r_r('a', 'b'),
    cp_r('c'),
    jr_cc('c', DLG_CURSOR_SAVE), // if cursor < count, no wrap
    xor_r('a'), // wrap to 0
    jr(DLG_CURSOR_SAVE),

    // --- Move cursor up ---
    label(DLG_CURSOR_UP),
    ld_a_nn(MEM.DLG_CURSOR),
    cp_n(u8(0)),
    jr_cc('nz', DLG_CURSOR_UP_DEC),
    // Wrap to last choice
    ld_a_nn(MEM.DLG_CHOICE_CNT),
    dec_r('a'),
    jr(DLG_CURSOR_SAVE),

    label(DLG_CURSOR_UP_DEC),
    ld_a_nn(MEM.DLG_CURSOR),
    dec_r('a'),

    label(DLG_CURSOR_SAVE),
    ld_nn_a(MEM.DLG_CURSOR),
    ...playSfx('cursor'),
    call(DLG_DRAW_CURSOR),
    ret(),

    // --- Confirm choice ---
    label(DLG_CONFIRM_CHOICE),
    ...playSfx('confirm'),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'y')), // hide the cursor
    ld_a_nn(MEM.DLG_CURSOR),
    ld_nn_a(MEM.DLG_RESULT),

    // Read next_node = table_base[logical_choice]
    ld_a_nn(MEM.DLG_CURSOR),
    ...buildLoadLogicalChoiceFromCursor('dlg_choice_logical'),
    ld_r_r('c', 'a'), // C = logical choice
    ld_a_nn(MEM.DLG_NODE_ID),
    ld_nn_a(MEM.DLG_FROM_NODE),

    ...loadPointer('hl', MEM.DLG_META0_LO, MEM.DLG_META0_HI),
    ld_r_n('b', u8(0)),
    add_hl_rr('bc'), // HL = table_base + logical_choice
    ldi_a_hl(),
    ld_r_r('b', 'a'), // B = raw next byte (bit 7 = bad answer)
    // Remember what was picked (bad flag | logical choice) for kana chances
    and_n(u8(BAD_CHOICE_FLAG)),
    or_r('c'),
    ld_nn_a(MEM.DLG_PICK),
    ld_r_r('a', 'b'),
    and_n(u8(0xff ^ BAD_CHOICE_FLAG)),
    cp_n(u8(NEXT_END)),
    jr_cc('nz', DLG_NEXT_STORE),
    ld_r_n('a', u8(END_OF_CONVERSATION)),
    label(DLG_NEXT_STORE),
    ld_nn_a(MEM.DLG_NODE_ID),

    // Rating: flagged = bad, first authored choice = good, anything else = ok.
    // good = +10 & regain a life, ok = no change, bad = -5 & lose a life
    ld_r_r('a', 'b'),
    and_n(u8(BAD_CHOICE_FLAG)),
    jr_cc('nz', DLG_BAD_CHOICE),
    ld_r_r('a', 'c'),
    cp_n(u8(0)),
    jr_cc('z', DLG_GOOD_CHOICE),
    ...buildClearDelta(), // ok: nothing changes
    jr(DLG_SCORE_DONE),

    label(DLG_GOOD_CHOICE),
    ...catFace(CAT_REACT, 'happy'),
    // Good: +10 score, +1 life (capped at MAX_LIVES)
    ...buildAddScore(10),
    ...buildSetDelta(DELTA_PLUS_10),
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(MAX_LIVES)),
    jr_cc('nc', DLG_SCORE_DONE), // already at max
    inc_r('a'),
    ld_nn_a(MEM.KANA_LIVES),
    jr(DLG_SCORE_DONE),

    label(DLG_BAD_CHOICE),
    ...catFace(CAT_REACT, 'sad'),
    // Bad: -5 score, -1 life (floor at 0)
    ...buildSubScore(5),
    ...buildSetDelta(DELTA_MINUS_5),
    ld_a_nn(MEM.KANA_LIVES),
    cp_n(u8(0)),
    jr_cc('z', DLG_SCORE_DONE), // already at 0
    dec_r('a'),
    ld_nn_a(MEM.KANA_LIVES),
    // If lives just hit 0, end conversation → skip to kana
    cp_n(u8(0)),
    jr_cc('nz', DLG_SCORE_DONE),
    ...storeByte(MEM.DLG_NODE_ID, END_OF_CONVERSATION),

    label(DLG_SCORE_DONE),
    ...zeroBytes(MEM.DLG_STATE), // idle
    ret(),

    // =================================================================
    // dlg_draw_cursor — Move the cursor sprite to the highlighted row
    // =================================================================
    label(DLG_DRAW_CURSOR),
    ld_a_nn(MEM.DLG_CURSOR),
    add_r('a'),
    add_r('a'),
    add_r('a'),
    add_r('a'), // A = cursor * 16 (choices are two tile rows apart)
    add_n(u8(CURSOR_Y)),
    ld_nn_a(oamField(SPRITE_SLOT.cursor, 'y')),
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'x'), CURSOR_X),
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'tile'), SPRITE_TILE.cursor),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'attr')),
    ret(),

    // =================================================================
    // dlg_open_tree — Start a dialogue tree. DE = pointer to tree data.
    // Stores tree base, sets node 0, opens the first node.
    // =================================================================
    label(DLG_OPEN_TREE),
    ...storePointer('de', MEM.DLG_TREE_LO, MEM.DLG_TREE_HI),
    ...zeroBytes(MEM.DLG_NODE_ID), // start at node 0
    // Fall through to dlg_open_node

    // =================================================================
    // dlg_open_node — Open the node at DLG_NODE_ID from the tree.
    // Looks up the offset table, computes ROM pointer, calls dlg_open.
    // =================================================================
    label(DLG_OPEN_NODE),
    call(NPC_SELECT), // show whoever speaks at this node
    ...loadPointer('hl', MEM.DLG_TREE_LO, MEM.DLG_TREE_HI),
    // HL = tree base. Skip node_count byte.
    inc_rr('hl'),
    // Offset table entry = base + 1 + node_id * 2
    ld_a_nn(MEM.DLG_NODE_ID),
    // Multiply by 2: shift left
    add_r('a'), // A = node_id * 2
    // Add A to HL (HL += A)
    ld_r_r('c', 'a'),
    ld_r_n('b', u8(0)),
    add_hl_rr('bc'), // HL = tree_base + 1 + node_id * 2
    // Read offset (16-bit LE)
    ldi_a_hl(), // lo byte
    ld_r_r('e', 'a'),
    ldi_a_hl(), // hi byte
    ld_r_r('d', 'a'),
    // DE = offset from tree start. Compute absolute: tree_base + offset
    ld_a_nn(MEM.DLG_TREE_LO),
    add_r('e'),
    ld_r_r('e', 'a'),
    ld_a_nn(MEM.DLG_TREE_HI),
    adc_r('d'),
    ld_r_r('d', 'a'),
    // DE = absolute ROM pointer to node data
    jp(DLG_OPEN),

    ...buildDrawTextbox(),
    ...buildClearTextbox(),
  ];
}
