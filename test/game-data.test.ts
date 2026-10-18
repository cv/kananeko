/** Font, kana question, and scene-data builders. */

import { describe, expect, it } from 'vitest';
import {
  CHAR_MAP,
  TILE_COUNT,
  buildTileData,
  encodeGlyph,
  requireTile,
  textToTiles,
} from '@game/font';
import { MAX_KANA_WORD_LENGTH, buildKanaData, defineKanaQuestion } from '@game/kana';
import { type DialogueNode, buildDialogueTree } from '@game/dialogue';
import { packScene, SCENES } from '@game/scene';
import { centerStartCol, tilemapAddr, tilePos } from '@game/tilemap';
import { FADE_STEPS, buildFadeTable, rgb } from '@game/video';
import { BACKDROP, BACKDROP_LEGEND, encodeBackdrop } from '@game/backdrop';

describe('font', () => {
  it('maps space to the blank tile 0 and every glyph to a later tile', () => {
    expect(CHAR_MAP[' ']).toBe(0);
    expect(textToTiles('Aあア┌▶').every((tile) => tile > 0)).toBe(true);
  });

  it('keeps tile indices clear of the 0xFE/0xFF data sentinels', () => {
    expect(Math.max(...Object.values(CHAR_MAP))).toBeLessThan(0xfe);
  });

  it('builds 16 bytes per tile with a blank tile 0 and no blank glyphs', () => {
    const data = buildTileData();
    expect(data.length).toBe((TILE_COUNT + 1) * 16);
    expect(data.slice(0, 16).every((b) => b === 0)).toBe(true);
    for (let tile = 1; tile <= TILE_COUNT; tile++) {
      expect(data.slice(tile * 16, (tile + 1) * 16).some((b) => b !== 0)).toBe(true);
    }
  });

  it('encodes the four shades into the low and high bit planes', () => {
    const tile = encodeGlyph([
      '.-+#....',
      '########',
      '........',
      '........',
      '........',
      '........',
      '........',
      '++++++++',
    ]);
    // '.'=0, '-'=1 (low), '+'=2 (high), '#'=3 (both)
    expect([tile[0], tile[1]]).toEqual([0b01010000, 0b00110000]);
    expect([tile[2], tile[3]]).toEqual([0xff, 0xff]);
    expect([tile[14], tile[15]]).toEqual([0x00, 0xff]);
  });

  it('rejects unknown pixel characters', () => {
    expect(() => encodeGlyph(['x.......', '', '', '', '', '', '', ''])).toThrow(
      /Invalid glyph pixel/,
    );
  });

  it('rejects characters that are not in the font', () => {
    expect(() => requireTile('漢')).toThrow(/Character not in font/);
  });
});

describe('defineKanaQuestion', () => {
  it('derives the word and correct answer from the typed kana tuple', () => {
    const question = defineKanaQuestion(['こ', 'ん', 'に', 'ち', 'は'], 2, 'な', 'ぬ', 'ね');
    expect(question).toEqual({
      word: 'こんにちは',
      blankIndex: 2,
      correct: 'に',
      distractors: ['な', 'ぬ', 'ね'],
    });
  });

  it('throws when a caller bypasses the type system with an invalid blank index', () => {
    expect(() => defineKanaQuestion(['こ', 'ん'] as const, 9 as never, 'か', 'く', 'け')).toThrow(
      /Kana blank index out of range/,
    );
  });
});

describe('buildDialogueTree ratings', () => {
  const node = (choices: DialogueNode['choices']): DialogueNode => ({ text: 'あ', choices });

  it('flags bad answers in bit 7 of their next-node byte', () => {
    const data = buildDialogueTree([
      node([
        { text: 'い', next: null },
        { text: 'う', next: 0, rating: 'bad' },
      ]),
    ]);
    // header (1 + 2) + text "あ" + TEXT_END + count, then the next-node table
    expect([...data.slice(6, 8)]).toEqual([0x7f, 0x80]);
  });

  it('rejects ratings the encoding cannot express', () => {
    expect(() => buildDialogueTree([node([{ text: 'い', next: null, rating: 'ok' }])])).toThrow(
      /first choice/,
    );
    expect(() =>
      buildDialogueTree([
        node([
          { text: 'い', next: null },
          { text: 'う', next: null, rating: 'good' },
        ]),
      ]),
    ).toThrow(/first choice/);
    expect(() =>
      buildDialogueTree(Array.from({ length: 127 }, () => node([{ text: 'い', next: null }]))),
    ).toThrow(/limited/);
  });
});

