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
  NR10: ioReg(0x10), // Channel 1 (pulse with sweep): registers $FF10-$FF14
  NR21: ioReg(0x16), // Channel 2 (pulse): registers $FF16-$FF19 ($FF15 is unused)
  NR30: ioReg(0x1a), // Channel 3 (wave): registers $FF1A-$FF1E; bit 7 = DAC on
  NR50: ioReg(0x24), // Master volume (left/right)
  NR51: ioReg(0x25), // Which channels play on which side
  NR52: ioReg(0x26), // Sound on/off
  WAVE_RAM: ioReg(0x30), // Channel 3's 32 4-bit samples ($FF30-$FF3F)

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
export const HW_MEM = {
  VRAM: u16(0x8000),
  OBJ_TILES: u16(0x8000), // Sprite tiles 0-127 (sprites always use $8000 addressing)
  BG_TILES_HIGH: u16(0x8800), // BG tiles 128-255 in $8800 addressing (LCDC bit 4 clear)
  BG_TILES_LOW: u16(0x9000), // BG tiles 0-127 in $8800 addressing
  VRAM_MAP0: u16(0x9800), // BG tilemap 0
  VRAM_MAP1: u16(0x9c00), // BG tilemap 1
  OAM: u16(0xfe00),
  HRAM: u16(0xff80),
  IE: u16(0xffff), // Interrupt enable register
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
