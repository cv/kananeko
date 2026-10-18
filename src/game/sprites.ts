/**
 * Sprites: a shadow copy of OAM in WRAM, transferred to OAM by DMA once a
 * frame (right after HALT, inside VBlank). Writing the shadow is always safe.
 */

import { HW, MEM } from '../asm/hardware';
import { copyBytes, zeroPages } from '../asm/macros';
import {
  call,
  db,
  dec_r,
  inc_rr,
  jr_cc,
  label,
  ld_a_de,
  ld_r_n,
  ld_rr_nn,
  ldh_n_a,
  ldi_hl_a,
} from '../asm/ops';
import { type Op, type U16, ref, u8, u16 } from '../asm/types';
import { hi } from '../asm/util';
import { encodeGlyph, glyphOf } from './font';
import { type Palette, rgb } from './video';

/** Shadow OAM: 40 sprites x 4 bytes, page-aligned for DMA */
export const SHADOW_OAM = u16(0xc100);
/** HRAM address the DMA routine is copied to (the CPU can only run from HRAM during DMA) */
const DMA_HRAM = u16(0xff80);
/** OAM coordinates are offset from the screen's top-left corner */
export const OAM_Y_OFFSET = 16;
export const OAM_X_OFFSET = 8;

export const SPRITE_SLOT = { cursor: 0 } as const;

/** Sprite tile indices (in the sprite-only $8000-$87FF block) */
export const SPRITE_TILES = { cursor: 0 } as const;

/** Glyphs copied into sprite tile memory at boot, in SPRITE_TILES order */
const SPRITE_GLYPHS = ['▶'] as const;

const FIELD_OFFSET = { y: 0, x: 1, tile: 2, attr: 3 } as const;

/** Shadow OAM address of one field of a sprite */
export function oamField(slot: number, field: keyof typeof FIELD_OFFSET): U16 {
  return u16(SHADOW_OAM + slot * 4 + FIELD_OFFSET[field]);
}

/** Start OAM DMA from the shadow page, then wait the 160 M-cycles it takes. */
const DMA_ROUTINE = [
  0x3e,
  hi(SHADOW_OAM), // ld a, high(SHADOW_OAM)
  0xe0,
  0x46, //          ldh (DMA), a
  0x3e,
  0x28, //          ld a, 40
  0x3d, //                loop: dec a
  0x20,
  0xfd, //          jr nz, loop
  0xc9, //                ret
] as const;

/** Sprite palette: transparent, light, mid, ink */
const OBJ_PALETTE: Palette = [
  rgb(0xff, 0xff, 0xff),
  rgb(0xc0, 0xc0, 0xc0),
  rgb(0x60, 0x60, 0x60),
  rgb(0x18, 0x18, 0x20),
];

/** Clear the shadow OAM, install the DMA routine, and set sprite palettes. */
export function buildSpriteInit(): Op[] {
  return [
    ...zeroPages('sprite_clear', SHADOW_OAM, 1),
    ...copyBytes('sprite_tile_copy', MEM.OBJ_TILES, ref('sprite_tiles'), SPRITE_TILE_BYTES),
    ld_rr_nn('hl', DMA_HRAM),
    ld_rr_nn('de', ref('dma_routine')),
    ld_r_n('b', u8(DMA_ROUTINE.length)),
    label('sprite_copy_dma'),
    ld_a_de(),
    inc_rr('de'),
    ldi_hl_a(),
    dec_r('b'),
    jr_cc('nz', ref('sprite_copy_dma')),

    ld_r_n('a', u8(0xe4)), // DMG: color index → shade, same as the background
    ldh_n_a(HW.OBP0),
    ld_r_n('a', u8(0x80)), // GBC OBJ palette 0, auto-increment
    ldh_n_a(HW.OCPS),
    ...OBJ_PALETTE.flatMap((color) => [
      ld_r_n('a', u8(color & 0xff)),
      ldh_n_a(HW.OCPD),
      ld_r_n('a', u8(color >> 8)),
      ldh_n_a(HW.OCPD),
    ]),
  ];
}

/** The DMA routine's bytes, copied to HRAM at boot, and the sprite tiles */
export function buildSpriteData(): Op[] {
  const tiles = SPRITE_GLYPHS.flatMap((ch) => Array.from(encodeGlyph(glyphOf(ch))));
  return [label('dma_routine'), db([...DMA_ROUTINE]), label('sprite_tiles'), db(tiles)];
}

const SPRITE_TILE_BYTES = SPRITE_GLYPHS.length * 16;

/** Copy the shadow OAM to OAM. Call right after HALT (VBlank). */
export function runDma(): Op[] {
  return [call(DMA_HRAM)];
}
