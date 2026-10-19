/**
 * Kananeko on screen: the mascot as 12 sprites (4x3 tiles) with its own GBC
 * palette, so it keeps its colors on every screen. Faces swap the middle row's
 * four tiles.
 *
 * Sprite tiles from CAT_SPRITE_BASE: the neutral picture (12 tiles, row-major),
 * then the middle row of every face in CAT_FACES order (4 tiles each).
 *
 * Subroutines:
 *   cat_place  B = left, C = top (screen pixels): show the cat with its current face
 *   cat_hide   take it off screen
 *   cat_react  A = face: show it for a moment, then return to the resting face
 *   cat_rest   A = face: the face it returns to (and blinks from, if neutral)
 *   cat_tick   once per frame: count down a reaction, blink
 */

import { HW, MEM } from '../asm/hardware';
import { copyBlock, storeByte, zeroBytes } from '../asm/macros';
import {
  add_n,
  add_r,
  call,
  cp_n,
  dec_r,
  inc_r,
  inc_rr,
  jp,
  jr,
  jr_cc,
  label,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldh_n_a,
  db,
  ldi_hl_a,
  or_r,
  ret,
  ret_cc,
  and_n,
  xor_r,
} from '../asm/ops';
import { type Op, ref, u8, u16 } from '../asm/types';
import { hi, lo } from '../asm/util';
import { sliceArt } from './art';
import { CAT_FACES, type CatFace, catArt } from './cat-art';
import { encodeGlyph } from './font';
import { HUES, INK, PAPER } from './palette';
import { OAM_X_OFFSET, OAM_Y_OFFSET, SPRITE_SLOT, oamField } from './sprites';
import { type Palette } from './video';

export { CAT_FACES, type CatFace };

/** First sprite tile of the cat (NPC tiles sit below it) */
export const CAT_SPRITE_BASE = 64;
/** GBC OBJ palette of the cat (NPCs use 1..MAX_CAST) */
export const CAT_OBJ_PALETTE = 7;
export const CAT_PALETTE: Palette = [PAPER, ...HUES.ginger, INK];

const COLS = 4;
const ROWS = 3;
/** First OAM slot of the face row (row 1) */
const FACE_SLOT = SPRITE_SLOT.cat + COLS;
/** Frames a reaction shows before the cat goes back to resting */
export const REACT_FRAMES = 60;
/** Blink: every BLINK_PERIOD frames, for BLINK_FRAMES */
const BLINK_PERIOD = 128;
const BLINK_FRAMES = 8;

export const FACE: Record<CatFace, number> = Object.fromEntries(
  CAT_FACES.map((face, i) => [face, i]),
) as Record<CatFace, number>;

/** Where the cat sits on each kind of screen (screen pixels, top-left) */
export const CAT_SPOTS = {
  /** Title and result screens: centered above the title */
  portrait: { x: 64, y: 16 },
  /** Quiz: bottom-left, beside the answers */
  quiz: { x: 16, y: 88 },
  /** Scenes: sitting on the dialogue box's top-left corner, paws over the edge */
  dialogue: { x: 8, y: 55 },
} as const;

/** Sprite tile data: the neutral picture, then each face's middle row */
export function buildCatTiles(): Uint8Array {
  const neutral = sliceArt(catArt('neutral'));
  const faceRows = CAT_FACES.flatMap((face) => sliceArt(catArt(face)).slice(COLS, 2 * COLS));
  return Uint8Array.from([...neutral, ...faceRows].flatMap((glyph) => [...encodeGlyph(glyph)]));
}

/** First tile of a face's middle row */
export function faceTile(face: CatFace): number {
  return CAT_SPRITE_BASE + COLS * ROWS + FACE[face] * COLS;
}

/** Call cat_place for a spot */
export function placeCat(spot: { readonly x: number; readonly y: number }): Op[] {
  return [ld_r_n('b', u8(spot.x)), ld_r_n('c', u8(spot.y)), call(ref('cat_place'))];
}

/** Call cat_react / cat_rest with a face */
export function catFace(routine: 'cat_react' | 'cat_rest', face: CatFace): Op[] {
  return [ld_r_n('a', u8(FACE[face])), call(ref(routine))];
}

/** At boot: copy the cat's tiles to sprite memory and set its GBC palette */
export function buildCatInit(): Op[] {
  return [
    ...copyBlock(
      'cat_tile_copy',
      u16(MEM.OBJ_TILES + CAT_SPRITE_BASE * 16),
      ref('cat_tiles'),
      buildCatTiles().length,
    ),
    ld_r_n('a', u8(0x80 | (CAT_OBJ_PALETTE * 8))), // auto-increment from palette 7
    ldh_n_a(HW.OCPS),
    ...CAT_PALETTE.flatMap((color) => [
      ld_r_n('a', lo(color)),
      ldh_n_a(HW.OCPD),
      ld_r_n('a', hi(color)),
      ldh_n_a(HW.OCPD),
    ]),
  ];
}

