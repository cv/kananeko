/**
 * One entry per scene with everything the engine loads for it: pointers to its
 * data, and the counts and positions that go with them. The engine finds the
 * current entry once per scene (scene_desc) and reads fields from it
 * (scene_word, scene_byte), instead of switching on the scene for every load.
 */

import { MEM } from './ram';
import { loadPointer, storePointer, tableEntry } from '../asm/macros';
import { add, call, dec, dw, inc, jr, label, ld, or, pop, push, ret } from '../asm/sm83';
import { type Op, type U16, Label, routine } from '../asm/types';
import { at } from '../asm/util';
import { SCENE_DESC } from './labels';
import { gameModule } from '../asm/program';
import { type FieldsOf, type RecordOf, byte, struct, word } from '../asm/struct';

// Labels placed in this module
const SCENE_TABLE = new Label('scene_table');
const SCENE_WORD = routine('scene_word', { out: ['hl'], clobbers: ['a', 'de'] });
const SCENE_BYTE = routine('scene_byte', { out: ['a'], clobbers: ['de', 'hl'] });
const COPY_BLOCK = routine('copy_block', { clobbers: ['a', 'bc', 'de', 'hl'] });

/** One scene's entry in scene_table: what the engine loads for it */
export const SCENE_ENTRY = struct('scene entry', {
  dialogue: word(),
  rounds: word(),
  chances: word(),
  fade: word(),
  tiles: word(),
  tilesLength: word(),
  backdrop: word(),
  castTiles: word(),
  castTilesLength: word(),
  castPalettes: word(),
  castTable: word(),
  animation: word(),
  colors: word(),
  nameTiles: word(),
  nameAddress: word(),
  castPaletteBytes: byte(),
  stageX: byte(),
  stageY: byte(),
  flag: byte(),
});

type SceneFields = typeof SCENE_ENTRY.fields;
export type SceneWord = FieldsOf<SceneFields, 'word'>;
export type SceneByte = FieldsOf<SceneFields, 'byte'>;
export type SceneEntry = RecordOf<SceneFields>;

/** The table: scene_table lists each entry's address; entries follow */
export function buildSceneTable(entries: readonly SceneEntry[]): Op[] {
  const labels = entries.map((_, i) => new Label(`scene_entry${String(i)}`));
  return [
    label(SCENE_TABLE),
    ...labels.map((l) => dw(l)),
    ...entries.flatMap((entry, i) => [label(at(labels, i)), ...SCENE_ENTRY.encode(entry)]),
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
    ...tableEntry(SCENE_TABLE, 2),
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
  return [ld('a', SCENE_ENTRY.offset[field]), call(SCENE_WORD)];
}

/** A = a byte field of the current scene */
export function sceneByte(field: SceneByte): Op[] {
  return [ld('a', SCENE_ENTRY.offset[field]), call(SCENE_BYTE)];
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

export const sceneTableModule = gameModule({ name: 'scene table', code: buildSceneTableRoutines });
