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

  // Sound
  NR52: ioReg(0x26), // Sound on/off

  // Interrupts
  IF: ioReg(0x0f), // Interrupt flag
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
  DLG_META0_LO: u16(0xc02d), // ROM ptr to choice 0's next_node byte
  DLG_META0_HI: u16(0xc02e),
  DLG_META1_LO: u16(0xc02f), // ROM ptr to choice 1's next_node byte
  DLG_META1_HI: u16(0xc030),
  DLG_META2_LO: u16(0xc031), // ROM ptr to choice 2's next_node byte
  DLG_META2_HI: u16(0xc032),

  // WRAM — kana mini-game
  KANA_STATE: u16(0xc040), // 0=idle, 1=showing, 2=awaiting, 3=feedback
  KANA_CORRECT: u16(0xc041), // Correct direction (0=up,1=down,2=left,3=right)
  KANA_ANSWER: u16(0xc042), // Player's answer direction
  KANA_SCORE: u16(0xc043), // Confidence meter (0-255)
  KANA_Q_IDX: u16(0xc044), // Current question index

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
