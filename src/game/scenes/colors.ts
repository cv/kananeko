/**
 * Color schemes for each screen (GBC), drawn only from the master palette
 * (palette.ts). Backdrop cells pick a ramp by their map character (see
 * BACKDROP_LEGEND); unlisted cells use the first ramp. A scene's mood comes from
 * its paper (sky or wall) and hues; the ink is always the same.
 */

import { type ColorScheme } from '../color';
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
  cells: {
    '^': 'building',
    B: 'building',
    T: 'train',
    t: 'train',
    '=': 'track',
    _: 'track',
    '#': 'track',
  },
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
  cells: {
    o: 'sun',
    Y: 'leaves',
    y: 'leaves',
    g: 'leaves',
    H: 'house',
    h: 'house',
    '#': 'ground',
    r: 'ground',
    _: 'ground',
  },
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
    L: 'lantern',
    N: 'noren',
    K: 'kitchen',
    W: 'bowl',
    w: 'bowl',
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

export const PARK_COLORS: ColorScheme = {
  paper: rgb(0xd4, 0xcc, 0xec), // evening
  ramps: {
    cloud: inked('lilac'),
    stars: inked('honey'),
    leaves: inked('matcha'),
    fence: inked('wood'),
  },
  cells: {
    '.': 'stars',
    o: 'stars',
    Y: 'leaves',
    y: 'leaves',
    g: 'leaves',
    '#': 'leaves',
    f: 'fence',
  },
};

export const TITLE_COLORS: ColorScheme = { paper: PAPER, ramps: { cat: inked('ginger') } };

export const ENDING_COLORS: ColorScheme = { paper: PAPER, ramps: { cat: inked('ginger') } };

export const GAME_OVER_COLORS: ColorScheme = { paper: PAPER, ramps: { cat: inked('stone') } };
