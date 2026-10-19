/**
 * Backdrop maps for each scene: what each character draws is in scenery.ts,
 * and its colors in colors.ts. Props (multi-tile pictures) fill a rectangle of
 * their character, repeating if it's bigger: 'YY' over three rows is one tree.
 *
 *   ' ' paper (sky, wall)   C cloud      O sun / moon   . star
 *   ^ rooftop   B building  T train car  _ platform edge  p platform
 *   Y tree      H house     g grass verge  r sidewalk     c curb and road
 *   # lawn      f fence     b beam       L lantern      N noren   K kitchen wall
 *   W ramen     m counter   n counter (in front of the staff)   F wood floor
 *   S shop sign E shelf     k shop floor
 */

import type { Backdrop } from '../backdrop';

/** A train waits at the platform; the city behind it */
export const STATION_BACKDROP: Backdrop = [
  ' CCCC        CCCC   ',
  '^CCCC ^^^    CCCC^  ',
  'BBBB  BBB    BBBBB  ',
  'BBBB  BBB    BBBBB  ',
  'TTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTT',
  '____________________',
  'pppppppppppppppppppp',
];

/** Houses and trees along a sunny street */
export const STREET_BACKDROP: Backdrop = [
  ' CCCC     OO   CCCC ',
  ' CCCC     OO   CCCC ',
  ' YY  HHH    YY  HHH ',
  ' YY  HHH    YY  HHH ',
  ' YY  HHH    YY  HHH ',
  'gggggggggggggggggggg',
  'rrrrrrrrrrrrrrrrrrrr',
  'cccccccccccccccccccc',
];

/** A ramen counter: staff stand in the kitchen doorway, behind the counter */
export const RESTAURANT_BACKDROP: Backdrop = [
  'bbbbbbbbbbbbbbbbbbbb',
  '   L  NNNNNNNN  L   ',
  '      KKKKKKKK      ',
  '      KKKKKKKK      ',
  '  WW  KKKKKKKK  WW  ',
  '  WW  KKKKKKKK  WW  ',
  'mmmmmmnnnnnnnnmmmmmm',
  'FFFFFFFFFFFFFFFFFFFF',
];

/** Shelves under the shop sign */
export const CONBINI_BACKDROP: Backdrop = [
  'SSSSSSSSSSSSSSSSSSSS',
  ' EEEEE  EEEEE EEEEE ',
  ' EEEEE  EEEEE EEEEE ',
  ' EEEEE  EEEEE EEEEE ',
  '                    ',
  'k k k k k k k k k k ',
  ' k k k k k k k k k k',
  'k k k k k k k k k k ',
];

/** An evening park: moon, stars, trees along a fence */
export const SHRINE_BACKDROP: Backdrop = [
  ' CCC          CCC   ',
  ' RRRR   JJJJJ   YY  ',
  ' RRRR i JJJJJ i YY  ',
  ' RRRR I JJJJJ I YY  ',
  'gggggggggggggggggggg',
  'vvvvvvvvvsssvvvvvvvv',
  'vvvvvvvvvsssvvvvvvvv',
  'vvvvvvvvvsssvvvvvvvv',
];

export const PARK_BACKDROP: Backdrop = [
  ' .    OO CCCC   .   ',
  '   .  OO CCCC    .  ',
  'YY   YY       YY  YY',
  'YY   YY       YY  YY',
  'YYfffYYfffffffYYffYY',
  'gggggggggggggggggggg',
  '####################',
  '####################',
];
