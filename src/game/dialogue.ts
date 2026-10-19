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
  adc,
  add,
  and,
  call,
  cp,
  dec,
  inc,
  jp,
  jr,
  label,
  ld,
  ldh,
  ret,
  sub,
  or,
  pop,
  push,
  xor,
} from '../asm/sm83';
import { type Op, u16, Label, routine } from '../asm/types';
import { hi, lo } from '../asm/util';
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
const DLG_CLEAR_BOX = routine('dlg_clear_box', { clobbers: ['a', 'bc', 'hl'] });
const DLG_CLEAR_ROW = new Label('dlg_clear_row');
const DLG_CLEAR_CELL = new Label('dlg_clear_cell');
const DLG_CLEAR_NC = new Label('dlg_clear_nc');
const TEXT_NEXT_RAW = new Label('text_next_raw');
const TEXT_NEXT_EXPAND = new Label('text_next_expand');
const TEXT_NEXT_DONE = new Label('text_next_done');
const DLG_OPEN = new Label('dlg_open');
const DLG_DO_PRINT = new Label('dlg_do_print');
const DLG_PRINT_SLOW = new Label('dlg_print_slow');
const DLG_PRINT_CHAR = routine('dlg_print_char', { clobbers: ['a', 'bc', 'hl'] });
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
const DLG_DRAW_CURSOR = routine('dlg_draw_cursor', { clobbers: ['a'] });

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
function buildLoadChoicePositionForLogicalChoice(): Op[] {
  return switchCases(
    CHOICE_TEXT_POSITIONS.map((position) => [ld('hl', u16(tilemapAddr(position)))]),
    { compare: (row) => [ld('a', [MEM.DLG_ORDER.at(row)]), cp('b')] },
  );
}

/** A = DLG_ORDER[A]: map a display row (cursor) to its logical choice */
function buildLoadLogicalChoiceFromCursor(): Op[] {
  return switchCases(
    Array.from({ length: MEM.DLG_ORDER.size }, (_, row) => [ld('a', [MEM.DLG_ORDER.at(row)])]),
  );
}

/** Write a display order to DLG_ORDER, skipping rows already at their identity value. */
function writeChoiceOrder(order: readonly number[]): Op[] {
  return order.flatMap((choice, row) => {
    if (choice === row) return [];
    return [choice === 0 ? xor('a') : ld('a', choice), ld([MEM.DLG_ORDER.at(row)], 'a')];
  });
}

/** Shuffle the display order of the current node's choices using DIV as entropy. */
function buildInitChoiceOrder(): Op[] {
  const done = new Label('dlg_order_done');
  return [
    // Identity order: row i shows choice i
    xor('a'),
    ld([MEM.DLG_ORDER.at(0)], 'a'),
    inc('a'),
    ld([MEM.DLG_ORDER.at(1)], 'a'),
    inc('a'),
    ld([MEM.DLG_ORDER.at(2)], 'a'),

    ld('a', [MEM.DLG_CHOICE_CNT]),
    cp(2),
    jr('z', DLG_ORDER_TWO),
    cp(3),
    jr('z', DLG_ORDER_THREE),
    jp(done),

    // Two choices: swap on an odd DIV
    label(DLG_ORDER_TWO),
    ldh('a', [HW.DIV]),
    and(1),
    jr('z', done),
    ...writeChoiceOrder(TWO_CHOICE_SWAPPED),
    jp(done),

    // Three choices: DIV & 7, folded into 0..5, picks a permutation
    label(DLG_ORDER_THREE),
    ldh('a', [HW.DIV]),
    and(7),
    cp(THREE_CHOICE_ORDERS.length),
    jr('c', DLG_ORDER_THREE_DISPATCH),
    sub(THREE_CHOICE_ORDERS.length),
    label(DLG_ORDER_THREE_DISPATCH),
    ...switchCases(THREE_CHOICE_ORDERS.map(writeChoiceOrder)),

    label(done),
  ];
}

