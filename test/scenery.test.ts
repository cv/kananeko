import { Canvas, isProp, SCENERY, tile } from '@game/scenery';
import { describe, expect, it } from 'vitest';

describe('Canvas', () => {
  it('outlines a rounded box in ink around its fill', () => {
    expect(new Canvas(5, 4).box(0, 0, 5, 4, '-').rows()).toEqual([
      '.###.',
      '#---#',
      '#---#',
      '.###.',
    ]);
  });

  it('draws a disc, outlined unless asked not to', () => {
    const outlined = new Canvas(5, 5).disc(2, 2, 2, '-').rows();
    expect(outlined[2]).toBe('#---#');
    const soft = new Canvas(5, 5).disc(2, 2, 2, '+', null).rows();
    expect(soft[2]).toBe('+++++');
  });

  it('ignores pixels off the canvas', () => {
    expect(new Canvas(2, 1).rect(-1, 0, 4, 3, '#').rows()).toEqual(['##']);
  });
});

describe('tile', () => {
  it('refuses textures that are not 8x8', () => {
    expect(() => tile(['........'])).toThrow(/8x8/);
  });
});

describe('SCENERY', () => {
  it.each(Object.entries(SCENERY))('draws %s in whole tiles, with the four shades', (_ch, art) => {
    const rows = isProp(art) ? art.art : art;
    expect(rows.length % 8).toBe(0);
    for (const row of rows) {
      expect(row.length % 8).toBe(0);
      expect(row.length).toBe(rows[0]?.length);
      expect(row).toMatch(/^[.\-+#]+$/u);
    }
  });
});
