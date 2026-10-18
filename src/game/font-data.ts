/**
 * 8x8 pixel art glyph definitions for all game characters.
 *
 * Each glyph is 8 rows of 8 pixels using the palette's four shades:
 *   '.' = paper (0), '-' = light (1), '+' = mid (2), '#' = ink (3)
 * Separated from font.ts to keep the builder logic clean.
 *
 * Glyph data is split across files by script:
 *   glyphs-latin.ts    — A-Z, 0-9, punctuation, box borders
 *   glyphs-hiragana.ts — あ-ん (Misaki Gothic)
 *   glyphs-katakana.ts — ア-ン (Misaki Gothic)
 *   glyphs-icons.ts    — HUD marks, scene icons, UI tiles (the cat is a sprite: cat-art.ts)
 */

export type Glyph = [string, string, string, string, string, string, string, string];

import { LATIN_UPPER, DIGITS_PUNCT, BORDER } from './glyphs-latin';
import { HIRAGANA } from './glyphs-hiragana';
import { KATAKANA } from './glyphs-katakana';
import { MARKS, SCENE_ICONS, UI_ICONS } from './glyphs-icons';

/**
 * Latin letters the game prints: none, all labels are Japanese. Every letter is
 * defined in glyphs-latin.ts, but only these take up tiles and ROM; add a letter
 * here if new UI text needs it (the build fails with "Character not in font").
 */
const LATIN_IN_ROM = '';

function pick(glyphs: Record<string, Glyph>, chars: string): Record<string, Glyph> {
  return Object.fromEntries(Object.entries(glyphs).filter(([ch]) => chars.includes(ch)));
}

export const ALL_GLYPHS: Record<string, Glyph> = {
  ...pick(LATIN_UPPER, LATIN_IN_ROM),
  ...DIGITS_PUNCT,
  ...HIRAGANA,
  ...KATAKANA,
  ...BORDER,
  ...MARKS,
  ...SCENE_ICONS,
  ...UI_ICONS,
};

// HUD and quiz marks
export const CAT_TILES = {
  BLANK: '\uE011',
  HEART_FULL: '\uE012',
  HEART_EMPTY: '\uE013',
} as const;

// UI tiles
export const UI_TILES = {
  /** D-pad arrows in direction-index order: UP, DOWN, LEFT, RIGHT */
  ARROWS: ['\uE030', '\uE031', '\uE032', '\uE033'],
  /** Name tag caps on a box's top edge */
  TAG_LEFT: '\uE035',
  TAG_RIGHT: '\uE036',
  /** The choice cursor (a sprite) */
  PAW: '\uE037',
} as const;

// Scene icon tile pairs [left, right]
export const SCENE_ICON_TILES = {
  TRAIN: ['\uE020', '\uE021'],
  HOUSE: ['\uE022', '\uE023'],
  BOWL: ['\uE024', '\uE025'],
  SHOP: ['\uE026', '\uE027'],
  TREE: ['\uE028', '\uE029'],
} as const;
