/**
 * Sprites: a shadow copy of OAM in WRAM, transferred to OAM by DMA once a
 * frame (right after HALT, inside VBlank). Writing the shadow is always safe.
 */

import { HW } from '../asm/hardware';
import { MEM } from './ram';
import { copyBytes, zeroPages } from '../asm/macros';
import { call, db, dec, inc, jr, jp, label, ld, ldh } from '../asm/sm83';
import { type Op, type U16, u16, Label } from '../asm/types';
import { hi, lo } from '../asm/util';
import { encodeGlyph, glyphOf } from './font';
import type { Palette } from './video';
import { HUES, INK, PAPER } from './palette';
import { UI_TILES } from './font-data';
import { OAM_DMA, SPRITES_OFF } from './labels';
import { gameModule } from '../asm/program';
import { byte, struct } from '../asm/struct';

// Labels placed in this module
const SPRITE_COPY_DMA = new Label('sprite_copy_dma');
const DMA_ROUTINE = new Label('dma_routine');
const SPRITE_TILES = new Label('sprite_tiles');

/** Shadow OAM: 40 sprites x 4 bytes, page-aligned for DMA (see SHADOW_OAM_REGION) */
export const SHADOW_OAM = MEM.SHADOW_OAM.address;
/** HRAM address the DMA routine is copied to (the CPU can only run from HRAM during DMA) */
const DMA_HRAM = MEM.OAM_DMA.address;
/** OAM coordinates are offset from the screen's top-left corner */
export const OAM_Y_OFFSET = 16;
export const OAM_X_OFFSET = 8;

export const SPRITE_SLOT = { cursor: 0, npc: 1, cat: 5 } as const;

/** Sprite tile indices (in the sprite-only $8000-$87FF block) */
export const SPRITE_TILE = { cursor: 0 } as const;

/** Glyphs copied into sprite tile memory at boot, in SPRITE_TILE order */
const SPRITE_GLYPHS = [UI_TILES.PAW] as const;

/** One sprite's entry in OAM (and in the shadow copy) */
const OAM_ENTRY = struct('OAM entry', { y: byte(), x: byte(), tile: byte(), attr: byte() });

/** Shadow OAM address of one field of a sprite */
export function oamField(slot: number, field: keyof typeof OAM_ENTRY.offset): U16 {
  return u16(SHADOW_OAM + slot * OAM_ENTRY.size + OAM_ENTRY.offset[field]);
}

/** Start OAM DMA from the shadow page, then wait the 160 M-cycles it takes. */
export const DMA_ROUTINE_BYTES = [
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
    ...zeroPages(SHADOW_OAM, 1),
    ...copyBytes(MEM.OBJ_TILES, SPRITE_TILES, SPRITE_TILE_BYTES),
    ld('hl', DMA_HRAM),
    ld('de', DMA_ROUTINE),
    ld('b', DMA_ROUTINE_BYTES.length),
    label(SPRITE_COPY_DMA),
    ld('a', ['de']),
    inc('de'),
    ld(['hl+'], 'a'),
    dec('b'),
    jr('nz', SPRITE_COPY_DMA),

    ld('a', 0xe4), // DMG: color index → shade, same as the background
    ldh([HW.OBP0], 'a'),
    ld('a', 0x80), // GBC OBJ palette 0, auto-increment
    ldh([HW.OCPS], 'a'),
    ...OBJ_PALETTE.flatMap((color) => [
      ld('a', lo(color)),
      ldh([HW.OCPD], 'a'),
      ld('a', hi(color)),
      ldh([HW.OCPD], 'a'),
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
  return [label(SPRITES_OFF), ...zeroPages(SHADOW_OAM, 1), jp(OAM_DMA)];
}

/** Copy the shadow OAM to OAM. Call right after HALT (VBlank). */
export function runDma(): Op[] {
  return [call(OAM_DMA)];
}

export const spritesModule = gameModule({
  name: 'sprites',
  init: buildSpriteInit,
  code: buildSpriteRoutines,
  data: buildSpriteData,
});
