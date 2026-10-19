/**
 * One entry per scene with everything the engine loads for it: pointers to its
 * data, and the counts and positions that go with them. The engine finds the
 * current entry once per scene (scene_desc) and reads fields from it
 * (scene_word, scene_byte), instead of switching on the scene for every load.
 */

import { MEM } from './ram';
import { loadPointer, storePointer } from '../asm/macros';
import { add, call, db, dec, dw, inc, jr, label, ld, or, pop, push, ret } from '../asm/sm83';
import { type Op, type Target, type U16, Label, routine } from '../asm/types';
import { at } from '../asm/util';
import { SCENE_DESC } from './labels';

// Labels placed in this module
const SCENE_TABLE = new Label('scene_table');
const SCENE_WORD = routine('scene_word', { out: ['hl'], clobbers: ['a', 'de'] });
const SCENE_BYTE = routine('scene_byte', { out: ['a'], clobbers: ['de', 'hl'] });
const COPY_BLOCK = routine('copy_block', { clobbers: ['a', 'bc', 'de', 'hl'] });

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
    ld('a', [MEM.SCENE_ID]),
    add('a'),
    ld('e', 'a'),
    ld('d', 0),
    ld('hl', SCENE_TABLE),
    add('hl', 'de'),
    ld('a', ['hl+']),
    ld('h', ['hl']),
    ld('l', 'a'),
    ...storePointer('hl', MEM.SCENE_DESC),
    ret(),

    label(SCENE_WORD),
    ld('e', 'a'),
    ld('d', 0),
    ...loadPointer('hl', MEM.SCENE_DESC),
    add('hl', 'de'),
    ld('a', ['hl+']),
    ld('h', ['hl']),
    ld('l', 'a'),
    ret(),

    label(SCENE_BYTE),
    ld('e', 'a'),
    ld('d', 0),
    ...loadPointer('hl', MEM.SCENE_DESC),
    add('hl', 'de'),
    ld('a', ['hl']),
    ret(),

    label(COPY_BLOCK),
    ld('a', ['de']),
    ld(['hl+'], 'a'),
    inc('de'),
    dec('bc'),
    ld('a', 'b'),
    or('c'),
    jr('nz', COPY_BLOCK),
    ret(),
  ];
}

/** HL = a word field of the current scene */
export function sceneWord(field: SceneWord): Op[] {
  return [ld('a', SCENE_FIELD[field]), call(SCENE_WORD)];
}

/** A = a byte field of the current scene */
export function sceneByte(field: SceneByte): Op[] {
  return [ld('a', SCENE_FIELD[field]), call(SCENE_BYTE)];
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
    ld('b', 'h'),
    ld('c', 'l'),
    pop('de'),
    ld('hl', dst),
    call(COPY_BLOCK),
  ];
}
