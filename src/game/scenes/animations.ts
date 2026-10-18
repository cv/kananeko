/**
 * One animated backdrop tile per scene. The tile's normal art is frame 0; these
 * are the frames it cycles through after it. Only scene-block (kit) tiles can
 * animate, so global tiles like the scene icons stay untouched for the ending.
 */

import { type Glyph } from '../font-data';

export interface TileAnimation {
  /** Backdrop map character whose tile animates */
  readonly cell: string;
  /** Frames shown after the tile's own art, in order */
  readonly frames: readonly Glyph[];
  /** Frames between steps (a power of two) */
  readonly period: number;
}

/** Station: a few office windows switch on and off */
export const STATION_ANIMATION: TileAnimation = {
  cell: 'B',
  period: 64,
  frames: [
    [
      '++++++++',
      '+..++--+',
      '+..++--+',
      '++++++++',
      '++++++++',
      '+--++..+',
      '+--++..+',
      '++++++++',
    ],
  ],
};

/** Street: grass tufts sway */
export const STREET_ANIMATION: TileAnimation = {
  cell: 'g',
  period: 32,
  frames: [
    [
      '........',
      '........',
      '........',
      '..+...+.',
      '.+.+.+.+',
      '-+-+-+-+',
      '--------',
      '--------',
    ],
  ],
};

/** Restaurant: paper lanterns swing */
export const RESTAURANT_ANIMATION: TileAnimation = {
  cell: 'L',
  period: 16,
  frames: [
    [
      '...#....',
      '...###..',
      '..#+++#.',
      '..#+-+#.',
      '..#+++#.',
      '..#+-+#.',
      '...###..',
      '....#...',
    ],
    [
      '...#....',
      '..###...',
      '.#+++#..',
      '.#+-+#..',
      '.#+++#..',
      '.#+-+#..',
      '..###...',
      '...#....',
    ],
    [
      '...#....',
      '.###....',
      '#+++#...',
      '#+-+#...',
      '#+++#...',
      '#+-+#...',
      '.###....',
      '..#.....',
    ],
  ],
};

/** Conbini: goods on the shelves catch the light */
export const CONBINI_ANIMATION: TileAnimation = {
  cell: 'E',
  period: 32,
  frames: [
    [
      '########',
      '.+-.#+..',
      '.+-.#+-.',
      '########',
      '-..+#.-+',
      '-+.+#.-+',
      '########',
      '+......+',
    ],
  ],
};

/** Park: stars twinkle */
export const PARK_ANIMATION: TileAnimation = {
  cell: '.',
  period: 16,
  frames: [
    [
      '........',
      '........',
      '........',
      '........',
      '........',
      '.-......',
      '........',
      '......-.',
    ],
  ],
};