/** One textbox row: left tile, interior (fill tile or cleared), right tile */
function buildTextboxRow(row: number, left: number, fill: number | 'clear', right: number): Op[] {
  const interior = SCREEN_COLS - 2;
  return [
    ld('hl', u16(tilemapAddr(row, 0))),
    ld('a', left),
    ld(['hl+'], 'a'),
    fill === 'clear' ? xor('a') : ld('a', fill),
    ld('b', interior),
    call(FILL_TILES),
    ld('a', right),
    ld(['hl+'], 'a'),
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
    ld('hl', u16(tilemapAddr(BOX_TOP_ROW + 1, 1))),
    ld('b', BOX_ROWS - 2),
    label(DLG_CLEAR_ROW),
    ld('c', BOX_INTERIOR_COLS),
    label(DLG_CLEAR_CELL),
    xor('a'),
    ...vramPut(),
    dec('c'),
    jr('nz', DLG_CLEAR_CELL),
    // Skip to column 1 of the next row
    ld('a', 'l'),
    add(32 - BOX_INTERIOR_COLS),
    ld('l', 'a'),
    jr('nc', DLG_CLEAR_NC),
    inc('h'),
    label(DLG_CLEAR_NC),
    dec('b'),
    jr('nz', DLG_CLEAR_ROW),
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
    ld('a', [MEM.TEXT_SP]),
    or('a'),
    jr('z', TEXT_NEXT_RAW),
    // A right half waiting on the stack comes first
    dec('a'),
    ld([MEM.TEXT_SP], 'a'),
    ld('e', 'a'),
    ld('d', 0),
    ld('hl', MEM.TEXT_STACK.address),
    add('hl', 'de'),
    ld('a', ['hl']),
    jr(TEXT_NEXT_EXPAND),
    label(TEXT_NEXT_RAW),
    ...loadPointer('hl', MEM.DLG_STR),
    ld('a', ['hl+']),
    ld('b', 'a'),
    ...storePointer('hl', MEM.DLG_STR),
    ld('a', 'b'),
    label(TEXT_NEXT_EXPAND),
    cp(base),
    jr('c', TEXT_NEXT_DONE), // a tile
    cp(TEXT_END),
    jr('z', TEXT_NEXT_DONE),
    // A code: push its right half, go on with its left half
    sub(base),
    ld('l', 'a'),
    ld('h', 0),
    add('hl', 'hl'),
    ld('de', TEXT_DICT),
    add('hl', 'de'),
    ld('a', ['hl+']),
    ld('b', 'a'), // left half
    ld('c', ['hl']), // right half
    ld('a', [MEM.TEXT_SP]),
    ld('e', 'a'),
    inc('a'),
    ld([MEM.TEXT_SP], 'a'),
    ld('d', 0),
    ld('hl', MEM.TEXT_STACK.address),
    add('hl', 'de'),
    ld(['hl'], 'c'),
    ld('a', 'b'),
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
    ...storePointer('de', MEM.DLG_STR),
    ...zeroBytes(MEM.TEXT_SP),

    // Set VRAM write position to the start of the text area (inside border)
    ...storeByte(MEM.DLG_VRAM.lo, lo(tilemapAddr(TEXT_START))),
    ...storeByte(MEM.DLG_VRAM.hi, hi(tilemapAddr(TEXT_START))),

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
    ld('a', [MEM.DLG_STATE]),
    cp(DialogueState.IDLE),
    ret('z'),
    cp(DialogueState.PRINTING),
    jp('z', DLG_DO_PRINT),
    cp(DialogueState.WAITING),
    jp('z', DLG_DO_WAIT),
    cp(DialogueState.CHOOSING),
    jp(DLG_DO_CHOOSE),

    // =================================================================
    // dlg_do_print — Reveal one character per REVEAL_DELAY frames, or
    // FAST_REVEAL_CHARS every frame while B is held
    // =================================================================
    label(DLG_DO_PRINT),
    ld('a', [MEM.JOYPAD_CUR]),
    and(JOY.B),
    jr('z', DLG_PRINT_SLOW),
    ...Array.from({ length: FAST_REVEAL_CHARS - 1 }, () => [
      call(DLG_PRINT_CHAR),
      ld('a', [MEM.DLG_STATE]),
      cp(DialogueState.PRINTING),
      ret('nz'), // the text ended
    ]).flat(),
    jr(DLG_PRINT_CHAR),

    label(DLG_PRINT_SLOW),
    ...countDownOrReturn(MEM.DLG_DELAY),
    ...storeByte(MEM.DLG_DELAY, REVEAL_DELAY),

    label(DLG_PRINT_CHAR),
    // Read the next tile (expanding the compression) and advance the string pointer
    call(TEXT_NEXT),

    // Check for text terminator (not 0x00, because tile 0 = space)
    cp(TEXT_END),
    jr('z', DLG_TEXT_DONE),

    // Write the tile at the VRAM cursor and advance it
    ld('b', 'a'),
    ...loadPointer('hl', MEM.DLG_VRAM),
    ld('a', 'b'),
    ...vramPut(),
    ...storePointer('hl', MEM.DLG_VRAM),
    // A soft blip for each letter (not for spaces)
    ld('a', 'b'),
    or('a'),
    ret('z'),
    ...playSfx('blip'),
    ret(),

    // --- Text finished: read choice count and transition ---
    label(DLG_TEXT_DONE),
    // String pointer now points to choice_count byte
    ...loadPointer('hl', MEM.DLG_STR),
    ld('a', ['hl+']), // A = choice count
    ld([MEM.DLG_CHOICE_CNT], 'a'),

    // HL now points to the next_node lookup table. Save this position.
    ...storePointer('hl', MEM.DLG_META0),

    // Skip past the next_node table (choice_count bytes)
    ld('a', [MEM.DLG_CHOICE_CNT]),
    ld('c', 'a'),
    ld('b', 0),
    add('hl', 'bc'),

    // Save pointer to first choice text
    ...storePointer('hl', MEM.DLG_STR),

    // If 0 choices, go to wait-for-A mode
    ld('a', [MEM.DLG_CHOICE_CNT]),
    cp(0),
    jr('nz', DLG_SETUP_CHOICES),
    ...storeByte(MEM.DLG_STATE, DialogueState.WAITING),
    ret(),

    // --- Set up choices ---
    label(DLG_SETUP_CHOICES),
    ...storeByte(MEM.DLG_STATE, DialogueState.CHOOSING),
    ...buildInitChoiceOrder(),

    // Draw each choice on its shuffled row (DLG_STR walks through their texts)

    ld('a', [MEM.DLG_CHOICE_CNT]),
    ld('c', 'a'), // C = remaining choices
    ld('b', 0), // B = choice index

    label(DLG_DRAW_CHOICE_LOOP),
    // HL = text position of the display row showing logical choice B
    ...buildLoadChoicePositionForLogicalChoice(),

    // Copy the choice's tiles to [HL] until the text terminator
    label(DLG_CHOICE_CHAR),
    call(TEXT_NEXT),
    cp(TEXT_END),
    jr('z', DLG_CHOICE_STR_DONE),
    ...vramPut(),
    jr(DLG_CHOICE_CHAR),

    label(DLG_CHOICE_STR_DONE),
    inc('b'), // next choice index
    dec('c'), // remaining--
    jr('nz', DLG_DRAW_CHOICE_LOOP),

    // Cursor sprite on the first row
    ...zeroBytes(MEM.DLG_CURSOR, MEM.DLG_BOUNCE),
    call(DLG_DRAW_CURSOR),

    ret(),

    // =================================================================
    // dlg_do_wait — Wait for A button press, then set idle
    // =================================================================
    label(DLG_DO_WAIT),
    ld('a', [MEM.JOYPAD_NEW]),
    and(JOY.A),
    ret('z'), // not pressed
    // A pressed — close dialogue
    xor('a'),
    ld([MEM.DLG_STATE], 'a'), // state = idle
    ret(),

    // =================================================================
    // dlg_do_choose — Navigate choices with UP/DOWN, confirm with A
    // =================================================================
    label(DLG_DO_CHOOSE),
    // Bounce the cursor one pixel right every CURSOR_BOUNCE_FRAMES frames
    ld('a', [MEM.DLG_BOUNCE]),
    inc('a'),
    ld([MEM.DLG_BOUNCE], 'a'),
    and(CURSOR_BOUNCE_FRAMES),
    ld('a', CURSOR_X),
    jr('z', DLG_BOUNCE_SET),
    inc('a'),
    label(DLG_BOUNCE_SET),
    ld([oamField(SPRITE_SLOT.cursor, 'x')], 'a'),

    ld('a', [MEM.JOYPAD_NEW]),

    // Check A button
    ld('b', 'a'), // save joypad in B
    and(JOY.A),
    jr('nz', DLG_CONFIRM_CHOICE),

    // Check DOWN
    ld('a', 'b'),
    and(JOY.DOWN),
    jr('nz', DLG_CURSOR_DOWN),

    // Check UP
    ld('a', 'b'),
    and(JOY.UP),
    jr('nz', DLG_CURSOR_UP),

    ret(), // no relevant input

    // --- Move cursor down ---
    label(DLG_CURSOR_DOWN),
    // Increment cursor, wrap around
    ld('a', [MEM.DLG_CURSOR]),
    inc('a'),
    ld('b', 'a'),
    ld('a', [MEM.DLG_CHOICE_CNT]),
    ld('c', 'a'), // C = choice count
    ld('a', 'b'),
    cp('c'),
    jr('c', DLG_CURSOR_SAVE), // if cursor < count, no wrap
    xor('a'), // wrap to 0
    jr(DLG_CURSOR_SAVE),

    // --- Move cursor up ---
    label(DLG_CURSOR_UP),
    ld('a', [MEM.DLG_CURSOR]),
    cp(0),
    jr('nz', DLG_CURSOR_UP_DEC),
    // Wrap to last choice
    ld('a', [MEM.DLG_CHOICE_CNT]),
    dec('a'),
    jr(DLG_CURSOR_SAVE),

    label(DLG_CURSOR_UP_DEC),
    ld('a', [MEM.DLG_CURSOR]),
    dec('a'),

    label(DLG_CURSOR_SAVE),
    ld([MEM.DLG_CURSOR], 'a'),
    ...playSfx('cursor'),
    call(DLG_DRAW_CURSOR),
    ret(),

    // --- Confirm choice ---
    label(DLG_CONFIRM_CHOICE),
    ...playSfx('confirm'),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'y')), // hide the cursor
    ld('a', [MEM.DLG_CURSOR]),
    ld([MEM.DLG_RESULT], 'a'),

    // Read next_node = table_base[logical_choice]
    ld('a', [MEM.DLG_CURSOR]),
    ...buildLoadLogicalChoiceFromCursor(),
    ld('c', 'a'), // C = logical choice
    ld('a', [MEM.DLG_NODE_ID]),
    ld([MEM.DLG_FROM_NODE], 'a'),

    ...loadPointer('hl', MEM.DLG_META0),
    ld('b', 0),
    add('hl', 'bc'), // HL = table_base + logical_choice
    ld('a', ['hl+']),
    ld('b', 'a'), // B = raw next byte (bit 7 = bad answer)
    // Remember what was picked (bad flag | logical choice) for kana chances
    and(BAD_CHOICE_FLAG),
    or('c'),
    ld([MEM.DLG_PICK], 'a'),
    ld('a', 'b'),
    and(0xff ^ BAD_CHOICE_FLAG),
    cp(NEXT_END),
    jr('nz', DLG_NEXT_STORE),
    ld('a', END_OF_CONVERSATION),
    label(DLG_NEXT_STORE),
    ld([MEM.DLG_NODE_ID], 'a'),

    // Rating: flagged = bad, first authored choice = good, anything else = ok.
    // good = +10 & regain a life, ok = no change, bad = -5 & lose a life
    ld('a', 'b'),
    and(BAD_CHOICE_FLAG),
    jr('nz', DLG_BAD_CHOICE),
    ld('a', 'c'),
    cp(0),
    jr('z', DLG_GOOD_CHOICE),
    ...buildClearDelta(), // ok: nothing changes
    jr(DLG_SCORE_DONE),

    label(DLG_GOOD_CHOICE),
    ...catFace(CAT_REACT, 'happy'),
    // Good: +10 score, +1 life (capped at MAX_LIVES)
    ...buildAddScore(10),
    ...buildSetDelta(DELTA_PLUS_10),
    ld('a', [MEM.KANA_LIVES]),
    cp(MAX_LIVES),
    jr('nc', DLG_SCORE_DONE), // already at max
    inc('a'),
    ld([MEM.KANA_LIVES], 'a'),
    jr(DLG_SCORE_DONE),

    label(DLG_BAD_CHOICE),
    ...catFace(CAT_REACT, 'sad'),
    // Bad: -5 score, -1 life (floor at 0)
    ...buildSubScore(5),
    ...buildSetDelta(DELTA_MINUS_5),
    ld('a', [MEM.KANA_LIVES]),
    cp(0),
    jr('z', DLG_SCORE_DONE), // already at 0
    dec('a'),
    ld([MEM.KANA_LIVES], 'a'),
    // If lives just hit 0, end conversation → skip to kana
    cp(0),
    jr('nz', DLG_SCORE_DONE),
    ...storeByte(MEM.DLG_NODE_ID, END_OF_CONVERSATION),

    label(DLG_SCORE_DONE),
    ...zeroBytes(MEM.DLG_STATE), // idle
    ret(),

    // =================================================================
    // dlg_draw_cursor — Move the cursor sprite to the highlighted row
    // =================================================================
    label(DLG_DRAW_CURSOR),
    ld('a', [MEM.DLG_CURSOR]),
    add('a'),
    add('a'),
    add('a'),
    add('a'), // A = cursor * 16 (choices are two tile rows apart)
    add(CURSOR_Y),
    ld([oamField(SPRITE_SLOT.cursor, 'y')], 'a'),
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'x'), CURSOR_X),
    ...storeByte(oamField(SPRITE_SLOT.cursor, 'tile'), SPRITE_TILE.cursor),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'attr')),
    ret(),

    // =================================================================
    // dlg_open_tree — Start a dialogue tree. DE = pointer to tree data.
    // Stores tree base, sets node 0, opens the first node.
    // =================================================================
    label(DLG_OPEN_TREE),
    ...storePointer('de', MEM.DLG_TREE),
    ...zeroBytes(MEM.DLG_NODE_ID), // start at node 0
    // Fall through to dlg_open_node

    // =================================================================
    // dlg_open_node — Open the node at DLG_NODE_ID from the tree.
    // Looks up the offset table, computes ROM pointer, calls dlg_open.
    // =================================================================
    label(DLG_OPEN_NODE),
    call(NPC_SELECT), // show whoever speaks at this node
    ...loadPointer('hl', MEM.DLG_TREE),
    // HL = tree base. Skip node_count byte.
    inc('hl'),
    // Offset table entry = base + 1 + node_id * 2
    ld('a', [MEM.DLG_NODE_ID]),
    // Multiply by 2: shift left
    add('a'), // A = node_id * 2
    // Add A to HL (HL += A)
    ld('c', 'a'),
    ld('b', 0),
    add('hl', 'bc'), // HL = tree_base + 1 + node_id * 2
    // Read offset (16-bit LE)
    ld('a', ['hl+']), // lo byte
    ld('e', 'a'),
    ld('a', ['hl+']), // hi byte
    ld('d', 'a'),
    // DE = offset from tree start. Compute absolute: tree_base + offset
    ld('a', [MEM.DLG_TREE.lo]),
    add('e'),
    ld('e', 'a'),
    ld('a', [MEM.DLG_TREE.hi]),
    adc('d'),
    ld('d', 'a'),
    // DE = absolute ROM pointer to node data
    jp(DLG_OPEN),

    ...buildDrawTextbox(),
    ...buildClearTextbox(),
  ];
}
