/**
 * Kananeko, the mascot: a 32x24 sprite (4x3 tiles) of a cool cat in sunglasses,
 * drawn as the left half of a picture and mirrored. Shades: '.' transparent, '-' fur, '+' ears and blush,
 * '#' ink. Every expression changes only the middle row of tiles (eyes and mouth),
 * so a face is just four tile numbers.
 */

import { mirrorHalf } from './art';

/** Neutral face, left half: sunglasses, a little nose over an ω mouth, blush, and paws over the edge */
const LEFT = [
  '................',
  '.....##.........',
  '.....#+#........',
  '.....#++#.......',
  '.....#+++#......',
  '.....#++--######',
  '....#+----------',
  '....#---#######-',
  '....######-#####',
  '....#---#######-',
  '....#---#######-',
  '....#----#####--',
  '....#-++------++',
  '....#-++-------+',
  '....#--------#-#',
  '....#---------#-',
  '....#-----------',
  '....#-----------',
  '.....#----------',
  '.....#----------',
  '......#-########',
  '......#--#......',
  '.......##.......',
  '................',
];

/**
 * Rows that change for each expression (all inside tile row 1, pixel rows 8-15).
 * The shades hide the eyes, so the mouth does the talking; the cat's "blink" is a
 * glint sliding across its lenses.
 */
const FACES = {
  neutral: {},
  happy: {
    14: '....#--------###',
    15: '....#---------#+',
  },
  sad: {
    14: '....#---------##',
    15: '....#--------#--',
  },
  blink: {
    8: '....#######-####',
  },
} as const satisfies Record<string, Readonly<Record<number, string>>>;

export type CatFace = keyof typeof FACES;
export const CAT_FACES = Object.keys(FACES) as CatFace[];

/** The whole 32x24 picture for a face */
export function catArt(face: CatFace): string[] {
  const rows: Readonly<Record<number, string>> = FACES[face];
  return mirrorHalf(LEFT.map((row, i) => rows[i] ?? row));
}
