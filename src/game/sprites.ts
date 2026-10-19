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
  jp,
  label,
  ld_a_de,
  ld_r_n,
  ld_rr_nn,
  ldh_n_a,
  ldi_hl_a,
} from '../asm/ops';
import { type Op, type U16, u8, u16, Label } from '../asm/types';
import { hi, lo } from '../asm/util';
import { encodeGlyph, glyphOf } from './font';
import type { Palette } from './video';
import { HUES, INK, PAPER } from './palette';
import { UI_TILES } from './font-data';
import { SPRITES_OFF } from './labels';

// Labels placed in this module
const SPRITE_COPY_DMA = new Label('sprite_copy_dma');
const DMA_ROUTINE = new Label('dma_routine');
const SPRITE_TILES = new Label('sprite_tiles');

/** Shadow OAM: 40 sprites x 4 bytes, page-aligned for DMA */
export const SHADOW_OAM = u16(0xc100);
/** HRAM address the DMA routine is copied to (the CPU can only run from HRAM during DMA) */
const DMA_HRAM = u16(0xff80);
/** OAM coordinates are offset from the screen's top-left corner */
export const OAM_Y_OFFSET = 16;
export const OAM_X_OFFSET = 8;

export const SPRITE_SLOT = { cursor: 0, npc: 1, cat: 5 } as const;

/** Sprite tile indices (in the sprite-only $8000-$87FF block) */
export const SPRITE_TILE = { cursor: 0 } as const;

/** Glyphs copied into sprite tile memory at boot, in SPRITE_TILE order */
const SPRITE_GLYPHS = [UI_TILES.PAW] as const;

const FIELD_OFFSET = { y: 0, x: 1, tile: 2, attr: 3 } as const;

/** Shadow OAM address of one field of a sprite */
export function oamField(slot: number, field: keyof typeof FIELD_OFFSET): U16 {
  return u16(SHADOW_OAM + slot * 4 + FIELD_OFFSET[field]);
}

/** Start OAM DMA from the shadow page, then wait the 160 M-cycles it takes. */
const DMA_ROUTINE_BYTES = [
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

/** Sprite palette 0 (the paw cursor): transparent, then sakura and ink */
const OBJ_PALETTE: Palette = [PAPER, ...HUES.sakura, INK];

/** Clear the shadow OAM, install the DMA routine, and set sprite palettes. */
export function buildSpriteInit(): Op[] {
  return [
    ...zeroPages('sprite_clear', SHADOW_OAM, 1),
    ...copyBytes('sprite_tile_copy', MEM.OBJ_TILES, SPRITE_TILES, SPRITE_TILE_BYTES),
    ld_rr_nn('hl', DMA_HRAM),
    ld_rr_nn('de', DMA_ROUTINE),
    ld_r_n('b', u8(DMA_ROUTINE_BYTES.length)),
    label(SPRITE_COPY_DMA),
    ld_a_de(),
    inc_rr('de'),
    ldi_hl_a(),
    dec_r('b'),
    jr_cc('nz', SPRITE_COPY_DMA),

    ld_r_n('a', u8(0xe4)), // DMG: color index → shade, same as the background
    ldh_n_a(HW.OBP0),
    ld_r_n('a', u8(0x80)), // GBC OBJ palette 0, auto-increment
    ldh_n_a(HW.OCPS),
    ...OBJ_PALETTE.flatMap((color) => [
      ld_r_n('a', lo(color)),
      ldh_n_a(HW.OCPD),
      ld_r_n('a', hi(color)),
      ldh_n_a(HW.OCPD),
    ]),
  ];
}

/** The DMA routine's bytes, copied to HRAM at boot, and the sprite tiles */
export function buildSpriteData(): Op[] {
  const tiles = SPRITE_GLYPHS.flatMap((ch) => Array.from(encodeGlyph(glyphOf(ch))));
  return [label(DMA_ROUTINE), db([...DMA_ROUTINE_BYTES]), label(SPRITE_TILES), db(tiles)];
}

const SPRITE_TILE_BYTES = SPRITE_GLYPHS.length * 16;

/** Subroutine sprites_off: take every sprite off screen (before a fade or screen change) */
export function buildSpriteRoutines(): Op[] {
  return [label(SPRITES_OFF), ...zeroPages('sprites_off_clear', SHADOW_OAM, 1), jp(DMA_HRAM)];
}

/** Copy the shadow OAM to OAM. Call right after HALT (VBlank). */
export function runDma(): Op[] {
  return [call(DMA_HRAM)];
}