describe('buildKanaData', () => {
  it('terminates the question list with a zero length', () => {
    expect([...buildKanaData([])]).toEqual([0]);
  });

  it('rejects words too long for the word box', () => {
    const word = 'あ'.repeat(MAX_KANA_WORD_LENGTH + 1);
    expect(() =>
      buildKanaData([{ word, blankIndex: 0, correct: 'あ', distractors: ['い', 'う', 'え'] }]),
    ).toThrow(/too long/);
  });
});

describe('scene packing', () => {
  it('stores the scene name without padding (it is centered when drawn)', () => {
    const scene = SCENES[0];
    expect(packScene(scene).nameRow).toEqual(textToTiles(scene.name));
  });
});

describe('encodeBackdrop', () => {
  const blankRow = ' '.repeat(BACKDROP.cols);
  const blank = Array<string>(BACKDROP.rows).fill(blankRow);

  it('maps each cell through the legend', () => {
    const map = [...blank];
    map[0] = 'o' + blankRow.slice(1);
    const data = encodeBackdrop(map);
    expect(data.length).toBe(BACKDROP.rows * BACKDROP.cols);
    expect(data[0]).toBe(requireTile(BACKDROP_LEGEND['o'] ?? ''));
    expect(data[1]).toBe(0);
  });

  it('rejects maps of the wrong size or with unknown cells', () => {
    expect(() => encodeBackdrop(blank.slice(1))).toThrow(/rows/);
    expect(() => encodeBackdrop([blankRow + ' ', ...blank.slice(1)])).toThrow(/wide/);
    expect(() => encodeBackdrop(['?' + blankRow.slice(1), ...blank.slice(1)])).toThrow(/Unknown/);
  });
});

describe('buildFadeTable', () => {
  const palette = SCENES[0].palette;
  const table = buildFadeTable(palette);
  const step = (k: number): number[] => Array.from(table.slice(k * 9, k * 9 + 9));
  const colors = (k: number): number[] =>
    [0, 1, 2, 3].map((i) => (step(k)[1 + i * 2] ?? 0) | ((step(k)[2 + i * 2] ?? 0) << 8));

  it('starts at white and ends at the palette itself', () => {
    expect(table.length).toBe(FADE_STEPS * 9);
    expect(step(0)[0]).toBe(0x00); // DMG: every shade white
    expect(colors(0)).toEqual([0x7fff, 0x7fff, 0x7fff, 0x7fff]);
    expect(step(FADE_STEPS - 1)[0]).toBe(0xe4);
    expect(colors(FADE_STEPS - 1)).toEqual([...palette]);
  });

  it('darkens every color at each step', () => {
    for (let k = 1; k < FADE_STEPS; k++) {
      colors(k).forEach((c, i) => {
        expect(c & 0x1f).toBeLessThanOrEqual((colors(k - 1)[i] ?? 0) & 0x1f);
      });
    }
  });
});

describe('scene palettes', () => {
  const luma = (c: number): number =>
    0.299 * (c & 0x1f) + 0.587 * ((c >> 5) & 0x1f) + 0.114 * ((c >> 10) & 0x1f);

  it.each(SCENES.map((s) => [s.name, s.palette] as const))(
    '%s runs from paper to ink, so glyph shades read as intended',
    (_name, palette) => {
      const lumas = palette.map(luma);
      lumas.slice(1).forEach((l, i) => {
        expect(l).toBeLessThan(lumas[i] ?? 0);
      });
    },
  );
});

describe('layout helpers', () => {
  it('computes tilemap addresses from rows and columns', () => {
    expect(tilemapAddr(0, 0)).toBe(0x9800);
    expect(tilemapAddr(tilePos(2, 3))).toBe(0x9800 + 2 * 32 + 3);
    expect(() => tilePos(32, 0)).toThrow(RangeError);
    expect(() => centerStartCol(21)).toThrow(RangeError);
  });

  it('packs 8-bit RGB into GBC RGB555', () => {
    expect(rgb(0xff, 0x00, 0x00)).toBe(0x001f);
    expect(rgb(0x00, 0xff, 0x00)).toBe(0x03e0);
    expect(rgb(0x00, 0x00, 0xff)).toBe(0x7c00);
  });
});
