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
  VRAM_TILES: u16(0x8000), // Tile data start (mode $8000)
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

  // WRAM — HUD delta flash
  DELTA_TYPE: u16(0xc04c), // 0=none, 1=+100, 2=+10, 3=-5, 4=-100
  DELTA_TIMER: u16(0xc04d), // Frames remaining for flash display

  // WRAM — scene system
  SCENE_ID: u16(0xc050), // Current scene index (0-4, 0xFF = title)
  SCENE_FLAGS: u16(0xc051), // Per-scene completion bitfield
  GAME_MODE: u16(0xc052), // 0=title, 1=dialogue, 2=kana, 3=transition
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
