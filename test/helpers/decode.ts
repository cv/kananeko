/**
 * Decoders for the ROM data formats, written independently of the encoders
 * so tests can check that encoding round-trips.
 */

import { CHAR_MAP } from '@game/font';
import { MATCH_FLAG } from '@game/kana';

const TILE_TO_CHAR = new Map(Object.entries(CHAR_MAP).map(([ch, tile]) => [tile as number, ch]));
const TEXT_END = 0xfe;

export type DecodedRating = 'ok' | 'good' | 'bad';
const BAD_FLAG = 0x80;
const NEXT_END = 0x7f;

function ratingOf(next: number, index: number): DecodedRating {
  if (next & BAD_FLAG) return 'bad';
  return index === 0 ? 'good' : 'ok';
}

export interface DecodedChoice {
  text: string;
  next: number | null;
  rating: DecodedRating;
}

export interface DecodedNode {
  text: string;
  choices: DecodedChoice[];
}

class Reader {
  private readonly data: Uint8Array;
  private pos: number;
  constructor(data: Uint8Array, start = 0) {
    this.data = data;
    this.pos = start;
  }

  byte(): number {
    const value = this.data[this.pos++];
    if (value === undefined) throw new RangeError(`Read past end at ${String(this.pos - 1)}`);
    return value;
  }

  text(): string {
    let out = '';
    for (let tile = this.byte(); tile !== TEXT_END; tile = this.byte()) {
      const ch = TILE_TO_CHAR.get(tile);
      if (ch === undefined) throw new Error(`Unknown tile ${String(tile)}`);
      out += ch;
    }
    return out;
  }
}

export function decodeDialogueTree(data: Uint8Array): DecodedNode[] {
  const header = new Reader(data);
  const count = header.byte();
  const offsets = Array.from({ length: count }, () => header.byte() | (header.byte() << 8));

  return offsets.map((offset) => {
    const r = new Reader(data, offset);
    const text = r.text();
    const choiceCount = r.byte();
    const next = Array.from({ length: choiceCount }, () => r.byte());
    const choices = next.map((n, i) => ({
      rating: ratingOf(n, i),
      text: r.text(),
      next: (n & ~BAD_FLAG) === NEXT_END ? null : n & ~BAD_FLAG,
    }));
    return { text, choices };
  });
}

export interface DecodedKanaQuestion {
  word: string;
  blankIndex: number;
  correct: string;
  distractors: string[];
  prompt?: 'katakana';
}

export function decodeKanaData(data: Uint8Array): DecodedKanaQuestion[] {
  const r = new Reader(data);
  const tile = (): string => {
    const t = r.byte();
    const ch = TILE_TO_CHAR.get(t);
    if (ch === undefined) throw new Error(`Unknown tile ${String(t)}`);
    return ch;
  };
  const questions: DecodedKanaQuestion[] = [];
  for (let header = r.byte(); header !== 0; header = r.byte()) {
    const word = Array.from({ length: header & ~MATCH_FLAG }, tile).join('');
    const blankIndex = r.byte();
    const correct = tile();
    const distractors = [tile(), tile(), tile()];
    const prompt = header & MATCH_FLAG ? { prompt: 'katakana' as const } : {};
    questions.push({ word, blankIndex, correct, distractors, ...prompt });
  }
  return questions;
}
