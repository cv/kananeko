import { ioReg, u16, type IoRegOffset, type U16 } from './types';

// SM83 / Game Boy hardware register addresses (offset from $FF00)
// Use with ldh instructions: ldh_n_a(HW.LCDC) stores A into $FF40

export const HW = {
  // LCD
  LCDC: ioReg(0x40), // LCD control
  STAT: ioReg(0x41), // LCD status
  SCY: ioReg(0x42), // Scroll Y
  SCX: ioReg(0x43), // Scroll X
  LY: ioReg(0x44), // Current scanline (read-only)
  LYC: ioReg(0x45), // LY compare
  DMA: ioReg(0x46), // OAM DMA transfer
  BGP: ioReg(0x47), // BG palette
  OBP0: ioReg(0x48), // Object palette 0
  OBP1: ioReg(0x49), // Object palette 1
  WY: ioReg(0x4a), // Window Y
  WX: ioReg(0x4b), // Window X

  // Joypad
  P1: ioReg(0x00), // Joypad register

  // Timer
  DIV: ioReg(0x04), // Divider register (free-running counter, pseudo-RNG source)

  // Sound
  NR52: ioReg(0x26), // Sound on/off

  // Interrupts
  IF: ioReg(0x0f), // Interrupt flag

  // GBC color palettes
  BCPS: ioReg(0x68), // BG Color Palette Spec (index + auto-increment bit 7)
  BCPD: ioReg(0x69), // BG Color Palette Data (write color bytes)
  OCPS: ioReg(0x6a), // OBJ Color Palette Spec
  OCPD: ioReg(0x6b), // OBJ Color Palette Data

  // GBC VRAM bank
  VBK: ioReg(0x4f), // VRAM Bank Select (0 or 1)
} as const satisfies Record<string, IoRegOffset>;

// LCDC bit flags — plain numbers, composed with bitwise OR then wrapped in u8()
export const LCDC = {
  BG_ON: 0x01, // Bit 0: BG & Window enable
  OBJ_ON: 0x02, // Bit 1: OBJ enable
  OBJ_SIZE: 0x04, // Bit 2: OBJ size (0=8x8, 1=8x16)
  BG_MAP_9C00: 0x08, // Bit 3: BG tile map ($9800 or $9C00)
  TILE_DATA_8000: 0x10, // Bit 4: BG & Window tile data ($8800 or $8000)
  WIN_ON: 0x20, // Bit 5: Window enable
  WIN_MAP_9C00: 0x40, // Bit 6: Window tile map
  LCD_ON: 0x80, // Bit 7: LCD enable
} as const;

