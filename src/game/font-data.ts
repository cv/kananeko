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
 *   glyphs-icons.ts    — Cat portrait, scene icons, UI tiles
 */

export type Glyph = [string, string, string, string, string, string, string, string];

import { LATIN_UPPER, DIGITS_PUNCT, BORDER } from './glyphs-latin';
import { HIRAGANA } from './glyphs-hiragana';
import { KATAKANA } from './glyphs-katakana';
import { CAT, CAT_BLINK_CHARS, CAT_SAD_CHARS, SCENE_ICONS, UI_ICONS } from './glyphs-icons';

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
  ...CAT,
  ...SCENE_ICONS,
  ...UI_ICONS,
};

// Cat tile indices for easy reference
export const CAT_TILES = {
  // 4x3 portrait grid (row-major: [row0: 4 tiles] [row1: 4 tiles] [row2: 4 tiles])
  ROW0: ['\uE000', '\uE001', '\uE002', '\uE003'] as const,
  ROW1: ['\uE004', '\uE005', '\uE006', '\uE007'] as const,
  ROW2: ['\uE008', '\uE009', '\uE00A', '\uE00B'] as const,
  /** Sad portrait, same 4x3 layout (reuses unchanged tiles) */
  SAD_ROWS: [CAT_SAD_CHARS.slice(0, 4), CAT_SAD_CHARS.slice(4, 8), CAT_SAD_CHARS.slice(8, 12)],
  /** Eye row (portrait row 1) with the eyes shut */
  BLINK_EYES: CAT_BLINK_CHARS.slice(4, 8),
  /** Small faces for the kana round */
  FACE_NEUTRAL: '\uE010',
  FACE_HAPPY: '\uE052',
  FACE_SAD: '\uE053',
  ICON: '\uE010',
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
