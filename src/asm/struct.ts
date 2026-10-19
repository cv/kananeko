/**
 * Record layouts declared once: the field offsets the assembly reads, the encoder that
 * writes records into the ROM, and a decoder for tests all come from one declaration.
 *
 *   const ENTRY = struct('scene entry', { dialogue: word(), stageX: byte() });
 *   ENTRY.offset.stageX   // 2
 *   ENTRY.encode({ dialogue: SCENE0_DLG, stageX: 40 })   // [dw(SCENE0_DLG), db([40])]
 *
 * Fields are laid out in declaration order; words are little-endian.
 */

import { db, dw } from './ops';
import { type Op, type Target, u16 } from './types';

export interface ByteField {
  readonly kind: 'byte';
}

export interface WordField {
  readonly kind: 'word';
}

export type Field = ByteField | WordField;

/** A 1-byte field */
export function byte(): ByteField {
  return { kind: 'byte' };
}

/** A 2-byte field: a 16-bit number, or the address of a label or pooled data */
export function word(): WordField {
  return { kind: 'word' };
}

export type Fields = Readonly<Record<string, Field>>;

/** The names of a layout's fields of one kind */
export type FieldsOf<F extends Fields, K extends Field['kind']> = {
  [N in keyof F]: F[N]['kind'] extends K ? N : never;
}[keyof F] &
  string;

/** What a record holds: numbers for bytes, numbers or addresses for words */
export type RecordOf<F extends Fields> = {
  readonly [N in keyof F]: F[N] extends WordField ? number | Target : number;
};

export interface Struct<F extends Fields> {
  readonly name: string;
  readonly fields: F;
  /** Bytes per record */
  readonly size: number;
  /** Each field's byte offset in a record */
  readonly offset: { readonly [N in keyof F]: number };
  /** The data of one record */
  encode(record: RecordOf<F>): Op[];
  /** Read one record back from bytes (tests): words as numbers */
  decode(bytes: ArrayLike<number>, at?: number): { readonly [N in keyof F]: number };
}

const SIZE = { byte: 1, word: 2 } as const;

/** Lay out a record type's fields in declaration order */
export function struct<const F extends Fields>(name: string, fields: F): Struct<F> {
  const offset: Record<string, number> = {};
  let size = 0;
  for (const [field, kind] of Object.entries(fields)) {
    offset[field] = size;
    size += SIZE[kind.kind];
  }
  const entries = Object.entries(fields);

  return {
    name,
    fields,
    size,
    offset: offset as { readonly [N in keyof F]: number },
    encode(record): Op[] {
      const values = record as Readonly<Record<string, number | Target>>;
      return entries.map(([field, { kind }]) => {
        const value = values[field];
        if (value === undefined) throw new Error(`${name}: no value for ${field}`);
        if (kind === 'word') return dw(typeof value === 'number' ? u16(value) : value);
        if (typeof value !== 'number')
          throw new Error(`${name}.${field} is a byte, not an address`);
        return db([value]);
      });
    },
    decode(bytes, at = 0): { readonly [N in keyof F]: number } {
      const out: Record<string, number> = {};
      for (const [field, { kind }] of entries) {
        const i = at + (offset[field] ?? 0);
        const lo = bytes[i] ?? 0;
        out[field] = kind === 'word' ? lo | ((bytes[i + 1] ?? 0) << 8) : lo;
      }
      return out as { readonly [N in keyof F]: number };
    },
  };
}
