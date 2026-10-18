/** Text-art slicing helpers. */

import { describe, expect, it } from 'vitest';
import { artChar, artVariant, mirrorHalf, sliceArt } from '@game/art';
import { CAT_PORTRAIT, CAT_PORTRAIT_CHARS, CAT_SAD_CHARS } from '@game/glyphs-icons';

const block = (fill: string): string[] => Array<string>(8).fill(fill.repeat(8));

describe('mirrorHalf', () => {
  it('appends each row reversed', () => {
    expect(mirrorHalf(['#-+.'])).toEqual(['#-+..+-#']);
  });
});

describe('sliceArt', () => {
  it('slices art into 8x8 glyphs, row-major', () => {
    const art = [
      ...block('#').map((r) => r + '--------'),
      ...block('+').map((r) => r + '........'),
    ];
    const glyphs = sliceArt(art);
    expect(glyphs).toHaveLength(4);
    expect(glyphs[0]?.[0]).toBe('########');
    expect(glyphs[1]?.[7]).toBe('--------');
    expect(glyphs[2]?.[3]).toBe('++++++++');
    expect(glyphs[3]?.[0]).toBe('........');
  });

  it('rejects art that is not a whole number of tiles', () => {
    expect(() => sliceArt([])).toThrow(/multiple of 8/);
    expect(() => sliceArt(['#'.repeat(8)])).toThrow(/multiple of 8/);
    expect(() => sliceArt(Array<string>(8).fill('#'.repeat(7)))).toThrow(/multiple of 8/);
    expect(() => sliceArt([...Array<string>(7).fill('#'.repeat(8)), '#'.repeat(16)])).toThrow(
      /multiple of 8/,
    );
  });
});

describe('artVariant', () => {
  it('reuses unchanged tiles and allocates characters for the rest', () => {
    const base = block('.').map((r) => r + r);
    const variant = block('.').map((r, i) => r + (i === 0 ? '#.......' : r));
    const { glyphs, chars } = artVariant(['a', 'b'], base, variant, 0xe100);
    expect(chars).toEqual(['a', artChar(0xe100)]);
    expect(Object.keys(glyphs)).toEqual([artChar(0xe100)]);
  });

  it('rejects a variant of a different size', () => {
    expect(() => artVariant(['a'], block('.'), [...block('.'), ...block('.')], 0xe100)).toThrow(
      /same size/,
    );
  });

  it('gives the sad cat new tiles only for its eyes and mouth', () => {
    const changed = CAT_SAD_CHARS.filter((ch, i) => ch !== CAT_PORTRAIT_CHARS[i]);
    expect(CAT_PORTRAIT).toHaveLength(24);
    expect(changed).toHaveLength(6);
  });
});
