/** Cat portrait and scene icon glyphs. */

import { artChar, artVariant, mirrorHalf, sliceArt } from './art';
import type { Glyph } from './font-data';

// ---------------------------------------------------------------------------
// Cat portrait: 32x24 pixels (4x3 tiles, E000-E00B), drawn as text art below
// and sliced into tiles. The sad variant only adds the tiles that change.
//
// ---------------------------------------------------------------------------

/** Left half of the 32x24 title portrait; the right half is its mirror image. */
const CAT_LEFT = [
  '................',
  '....#...........',
  '....##..........',
  '...#+#..........',
  '...#++#.........',
  '...#+-+#########',
  '..#+--++--------',
  '..#+------------',
  '..#-------------',
  '.#--------------',
  '.#--------------',
  '.#----###-------',
  '.#---#.###------',
  '.#---#####------',
  '.#----###-------',
  '.#------------++',
  '++#-----------##',
  '.#+++----------#',
  '.#-----------#-#',
  '..#-----------##',
  '..#-------------',
  '...##-----------',
  '.....###########',
  '................',
];

/** Rows that change for the sad portrait: half-closed eyes and a frown */
const CAT_SAD_ROWS: Readonly<Record<number, string>> = {
  11: '.#--------------',
  12: '.#---#####------',
  13: '.#----###-------',
  14: '.#--------------',
  17: '.#+++-----------',
  18: '.#-------------#',
  19: '..#-----------#-',
};

export const CAT_PORTRAIT = mirrorHalf(CAT_LEFT);
export const CAT_PORTRAIT_SAD = mirrorHalf(CAT_LEFT.map((row, i) => CAT_SAD_ROWS[i] ?? row));

/** Characters of the 4x3 portrait tiles, row-major */
export const CAT_PORTRAIT_CHARS = Array.from({ length: 12 }, (_, i) => artChar(0xe000 + i));
const CAT_SAD = artVariant(CAT_PORTRAIT_CHARS, CAT_PORTRAIT, CAT_PORTRAIT_SAD, 0xe060);
/** Characters of the sad portrait (shares unchanged tiles with the happy one) */
export const CAT_SAD_CHARS = CAT_SAD.chars;

const CAT_PORTRAIT_GLYPHS: Record<string, Glyph> = {};
sliceArt(CAT_PORTRAIT).forEach((glyph, i) => {
  CAT_PORTRAIT_GLYPHS[artChar(0xe000 + i)] = glyph;
});

export const CAT: Record<string, Glyph> = {
  ...CAT_PORTRAIT_GLYPHS,
  ...CAT_SAD.glyphs,

  // Small cat faces (kana round): neutral, happy, sad
  '\uE010': [
    '#......#',
    '##....##',
    '#+####+#',
    '#------#',
    '#-#--#-#',
    '#------#',
    '#--++--#',
    '.######.',
  ],
  '\uE052': [
    '#......#',
    '##....##',
    '#+####+#',
    '#------#',
    '#-#--#-#',
    '#+----+#',
    '#-####-#',
    '.#-##-#.',
  ],
  '\uE053': [
    '#......#',
    '##....##',
    '#+####+#',
    '#------#',
    '#++--++#',
    '#------#',
    '#--++--#',
    '.#+--+#.',
  ],

  // Heart full (life remaining)
  '\uE012': [
    '........',
    '.##.##..',
    '#--#++#.',
    '#-++++#.',
    '#+++++#.',
    '.#+++#..',
    '..#+#...',
    '...#....',
  ],
  // Heart empty (life lost)
  '\uE013': [
    '........',
    '.++.++..',
    '+..+..+.',
    '+.....+.',
    '.+...+..',
    '..+.+...',
    '...+....',
    '........',
  ],

  // Bold inverted blank — solid block with ? cutout (kana game missing character)
  '\uE011': [
    '++++++++',
    '++....++',
    '+.++++.+',
    '+++++..+',
    '+++..+++',
    '++++++++',
    '+++..+++',
    '++++++++',
  ],
};

// ---------------------------------------------------------------------------
// Scene icon tiles (2 tiles per scene, 16x8 each)
// ---------------------------------------------------------------------------

export const SCENE_ICONS: Record<string, Glyph> = {
  // Train (left half)
  '\uE020': [
    '........',
    '.######.',
    '#------#',
    '#-..-..#',
    '#-..-..#',
    '#------#',
    '########',
    '..#..#..',
  ],
  // Train (right half)
  '\uE021': [
    '........',
    '.######.',
    '#------#',
    '#-..-..#',
    '#-..-..#',
    '#------#',
    '########',
    '..#..#..',
  ],
  // House (left half)
  '\uE022': [
    '...#....',
    '..#+#...',
    '.#+++#..',
    '########',
    '#-##--#-',
    '#-##--#-',
    '#-##--#-',
    '########',
  ],
  // House (right half)
  '\uE023': [
    '....#...',
    '...#+#..',
    '..#+++#.',
    '########',
    '-#--##-#',
    '-#--##-#',
    '-#--##-#',
    '########',
  ],
  // Bowl with steam (left half)
  '\uE024': [
    '.+..+...',
    '..+..+..',
    '.+..+..+',
    '........',
    '########',
    '.#++++++',
    '..#+++++',
    '....####',
  ],
  // Bowl with steam (right half)
  '\uE025': [
    '..+.....',
    '.+..+...',
    '..+.....',
    '........',
    '########',
    '++++++#.',
    '+++++#..',
    '####....',
  ],
  // Shop (left half)
  '\uE026': [
    '########',
    '#-#-#-#-',
    '########',
    '#.......',
    '#.####..',
    '#.#--#..',
    '#.#--#..',
    '########',
  ],
  // Shop (right half)
  '\uE027': [
    '########',
    '-#-#-#-#',
    '########',
    '.......#',
    '..####.#',
    '..#--#.#',
    '..#--#.#',
    '########',
  ],
  // Tree (left half)
  '\uE028': [
    '....#...',
    '...#+#..',
    '..#+++#.',
    '.#++++++',
    '.#++++++',
    '..#+++#.',
    '...##...',
    '...##...',
  ],
  // Tree (right half)
  '\uE029': [
    '..##....',
    '.#++#...',
    '#++++#..',
    '++++++#.',
    '++++++#.',
    '.#+++#..',
    '..##....',
    '..##....',
  ],
};

// ---------------------------------------------------------------------------
// D-pad arrows for the kana round; each points toward the option it sits beside.
// ---------------------------------------------------------------------------

export const UI_ICONS: Record<string, Glyph> = {
  // Up (sits above the UP option)
  '\uE030': [
    '........',
    '........',
    '........',
    '...++...',
    '..++++..',
    '.++++++.',
    '++++++++',
    '........',
  ],
  // Down (sits below the DOWN option)
  '\uE031': [
    '........',
    '++++++++',
    '.++++++.',
    '..++++..',
    '...++...',
    '........',
    '........',
    '........',
  ],
  // Left (sits left of the LEFT option)
  '\uE032': [
    '......+.',
    '.....++.',
    '....+++.',
    '...++++.',
    '...++++.',
    '....+++.',
    '.....++.',
    '......+.',
  ],
  // Right (sits right of the RIGHT option)
  '\uE033': [
    '.+......',
    '.++.....',
    '.+++....',
    '.++++...',
    '.++++...',
    '.+++....',
    '.++.....',
    '.+......',
  ],
};
