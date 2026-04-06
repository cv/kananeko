/**
 * Dialogue engine for the Game Boy.
 *
 * Renders a text box at the bottom of the screen (rows 12-17),
 * reveals text character-by-character, presents response choices,
 * and handles cursor navigation with d-pad + A confirm.
 *
 * Dialogue data format in ROM:
 *   [tile_index...] 0x00               — NPC text (null-terminated tile indices)
 *   [choice_count: u8]                 — number of choices (0 = press A to continue)
 *   [tile_index...] 0x00               — choice 0 text
 *   [tile_index...] 0x00               — choice 1 text
 *   ...
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
import { CHAR_MAP, textToTiles } from './font';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const BOX_TOP_ROW = 12;
const BOX_ROWS = 6; // rows 12-17
const TEXT_ROW_1 = 13;
const CHOICE_START_ROW = 15;
const MAP_COLS = 32;
const SCREEN_COLS = 20;
const REVEAL_DELAY = 3; // frames between each character reveal

// Tile indices for border characters
const BORDER_TL = CHAR_MAP['┌'] ?? 0;
const BORDER_TR = CHAR_MAP['┐'] ?? 0;
const BORDER_BL = CHAR_MAP['└'] ?? 0;
const BORDER_BR = CHAR_MAP['┘'] ?? 0;
const BORDER_H = CHAR_MAP['─'] ?? 0;
const BORDER_V = CHAR_MAP['│'] ?? 0;
const CURSOR_TILE = CHAR_MAP['▶'] ?? 0;

function tilemapAddr(row: number, col: number): number {
  return 0x9800 + row * MAP_COLS + col;
}

// ---------------------------------------------------------------------------
// Dialogue data types & encoder
// ---------------------------------------------------------------------------

export interface DialogueEntry {
  text: string;
  choices: string[];
}

/**
 * Pack dialogue entries into ROM data (tile index sequences).
 * Returns the packed bytes and per-entry offsets (relative to start of data).
 */
export function buildDialogueData(entries: DialogueEntry[]): {
  data: Uint8Array;
  offsets: number[];
} {
  const bytes: number[] = [];
  const offsets: number[] = [];

  for (const entry of entries) {
    offsets.push(bytes.length);
    // NPC text as tile indices, null-terminated
    for (const tile of textToTiles(entry.text)) {
      bytes.push(tile);
    }
    bytes.push(0x00); // terminator

    // Choice count
    bytes.push(entry.choices.length);

    // Each choice, null-terminated
    for (const choice of entry.choices) {
      for (const tile of textToTiles(choice)) {
        bytes.push(tile);
      }
      bytes.push(0x00);
    }
  }

  return { data: new Uint8Array(bytes), offsets };
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
 * Call dlg_open to start a dialogue (DE = pointer to dialogue data in ROM).
 * Call dlg_update each frame in the main loop.
 * When dlg_state returns to 0, the dialogue is done and dlg_result has the choice.
 */
export function buildDialogueEngine(): Op[] {
  return [
    // =================================================================
    // dlg_open — Start a new dialogue. DE = pointer to dialogue data.
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

    // Store string pointer
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

    // Check for null terminator
    cp_n(u8(0)),
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

    // Save updated pointer (past choice_count)
    ld_r_r('b', 'a'),
    ld_r_r('a', 'l'),
    ld_nn_a(MEM.DLG_STR_LO),
    ld_r_r('a', 'h'),
    ld_nn_a(MEM.DLG_STR_HI),
    ld_r_r('a', 'b'),

    ld_nn_a(MEM.DLG_CHOICE_CNT),

    // If 0 choices, go to wait-for-A mode
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
    // DE = string pointer, HL = VRAM destination
    // Copy tiles until null terminator
    label('dlg_choice_char'),
    ld_r_r('a', 'd'), // load [DE] manually
    ld_r_r('h', 'a'), // Oops, this clobbers HL. Need different approach.
    // Actually we need to swap between reading from DE and writing to HL.
    // Use a push/pop approach.

    // Let me use a simpler approach: save HL, load from [DE], restore HL, write.
    // Actually the GB has no LD A,[DE] with auto-increment, so we manually do:
    // Push HL, LD H,D / LD L,E / LD A,[HL] / INC HL / LD D,H / LD E,L / Pop HL
    // This is clunky. Simpler: use [DE] read (ld_a_de exists) and manual inc.

    // Reset HL for this choice (we clobbered it above, but the jump set it)
    // Actually the issue is I jumped to dlg_choice_write with HL set, then
    // the label dlg_choice_char tries to use both DE and HL.
    // Let me restructure: the jumps above set HL correctly, then we fall into copy.

    // OK let me just save/restore properly.
    // For each character: read [DE], inc DE, check null, write to [HL+]

    // Save VRAM position on stack during the character read
    // Actually ld_a_de doesn't clobber HL. Let's just do it simply:
    ld_a_de(), // A = [DE] (tile index from ROM)
    inc_rr('de'), // advance source
    cp_n(u8(0)),
    jr_cc('z', ref('dlg_choice_str_done')), // null = end of this choice
    ldi_hl_a(), // write tile to VRAM, advance dest
    jr(ref('dlg_choice_char')),

    label('dlg_choice_str_done'),
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
    xor_r('a'),
    ld_nn_a(MEM.DLG_STATE), // state = idle
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
  ];
}
