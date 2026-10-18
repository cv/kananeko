/**
 * Kananeko, the mascot: a 32x24 sprite (4x3 tiles) drawn as the left half of a
 * picture and mirrored. Shades: '.' transparent, '-' fur, '+' ears and blush,
 * '#' ink. Every expression changes only the middle row of tiles (eyes and mouth),
 * so a face is just four tile numbers.
 */

import { mirrorHalf } from './art';

/** Neutral face, left half: dot eyes, an ω mouth, blush, and two paws over the edge */
const LEFT = [
  '................',
  '..##............',
  '..#+#...........',
  '..#++#..........',
  '..#+++#.........',
  '..#++--########.',
  '.#+------------#',
  '.#-------------- ',
  '.#--------------',
  '.#--------------',
  '.#----##--------',
  '.#----##--------',
  '.#--------------',
  '.#-++---------++',
  '.#-++--------#--',
  '.#------------##',
  '..#-------------',
  '..#-------------',
  '...#------------',
  '....##----------',
  '....#-##########',
  '....#--#........',
  '.....##.........',
  '................',
].map((row) => row.trimEnd());

/** Rows that change for each expression (all inside tile row 1, pixel rows 8-15) */
const FACES = {
  neutral: {},
  happy: {
    10: '.#-----#--------',
    11: '.#----#-#-------',
    13: '.#-++--------###',
    14: '.#-++---------#+',
    15: '.#-------------#',
  },
  sad: {
    9: '.#-------#------',
    10: '.#-----#--------',
    11: '.#----##--------',
    13: '.#-++---------##',
    14: '.#-++--------#--',
    15: '.#--------------',
  },
  blink: {
    10: '.#--------------',
    11: '.#----##--------',
  },
} as const satisfies Record<string, Readonly<Record<number, string>>>;

export type CatFace = keyof typeof FACES;
export const CAT_FACES = Object.keys(FACES) as CatFace[];

/** The whole 32x24 picture for a face */
export function catArt(face: CatFace): string[] {
  const rows: Readonly<Record<number, string>> = FACES[face];
  return mirrorHalf(LEFT.map((row, i) => rows[i] ?? row));
}
