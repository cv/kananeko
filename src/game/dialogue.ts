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

import {
  compare,
  dispatch,
  doWhile,
  ifEquals,
  ifNotEquals,
  ifThen,
  loop,
  repeat,
} from '../asm/flow';
import { HW, JOY } from '../asm/hardware';
import {
  copyByte,
  countDownOrReturn,
  incByte,
  loadPointer,
  storeByte,
  storePointer,
  switchCases,
  tableEntry,
  zeroBytes,
} from '../asm/macros';
import { type GameModule, gameModule } from '../asm/program';
import {
  adc,
  add,
  and,
  call,
  cp,
  db,
  dec,
  inc,
  invoke,
  jp,
  jr,
  label,
  ld,
  ldh,
  or,
  pop,
  push,
  ret,
  sub,
  xor,
} from '../asm/sm83';
import { Label, type Op, routine } from '../asm/types';
import { hi, lo } from '../asm/util';
import { catFace } from './cat';
import { BAD_CHOICE_FLAG, NEXT_END, TEXT_END } from './dialogue-data';
import type { Triple } from './fixed';
import { requireTile } from './font';
import { ifHeld, pressed } from './joypad';
import {
  buildAddScore,
  buildClearDelta,
  buildSetDelta,
  buildSubScore,
  DELTA_MINUS_5,
  DELTA_PLUS_10,
} from './kana-hud';
import {
  ANIM_TICK,
  CAT_REACT,
  DLG_DRAW_BOX,
  DLG_OPEN_NODE,
  DLG_OPEN_TREE,
  DLG_UPDATE,
  FILL_TILES,
  NPC_SELECT,
  NPC_UPDATE,
  TEXT_DICT,
  TEXT_NEXT,
} from './labels';
import { MEM } from './ram';
import { playSfx } from './sound';
import { OAM_X_OFFSET, OAM_Y_OFFSET, oamField, SPRITE_SLOT, SPRITE_TILE } from './sprites';
import { DialogueState, END_OF_CONVERSATION, MAX_LIVES } from './state';
import type { TextCodec } from './text-codec';
import { SCREEN_COLS, tilemapAddr, tilePos, type TilePosition } from './tilemap';
import { vramPut } from './video';
const DLG_CLEAR_BOX = routine('dlg_clear_box', { clobbers: ['a', 'bc', 'hl'] });
const DLG_PRINT_CHAR = routine('dlg_print_char', { clobbers: ['a', 'bc', 'hl'] });
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
const FAST_REVEAL_CHARS = 3;

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
    CHOICE_TEXT_POSITIONS.map((position) => [ld('hl', tilemapAddr(position))]),
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
  const orderThree = new Label('dlg_order_three');
  const done = new Label('dlg_order_done');
  return [
    // Identity order: row i shows choice i
    xor('a'),
    ld([MEM.DLG_ORDER.at(0)], 'a'),
    inc('a'),
    ld([MEM.DLG_ORDER.at(1)], 'a'),
    inc('a'),
    ld([MEM.DLG_ORDER.at(2)], 'a'),

    ...ifNotEquals(MEM.DLG_CHOICE_CNT, 2, [cp(3), jr('z', orderThree), jp(done)]),
    ldh('a', [HW.DIV]),
    and(1),
    jr('z', done),
    ...writeChoiceOrder(TWO_CHOICE_SWAPPED),
    jp(done),

    // Three choices: DIV & 7, folded into 0..5, picks a permutation
    label(orderThree),
    ldh('a', [HW.DIV]),
    and(7),
    cp(THREE_CHOICE_ORDERS.length),
    ...ifThen('nc', [sub(THREE_CHOICE_ORDERS.length)]),
    ...switchCases(THREE_CHOICE_ORDERS.map(writeChoiceOrder)),

    label(done),
  ];
}

