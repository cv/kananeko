/** Font, kana question, and scene-data builders. */

import { describe, expect, it } from 'vitest';
import {
  CHAR_MAP,
  TILE_COUNT,
  buildTileData,
  encodeGlyph,
  glyphOf,
  requireTile,
  textToTiles,
} from '@game/font';
import { MAX_KANA_WORD_LENGTH, buildKanaData, defineKanaQuestion } from '@game/kana';
import { type DialogueNode, buildDialogueTree } from '@game/dialogue';
import { packScene, SCENES } from '@game/scene';
import { centerStartCol, tilemapAddr, tilePos } from '@game/tilemap';
import { bgTileAddr, encodeAttributeRuns, rgb } from '@game/video';
import { HUD_PALETTE, INK, UI_PALETTE, inked } from '@game/palette';
import {
  PAL,
  attributeOfCell,
  buildPaletteSet,
  buildSharedPalettes,
  paletteOf,
  paletteOfCell,
} from '@game/color';
import { MAX_CAST, packCast } from '@game/npc';
import { packAnimation } from '@game/anim';
import { ENDING_COLORS, GAME_OVER_COLORS, TITLE_COLORS } from '@game/scenes/colors';
import { BACKDROP, SCENE_TILE_BASE, SCENE_TILE_CAPACITY, buildSceneArt } from '@game/backdrop';