/** The cat's sprite tiles (copied at boot) */
export function buildCatData(): Op[] {
  return [label('cat_tiles'), db(buildCatTiles())];
}

export function buildCatRoutines(): Op[] {
  return [
    // cat_place: B = left, C = top
    label('cat_place'),
    ld_r_r('a', 'b'),
    add_n(u8(OAM_X_OFFSET)),
    ld_nn_a(MEM.CAT_X),
    ld_r_r('a', 'c'),
    add_n(u8(OAM_Y_OFFSET)),
    ld_r_r('c', 'a'), // C = OAM y of the current row
    ld_rr_nn('hl', oamField(SPRITE_SLOT.cat, 'y')),
    ld_r_n('d', u8(CAT_SPRITE_BASE)), // D = tile
    ld_r_n('e', u8(ROWS)),
    label('cat_place_row'),
    ld_a_nn(MEM.CAT_X),
    ld_r_r('b', 'a'), // B = OAM x of the current column
    ...storeByte(MEM.CAT_COL, COLS),
    label('cat_place_col'),
    ld_r_r('a', 'c'),
    ldi_hl_a(),
    ld_r_r('a', 'b'),
    ldi_hl_a(),
    ld_r_r('a', 'd'),
    ldi_hl_a(),
    inc_r('d'),
    ld_r_n('a', u8(CAT_OBJ_PALETTE)),
    ldi_hl_a(),
    ld_r_r('a', 'b'),
    add_n(u8(8)),
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.CAT_COL),
    dec_r('a'),
    ld_nn_a(MEM.CAT_COL),
    jr_cc('nz', ref('cat_place_col')),
    ld_r_r('a', 'c'),
    add_n(u8(8)),
    ld_r_r('c', 'a'),
    dec_r('e'),
    jr_cc('nz', ref('cat_place_row')),
    jr(ref('cat_show_face')),

    // cat_hide
    label('cat_hide'),
    ld_rr_nn('hl', oamField(SPRITE_SLOT.cat, 'y')),
    ld_r_n('b', u8(COLS * ROWS)),
    xor_r('a'),
    label('cat_hide_slot'),
    ldi_hl_a(),
    inc_rr('hl'),
    inc_rr('hl'),
    inc_rr('hl'),
    dec_r('b'),
    jr_cc('nz', ref('cat_hide_slot')),
    ret(),

    // cat_rest: A = resting face
    label('cat_rest'),
    ld_nn_a(MEM.CAT_REST),
    ...zeroBytes(MEM.CAT_TIMER), // clobbers A
    ld_a_nn(MEM.CAT_REST),
    jr(ref('cat_set_face')),

    // cat_react: A = face for REACT_FRAMES
    label('cat_react'),
    ld_r_r('b', 'a'),
    ...storeByte(MEM.CAT_TIMER, REACT_FRAMES),
    ld_r_r('a', 'b'),
    label('cat_set_face'),
    ld_nn_a(MEM.CAT_FACE),

    // cat_show_face: point the middle row's sprites at CAT_FACE's tiles
    label('cat_show_face'),
    ld_a_nn(MEM.CAT_FACE),
    add_r('a'),
    add_r('a'),
    add_n(u8(faceTile('neutral'))),
    ld_rr_nn('hl', oamField(FACE_SLOT, 'tile')),
    ld_r_n('b', u8(COLS)),
    label('cat_face_tile'),
    ld_r_r('hl_ptr', 'a'),
    inc_r('a'),
    inc_rr('hl'),
    inc_rr('hl'),
    inc_rr('hl'),
    inc_rr('hl'),
    dec_r('b'),
    jr_cc('nz', ref('cat_face_tile')),
    ret(),

    // cat_tick: end a reaction when its time is up; blink while resting neutral
    label('cat_tick'),
    ld_a_nn(MEM.CAT_TIMER),
    or_r('a'),
    jr_cc('z', ref('cat_tick_rest')),
    dec_r('a'),
    ld_nn_a(MEM.CAT_TIMER),
    ret_cc('nz'),
    ld_a_nn(MEM.CAT_REST),
    jr(ref('cat_set_face')),
    label('cat_tick_rest'),
    ld_a_nn(MEM.CAT_REST),
    cp_n(u8(FACE.neutral)),
    ret_cc('nz'), // only a neutral cat blinks
    ld_a_nn(MEM.CAT_BLINK),
    inc_r('a'),
    ld_nn_a(MEM.CAT_BLINK),
    and_n(u8(BLINK_PERIOD - 1)),
    cp_n(u8(BLINK_PERIOD - BLINK_FRAMES)),
    jr_cc('z', ref('cat_tick_blink')),
    or_r('a'),
    ret_cc('nz'),
    ld_r_n('a', u8(FACE.neutral)),
    jr(ref('cat_set_face')),
    label('cat_tick_blink'),
    ld_r_n('a', u8(FACE.blink)),
    jp(ref('cat_set_face')),
  ];
}
