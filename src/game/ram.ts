/**
 * The game's RAM: every variable with its size, laid out by the allocator in
 * src/asm/ram.ts (in declaration order, never overlapping unless shared with same()).
 * Sizes of buffers are checked against the engines that use them in test/ram.test.ts.
 */

import { HW_MEM } from '../asm/hardware';
import { allocate, buffer, byte, byteOf, checkRegions, same, word } from '../asm/ram';
import { DialogueState, KanaMode, KanaState } from './state';
import { type U16, u16 } from '../asm/types';

/** Bytes per sound voice: see VOICE in sound.ts */
const VOICE_BYTES = 8;

/** The OAM DMA routine, copied to the start of HRAM at boot (see sprites.ts) */
export const DMA_REGION = allocate('HRAM DMA routine', 0xff80, 10, { OAM_DMA: buffer(10) });

/**
 * Engine state in HRAM, after the DMA routine and up to IE at $FFFF: LDH reaches it
 * in a byte less and 4 cycles faster than WRAM. Boot zeroes it (HRAM starts with
 * random contents on real hardware).
 */
export const VARIABLES = allocate('HRAM variables', DMA_REGION.end, 0xffff - DMA_REGION.end, {
  // Joypad
  JOYPAD_CUR: byte(), // Current frame button state
  JOYPAD_PREV: byte(), // Previous frame button state
  JOYPAD_NEW: byte(), // Newly pressed this frame (edge-detected)

  // Dialogue engine
  DLG_STATE: byteOf(DialogueState), // 0=idle, 1=printing, 2=wait-for-input, 3=choosing
  DLG_CHAR_IDX: byte(), // Index into current string being revealed
  DLG_DELAY: byte(), // Frame counter for character reveal delay
  DLG_CHOICE_CNT: byte(), // Number of response choices (0-3)
  DLG_CURSOR: byte(), // Currently highlighted choice index
  DLG_STR: word(), // Pointer to current dialogue string
  DLG_VRAM: word(), // Current VRAM write position
  DLG_RESULT: byte(), // Chosen response index after selection
  DLG_NODE_ID: byte(), // Current node index in dialogue tree (0xFF = done)
  DLG_TREE: word(), // Base pointer to current tree data
  DLG_META0: word(), // ROM ptr to the choices' next_node table
  DLG_ORDER: buffer(3), // display row → logical choice index
  DLG_BOUNCE: byte(), // Frame counter driving the choice cursor's bounce

  // Kana mini-game
  KANA_STATE: byteOf(KanaState), // 0=idle, 2=awaiting, 3=correct feedback, 4=wrong feedback
  KANA_CORRECT_POS: byte(), // Which d-pad direction has the correct answer (0-3)
  KANA_ANSWER: byte(), // Player's answer direction (0-3)
  KANA_SCORE: word(), // 16-bit score
  KANA_Q_IDX: byte(), // Current question index
  KANA_LIVES: byte(), // Lives remaining (3,2,1,0)
  KANA_ATTEMPTS: byte(), // Attempts on current question (0,1,2)
  KANA_SHUFFLE: buffer(4), // the answers' tiles, shuffled onto the d-pad: [0] is the correct one
  // The kana round never runs alongside dialogue, so it borrows these dialogue bytes:
  KANA_DATA: same('DLG_STR'), // pointer to the next question in ROM
  KANA_FEEDBACK_TIMER: same('DLG_DELAY'), // frames left in the feedback pause

  // HUD delta flash
  DELTA_TYPE: byte(), // 0=none, 1=+100, 2=+10, 3=-5, 4=-100
  DELTA_TIMER: byte(), // Frames remaining for flash display

  // Scene system
  SCENE_ID: byte(), // Current scene index (0-4, 0xFF = title)
  SCENE_FLAGS: byte(), // Per-scene completion bitfield
  GAME_MODE: byte(), // 0=title, 1=dialogue, 2=kana, 3=transition
  TITLE_TIMER: byte(), // Title-screen animation timer (1 tick per frame)
  KANA_BLANK: word(), // VRAM address of the blanked kana in the word
  FADE_TABLE: word(), // Palette set on screen

  // What the HUD currently shows, so it only redraws on change
  HUD_SHOWN_LIVES: byte(),
  HUD_SHOWN_SCORE: word(),
  HUD_SHOWN_DELTA: byte(), // delta type on screen (0 = cleared)

  // Hardware and the scene's NPC and tile animation
  IS_CGB: byte(), // 1 on a Game Boy Color (A = $11 at boot), else 0
  NPC_TABLE: word(), // Current scene's NPC segment table
  NPC_CURRENT: byte(), // NPC on screen ($FF = none)
  NPC_TIMER: byte(), // Frame counter for the NPC's idle bob
  ANIM: word(), // Current scene's tile animation
  ANIM_TIMER: byte(), // Frame counter for the tile animation
  ANIM_FRAME: byte(), // Animation frame on screen
  NPC_X: byte(), // Speaker's OAM x (left half)
  NPC_Y: byte(), // Speaker's OAM y (top half, before the bob)

  // Kana rounds of the current scene (see rounds.ts)
  ROUNDS: word(), // pointer to the scene's rounds data
  ROUNDS_DONE: byte(), // bit i set = round i already played
  ROUND_RAN: byte(), // a round ran since the last dialogue choice (the scene needs redrawing)
  CHANCES: word(), // pointer to the scene's chances table
  KANA_MODE: byteOf(KanaMode), // KanaMode of the running round
  DLG_FROM_NODE: byte(), // node the last choice was made at
  DLG_PICK: byte(), // last choice: logical index, bit 7 = bad answer
  KANA_STREAK: byte(), // first-try answers in a row toward the next streak bonus
  SCORE_DIGITS: buffer(5), // SCORE_DIGIT_COUNT digit tiles of the score, most significant first
  KANA_PROMPT: byte(), // nonzero = the current question asks for katakana (see MATCH_FLAG)
  KANA_CLOCK_FRAMES: byte(), // speed round: frames left in the current second
  KANA_CLOCK_SECS: byte(), // speed round: seconds left to answer

  // The mascot sprite (see cat.ts)
  CAT_X: byte(), // OAM x of the cat's left column while placing it
  CAT_COL: byte(), // columns left in the row being placed
  CAT_FACE: byte(), // face showing (index into CAT_FACES)
  CAT_REST: byte(), // face it returns to after a reaction
  CAT_TIMER: byte(), // frames left in a reaction
  CAT_BLINK: byte(), // blink cycle counter

  // The current scene's entry in scene_table (see scene-table.ts)
  SCENE_DESC: word(),

  // Frame budget (see frame_wait in video.ts)
  FRAME_COUNT: byte(), // VBlanks so far (the VBlank handler counts them)
  LAST_FRAME: byte(), // FRAME_COUNT when the game last finished a frame's work
  FRAMES_MISSED: byte(), // VBlanks the game's work ran past (saturates at 255)

  // Dialogue text decompression (see text_next in dialogue.ts)
  TEXT_SP: byte(), // right halves of codes waiting on TEXT_STACK

  // Sound (see sound.ts)
  SFX_ID: byte(), // The sound effect playing last (SFX_NONE before any)
  SFX_PRIO: byte(), // Its priority: a lower one can't cut it off
  MUSIC_ID: byte(), // The song playing (see music_play)

  // Passwords and the title menu (see password.ts, menu.ts)
  PASS_ACC: buffer(4), // check, scene << 2 | lives, score hi, score lo
  PASS_LEN: byte(), // Kana entered so far
  PASS_CURSOR: byte(), // The kana grid's highlighted cell (0-31)
  MENU_CURSOR: byte(), // The title menu's highlighted item

  // The kana chart and practice (see chart.ts, practice.ts)
  CHART_WAIT: byte(), // 1 while the kana chart waits for a button
  PRACTICE_NEXT: byte(), // Where the next practice pick starts looking (a chart entry)
  PRACTICE_QUIT: byte(), // Set when B leaves practice
  PRACTICE_SEED: byte(), // Mixed into the practice picks' randomness
});

