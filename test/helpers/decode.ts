/**
 * Decoders for the ROM data formats, written independently of the encoders
 * so tests can check that encoding round-trips.
 */

import { CHAR_MAP } from '@game/font';

const TILE_TO_CHAR = new Map(Object.entries(CHAR_MAP).map(([ch, tile]) => [tile as number, ch]));
const TEXT_END = 0xfe;
const END_OF_CONVERSATION = 0xff;

export interface DecodedChoice {
  text: string;
  next: number | null;
  good: boolean;
}

export interface DecodedNode {
  text: string;
  choices: DecodedChoice[];
}

class Reader {
  private pos: number;
  constructor(
    private readonly data: Uint8Array,
    start = 0,
  ) {
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
    const good = Array.from({ length: choiceCount }, () => r.byte() === 1);
    const choices = next.map((n, i) => ({
      text: r.text(),
      next: n === END_OF_CONVERSATION ? null : n,
      good: good[i] ?? false,
    }));
    return { text, choices };
  });
}

export interface DecodedKanaQuestion {
  word: string;
  blankIndex: number;
  correct: string;
  distractors: string[];
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
  for (let length = r.byte(); length !== 0; length = r.byte()) {
    const word = Array.from({ length }, tile).join('');
    const blankIndex = r.byte();
    const correct = tile();
    const distractors = [tile(), tile(), tile()];
    questions.push({ word, blankIndex, correct, distractors });
  }
  return questions;
}
