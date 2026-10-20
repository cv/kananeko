import type { Glyph } from '@game/font-data';
import { buildLogo, LOGO_ROWS, LOGO_TEXT, logoArt } from '@game/logo';
import { describe, expect, it } from 'vitest';

const dot: Glyph = [
  '#.......',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
];

describe('logoArt', () => {
  it('doubles each ink pixel, lights its top edge, and outlines it', () => {
    const art = logoArt(dot);
    expect(art).toHaveLength(16);
    expect(art.slice(0, 4)).toEqual([
      '####............',
      '#--#............',
      '#++#............',
      '####............',
    ]);
  });
});

describe('buildLogo', () => {
  it('gives every letter 2x2 tiles, laid out as two rows', () => {
    const logo = buildLogo('カナ');
    expect(Object.keys(logo.glyphs)).toHaveLength(8);
    expect(logo.rows.map((row) => Array.from(row).length)).toEqual([4, 4]);
  });

  it('refuses letters the font has no katakana for', () => {
    expect(() => buildLogo('漢')).toThrow(/No katakana glyph/);
  });

  it('spells カナネコ on the title', () => {
    expect(LOGO_ROWS.map((row) => Array.from(row).length)).toEqual([
      LOGO_TEXT.length * 2,
      LOGO_TEXT.length * 2,
    ]);
  });
});