/** Buffers in WRAM page $C0, walked with HL; boot zeroes the whole page */
export const BUFFERS = allocate('WRAM buffers', 0xc000, 0x100, {
  TEXT_STACK: buffer(16), // TEXT_STACK_SIZE bytes (see text_next in dialogue.ts)
  SND_VOICES: buffer(3 * VOICE_BYTES), // SOUND_VOICES × VOICE_SIZE bytes (see sound.ts)
  PASS_CHARS: buffer(6), // PASSWORD_LENGTH kana, as PASSWORD_ALPHABET indices
  KANA_SEEN: buffer(6), // CHART_BYTES bytes, a bit per kana in CHART_KANA order: answered right
  KANA_MISSED: buffer(6), // CHART_BYTES bytes: answered wrong
});

/** The shadow copy of OAM that sprites.ts DMAs each frame: DMA needs it page-aligned */
export const SHADOW_OAM_REGION = allocate('shadow OAM', 0xc100, 0xa0, { SHADOW_OAM: buffer(0xa0) });

/** Questions picked for a practice or speed round, then a 0 */
export const PRACTICE_REGION = allocate('practice buffer', 0xc200, 0x100, {
  PRACTICE_BUF: buffer(0x100),
});

/** The stack grows down from the top of this region (SP starts at STACK_TOP) */
export const STACK_REGION = allocate('stack', 0xc300, 0x100, { STACK: buffer(0x100) });
export const STACK_TOP: U16 = u16(STACK_REGION.limit);

export const RAM_REGIONS = [
  BUFFERS,
  SHADOW_OAM_REGION,
  PRACTICE_REGION,
  STACK_REGION,
  DMA_REGION,
  VARIABLES,
] as const;
checkRegions(RAM_REGIONS);

/** Hardware addresses and the game's variables */
export const MEM = {
  ...HW_MEM,
  ...DMA_REGION.vars,
  ...VARIABLES.vars,
  ...BUFFERS.vars,
  ...SHADOW_OAM_REGION.vars,
  ...PRACTICE_REGION.vars,
};

/** Every variable's address by name, for the .sym file */
export function ramSymbols(): Map<string, number> {
  return new Map(RAM_REGIONS.flatMap((region) => region.variables.map((v) => [v.name, v.address])));
}
