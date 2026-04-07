/**
 * Dialogue engine for the Game Boy.
 *
 * Renders a text box at the bottom of the screen (rows 12-17),
 * reveals text character-by-character, presents response choices,
 * and handles cursor navigation with d-pad + A confirm.
 *
 * Supports branching dialogue trees. Each tree has:
 *   [node_count: u8]
 *   [offset_lo, offset_hi] × node_count   — offset table (from tree start)
 *   Per node:
 *     [tile_indices...] 0xFE             — NPC text (0xFE = text end sentinel)
 *     [choice_count: u8]
 *     [next_node × choice_count]          — compact lookup (0xFF = end conversation)
 *     [choice_text...] 0xFE              — choice 0 text
 *     [choice_text...] 0xFE              — choice 1 text
 *     ...
 */

import { type Op, ref, u8, u16 } from '../asm/types';
import {
  label,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ld_a_nn,
  ld_nn_a,
  ld_a_de,
  ldi_hl_a,
  ldi_a_hl,
  ldh_a_n,
  ldh_n_a,
  xor_r,
  and_n,
  cp_n,
  cp_r,
  add_r,
  add_n,
  adc_n,
  sub_n,
  sbc_n,
  adc_r,
  add_hl_rr,
  inc_r,
  inc_rr,
  dec_r,
  jr,
  jr_cc,
  jp,
  jp_cc,
  call,
  ret,
  ret_cc,
} from '../asm/ops';
import { HW, JOY, LCDC, MEM } from '../asm/hardware';
import { requireTile, textToTiles } from './font';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const BOX_TOP_ROW = 11;
const BOX_ROWS = 7; // rows 11-17
const TEXT_ROW_1 = 12;
const CHOICE_START_ROW = 14;
const MAP_COLS = 32;
const SCREEN_COLS = 20;
const REVEAL_DELAY = 3; // frames between each character reveal

// Tile indices for border characters
const BORDER_TL = requireTile('┌');
const BORDER_TR = requireTile('┐');
const BORDER_BL = requireTile('└');
const BORDER_BR = requireTile('┘');
const BORDER_H = requireTile('─');
const BORDER_V = requireTile('│');
const CURSOR_TILE = requireTile('▶');

function tilemapAddr(row: number, col: number): number {
  return 0x9800 + row * MAP_COLS + col;
}

// ---------------------------------------------------------------------------
// Dialogue data types & encoder
// ---------------------------------------------------------------------------

export interface DialogueNode {
  text: string;
  choices: {
    text: string;
    next: number | null; // next node index, null = end conversation
    hint?: string; // shown briefly if this isn't the ideal response
  }[];
}

export type DialogueTree = DialogueNode[];

/**
 * Sentinel bytes — deliberately outside the TileIndex range (0x00-0xFD)
 * so they can never collide with valid tile data.
 */
const END_MARKER = 0xff; // end of conversation (node.next = null)
const TEXT_END = 0xfe; // end of text string (tile 0 = space, so 0x00 is valid content)

/**
 * Pack a dialogue tree into ROM data with an offset table for random access.
 *
 * Per node:
 *   [text_tiles...] 0xFE
 *   [choice_count]
 *   [next_node × choice_count]           ← compact lookup table
 *   [good_flag × choice_count]           ← 1 = good answer (+10), 0 = bad (-5)
 *   [choice_0_text...] 0xFE
 *   [choice_1_text...] 0xFE
 *   ...
 */
