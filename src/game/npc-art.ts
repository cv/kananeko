/**
 * 16x16 character sprites assembled from parts, so every conversation partner
 * gets a look without hand-drawing each one.
 *
 * Shades: '.' transparent, '-' skin (and other light parts), '+' clothes, '#' hair/outline.
 * Overlays use ' ' for "keep what's underneath".
 */

import { type Triple } from './fixed';

type Art = readonly string[];

const BASE: Art = [
  '................',
  '................',
  '......----......',
  '.....------.....',
  '.....-#--#-.....',
  '.....------.....',
  '......----......',
  '.......--.......',
  '.....++++++.....',
  '....++++++++....',
  '...-++++++++-...',
  '...-++++++++-...',
  '....++++++++....',
  '.....++..++.....',
  '.....++..++.....',
  '.....##..##.....',
];

const HAIR = {
  short: { 1: '......####......', 2: '.....######.....', 3: '.....#    #.....' },
  long: {
    1: '......####......',
    2: '.....######.....',
    3: '....##    ##....',
    4: '....#      #....',
    5: '....#      #....',
    6: '....##    ##....',
    7: '.....#    #.....',
  },
  bun: {
    0: '.......##.......',
    1: '......####......',
    2: '.....######.....',
    3: '.....#    #.....',
  },
  cap: {
    0: '.....######.....',
    1: '....########....',
    2: '....#########...',
    3: '.....#    #.....',
  },
  chef: { 0: '.....++++++.....', 1: '....++++++++....', 2: '.....++++++.....' },
  elder: { 3: '....##    ##....', 4: '....#      #....' },
  pigtails: { 1: '......####......', 2: '..##.######.##..', 3: '..##.#    #.##..' },
  bob: {
    1: '.....######.....',
    2: '....########....',
    3: '....##    ##....',
    4: '....#      #....',
    5: '....#      #....',
  },
} as const satisfies Record<string, Readonly<Record<number, string>>>;

const OUTFIT = {
  plain: {},
  uniform: { 9: '       ##       ', 10: '       ##       ', 11: '       ##       ' },
  apron: { 10: '    #------#    ', 11: '    #------#    ', 12: '    ########    ' },
  dress: { 12: '...++++++++++...', 13: '...++++++++++...', 14: '.....--..--.....' },
  sport: { 13: '.....--..--.....', 14: '.....--..--.....' },
  coat: { 12: '...++++++++++...', 13: '...++++++++++...', 14: '....+++..+++....' },
} as const satisfies Record<string, Readonly<Record<number, string>>>;

const EXTRA = {
  glasses: { 4: '....-##--##-....' },
  backpack: { 9: '    #      #    ', 10: '    #      #    ', 11: '    #      #    ' },
  box: { 10: '....########....', 11: '....#------#....', 12: '....########....' },
  flute: { 6: '          #####.' },
  moustache: { 6: '......####......' },
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