/** One textbox row: left tile, interior (fill tile or cleared), right tile */
function buildTextboxRow(row: number, left: number, fill: number | 'clear', right: number): Op[] {
  const interior = SCREEN_COLS - 2;
  return [
    ld('hl', tilemapAddr(row, 0)),
    ld('a', left),
    ld(['hl+'], 'a'),
    fill === 'clear' ? xor('a') : ld('a', fill),
    ...invoke(FILL_TILES, { b: interior, a: 'a', hl: 'hl' }),
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
    ld('hl', tilemapAddr(BOX_TOP_ROW + 1, 1)),
    ...repeat(BOX_ROWS - 2, [
      ...repeat(BOX_INTERIOR_COLS, [xor('a'), ...vramPut()], 'c'),
      // Skip to column 1 of the next row
      ld('a', 'l'),
      add(32 - BOX_INTERIOR_COLS),
      ld('l', 'a'),
      ...ifThen('c', [inc('h')]),
    ]),
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
  const nextDone = new Label('text_next_done');
  const expand = new Label('text_next_expand');
  return [
    label(TEXT_NEXT),
    push('bc'),
    push('de'),
    push('hl'),
    ld('a', [MEM.TEXT_SP]),
    or('a'),
    ...ifThen('nz', [
      dec('a'),
      ld([MEM.TEXT_SP], 'a'),
      ...tableEntry(MEM.TEXT_STACK.address),
      ld('a', ['hl']),
      jr(expand),
    ]),
    ...loadPointer('hl', MEM.DLG_STR),
    ld('a', ['hl+']),
    ld('b', 'a'),
    ...storePointer('hl', MEM.DLG_STR),
    ld('a', 'b'),
    label(expand),
    cp(base),
    jr('c', nextDone), // a tile
    cp(TEXT_END),
    jr('z', nextDone),
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
    jr(expand),
    label(nextDone),
    pop('hl'),
    pop('de'),
    pop('bc'),
    ret(),
  ];
}

function buildDialogueEngine(): Op[] {
  const scoreDone = new Label('dlg_score_done');
  const badChoice = new Label('dlg_bad_choice');
  const saveCursor = new Label('dlg_cursor_save');
  const cursorUp = new Label('dlg_cursor_up');
  const confirmChoice = new Label('dlg_confirm_choice');
  const textDone = new Label('dlg_text_done');
  const doChoose = new Label('dlg_do_choose');
  const doWait = new Label('dlg_do_wait');
  const openDialogue = new Label('dlg_open');
  return [
    // =================================================================
    // dlg_open — Start showing a dialogue node. DE = pointer to node data.
    // Clears the textbox (drawn at scene load) without turning the LCD off.
    // =================================================================
    label(openDialogue),
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
    ...dispatch(MEM.DLG_STATE, DialogueState, {
      IDLE: 'ret',
      PRINTING: 'continue',
      WAITING: doWait,
      CHOOSING: doChoose,
    }),
    ...ifHeld(JOY.B, [
      ...Array.from({ length: FAST_REVEAL_CHARS - 1 }, () => [
        call(DLG_PRINT_CHAR),
        ...compare(MEM.DLG_STATE, DialogueState.PRINTING),
        ret('nz'), // the text ended
      ]).flat(),
      jr(DLG_PRINT_CHAR),
    ]),
    ...countDownOrReturn(MEM.DLG_DELAY),
    ...storeByte(MEM.DLG_DELAY, REVEAL_DELAY),

    label(DLG_PRINT_CHAR),
    // Read the next tile (expanding the compression) and advance the string pointer
    call(TEXT_NEXT),

    // Check for text terminator (not 0x00, because tile 0 = space)
    cp(TEXT_END),
    jr('z', textDone),

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
    label(textDone),
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
    ...ifEquals(MEM.DLG_CHOICE_CNT, 0, [...storeByte(MEM.DLG_STATE, DialogueState.WAITING), ret()]),
    ...storeByte(MEM.DLG_STATE, DialogueState.CHOOSING),
    ...buildInitChoiceOrder(),

    // Draw each choice on its shuffled row (DLG_STR walks through their texts)

    ld('a', [MEM.DLG_CHOICE_CNT]),
    ld('c', 'a'), // C = remaining choices
    ld('b', 0), // B = choice index

    ...doWhile('nz', [
      ...buildLoadChoicePositionForLogicalChoice(),

      // Copy the choice's tiles to [HL] until the text terminator
      ...loop((again, done) => [
        call(TEXT_NEXT),
        cp(TEXT_END),
        jr('z', done),
        ...vramPut(),
        jr(again),
      ]),
      inc('b'), // next choice index
      dec('c'),
    ]),

    // Cursor sprite on the first row
    ...zeroBytes(MEM.DLG_CURSOR, MEM.DLG_BOUNCE),
    call(DLG_DRAW_CURSOR),

    ret(),

    // =================================================================
    // dlg_do_wait — Wait for A button press, then set idle
    // =================================================================
    label(doWait),
    ...pressed(JOY.A),
    ret('z'),
    // A pressed — close dialogue
    xor('a'),
    ld([MEM.DLG_STATE], 'a'), // state = idle
    ret(),

    // =================================================================
    // dlg_do_choose — Navigate choices with UP/DOWN, confirm with A
    // =================================================================
    label(doChoose),
    // Bounce the cursor one pixel right every CURSOR_BOUNCE_FRAMES frames
    ...incByte(MEM.DLG_BOUNCE),
    and(CURSOR_BOUNCE_FRAMES),
    ld('a', CURSOR_X),
    ...ifThen('nz', [inc('a')]),
    ld([oamField(SPRITE_SLOT.cursor, 'x')], 'a'),

    ld('a', [MEM.JOYPAD_NEW]),

    // Check A button
    ld('b', 'a'), // save joypad in B
    and(JOY.A),
    jr('nz', confirmChoice),

    // Check DOWN
    ld('a', 'b'),
    and(JOY.DOWN),
    ...ifThen('z', [ld('a', 'b'), and(JOY.UP), jr('nz', cursorUp), ret()]),
    // Increment cursor, wrap around
    ld('a', [MEM.DLG_CURSOR]),
    inc('a'),
    ld('b', 'a'),
    ld('a', [MEM.DLG_CHOICE_CNT]),
    ld('c', 'a'), // C = choice count
    ld('a', 'b'),
    cp('c'),
    jr('c', saveCursor), // if cursor < count, no wrap
    xor('a'), // wrap to 0
    jr(saveCursor),

    // --- Move cursor up ---
    label(cursorUp),
    ...ifEquals(MEM.DLG_CURSOR, 0, [ld('a', [MEM.DLG_CHOICE_CNT]), dec('a'), jr(saveCursor)]),
    ld('a', [MEM.DLG_CURSOR]),
    dec('a'),

    label(saveCursor),
    ld([MEM.DLG_CURSOR], 'a'),
    ...playSfx('cursor'),
    call(DLG_DRAW_CURSOR),
    ret(),

    // --- Confirm choice ---
    label(confirmChoice),
    ...playSfx('confirm'),
    ...zeroBytes(oamField(SPRITE_SLOT.cursor, 'y')), // hide the cursor
    ...copyByte(MEM.DLG_RESULT, MEM.DLG_CURSOR),

    // Read next_node = table_base[logical_choice]
    ld('a', [MEM.DLG_CURSOR]),
    ...buildLoadLogicalChoiceFromCursor(),
    ld('c', 'a'), // C = logical choice
    ...copyByte(MEM.DLG_FROM_NODE, MEM.DLG_NODE_ID),

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
    ...ifThen('z', [ld('a', END_OF_CONVERSATION)]),
    ld([MEM.DLG_NODE_ID], 'a'),

    // Rating: flagged = bad, first authored choice = good, anything else = ok.
    // good = +10 & regain a life, ok = no change, bad = -5 & lose a life
    ld('a', 'b'),
    and(BAD_CHOICE_FLAG),
    jr('nz', badChoice),
    ld('a', 'c'),
    or('a'),
    ...ifThen('nz', [
      ...buildClearDelta(), // ok: nothing changes
      jr(scoreDone),
    ]),
    ...catFace(CAT_REACT, 'happy'),
    // Good: +10 score, +1 life (capped at MAX_LIVES)
    ...buildAddScore(10),
    ...buildSetDelta(DELTA_PLUS_10),
    ...compare(MEM.KANA_LIVES, MAX_LIVES),
    jr('nc', scoreDone), // already at max
    inc('a'),
    ld([MEM.KANA_LIVES], 'a'),
    jr(scoreDone),

    label(badChoice),
    ...catFace(CAT_REACT, 'sad'),
    // Bad: -5 score, -1 life (floor at 0)
    ...buildSubScore(5),
    ...buildSetDelta(DELTA_MINUS_5),
    ...compare(MEM.KANA_LIVES, 0),
    jr('z', scoreDone), // already at 0
    dec('a'),
    ld([MEM.KANA_LIVES], 'a'),
    // If lives just hit 0 (DEC set Z), end conversation → skip to kana
    jr('nz', scoreDone),
    ...storeByte(MEM.DLG_NODE_ID, END_OF_CONVERSATION),

    label(scoreDone),
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
    jp(openDialogue),

    ...buildDrawTextbox(),
    ...buildClearTextbox(),
  ];
}

/** The dialogue engine, for text compressed with a dictionary whose codes start at \`codeBase\` */
/** The dialogue engine, and the dictionary of the text's compression `codec` */
export function dialogueModule(codec: () => TextCodec): GameModule {
  return gameModule({
    name: 'dialogue',
    code: () => [...buildDialogueEngine(), ...buildTextNext(codec().base)],
    // two bytes per code (text-codec.ts)
    data: () => [label(TEXT_DICT), db(codec().pairs.flat())],
  });
}