// Memory map
export const MEM = {
  VRAM: u16(0x8000),
  OBJ_TILES: u16(0x8000), // Sprite tiles 0-127 (sprites always use $8000 addressing)
  BG_TILES_HIGH: u16(0x8800), // BG tiles 128-255 in $8800 addressing (LCDC bit 4 clear)
  BG_TILES_LOW: u16(0x9000), // BG tiles 0-127 in $8800 addressing
  VRAM_MAP0: u16(0x9800), // BG tilemap 0
  VRAM_MAP1: u16(0x9c00), // BG tilemap 1
  OAM: u16(0xfe00),
  HRAM: u16(0xff80),
  IE: u16(0xffff), // Interrupt enable register

  // WRAM — joypad state
  JOYPAD_CUR: u16(0xc000), // Current frame button state
  JOYPAD_PREV: u16(0xc001), // Previous frame button state
  JOYPAD_NEW: u16(0xc002), // Newly pressed this frame (edge-detected)

  // WRAM — dialogue engine
  DLG_STATE: u16(0xc020), // 0=idle, 1=printing, 2=wait-for-input, 3=choosing
  DLG_CHAR_IDX: u16(0xc021), // Index into current string being revealed
  DLG_DELAY: u16(0xc022), // Frame counter for character reveal delay
  DLG_CHOICE_CNT: u16(0xc023), // Number of response choices (0-3)
  DLG_CURSOR: u16(0xc024), // Currently highlighted choice index
  DLG_STR_LO: u16(0xc025), // Pointer to current dialogue string (lo byte)
  DLG_STR_HI: u16(0xc026), // Pointer to current dialogue string (hi byte)
  DLG_VRAM_LO: u16(0xc027), // Current VRAM write position (lo byte)
  DLG_VRAM_HI: u16(0xc028), // Current VRAM write position (hi byte)
  DLG_RESULT: u16(0xc029), // Chosen response index after selection
  DLG_NODE_ID: u16(0xc02a), // Current node index in dialogue tree (0xFF = done)
  DLG_TREE_LO: u16(0xc02b), // Base pointer to current tree data (lo)
  DLG_TREE_HI: u16(0xc02c), // Base pointer to current tree data (hi)
  // Per-choice metadata pointers (ROM address of next_node byte for each choice)
  DLG_META0_LO: u16(0xc02d), // ROM ptr to next_node table base (lo)
  DLG_META0_HI: u16(0xc02e), // ROM ptr to next_node table base (hi)
  DLG_ORDER0: u16(0xc02f), // Display row 0 → logical choice index
  DLG_ORDER1: u16(0xc030), // Display row 1 → logical choice index
  DLG_ORDER2: u16(0xc031), // Display row 2 → logical choice index
  DLG_BOUNCE: u16(0xc032), // Frame counter driving the choice cursor's bounce

  // WRAM — kana mini-game
  KANA_STATE: u16(0xc040), // 0=idle, 2=awaiting, 3=correct feedback, 4=wrong feedback
  KANA_CORRECT_POS: u16(0xc041), // Which d-pad direction has the correct answer (0-3)
  KANA_ANSWER: u16(0xc042), // Player's answer direction (0-3)
  KANA_SCORE_LO: u16(0xc043), // 16-bit score (low byte)
  KANA_SCORE_HI: u16(0xc044), // 16-bit score (high byte)
  KANA_Q_IDX: u16(0xc045), // Current question index
  KANA_LIVES: u16(0xc046), // Lives remaining (3,2,1,0)
  KANA_ATTEMPTS: u16(0xc047), // Attempts on current question (0,1,2)
  KANA_SHUFFLE: u16(0xc048), // shuffle buffer[0] (correct tile)
  KANA_SHUFFLE1: u16(0xc049), // shuffle buffer[1]
  KANA_SHUFFLE2: u16(0xc04a), // shuffle buffer[2]
  KANA_SHUFFLE3: u16(0xc04b), // shuffle buffer[3]
  // The kana round never runs alongside dialogue, so it borrows these dialogue bytes:
  KANA_DATA_LO: u16(0xc025), // = DLG_STR_LO: pointer to the next question in ROM (lo)
  KANA_DATA_HI: u16(0xc026), // = DLG_STR_HI: pointer to the next question in ROM (hi)
  KANA_FEEDBACK_TIMER: u16(0xc022), // = DLG_DELAY: frames left in the feedback pause

  // WRAM — HUD delta flash
  DELTA_TYPE: u16(0xc04c), // 0=none, 1=+100, 2=+10, 3=-5, 4=-100
  DELTA_TIMER: u16(0xc04d), // Frames remaining for flash display

  // WRAM — what the HUD currently shows, so it only redraws on change
  HUD_SHOWN_LIVES: u16(0xc058),
  HUD_SHOWN_SCORE_LO: u16(0xc059),
  HUD_SHOWN_SCORE_HI: u16(0xc05a),
  HUD_SHOWN_DELTA: u16(0xc05b), // delta type on screen (0 = cleared)
  SCORE_DIGITS: u16(0xc082), // 5 digit tiles of the score, most significant first ($C082-$C086)

  // WRAM — kana rounds of the current scene (see rounds.ts)
  ROUNDS_LO: u16(0xc078), // pointer to the scene's rounds data (lo)
  ROUNDS_HI: u16(0xc079), // pointer to the scene's rounds data (hi)
  ROUNDS_DONE: u16(0xc07a), // bit i set = round i already played
  ROUND_RAN: u16(0xc07b), // a round ran since the last dialogue choice (the scene needs redrawing)
  CHANCES_LO: u16(0xc07c), // pointer to the scene's chances table (lo)
  CHANCES_HI: u16(0xc07d), // pointer to the scene's chances table (hi)
  KANA_MODE: u16(0xc07e), // KanaMode of the running round
  DLG_FROM_NODE: u16(0xc07f), // node the last choice was made at
  DLG_PICK: u16(0xc080), // last choice: logical index, bit 7 = bad answer
  KANA_STREAK: u16(0xc081), // first-try answers in a row toward the next streak bonus
  KANA_PROMPT: u16(0xc087), // nonzero = the current question asks for katakana (see MATCH_FLAG)
  KANA_CLOCK_FRAMES: u16(0xc088), // speed round: frames left in the current second
  KANA_CLOCK_SECS: u16(0xc089), // speed round: seconds left to answer

  // WRAM — the mascot sprite (see cat.ts)
  CAT_X: u16(0xc08a), // OAM x of the cat's left column while placing it
  CAT_COL: u16(0xc08b), // columns left in the row being placed
  CAT_FACE: u16(0xc08c), // face showing (index into CAT_FACES)
  CAT_REST: u16(0xc08d), // face it returns to after a reaction
  CAT_TIMER: u16(0xc08e), // frames left in a reaction
  CAT_BLINK: u16(0xc08f), // blink cycle counter

  // WRAM — scene system
  SCENE_ID: u16(0xc050), // Current scene index (0-4, 0xFF = title)
  SCENE_FLAGS: u16(0xc051), // Per-scene completion bitfield
  GAME_MODE: u16(0xc052), // 0=title, 1=dialogue, 2=kana, 3=transition
  TITLE_TIMER: u16(0xc053), // Title-screen animation timer (1 tick per frame)
  KANA_BLANK_LO: u16(0xc054), // VRAM address of the blanked kana in the word (lo)
  KANA_BLANK_HI: u16(0xc055), // VRAM address of the blanked kana in the word (hi)
  FADE_TABLE_LO: u16(0xc056), // Palette set on screen (lo)
  FADE_TABLE_HI: u16(0xc057), // Palette set on screen (hi)
  IS_CGB: u16(0xc060), // 1 on a Game Boy Color (A = $11 at boot), else 0
  NPC_TABLE_LO: u16(0xc061), // Current scene's NPC segment table (lo)
  NPC_TABLE_HI: u16(0xc062), // Current scene's NPC segment table (hi)
  NPC_CURRENT: u16(0xc063), // NPC on screen ($FF = none)
  NPC_TIMER: u16(0xc064), // Frame counter for the NPC's idle bob
  ANIM_LO: u16(0xc065), // Current scene's tile animation (lo)
  ANIM_HI: u16(0xc066), // Current scene's tile animation (hi)
  ANIM_TIMER: u16(0xc067), // Frame counter for the tile animation
  ANIM_FRAME: u16(0xc068), // Animation frame on screen
  NPC_X: u16(0xc069), // Speaker's OAM x (left half)
  NPC_Y: u16(0xc06a), // Speaker's OAM y (top half, before the bob)
} as const satisfies Record<string, U16>;

// Joypad bit flags (active-high after our read routine)
// High nibble = d-pad, low nibble = buttons
export const JOY = {
  A: 0x01,
  B: 0x02,
  SELECT: 0x04,
  START: 0x08,
  RIGHT: 0x10,
  LEFT: 0x20,
  UP: 0x40,
  DOWN: 0x80,
} as const;
