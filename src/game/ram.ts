/**
 * The game's RAM: every variable with its size, laid out by the allocator in
 * src/asm/ram.ts (in declaration order, never overlapping unless shared with same()).
 * Sizes of buffers are checked against the engines that use them in test/ram.test.ts.
 */

import { HW_MEM } from '../asm/hardware';
import { allocate, checkRegions, same } from '../asm/ram';

/** Bytes per sound voice: see VOICE in sound.ts */
const VOICE_BYTES = 8;

/**
 * Engine state in WRAM page $C0: all of it shares H = $C0, and boot zeroes the
 * whole page (WRAM starts with random contents on real hardware).
 */
export const VARIABLES = allocate('WRAM variables', 0xc000, 0x100, {
  // Joypad
  JOYPAD_CUR: 1, // Current frame button state
  JOYPAD_PREV: 1, // Previous frame button state
  JOYPAD_NEW: 1, // Newly pressed this frame (edge-detected)

  // Dialogue engine
  DLG_STATE: 1, // 0=idle, 1=printing, 2=wait-for-input, 3=choosing
  DLG_CHAR_IDX: 1, // Index into current string being revealed
  DLG_DELAY: 1, // Frame counter for character reveal delay
  DLG_CHOICE_CNT: 1, // Number of response choices (0-3)
  DLG_CURSOR: 1, // Currently highlighted choice index
  DLG_STR_LO: 1, // Pointer to current dialogue string (lo byte)
  DLG_STR_HI: 1, // Pointer to current dialogue string (hi byte)
  DLG_VRAM_LO: 1, // Current VRAM write position (lo byte)
  DLG_VRAM_HI: 1, // Current VRAM write position (hi byte)
  DLG_RESULT: 1, // Chosen response index after selection
  DLG_NODE_ID: 1, // Current node index in dialogue tree (0xFF = done)
  DLG_TREE_LO: 1, // Base pointer to current tree data (lo)
  DLG_TREE_HI: 1, // Base pointer to current tree data (hi)
  DLG_META0_LO: 1, // ROM ptr to the choices' next_node table (lo)
  DLG_META0_HI: 1, // ROM ptr to the choices' next_node table (hi)
  DLG_ORDER0: 1, // Display row 0 → logical choice index
  DLG_ORDER1: 1, // Display row 1 → logical choice index
  DLG_ORDER2: 1, // Display row 2 → logical choice index
  DLG_BOUNCE: 1, // Frame counter driving the choice cursor's bounce

  // Kana mini-game
  KANA_STATE: 1, // 0=idle, 2=awaiting, 3=correct feedback, 4=wrong feedback
  KANA_CORRECT_POS: 1, // Which d-pad direction has the correct answer (0-3)
  KANA_ANSWER: 1, // Player's answer direction (0-3)
  KANA_SCORE_LO: 1, // 16-bit score (low byte)
  KANA_SCORE_HI: 1, // 16-bit score (high byte)
  KANA_Q_IDX: 1, // Current question index
  KANA_LIVES: 1, // Lives remaining (3,2,1,0)
  KANA_ATTEMPTS: 1, // Attempts on current question (0,1,2)
  KANA_SHUFFLE: 1, // shuffle buffer[0] (correct tile)
  KANA_SHUFFLE1: 1, // shuffle buffer[1]
  KANA_SHUFFLE2: 1, // shuffle buffer[2]
  KANA_SHUFFLE3: 1, // shuffle buffer[3]
  // The kana round never runs alongside dialogue, so it borrows these dialogue bytes:
  KANA_DATA_LO: same('DLG_STR_LO'), // pointer to the next question in ROM (lo)
  KANA_DATA_HI: same('DLG_STR_HI'), // pointer to the next question in ROM (hi)
  KANA_FEEDBACK_TIMER: same('DLG_DELAY'), // frames left in the feedback pause

  // HUD delta flash
  DELTA_TYPE: 1, // 0=none, 1=+100, 2=+10, 3=-5, 4=-100
  DELTA_TIMER: 1, // Frames remaining for flash display

  // Scene system
  SCENE_ID: 1, // Current scene index (0-4, 0xFF = title)
  SCENE_FLAGS: 1, // Per-scene completion bitfield
  GAME_MODE: 1, // 0=title, 1=dialogue, 2=kana, 3=transition
  TITLE_TIMER: 1, // Title-screen animation timer (1 tick per frame)
  KANA_BLANK_LO: 1, // VRAM address of the blanked kana in the word (lo)
  KANA_BLANK_HI: 1, // VRAM address of the blanked kana in the word (hi)
  FADE_TABLE_LO: 1, // Palette set on screen (lo)
  FADE_TABLE_HI: 1, // Palette set on screen (hi)

  // What the HUD currently shows, so it only redraws on change
  HUD_SHOWN_LIVES: 1,
  HUD_SHOWN_SCORE_LO: 1,
  HUD_SHOWN_SCORE_HI: 1,
  HUD_SHOWN_DELTA: 1, // delta type on screen (0 = cleared)

  // Hardware and the scene's NPC and tile animation
  IS_CGB: 1, // 1 on a Game Boy Color (A = $11 at boot), else 0
  NPC_TABLE_LO: 1, // Current scene's NPC segment table (lo)
  NPC_TABLE_HI: 1, // Current scene's NPC segment table (hi)
  NPC_CURRENT: 1, // NPC on screen ($FF = none)
  NPC_TIMER: 1, // Frame counter for the NPC's idle bob
  ANIM_LO: 1, // Current scene's tile animation (lo)
  ANIM_HI: 1, // Current scene's tile animation (hi)
  ANIM_TIMER: 1, // Frame counter for the tile animation
  ANIM_FRAME: 1, // Animation frame on screen
  NPC_X: 1, // Speaker's OAM x (left half)
  NPC_Y: 1, // Speaker's OAM y (top half, before the bob)

  // Kana rounds of the current scene (see rounds.ts)
  ROUNDS_LO: 1, // pointer to the scene's rounds data (lo)
  ROUNDS_HI: 1, // pointer to the scene's rounds data (hi)
  ROUNDS_DONE: 1, // bit i set = round i already played
  ROUND_RAN: 1, // a round ran since the last dialogue choice (the scene needs redrawing)
  CHANCES_LO: 1, // pointer to the scene's chances table (lo)
  CHANCES_HI: 1, // pointer to the scene's chances table (hi)
  KANA_MODE: 1, // KanaMode of the running round
  DLG_FROM_NODE: 1, // node the last choice was made at
  DLG_PICK: 1, // last choice: logical index, bit 7 = bad answer
  KANA_STREAK: 1, // first-try answers in a row toward the next streak bonus
  SCORE_DIGITS: 5, // SCORE_DIGIT_COUNT digit tiles of the score, most significant first
  KANA_PROMPT: 1, // nonzero = the current question asks for katakana (see MATCH_FLAG)
  KANA_CLOCK_FRAMES: 1, // speed round: frames left in the current second
  KANA_CLOCK_SECS: 1, // speed round: seconds left to answer

  // The mascot sprite (see cat.ts)
  CAT_X: 1, // OAM x of the cat's left column while placing it
  CAT_COL: 1, // columns left in the row being placed
  CAT_FACE: 1, // face showing (index into CAT_FACES)
  CAT_REST: 1, // face it returns to after a reaction
  CAT_TIMER: 1, // frames left in a reaction
  CAT_BLINK: 1, // blink cycle counter

  // The current scene's entry in scene_table (see scene-table.ts)
  SCENE_DESC_LO: 1,
  SCENE_DESC_HI: 1,

  // Frame budget (see frame_wait in video.ts)
  FRAME_COUNT: 1, // VBlanks so far (the VBlank handler counts them)
  LAST_FRAME: 1, // FRAME_COUNT when the game last finished a frame's work
  FRAMES_MISSED: 1, // VBlanks the game's work ran past (saturates at 255)

  // Dialogue text decompression (see text_next in dialogue.ts)
  TEXT_SP: 1, // right halves of codes waiting on TEXT_STACK
  TEXT_STACK: 16, // TEXT_STACK_SIZE bytes

  // Sound (see sound.ts)
  SND_VOICES: 3 * VOICE_BYTES, // SOUND_VOICES × VOICE_SIZE bytes
  SFX_ID: 1, // The sound effect playing last (SFX_NONE before any)
  SFX_PRIO: 1, // Its priority: a lower one can't cut it off
  MUSIC_ID: 1, // The song playing (see music_play)

  // Passwords and the title menu (see password.ts, menu.ts)
  PASS_ACC: 4, // check, scene << 2 | lives, score hi, score lo
  PASS_CHARS: 6, // PASSWORD_LENGTH kana, as PASSWORD_ALPHABET indices
  PASS_LEN: 1, // Kana entered so far
  PASS_CURSOR: 1, // The kana grid's highlighted cell (0-31)
  MENU_CURSOR: 1, // The title menu's highlighted item

  // The kana chart and practice (see chart.ts, practice.ts)
  CHART_WAIT: 1, // 1 while the kana chart waits for a button
  PRACTICE_NEXT: 1, // Where the next practice pick starts looking (a chart entry)
  PRACTICE_QUIT: 1, // Set when B leaves practice
  KANA_SEEN: 6, // CHART_BYTES bytes, a bit per kana in CHART_KANA order: answered right
  KANA_MISSED: 6, // CHART_BYTES bytes: answered wrong
  PRACTICE_SEED: 1, // Mixed into the practice picks' randomness
});

/** The shadow copy of OAM that sprites.ts DMAs each frame: DMA needs it page-aligned */
export const SHADOW_OAM_REGION = allocate('shadow OAM', 0xc100, 0xa0, { SHADOW_OAM: 0xa0 });

/** Questions picked for a practice or speed round, then a 0 */
export const PRACTICE_REGION = allocate('practice buffer', 0xc200, 0x100, { PRACTICE_BUF: 0x100 });

export const RAM_REGIONS = [VARIABLES, SHADOW_OAM_REGION, PRACTICE_REGION] as const;
checkRegions(RAM_REGIONS);

/** Hardware addresses and the game's variables */
export const MEM = {
  ...HW_MEM,
  ...VARIABLES.addresses,
  ...SHADOW_OAM_REGION.addresses,
  ...PRACTICE_REGION.addresses,
};

/** Every variable's address by name, for the .sym file */
export function ramSymbols(): Map<string, number> {
  return new Map(RAM_REGIONS.flatMap((region) => region.variables.map((v) => [v.name, v.address])));
}
