/**
 * Dialogue text compression: byte-pair encoding into the tile codes text never uses.
 *
 * Text is a string of tile indices, all below `base`. Each code from `base` up stands
 * for a pair of bytes, either of which may itself be a code, so frequent words
 * shrink to a byte or two. The engine expands codes as it prints (text_next, in
 * dialogue.ts), keeping the right halves it hasn't printed yet on a small stack.
 */

import { at } from '../asm/util';

/** TEXT_END (0xFE) ends a string and is never part of a pair; 0xFF stays unused */
const CODE_LIMIT = 0xfe;
/** Pairs must occur at least this often to earn a code */
const MIN_COUNT = 3;
/** Bytes of WRAM for pending right halves (see text_next) */
export const TEXT_STACK_SIZE = 16;

export interface TextCodec {
  /** First code; every text tile is below it */
  readonly base: number;
  /** The pair each code stands for, in code order */
  readonly pairs: readonly (readonly [number, number])[];
  /** Deepest nesting of codes: the stack text_next needs */
  readonly depth: number;
  readonly encode: (text: readonly number[]) => number[];
  readonly decode: (data: readonly number[]) => number[];
}

function replacePair(text: readonly number[], a: number, b: number, code: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === a && text[i + 1] === b) {
      out.push(code);
      i++;
    } else {
      out.push(at(text, i));
    }
  }
  return out;
}

/**
 * Learn a dictionary from the strings to compress (all of the game's dialogue).
 * No code nests deeper than `maxDepth` (the room text_next has for right halves).
 */
export function buildTextCodec(
  strings: readonly (readonly number[])[],
  maxDepth = TEXT_STACK_SIZE,
): TextCodec {
  const base = Math.max(0, ...strings.flat()) + 1;
  const pairs: [number, number][] = [];
  const depths: number[] = [];
  const depthOf = (byte: number): number => (byte < base ? 0 : at(depths, byte - base));
  let texts = strings.map((s) => [...s]);
  for (let code = base; code < CODE_LIMIT; code++) {
    const counts = new Map<number, number>();
    for (const text of texts) {
      for (let i = 1; i < text.length; i++) {
        const key = at(text, i - 1) * 256 + at(text, i);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    // The most frequent pair; ties go to the lowest pair, so builds are reproducible
    let best = -1;
    let bestCount = MIN_COUNT - 1;
    for (const [key, count] of counts) {
      const depth = 1 + Math.max(depthOf(key >> 8), depthOf(key & 0xff));
      if (depth > maxDepth) continue;
      if (count > bestCount || (count === bestCount && key < best)) {
        best = key;
        bestCount = count;
      }
    }
    if (best < 0) break;
    const pair = [best >> 8, best & 0xff] as const;
    pairs.push([pair[0], pair[1]]);
    depths.push(1 + Math.max(depthOf(pair[0]), depthOf(pair[1])));
    texts = texts.map((text) => replacePair(text, pair[0], pair[1], code));
  }

  const expand = (byte: number): number[] => {
    const pair = pairs[byte - base];
    return pair === undefined ? [byte] : [...expand(pair[0]), ...expand(pair[1])];
  };

  return {
    base,
    pairs,
    depth: Math.max(0, ...depths),
    encode: (text) =>
      pairs.reduce<number[]>((out, [a, b], i) => replacePair(out, a, b, base + i), [...text]),
    decode: (data) => data.flatMap(expand),
  };
}
