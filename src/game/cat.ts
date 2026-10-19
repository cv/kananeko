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
 *   cat_react  A = face: show it for a moment, then return to the resting face
 *   cat_rest   A = face: the face it returns to (and blinks from, if neutral)
 *   cat_tick   once per frame: count down a reaction, blink
 */

import { doWhile, ifThen, repeat } from '../asm/flow';
import { HW } from '../asm/hardware';
import { MEM } from './ram';
import { copyBlock, storeByte, zeroBytes } from '../asm/macros';
import { add, call, cp, dec, inc, jp, jr, label, ld, ldh, db, or, ret, and } from '../asm/sm83';
import { type Op, u16, Label, routine } from '../asm/types';
import { hi, lo } from '../asm/util';
import { sliceArt } from './art';
import { CAT_FACES, type CatFace, catArt } from './cat-art';
import { encodeGlyph } from './font';
import { HUES, INK, PAPER } from './palette';
import { OAM_X_OFFSET, OAM_Y_OFFSET, SPRITE_SLOT, oamField } from './sprites';
import type { Palette } from './video';
import { CAT_REST, CAT_REACT, CAT_TICK } from './labels';
import { gameModule } from '../asm/program';

// Labels placed in this module
const CAT_TILES = new Label('cat_tiles');
const CAT_PLACE = routine('cat_place', { clobbers: ['a', 'bc', 'de', 'hl'] });

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
  return [ld('b', spot.x), ld('c', spot.y), call(CAT_PLACE)];
}

/** Call CAT_REACT or CAT_REST with a face */
export function catFace(routine: typeof CAT_REACT, face: CatFace): Op[] {
  return [ld('a', FACE[face]), call(routine)];
}

/** At boot: copy the cat's tiles to sprite memory and set its GBC palette */
export function buildCatInit(): Op[] {
  return [
    ...copyBlock(u16(MEM.OBJ_TILES + CAT_SPRITE_BASE * 16), CAT_TILES, buildCatTiles().length),
    ld('a', 0x80 | (CAT_OBJ_PALETTE * 8)), // auto-increment from palette 7
    ldh([HW.OCPS], 'a'),
    ...CAT_PALETTE.flatMap((color) => [
      ld('a', lo(color)),
      ldh([HW.OCPD], 'a'),
      ld('a', hi(color)),
      ldh([HW.OCPD], 'a'),
    ]),
  ];
}

/** The cat's sprite tiles (copied at boot) */
export function buildCatData(): Op[] {
  return [label(CAT_TILES), db(buildCatTiles())];
}

export function buildCatRoutines(): Op[] {
  const setFace = new Label('cat_set_face');
  const showFace = new Label('cat_show_face');
  return [
    // cat_place: B = left, C = top
    label(CAT_PLACE),
    ld('a', 'b'),
    add(OAM_X_OFFSET),
    ld([MEM.CAT_X], 'a'),
    ld('a', 'c'),
    add(OAM_Y_OFFSET),
    ld('c', 'a'), // C = OAM y of the current row
    ld('hl', oamField(SPRITE_SLOT.cat, 'y')),
    ld('d', CAT_SPRITE_BASE), // D = tile
    ...repeat(
      ROWS,
      [
        ld('a', [MEM.CAT_X]),
        ld('b', 'a'), // B = OAM x of the current column
        ...storeByte(MEM.CAT_COL, COLS),
        ...doWhile('nz', [
          ld('a', 'c'),
          ld(['hl+'], 'a'),
          ld('a', 'b'),
          ld(['hl+'], 'a'),
          ld('a', 'd'),
          ld(['hl+'], 'a'),
          inc('d'),
          ld('a', CAT_OBJ_PALETTE),
          ld(['hl+'], 'a'),
          ld('a', 'b'),
          add(8),
          ld('b', 'a'),
          ld('a', [MEM.CAT_COL]),
          dec('a'),
          ld([MEM.CAT_COL], 'a'),
        ]),
        ld('a', 'c'),
        add(8),
        ld('c', 'a'),
      ],
      'e',
    ),
    jr(showFace),

    // cat_rest: A = resting face
    label(CAT_REST),
    ld([MEM.CAT_REST], 'a'),
    ...zeroBytes(MEM.CAT_TIMER), // clobbers A
    ld('a', [MEM.CAT_REST]),
    jr(setFace),

    // cat_react: A = face for REACT_FRAMES
    label(CAT_REACT),
    ld('b', 'a'),
    ...storeByte(MEM.CAT_TIMER, REACT_FRAMES),
    ld('a', 'b'),
    label(setFace),
    ld([MEM.CAT_FACE], 'a'),

    // cat_show_face: point the middle row's sprites at CAT_FACE's tiles
    label(showFace),
    ld('a', [MEM.CAT_FACE]),
    add('a'),
    add('a'),
    add(faceTile('neutral')),
    ld('hl', oamField(FACE_SLOT, 'tile')),
    ...repeat(COLS, [ld(['hl'], 'a'), inc('a'), inc('hl'), inc('hl'), inc('hl'), inc('hl')]),
    ret(),

    // cat_tick: end a reaction when its time is up; blink while resting neutral
    label(CAT_TICK),
    ld('a', [MEM.CAT_TIMER]),
    or('a'),
    ...ifThen('nz', [
      dec('a'),
      ld([MEM.CAT_TIMER], 'a'),
      ret('nz'),
      ld('a', [MEM.CAT_REST]),
      jr(setFace),
    ]),
    ld('a', [MEM.CAT_REST]),
    cp(FACE.neutral),
    ret('nz'), // only a neutral cat blinks
    ld('a', [MEM.CAT_BLINK]),
    inc('a'),
    ld([MEM.CAT_BLINK], 'a'),
    and(BLINK_PERIOD - 1),
    cp(BLINK_PERIOD - BLINK_FRAMES),
    ...ifThen('nz', [or('a'), ret('nz'), ld('a', FACE.neutral), jr(setFace)]),
    ld('a', FACE.blink),
    jp(setFace),
  ];
}

export const catModule = gameModule({
  name: 'cat',
  init: buildCatInit,
  code: buildCatRoutines,
  data: buildCatData,
});
