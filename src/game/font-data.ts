/**
 * 8x8 pixel art glyph definitions for all game characters.
 *
 * Each glyph is 8 rows of 8 pixels: '#' = on, '.' = off.
 * Separated from font.ts to keep the builder logic clean.
 *
 * Glyph data is split across files by script:
 *   glyphs-latin.ts    — A-Z, 0-9, punctuation, box borders
 *   glyphs-hiragana.ts — あ-ん (Misaki Gothic)
 *   glyphs-katakana.ts — ア-ン (Misaki Gothic)
 *   glyphs-icons.ts    — Cat portrait, scene icons, UI tiles
 */

export type Glyph = [string, string, string, string, string, string, string, string];

import { LATIN_UPPER, DIGITS_PUNCT, BORDER } from './glyphs-latin';
import { HIRAGANA } from './glyphs-hiragana';
import { KATAKANA } from './glyphs-katakana';
import { CAT, SCENE_ICONS } from './glyphs-icons';

export const ALL_GLYPHS: Record<string, Glyph> = {
  ...LATIN_UPPER,
  ...DIGITS_PUNCT,
  ...HIRAGANA,
  ...KATAKANA,
  ...BORDER,
  ...CAT,
  ...SCENE_ICONS,
};

// Cat tile indices for easy reference
export const CAT_TILES = {
  // 4x3 portrait grid (row-major: [row0: 4 tiles] [row1: 4 tiles] [row2: 4 tiles])
  ROW0: ['\uE000', '\uE001', '\uE002', '\uE003'] as const,
  ROW1: ['\uE004', '\uE005', '\uE006', '\uE007'] as const,
  ROW2: ['\uE008', '\uE009', '\uE00A', '\uE00B'] as const,
  ICON: '\uE010',
  BLANK: '\uE011',
  HEART_FULL: '\uE012',
  HEART_EMPTY: '\uE013',
} as const;

// Scene icon tile pairs [left, right]
export const SCENE_ICON_TILES = {
  TRAIN: ['\uE020', '\uE021'],
  HOUSE: ['\uE022', '\uE023'],
  BOWL: ['\uE024', '\uE025'],
  SHOP: ['\uE026', '\uE027'],
  TREE: ['\uE028', '\uE029'],
} as const;