describe('font', () => {
  it('maps space to the blank tile 0 and every glyph to a later tile', () => {
    expect(CHAR_MAP[' ']).toBe(0);
    expect(textToTiles('1あア┌▕').every((tile) => tile > 0)).toBe(true);
  });

  it('prints no latin letters: every label is Japanese', () => {
    expect(Object.keys(CHAR_MAP).filter((ch) => /[A-Za-z]/u.test(ch))).toEqual([]);
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

  it('looks up glyph art by character', () => {
    expect(glyphOf('─')).toHaveLength(8);
    expect(() => glyphOf('漢')).toThrow(/Character not in font/);
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

describe('buildSceneArt', () => {
  const blankRow = ' '.repeat(BACKDROP.cols);
  const blank = Array<string>(BACKDROP.rows).fill(blankRow);

  it('gives textures scene slots in order of first use, sharing identical tiles', () => {
    const map = [...blank];
    map[0] = 'p_pmn' + blankRow.slice(5);
    const { backdrop, tileData, tileOfCell } = buildSceneArt(map);
    expect(backdrop.length).toBe(BACKDROP.rows * BACKDROP.cols);
    // m and n are the same counter, so they share a tile; blanks use the global tile 0
    expect([...backdrop.slice(0, 6)]).toEqual([
      SCENE_TILE_BASE,
      SCENE_TILE_BASE + 1,
      SCENE_TILE_BASE,
      SCENE_TILE_BASE + 2,
      SCENE_TILE_BASE + 2,
      0,
    ]);
    expect(tileOfCell.get('_')).toBe(SCENE_TILE_BASE + 1);
    expect(tileData.length).toBe(3 * 16);
  });

  it('draws a prop over its rectangle, repeating it along longer runs', () => {
    const map = [...blank];
    for (const r of [0, 1, 2]) map[r] = 'YYYY' + blankRow.slice(4);
    const { backdrop } = buildSceneArt(map);
    const row = (r: number): number[] => [
      ...backdrop.slice(r * BACKDROP.cols, r * BACKDROP.cols + 4),
    ];
    const [a = 0, b = 0] = row(0);
    expect(row(0)).toEqual([a, b, a, b]); // two trees side by side
    expect(new Set([...row(0), ...row(1), ...row(2)]).size).toBeGreaterThan(2);
    expect(row(1)).not.toEqual(row(0));
  });

  it('refuses a backdrop with more tiles than the block holds', () => {
    const map = [...blank];
    map[0] = 'p_' + blankRow.slice(2);
    expect(() => buildSceneArt(map, 1)).toThrow(/more than the 1 free/);
  });

  it('keeps every scene within its tile block', () => {
    for (const scene of SCENES) {
      expect(buildSceneArt(scene.backdrop).tileData.length / 16).toBeLessThanOrEqual(
        SCENE_TILE_CAPACITY,
      );
    }
  });

  it('rejects maps of the wrong size or with unknown cells', () => {
    expect(() => buildSceneArt(blank.slice(1))).toThrow(/rows/);
    expect(() => buildSceneArt([blankRow + ' ', ...blank.slice(1)])).toThrow(/wide/);
    expect(() => buildSceneArt(['?' + blankRow.slice(1), ...blank.slice(1)])).toThrow(/Unknown/);
  });
});

describe('buildPaletteSet', () => {
  const scheme = SCENES[1].colors;
  const set = buildPaletteSet(scheme);
  const color = (palette: number, index: number): number =>
    (set[1 + palette * 8 + index * 2] ?? 0) | ((set[2 + palette * 8 + index * 2] ?? 0) << 8);

  it('holds only the scene ramps, each on its paper (the shared palettes are stored once)', () => {
    const count = set[0] ?? 0;
    expect(count).toBe(Object.keys(scheme.ramps).length);
    expect(set.length).toBe(1 + count * 8);
    for (let p = 0; p < count; p++) expect(color(p, 0)).toBe(scheme.paper);
    expect(paletteOf(scheme, Object.keys(scheme.ramps)[0] ?? '')).toBe(2); // after ui and hud
  });

  it('stores the ui and hud palettes once, for every screen', () => {
    const shared = buildSharedPalettes();
    const word = (i: number): number => (shared[i * 2] ?? 0) | ((shared[i * 2 + 1] ?? 0) << 8);
    expect([0, 1, 2, 3].map(word)).toEqual([...UI_PALETTE]);
    expect([4, 5, 6, 7].map(word)).toEqual([...HUD_PALETTE]);
    expect(PAL).toEqual({ ui: 0, hud: 1 });
  });

  it('refuses a scheme with no ramps of its own', () => {
    expect(() => buildPaletteSet({ paper: 0, ramps: {} })).toThrow(/at least one ramp/);
  });

  it('puts front cells (like the restaurant counter) over sprites', () => {
    const restaurant = SCENES[2].colors;
    expect(attributeOfCell(restaurant, 'n')).toBe(paletteOf(restaurant, 'wood') | 0x80);
    expect(attributeOfCell(restaurant, 'F')).toBe(paletteOf(restaurant, 'wood'));
  });

  it('maps backdrop cells to their ramp, defaulting to the first scene ramp', () => {
    expect(paletteOfCell(scheme, 'Y')).toBe(paletteOf(scheme, 'leaves'));
    expect(paletteOfCell(scheme, ' ')).toBe(paletteOf(scheme, 'sky'));
    expect(paletteOf(scheme, 'hud')).toBe(PAL.hud);
    expect(() => paletteOf(scheme, 'nope')).toThrow(/No ramp/);
  });

  it('rejects more than 8 palettes', () => {
    const ramps = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [`r${String(i)}`, inked('sky')] as const),
    );
    expect(() => buildPaletteSet({ paper: 0, ramps })).toThrow(/At most/);
  });
});

describe('encodeAttributeRuns', () => {
  it('run-length encodes palettes and ends with a zero count', () => {
    expect([...encodeAttributeRuns([0, 0, 0, 2, 2, 5])]).toEqual([3, 0, 2, 2, 1, 5, 0]);
    expect([...encodeAttributeRuns(Array<number>(300).fill(1))]).toEqual([255, 1, 45, 1, 0]);
  });
});

describe('packAnimation', () => {
  const scene = SCENES[4];
  const art = buildSceneArt(scene.backdrop);
  const anim = scene.animation;

  it('packs the tile address, frame count, period mask, and frames (base first)', () => {
    const data = packAnimation(anim, art);
    const tile = art.tileOfCell.get(anim.cell) ?? 0;
    expect((data[0] ?? 0) | ((data[1] ?? 0) << 8)).toBe(bgTileAddr(tile));
    expect(data[2]).toBe(anim.frames.length + 1);
    expect(data[3]).toBe(anim.period - 1);
    expect(data.length).toBe(4 + (anim.frames.length + 1) * 16);
  });

  it('encodes "no animation" as a zero frame count', () => {
    expect([...packAnimation(undefined, art)]).toEqual([0, 0, 0]);
  });

  it('rejects cells that are not scene tiles, bad periods, and too many frames', () => {
    expect(() => packAnimation({ ...anim, cell: 'Y' }, art)).toThrow(/isn't a scene tile/);
    expect(() => packAnimation({ ...anim, period: 12 }, art)).toThrow(/power of two/);
    expect(() =>
      packAnimation(
        { ...anim, frames: Array.from({ length: 16 }, () => anim.frames[0] ?? []) as never },
        art,
      ),
    ).toThrow(/At most/);
  });
});

describe('packCast', () => {
  const look = SCENES[0].cast.npcs[0];
  if (look === undefined) throw new Error('station has no cast');

  it('packs 4 tiles and one palette per NPC, and an $FF-terminated segment table', () => {
    const packed = packCast({
      npcs: [look],
      segments: [
        { from: 0, npc: 0 },
        { from: 5, npc: null },
      ],
    });
    expect(packed.tiles.length).toBe(4 * 16);
    expect(packed.palettes.length).toBe(8);
    expect([...packed.table]).toEqual([0, 0, 5, 0xff, 0xff]);
  });

  it('rejects out-of-order segments, unknown NPCs, and oversized casts', () => {
    expect(() =>
      packCast({
        npcs: [look],
        segments: [
          { from: 3, npc: 0 },
          { from: 3, npc: 0 },
        ],
      }),
    ).toThrow(/ascending/);
    expect(() => packCast({ npcs: [look], segments: [{ from: 0, npc: 1 }] })).toThrow(/No NPC/);
    expect(() =>
      packCast({ npcs: Array<typeof look>(MAX_CAST + 1).fill(look), segments: [] }),
    ).toThrow(/At most/);
  });

  it.each(SCENES.map((s) => [s.name, s.cast] as const))(
    'starts %s with someone to talk to and covers every segment with a real node',
    (_name, cast) => {
      expect(cast.segments[0]).toEqual({ from: 0, npc: 0 });
      for (const { npc } of cast.segments) {
        if (npc !== null) expect(cast.npcs[npc]).toBeDefined();
      }
    },
  );
});

describe('scene colors', () => {
  const luma = (c: number): number =>
    0.299 * (c & 0x1f) + 0.587 * ((c >> 5) & 0x1f) + 0.114 * ((c >> 10) & 0x1f);

  const schemes = [...SCENES.map((s) => s.colors), TITLE_COLORS, ENDING_COLORS, GAME_OVER_COLORS];

  it('runs the ui palette from paper to ink, so text reads clearly', () => {
    const lumas = UI_PALETTE.map(luma);
    lumas.slice(1).forEach((l, i) => {
      expect(l).toBeLessThan(lumas[i] ?? 0);
    });
  });

  it('writes the HUD in the darkest color on its ribbon', () => {
    const [ribbon = 0, ...rest] = HUD_PALETTE.map(luma);
    expect(Math.min(...rest)).toBe(luma(INK));
    expect(luma(INK)).toBeLessThan(ribbon / 2);
  });

  it('outlines everything in the one ink', () => {
    for (const scheme of schemes) {
      for (const ramp of Object.values(scheme.ramps)) expect([INK, ramp[1]]).toContain(ramp[2]);
    }
  });

  it('gives every art ramp an ink darker than its paper (accents like stars may glow)', () => {
    for (const scheme of schemes) {
      for (const ramp of Object.values(scheme.ramps)) {
        expect(luma(ramp[2])).toBeLessThan(luma(scheme.paper));
      }
    }
  });

  it('only maps backdrop cells to ramps that exist', () => {
    for (const scene of SCENES) {
      for (const ramp of Object.values(scene.colors.cells ?? {})) {
        expect(Object.keys(scene.colors.ramps)).toContain(ramp);
      }
    }
  });
});

describe('layout helpers', () => {
  it('computes tilemap addresses from rows and columns', () => {
    expect(tilemapAddr(0, 0)).toBe(0x9800);
    expect(tilemapAddr(tilePos(2, 3))).toBe(0x9800 + 2 * 32 + 3);
    expect(() => tilePos(32, 0)).toThrow(RangeError);
    expect(() => centerStartCol(21)).toThrow(RangeError);
  });

  it('locates BG tiles in $8800 addressing', () => {
    expect(bgTileAddr(0)).toBe(0x9000);
    expect(bgTileAddr(127)).toBe(0x97f0);
    expect(bgTileAddr(128)).toBe(0x8800);
    expect(bgTileAddr(255)).toBe(0x8ff0);
  });

  it('packs 8-bit RGB into GBC RGB555', () => {
    expect(rgb(0xff, 0x00, 0x00)).toBe(0x001f);
    expect(rgb(0x00, 0xff, 0x00)).toBe(0x03e0);
    expect(rgb(0x00, 0x00, 0xff)).toBe(0x7c00);
  });
});
