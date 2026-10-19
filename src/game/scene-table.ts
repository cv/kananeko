/**
 * One entry per scene with everything the engine loads for it: pointers to its
 * data, and the counts and positions that go with them. The engine finds the
 * current entry once per scene (scene_desc) and reads fields from it
 * (scene_word, scene_byte), instead of switching on the scene for every load.
 */

import { MEM } from './ram';
import { loadPointer, storePointer } from '../asm/macros';
import {
  add_hl_rr,
  add_r,
  call,
  db,
  dec_rr,
  dw,
  inc_rr,
  jr_cc,
  label,
  ld_a_de,
  ld_a_nn,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldi_a_hl,
  ldi_hl_a,
  or_r,
  pop,
  push,
  ret,
} from '../asm/ops';
import { type Op, type Target, type U16, u8, Label } from '../asm/types';
import { at } from '../asm/util';
import { SCENE_DESC } from './labels';

// Labels placed in this module
const SCENE_TABLE = new Label('scene_table');
const SCENE_WORD = new Label('scene_word');
const SCENE_BYTE = new Label('scene_byte');
const COPY_BLOCK = new Label('copy_block');

/** Word fields (2 bytes each), then byte fields */
const WORDS = [
  'dialogue',
  'rounds',
  'chances',
  'fade',
  'tiles',
  'tilesLength',
  'backdrop',
  'castTiles',
  'castTilesLength',
  'castPalettes',
  'castTable',
  'animation',
  'colors',
  'nameTiles',
  'nameAddress',
] as const;
const BYTES = ['castPaletteBytes', 'stageX', 'stageY', 'flag'] as const;

export type SceneWord = (typeof WORDS)[number];
export type SceneByte = (typeof BYTES)[number];

/** Byte offset of each field in an entry */
export const SCENE_FIELD: Readonly<Record<SceneWord | SceneByte, number>> = Object.fromEntries([
  ...WORDS.map((name, i) => [name, i * 2] as const),
  ...BYTES.map((name, i) => [name, WORDS.length * 2 + i] as const),
]) as Record<SceneWord | SceneByte, number>;

export type SceneEntry = Readonly<Record<SceneWord, U16 | Target>> &
  Readonly<Record<SceneByte, number>>;

/** The table: scene_table lists each entry's address; entries follow */
export function buildSceneTable(entries: readonly SceneEntry[]): Op[] {
  const labels = entries.map((_, i) => new Label(`scene_entry${String(i)}`));
  return [
    label(SCENE_TABLE),
    ...labels.map((l) => dw(l)),
    ...entries.flatMap((entry, i) => [
      label(at(labels, i)),
      ...WORDS.map((name) => dw(entry[name])),
      db(BYTES.map((name) => entry[name])),
    ]),
  ];
}

/**
 * Subroutines:
 *   scene_desc  find SCENE_ID's entry and remember it (SCENE_DESC)
 *   scene_word  A = field offset → HL = the field's word (clobbers A, DE)
 *   scene_byte  A = field offset → A = the field's byte (clobbers DE, HL)
 *   copy_block  copy BC (> 0) bytes from DE to HL (clobbers A, BC, DE, HL)
 */
export function buildSceneTableRoutines(): Op[] {
  return [
    label(SCENE_DESC),
    ld_a_nn(MEM.SCENE_ID),
    add_r('a'),
    ld_r_r('e', 'a'),
    ld_r_n('d', u8(0)),
    ld_rr_nn('hl', SCENE_TABLE),
    add_hl_rr('de'),
    ldi_a_hl(),
    ld_r_r('h', 'hl_ptr'),
    ld_r_r('l', 'a'),
    ...storePointer('hl', MEM.SCENE_DESC),
    ret(),

    label(SCENE_WORD),
    ld_r_r('e', 'a'),
    ld_r_n('d', u8(0)),
    ...loadPointer('hl', MEM.SCENE_DESC),
    add_hl_rr('de'),
    ldi_a_hl(),
    ld_r_r('h', 'hl_ptr'),
    ld_r_r('l', 'a'),
    ret(),

    label(SCENE_BYTE),
    ld_r_r('e', 'a'),
    ld_r_n('d', u8(0)),
    ...loadPointer('hl', MEM.SCENE_DESC),
    add_hl_rr('de'),
    ld_r_r('a', 'hl_ptr'),
    ret(),

    label(COPY_BLOCK),
    ld_a_de(),
    ldi_hl_a(),
    inc_rr('de'),
    dec_rr('bc'),
    ld_r_r('a', 'b'),
    or_r('c'),
    jr_cc('nz', COPY_BLOCK),
    ret(),
  ];
}

/** HL = a word field of the current scene */
export function sceneWord(field: SceneWord): Op[] {
  return [ld_r_n('a', u8(SCENE_FIELD[field])), call(SCENE_WORD)];
}

/** A = a byte field of the current scene */
export function sceneByte(field: SceneByte): Op[] {
  return [ld_r_n('a', u8(SCENE_FIELD[field])), call(SCENE_BYTE)];
}

/**
 * Copy a block whose source and length are word fields of the current scene to a
 * fixed address (LCD off).
 */
export function copySceneBlock(dst: U16, source: SceneWord, length: SceneWord): Op[] {
  return [
    ...sceneWord(source),
    push('hl'),
    ...sceneWord(length),
    ld_r_r('b', 'h'),
    ld_r_r('c', 'l'),
    pop('de'),
    ld_rr_nn('hl', dst),
    call(COPY_BLOCK),
  ];
}