export function buildDialogueTree(tree: DialogueTree): Uint8Array {
  const nodeChunks: number[][] = [];
  for (const node of tree) {
    const chunk: number[] = [];
    // NPC text, null-terminated
    for (const tile of textToTiles(node.text)) {
      chunk.push(tile);
    }
    chunk.push(TEXT_END);

    // Choice count
    chunk.push(node.choices.length);

    // Next-node lookup table (one byte per choice, right after count)
    for (const choice of node.choices) {
      chunk.push(choice.next ?? END_MARKER);
    }

    // Good-answer flags (1 = no hint = good, 0 = has hint = bad)
    for (const choice of node.choices) {
      chunk.push(choice.hint === undefined ? 1 : 0);
    }

    // Choice texts, each null-terminated
    for (const choice of node.choices) {
      for (const tile of textToTiles(choice.text)) {
        chunk.push(tile);
      }
      chunk.push(TEXT_END);
    }

    nodeChunks.push(chunk);
  }

  // Header: node_count + offset table (2 bytes per node)
  const headerSize = 1 + tree.length * 2;
  const header: number[] = [tree.length];

  let currentOffset = headerSize;
  for (const chunk of nodeChunks) {
    header.push(currentOffset & 0xff);
    header.push((currentOffset >> 8) & 0xff);
    currentOffset += chunk.length;
  }

  const bytes = [...header];
  for (const chunk of nodeChunks) {
    for (const b of chunk) {
      bytes.push(b);
    }
  }

  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Assembly: text box border (drawn with LCD off)
// ---------------------------------------------------------------------------

function buildDrawTextbox(): Op[] {
  const ops: Op[] = [];

  // Top border row
  ops.push(ld_rr_nn('hl', u16(tilemapAddr(BOX_TOP_ROW, 0))));
  ops.push(ld_r_n('a', u8(BORDER_TL)));
  ops.push(ldi_hl_a());
  for (let i = 1; i < SCREEN_COLS - 1; i++) {
    ops.push(ld_r_n('a', u8(BORDER_H)));
    ops.push(ldi_hl_a());
  }
  ops.push(ld_r_n('a', u8(BORDER_TR)));
  ops.push(ldi_hl_a());

  // Middle rows (content area with side borders)
  for (let row = BOX_TOP_ROW + 1; row < BOX_TOP_ROW + BOX_ROWS - 1; row++) {
    ops.push(ld_rr_nn('hl', u16(tilemapAddr(row, 0))));
    ops.push(ld_r_n('a', u8(BORDER_V)));
    ops.push(ldi_hl_a());
    // Clear interior
    ops.push(xor_r('a'));
    for (let i = 1; i < SCREEN_COLS - 1; i++) {
      ops.push(ldi_hl_a());
    }
    ops.push(ld_r_n('a', u8(BORDER_V)));
    ops.push(ldi_hl_a());
  }

  // Bottom border row
  ops.push(ld_rr_nn('hl', u16(tilemapAddr(BOX_TOP_ROW + BOX_ROWS - 1, 0))));
  ops.push(ld_r_n('a', u8(BORDER_BL)));
  ops.push(ldi_hl_a());
  for (let i = 1; i < SCREEN_COLS - 1; i++) {
    ops.push(ld_r_n('a', u8(BORDER_H)));
    ops.push(ldi_hl_a());
  }
  ops.push(ld_r_n('a', u8(BORDER_BR)));
  ops.push(ldi_hl_a());

  return ops;
}

// ---------------------------------------------------------------------------
// Assembly: dialogue engine subroutines
// ---------------------------------------------------------------------------

/**
 * Build the dialogue engine assembly subroutines.
 *
 * dlg_open: DE = pointer to a node's data in ROM. Draws textbox, starts reveal.
 * dlg_update: Call each frame. When state returns to 0, check DLG_NODE_ID:
 *   0xFF = conversation over, else = next node to open.
 */
export function buildDialogueEngine(): Op[] {
  return [
    // =================================================================
    // dlg_open — Start showing a dialogue node. DE = pointer to node data.
    // Turns LCD off, draws textbox, turns LCD back on, sets up state.
    // =================================================================
    label('dlg_open'),

    // Wait for VBlank before turning LCD off
    label('dlg_open_vblank'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('dlg_open_vblank')),

    // Turn off LCD for bulk VRAM writes
    xor_r('a'),
    ldh_n_a(HW.LCDC),

    // Draw the textbox border
    ...buildDrawTextbox(),

    // Turn LCD back on
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    // Store node data pointer
    ld_r_r('a', 'e'),
    ld_nn_a(MEM.DLG_STR_LO),
    ld_r_r('a', 'd'),
    ld_nn_a(MEM.DLG_STR_HI),

    // Set VRAM write position to start of text row 1, col 2 (inside border)
    ld_r_n('a', u8(tilemapAddr(TEXT_ROW_1, 2) & 0xff)),
    ld_nn_a(MEM.DLG_VRAM_LO),
    ld_r_n('a', u8((tilemapAddr(TEXT_ROW_1, 2) >> 8) & 0xff)),
    ld_nn_a(MEM.DLG_VRAM_HI),

    // Init state
    ld_r_n('a', u8(1)), // state = printing
    ld_nn_a(MEM.DLG_STATE),
    xor_r('a'),
    ld_nn_a(MEM.DLG_CHAR_IDX),
    ld_r_n('a', u8(REVEAL_DELAY)),
    ld_nn_a(MEM.DLG_DELAY),
    xor_r('a'),
    ld_nn_a(MEM.DLG_CURSOR),
    ld_nn_a(MEM.DLG_RESULT),

    ret(),

    // =================================================================
    // dlg_update — Called each frame. Dispatches based on dlg_state.
    // =================================================================
    label('dlg_update'),
    ld_a_nn(MEM.DLG_STATE),
    cp_n(u8(0)),
    ret_cc('z'), // state 0 = idle, nothing to do

    cp_n(u8(1)),
    jp_cc('z', ref('dlg_do_print')),

    cp_n(u8(2)),
    jp_cc('z', ref('dlg_do_wait')),

    cp_n(u8(3)),
    jp(ref('dlg_do_choose')),

    // =================================================================
    // dlg_do_print — Reveal one character per REVEAL_DELAY frames
    // =================================================================
    label('dlg_do_print'),

    // Decrement delay counter
    ld_a_nn(MEM.DLG_DELAY),
    dec_r('a'),
    ld_nn_a(MEM.DLG_DELAY),
    ret_cc('nz'), // not time yet

    // Reset delay
    ld_r_n('a', u8(REVEAL_DELAY)),
    ld_nn_a(MEM.DLG_DELAY),

    // Load string pointer into HL
    ld_a_nn(MEM.DLG_STR_LO),
    ld_r_r('l', 'a'),
    ld_a_nn(MEM.DLG_STR_HI),
    ld_r_r('h', 'a'),

    // Read next tile index
    ldi_a_hl(), // A = [HL++] = next tile

    // Save updated string pointer
    ld_r_r('b', 'a'), // save tile in B
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_STR_LO),
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_STR_HI),
    ld_r_r('a', 'b'), // restore tile

    // Check for text terminator (0xFE — not 0x00, because tile 0 = space)
    cp_n(u8(0xfe)),
    jr_cc('z', ref('dlg_text_done')),

    // Write tile to VRAM position
    // Load VRAM pointer into HL
    ld_r_r('b', 'a'), // save tile
    ld_a_nn(MEM.DLG_VRAM_LO),
    ld_r_r('l', 'a'),
    ld_a_nn(MEM.DLG_VRAM_HI),
    ld_r_r('h', 'a'),

    // Wait for HBlank/VBlank to safely write VRAM
    // (single tile write is fast enough during HBlank)
    ld_r_r('a', 'b'),
    ldi_hl_a(), // write tile, advance VRAM pointer

    // Save updated VRAM pointer
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_VRAM_LO),
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_VRAM_HI),

    ret(),

    // --- Text finished: read choice count and transition ---
    label('dlg_text_done'),
    // String pointer now points to choice_count byte
    ld_a_nn(MEM.DLG_STR_LO),
    ld_r_r('l', 'a'),
    ld_a_nn(MEM.DLG_STR_HI),
    ld_r_r('h', 'a'),
    ldi_a_hl(), // A = choice count
    ld_nn_a(MEM.DLG_CHOICE_CNT),

    // HL now points to the next_node lookup table. Save this position.
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_META0_LO), // reuse META0 as "next_node table pointer"
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_META0_HI),

    // Skip past next_node table + good_flag table (choice_count * 2 bytes)
    ld_a_nn(MEM.DLG_CHOICE_CNT),
    add_r('a'), // A = choice_count * 2
    ld_r_r('c', 'a'),
    ld_r_n('b', u8(0)),
    add_hl_rr('bc'), // HL += choice_count * 2

    // Save pointer to first choice text
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_STR_LO),
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_STR_HI),

    // If 0 choices, go to wait-for-A mode
    ld_a_nn(MEM.DLG_CHOICE_CNT),
    cp_n(u8(0)),
    jr_cc('nz', ref('dlg_setup_choices')),
    ld_r_n('a', u8(2)), // state = wait
    ld_nn_a(MEM.DLG_STATE),
    ret(),

    // --- Set up choices ---
    label('dlg_setup_choices'),
    ld_r_n('a', u8(3)), // state = choosing
    ld_nn_a(MEM.DLG_STATE),

    // Draw choice texts (with LCD off for bulk write)
    label('dlg_draw_choices_vblank'),
    ldh_a_n(HW.LY),
    cp_n(u8(144)),
    jr_cc('nz', ref('dlg_draw_choices_vblank')),

    xor_r('a'),
    ldh_n_a(HW.LCDC),

    // Draw each choice on its own row
    // We read choice strings from the string pointer
    ld_a_nn(MEM.DLG_STR_LO),
    ld_r_r('e', 'a'),
    ld_a_nn(MEM.DLG_STR_HI),
    ld_r_r('d', 'a'),

    ld_a_nn(MEM.DLG_CHOICE_CNT),
    ld_r_r('c', 'a'), // C = remaining choices
    ld_r_n('b', u8(0)), // B = choice index

    label('dlg_draw_choice_loop'),
    // Calculate VRAM address for this choice row
    // Row = CHOICE_START_ROW + B, Col = 3 (after border + cursor space)
    // We inline the address computation for each row
    ld_r_r('a', 'b'), // choice index

    // VRAM = 0x9800 + (CHOICE_START_ROW + index) * 32 + 3
    // We compute using a simple add chain since we only have 3 choices max
    cp_n(u8(0)),
    jr_cc('nz', ref('dlg_choice_row1')),
    ld_rr_nn('hl', u16(tilemapAddr(CHOICE_START_ROW, 3))),
    jr(ref('dlg_choice_write')),

    label('dlg_choice_row1'),
    cp_n(u8(1)),
    jr_cc('nz', ref('dlg_choice_row2')),
    ld_rr_nn('hl', u16(tilemapAddr(CHOICE_START_ROW + 1, 3))),
    jr(ref('dlg_choice_write')),

    label('dlg_choice_row2'),
    ld_rr_nn('hl', u16(tilemapAddr(CHOICE_START_ROW + 2, 3))),

    label('dlg_choice_write'),
    // DE = ROM string pointer, HL = VRAM destination
    // Copy tiles until null terminator: ld_a_de reads [DE] without clobbering HL
    label('dlg_choice_char'),
    ld_a_de(), // A = [DE] (tile index from ROM)
    inc_rr('de'), // advance source
    cp_n(u8(0xfe)),
    jr_cc('z', ref('dlg_choice_str_done')), // 0xFE = end of this choice text
    ldi_hl_a(), // write tile to VRAM, advance dest
    jr(ref('dlg_choice_char')),

    label('dlg_choice_str_done'),
    // Choice texts are now simple null-terminated strings with no metadata
    inc_r('b'), // next choice index
    dec_r('c'), // remaining--
    jr_cc('nz', ref('dlg_draw_choice_loop')),

    // Draw cursor at first choice
    ld_rr_nn('hl', u16(tilemapAddr(CHOICE_START_ROW, 2))),
    ld_r_n('a', u8(CURSOR_TILE)),
    ldi_hl_a(),

    // Turn LCD back on
    ld_r_n('a', u8(LCDC.LCD_ON | LCDC.TILE_DATA_8000 | LCDC.BG_ON)),
    ldh_n_a(HW.LCDC),

    // Init cursor position
    xor_r('a'),
    ld_nn_a(MEM.DLG_CURSOR),

    ret(),

    // =================================================================
    // dlg_do_wait — Wait for A button press, then set idle
    // =================================================================
    label('dlg_do_wait'),
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
    label('dlg_do_choose'),
    ld_a_nn(MEM.JOYPAD_NEW),

    // Check A button
    ld_r_r('b', 'a'), // save joypad in B
    and_n(u8(JOY.A)),
    jr_cc('nz', ref('dlg_confirm_choice')),

    // Check DOWN
    ld_r_r('a', 'b'),
    and_n(u8(JOY.DOWN)),
    jr_cc('nz', ref('dlg_cursor_down')),

    // Check UP
    ld_r_r('a', 'b'),
    and_n(u8(JOY.UP)),
    jr_cc('nz', ref('dlg_cursor_up')),

    ret(), // no relevant input

    // --- Move cursor down ---
    label('dlg_cursor_down'),
    // Erase old cursor
    call(ref('dlg_erase_cursor')),
    // Increment cursor, wrap around
    ld_a_nn(MEM.DLG_CURSOR),
    inc_r('a'),
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.DLG_CHOICE_CNT),
    ld_r_r('c', 'a'), // C = choice count
    ld_r_r('a', 'b'),
    cp_r('c'),
    jr_cc('c', ref('dlg_cursor_save')), // if cursor < count, no wrap
    xor_r('a'), // wrap to 0
    jr(ref('dlg_cursor_save')),

    // --- Move cursor up ---
    label('dlg_cursor_up'),
    call(ref('dlg_erase_cursor')),
    ld_a_nn(MEM.DLG_CURSOR),
    cp_n(u8(0)),
    jr_cc('nz', ref('dlg_cursor_up_dec')),
    // Wrap to last choice
    ld_a_nn(MEM.DLG_CHOICE_CNT),
    dec_r('a'),
    jr(ref('dlg_cursor_save')),

    label('dlg_cursor_up_dec'),
    ld_a_nn(MEM.DLG_CURSOR),
    dec_r('a'),

    label('dlg_cursor_save'),
    ld_nn_a(MEM.DLG_CURSOR),
    call(ref('dlg_draw_cursor')),
    ret(),

    // --- Confirm choice ---
    label('dlg_confirm_choice'),
    ld_a_nn(MEM.DLG_CURSOR),
    ld_nn_a(MEM.DLG_RESULT),

    // Read next_node = table_base[cursor]
    ld_a_nn(MEM.DLG_META0_LO),
    ld_r_r('l', 'a'),
    ld_a_nn(MEM.DLG_META0_HI),
    ld_r_r('h', 'a'),
    ld_a_nn(MEM.DLG_CURSOR),
    ld_r_r('c', 'a'),
    ld_r_n('b', u8(0)),
    add_hl_rr('bc'), // HL = table_base + cursor
    ldi_a_hl(),
    ld_nn_a(MEM.DLG_NODE_ID),

    // Read good_flag = table_base[choice_count + cursor]
    // HL is now at table_base + cursor + 1. We need table_base + choice_count + cursor.
    // Offset from current HL: (choice_count - cursor - 1)
    // Simpler: reload table_base, add choice_count + cursor
    ld_a_nn(MEM.DLG_META0_LO),
    ld_r_r('l', 'a'),
    ld_a_nn(MEM.DLG_META0_HI),
    ld_r_r('h', 'a'),
    // Add choice_count + cursor
    ld_a_nn(MEM.DLG_CHOICE_CNT),
    add_r('c'), // A = choice_count + cursor (C still has cursor from above)
    ld_r_r('c', 'a'),
    ld_r_n('b', u8(0)),
    add_hl_rr('bc'),
    ldi_a_hl(), // A = good_flag (1 = good, 0 = bad)

    // Score: +10 if good, -5 if bad
    cp_n(u8(1)),
    jr_cc('nz', ref('dlg_bad_choice')),
    // Good: +10 to kana score
    ld_a_nn(MEM.KANA_SCORE_LO),
    add_n(u8(10)),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_a_nn(MEM.KANA_SCORE_HI),
    adc_n(u8(0)),
    ld_nn_a(MEM.KANA_SCORE_HI),
    jr(ref('dlg_score_done')),

    label('dlg_bad_choice'),
    // Bad: -5 from kana score
    ld_a_nn(MEM.KANA_SCORE_LO),
    sub_n(u8(5)),
    ld_nn_a(MEM.KANA_SCORE_LO),
    ld_a_nn(MEM.KANA_SCORE_HI),
    sbc_n(u8(0)),
    ld_nn_a(MEM.KANA_SCORE_HI),

    label('dlg_score_done'),
    // Set state = idle
    xor_r('a'),
    ld_nn_a(MEM.DLG_STATE),
    ret(),

    // =================================================================
    // dlg_erase_cursor — Clear the cursor tile at the current position
    // =================================================================
    label('dlg_erase_cursor'),
    ld_a_nn(MEM.DLG_CURSOR),
    // Compute VRAM address: 0x9800 + (CHOICE_START_ROW + cursor) * 32 + 2
    cp_n(u8(0)),
    jr_cc('nz', ref('dlg_erase_r1')),
    ld_rr_nn('hl', u16(tilemapAddr(CHOICE_START_ROW, 2))),
    jr(ref('dlg_erase_write')),
    label('dlg_erase_r1'),
    cp_n(u8(1)),
    jr_cc('nz', ref('dlg_erase_r2')),
    ld_rr_nn('hl', u16(tilemapAddr(CHOICE_START_ROW + 1, 2))),
    jr(ref('dlg_erase_write')),
    label('dlg_erase_r2'),
    ld_rr_nn('hl', u16(tilemapAddr(CHOICE_START_ROW + 2, 2))),
    label('dlg_erase_write'),
    xor_r('a'),
    ldi_hl_a(), // write blank tile
    ret(),

    // =================================================================
    // dlg_draw_cursor — Draw cursor at the current position
    // =================================================================
    label('dlg_draw_cursor'),
    ld_a_nn(MEM.DLG_CURSOR),
    cp_n(u8(0)),
    jr_cc('nz', ref('dlg_draw_r1')),
    ld_rr_nn('hl', u16(tilemapAddr(CHOICE_START_ROW, 2))),
    jr(ref('dlg_draw_write')),
    label('dlg_draw_r1'),
    cp_n(u8(1)),
    jr_cc('nz', ref('dlg_draw_r2')),
    ld_rr_nn('hl', u16(tilemapAddr(CHOICE_START_ROW + 1, 2))),
    jr(ref('dlg_draw_write')),
    label('dlg_draw_r2'),
    ld_rr_nn('hl', u16(tilemapAddr(CHOICE_START_ROW + 2, 2))),
    label('dlg_draw_write'),
    ld_r_n('a', u8(CURSOR_TILE)),
    ldi_hl_a(),
    ret(),

    // =================================================================
    // dlg_open_tree — Start a dialogue tree. DE = pointer to tree data.
    // Stores tree base, sets node 0, opens the first node.
    // =================================================================
    label('dlg_open_tree'),
    // Save tree base pointer
    ld_r_r('a', 'e'),
    ld_nn_a(MEM.DLG_TREE_LO),
    ld_r_r('a', 'd'),
    ld_nn_a(MEM.DLG_TREE_HI),
    // Start at node 0
    xor_r('a'),
    ld_nn_a(MEM.DLG_NODE_ID),
    // Fall through to dlg_open_node

    // =================================================================
    // dlg_open_node — Open the node at DLG_NODE_ID from the tree.
    // Looks up the offset table, computes ROM pointer, calls dlg_open.
    // =================================================================
    label('dlg_open_node'),
    // Load tree base into HL
    ld_a_nn(MEM.DLG_TREE_LO),
    ld_r_r('l', 'a'),
    ld_a_nn(MEM.DLG_TREE_HI),
    ld_r_r('h', 'a'),
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
    jp(ref('dlg_open')),
  ];
}
