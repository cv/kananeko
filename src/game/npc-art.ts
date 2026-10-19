/**
 * 16x16 character sprites assembled from parts, so every conversation partner
 * gets a look without hand-drawing each one.
 *
 * Chibi proportions (a big head on a short body), to match the cat.
 * Shades: '.' transparent, '-' skin (and other light parts), '+' clothes, '#' hair/outline.
 * Overlays use ' ' for "keep what's underneath".
 */

import { mirrorHalf } from './art';
import type { Triple } from './fixed';

type Art = readonly string[];

/** A chibi: big round head, dot eyes, a small mouth, and a short body (mirrored left half) */
const BASE: Art = mirrorHalf([
  '........',
  '........',
  '.....###',
  '....#---',
  '...#----',
  '...#----',
  '...#-#--',
  '...#-#--',
  '...#---#',
  '....#---',
  '.....###',
  '....#+++',
  '...-#+++',
  '....#+++',
  '.....#+#',
  '.....##.',
]);

const SHORT = {
  1: '.....######.....',
  2: '....########....',
  3: '...###    ###...',
} as const;

const HAIR = {
  short: SHORT,
  long: {
    ...SHORT,
    4: '..##        ##..',
    5: '..##        ##..',
    6: '..##        ##..',
    7: '..##        ##..',
    8: '..##        ##..',
    9: '...#        #...',
  },
  bun: { 0: '.......##.......', ...SHORT },
  cap: {
    1: '....########....',
    2: '...##########...',
    3: '...###    #####.',
  },
  chef: {
    0: '....++++++++....',
    1: '....++++++++....',
    2: '....########....',
  },
  elder: {
    2: '....#      #....',
    3: '...##      ##...',
    4: '...##      ##...',
  },
  pigtails: {
    ...SHORT,
    2: '.##.########.##.',
    3: '.#####    #####.',
    4: '.##..      ..##.',
  },
  bob: {
    ...SHORT,
    4: '...##      ##...',
    5: '...##      ##...',
    6: '...##      ##...',
    7: '...##      ##...',
  },
} as const satisfies Record<string, Readonly<Record<number, string>>>;

const OUTFIT = {
  plain: {},
  uniform: { 11: '       ##       ', 12: '       ##       ', 13: '       ##       ' },
  apron: { 12: '      ----      ', 13: '      ----      ' },
  dress: { 13: '...#++++++++#...', 14: '....##+##+##....' },
  sport: { 14: '.....#-##-#.....' },
  coat: { 13: '...#++++++++#...', 14: '...#+++##+++#...' },
} as const satisfies Record<string, Readonly<Record<number, string>>>;

const EXTRA = {
  glasses: { 6: '....###--###....' },
  backpack: { 11: '     #    #     ', 12: '     #    #     ' },
  box: { 11: '....########....', 12: '....#------#....', 13: '....########....' },
  flute: { 8: '          ######' },
  moustache: { 8: '......####......' },
} as const satisfies Record<string, Readonly<Record<number, string>>>;

export interface NpcLook {
  readonly hair: keyof typeof HAIR;
  readonly outfit: keyof typeof OUTFIT;
  readonly extras?: readonly (keyof typeof EXTRA)[];
  /** skin, clothes, hair/outline (RGB555) — the sprite's GBC palette */
  readonly colors: Triple<number>;
}

function overlay(art: Art, layer: Readonly<Record<number, string>>): string[] {
  return art.map((row, r) => {
    const top = layer[r];
    if (top === undefined) return row;
    return Array.from(row, (pixel, c) => (top.charAt(c) === ' ' ? pixel : top.charAt(c))).join('');
  });
}

/** Compose a character's 16x16 art from its parts. */
export function npcArt(look: NpcLook): string[] {
  const layers = [
    HAIR[look.hair],
    OUTFIT[look.outfit],
    ...(look.extras ?? []).map((e) => EXTRA[e]),
  ];
  return layers.reduce<string[]>((art, layer) => overlay(art, layer), [...BASE]);
}
