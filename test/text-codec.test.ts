/** Dialogue compression: the codec, the game's dictionary, and the engine's decoder */

import { storePointer, zeroBytes } from '@asm/macros';
import { call, cp, db, jr, label, ld } from '@asm/sm83';
import { Label, u16 } from '@asm/types';
import { buildTextNext } from '@game/dialogue';
import { TEXT_END } from '@game/dialogue-data';
import { textToTiles } from '@game/font';
import { TEXT_DICT, TEXT_NEXT } from '@game/labels';
import { MEM } from '@game/ram';
import { dialogueCodec, sceneQuiz, SCENES } from '@game/scene';
import { buildTextCodec, TEXT_STACK_SIZE } from '@game/text-codec';
import { describe, expect, it } from 'vitest';

import { runProgram, SCRATCH } from './helpers/run-program';

// Labels placed in this module
const NEXT = new Label('next');
const LINE = new Label('line');

describe('buildTextCodec', () => {
  const strings = [
    [1, 2, 3, 1, 2, 3],
    [1, 2, 3, 4],
    [1, 2, 9, 1, 2, 3],
  ];
  const codec = buildTextCodec(strings);

  it('puts its codes above every text tile', () => {
    expect(codec.base).toBe(10);
    expect(codec.pairs[0]).toEqual([1, 2]); // the most frequent pair
  });

  it('round-trips, nesting codes inside codes', () => {
    for (const s of strings) {
      const encoded = codec.encode(s);
      expect(codec.decode(encoded)).toEqual(s);
    }
    expect(codec.encode([1, 2, 3])).toHaveLength(1); // (1,2),3 → one code
    expect(codec.depth).toBeGreaterThanOrEqual(2);
  });

  it('breaks ties between equally frequent pairs by value', () => {
    const tied = buildTextCodec([
      [5, 6, 5, 6, 5, 6],
      [1, 2, 1, 2, 1, 2],
    ]);
    expect(tied.pairs[0]).toEqual([1, 2]);
  });

  it('never nests codes deeper than the decoder can hold', () => {
    const long = [Array<number>(64).fill(1)];
    expect(buildTextCodec(long).depth).toBeGreaterThan(2);
    const shallow = buildTextCodec(long, 2);
    expect(shallow.depth).toBe(2);
    expect(shallow.decode(shallow.encode(long[0] ?? []))).toEqual(long[0]);
  });

  it('leaves text without repeats alone', () => {
    const plain = buildTextCodec([[5, 6, 7]]);
    expect(plain.pairs).toEqual([]);
    expect(plain.encode([5, 6, 7])).toEqual([5, 6, 7]);
    expect(plain.depth).toBe(0);
  });
});

describe("the game's dialogue", () => {
  const codec = dialogueCodec();
  const texts = SCENES.flatMap((scene) =>
    sceneQuiz(scene).dialogue.flatMap((node) => [
      node.text,
      ...node.choices.map((choice) => choice.text),
    ]),
  );

  it('decodes every line and reply back exactly', () => {
    for (const text of texts) {
      const tiles = textToTiles(text);
      expect(codec.decode(codec.encode(tiles)), text).toEqual(tiles);
    }
  });

  it('fits its codes between the text tiles and TEXT_END, within the stack', () => {
    expect(codec.base + codec.pairs.length).toBeLessThanOrEqual(TEXT_END);
    expect(codec.depth).toBeLessThanOrEqual(TEXT_STACK_SIZE);
    const encoded = texts.reduce((n, t) => n + codec.encode(textToTiles(t)).length, 0);
    const raw = texts.reduce((n, t) => n + textToTiles(t).length, 0);
    expect(encoded).toBeLessThan(raw * 0.75);
  });
});

describe('text_next', () => {
  it('prints a compressed line tile by tile, the same as the original', () => {
    const codec = dialogueCodec();
    // The line whose codes nest deepest
    const depthOf = (byte: number): number => {
      const pair = codec.pairs[byte - codec.base];
      return pair === undefined ? 0 : 1 + Math.max(depthOf(pair[0]), depthOf(pair[1]));
    };
    const lines = SCENES.flatMap((scene) => sceneQuiz(scene).dialogue.map((node) => node.text));
    const deepest =
      lines
        .map((text) => textToTiles(text))
        .sort(
          (a, b) =>
            Math.max(...codec.encode(b).map(depthOf)) - Math.max(...codec.encode(a).map(depthOf)),
        )[0] ?? [];

    const mem = runProgram(
      [
        ld('hl', LINE),
        ...storePointer('hl', MEM.DLG_STR),
        ...zeroBytes(MEM.TEXT_SP),
        ld('hl', u16(SCRATCH)),
        label(NEXT),
        call(TEXT_NEXT),
        ld(['hl+'], 'a'),
        cp(TEXT_END),
        jr('nz', NEXT),
        ld('a', [MEM.TEXT_SP]),
        ld([u16(SCRATCH + 0x80)], 'a'),
      ],
      [
        ...buildTextNext(codec.base),
        label(TEXT_DICT),
        db(codec.pairs.flat()),
        label(LINE),
        db([...codec.encode(deepest), TEXT_END]),
      ],
    );
    expect(Array.from(mem.slice(SCRATCH, SCRATCH + deepest.length + 1))).toEqual([
      ...deepest,
      TEXT_END,
    ]);
    expect(mem[SCRATCH + 0x80]).toBe(0); // nothing left on the stack
  });
});
