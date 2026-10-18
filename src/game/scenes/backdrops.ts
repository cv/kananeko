/**
 * Backdrop maps for each scene (see BACKDROP_LEGEND in ../backdrop.ts).
 *
 *   ' ' paper   . sky    ( ) cloud   o sun/moon   ^ rooftop   B building
 *   = rails     _ ground edge   # ground   g grass   f fence   r road
 *   | wallpaper L lantern   N noren   n counter   E shelf   F wood floor   k tile floor
 *   Tt train    Hh house    Ww bowl   Ss shop   Yy tree
 */

import { type Backdrop } from '../backdrop';

export const STATION_BACKDROP: Backdrop = [
  '  ()     .     ()  .',
  ' .   ()        .    ',
  '^^^     ^^^^    ^^^ ',
  'BBB ^^^ BBBB ^^ BBB ',
  'BBB BBB BBBB BB BBB ',
  ' TtTtTt      TtTt   ',
  '====================',
  '____________________',
];

export const STREET_BACKDROP: Backdrop = [
  '  ()    o      ()   ',
  ' .         .     .  ',
  '                    ',
  ' Yy  Hh  Yy  Hh  Yy ',
  'gggggggggggggggggggg',
  '####################',
  'rrrrrrrrrrrrrrrrrrrr',
  '____________________',
];

export const RESTAURANT_BACKDROP: Backdrop = [
  '||||||||||||||||||||',
  '||L||||L||||L||||L||',
  '||||NNNNNNNNNNNN||||',
  '||||||||||||||||||||',
  '                    ',
  '  WwWw  WwWw  WwWw  ',
  'nnnnnnnnnnnnnnnnnnnn',
  'FFFFFFFFFFFFFFFFFFFF',
];

export const CONBINI_BACKDROP: Backdrop = [
  '  SsSsSsSsSsSsSsSs  ',
  '||||||||||||||||||||',
  'EEEEE||EEEEE||EEEEE|',
  'EEEEE||EEEEE||EEEEE|',
  'EEEEE||EEEEE||EEEEE|',
  '||||||||||||||||||||',
  'kkkkkkkkkkkkkkkkkkkk',
  'kkkkkkkkkkkkkkkkkkkk',
];

export const PARK_BACKDROP: Backdrop = [
  ' .    o       .     ',
  '    .     ()     .  ',
  '                    ',
  'Yy  Yy    Yy  Yy  Yy',
  'ffffffffffffffffffff',
  'gggggggggggggggggggg',
  '####################',
  '####################',
];
