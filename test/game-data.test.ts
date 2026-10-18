/** Font, kana question, and scene-data builders. */

import { describe, expect, it } from 'vitest';
import { CHAR_MAP, TILE_COUNT, buildTileData, requireTile, textToTiles } from '@game/font';
import { buildKanaData, defineKanaQuestion } from '@game/kana';
import { packScene, SCENES } from '@game/scene';
import { centerStartCol, tilemapAddr, tilePos } from '@game/tilemap';
import { rgb } from '@game/video';

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

describe('buildKanaData', () => {
  it('terminates the question list with a zero length', () => {
    expect([...buildKanaData([])]).toEqual([0]);
  });
});

describe('scene packing', () => {
  it('stores the scene name without padding (it is centered when drawn)', () => {
    const scene = SCENES[0];
    expect(packScene(scene).nameRow).toEqual(textToTiles(scene.name));
  });
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
