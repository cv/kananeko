/**
 * Color schemes for each screen (GBC), drawn only from the master palette
 * (palette.ts). Backdrop cells pick a ramp by their map character (see
 * scenes/backdrops.ts); unlisted cells use the first ramp. A scene's mood comes from
 * its paper (sky or wall) and hues; the ink is always the same.
 */

import type { ColorScheme } from '../color';
import { HUES, INK, PAPER, inked } from '../palette';
import { rgb } from '../video';

/** Cream clouds on a blue sky */
const SKY = [PAPER, HUES.sky[1], INK] as const;

export const STATION_COLORS: ColorScheme = {
  paper: HUES.sky[0],
  ramps: {
    sky: SKY,
    building: inked('stone'),
    train: inked('matcha'),
    track: inked('wood'),
  },
  cells: { '^': 'building', B: 'building', T: 'train', _: 'track', p: 'track' },
};

export const STREET_COLORS: ColorScheme = {
  paper: HUES.sky[0],
  ramps: {
    sky: SKY,
    sun: inked('honey'),
    leaves: inked('matcha'),
    house: inked('sakura'),
    ground: inked('wood'),
  },
  cells: { O: 'sun', Y: 'leaves', g: 'leaves', H: 'house', r: 'ground', c: 'ground' },
};

export const RESTAURANT_COLORS: ColorScheme = {
  paper: rgb(0xfb, 0xe9, 0xd6), // warm plaster
  ramps: {
    wall: inked('latte'),
    lantern: inked('tomato'),
    noren: inked('indigo'),
    bowl: inked('ginger'),
    wood: inked('wood'),
    kitchen: inked('stone'),
  },
  cells: {
    b: 'wood',
    L: 'lantern',
    N: 'noren',
    K: 'kitchen',
    W: 'bowl',
    m: 'wood',
    n: 'wood',
    F: 'wood',
  },
  front: 'n', // staff stand behind the counter
};

export const CONBINI_COLORS: ColorScheme = {
  paper: rgb(0xfa, 0xf6, 0xee), // bright shop light
  ramps: {
    wall: inked('stone'),
    sign: inked('matcha'),
    goods: [HUES.honey[0], HUES.tomato[1], INK],
    floor: inked('sky'),
  },
  cells: { S: 'sign', s: 'sign', E: 'goods', k: 'floor' },
};

export const SHRINE_COLORS: ColorScheme = {
  paper: HUES.sky[0],
  ramps: {
    torii: inked('tomato'),
    hall: inked('wood'),
    stone: inked('stone'),
    leaves: inked('matcha'),
    sand: inked('honey'), // the gravel, and the lanterns' light
    cloud: SKY,
  },
  cells: {
    R: 'torii',
    J: 'hall',
    I: 'stone',
    s: 'stone',
    Y: 'leaves',
    g: 'leaves',
    v: 'sand',
    i: 'sand',
    C: 'cloud',
  },
};

export const PARK_COLORS: ColorScheme = {
  paper: rgb(0xd4, 0xcc, 0xec), // evening
  ramps: {
    cloud: inked('lilac'),
    stars: inked('honey'),
    leaves: inked('matcha'),
    fence: inked('wood'),
  },
  cells: { '.': 'stars', O: 'stars', Y: 'leaves', g: 'leaves', '#': 'leaves', f: 'fence' },
};

export const TITLE_COLORS: ColorScheme = { paper: PAPER, ramps: { cat: inked('ginger') } };

export const ENDING_COLORS: ColorScheme = { paper: PAPER, ramps: { cat: inked('ginger') } };

export const GAME_OVER_COLORS: ColorScheme = { paper: PAPER, ramps: { cat: inked('stone') } };

/** The kana chart: missed kana stand out, inked in tomato red instead of plum */
export const CHART_COLORS: ColorScheme = {
  paper: PAPER,
  ramps: { missed: [...HUES.sakura, HUES.tomato[1]] },
};
