/**
 * The game's one palette: "a cat's travel sketchbook". Warm paper, a single
 * plum-brown ink for every outline and letter, and a few soft hues. Every screen
 * draws only from these, so the whole game reads as one book.
 */

import type { Triple } from './fixed';
import { rgb } from './video';

/** Light, mid, and dark shades layered on a palette's color 0 */
export type Ramp = Triple<number>;

/** Every outline and letter */
export const INK = rgb(0x4b, 0x2d, 0x3c);
/** The page: text boxes, quiz cards, title */
export const PAPER = rgb(0xff, 0xf4, 0xe0);
/** Tinted paper: box fills, the HUD ribbon */
export const LATTE = rgb(0xf2, 0xdc, 0xc0);
/** Soft shadow under boxes */
export const COCOA = rgb(0xb9, 0x8a, 0x78);

/** Soft hues as [light, mid]; the dark shade is always INK */
export const HUES = {
  latte: [LATTE, COCOA],
  sakura: [rgb(0xff, 0xd9, 0xe0), rgb(0xf0, 0x93, 0xa8)],
  tomato: [rgb(0xff, 0xcc, 0xb8), rgb(0xe8, 0x70, 0x5a)],
  ginger: [rgb(0xff, 0xdc, 0xae), rgb(0xf0, 0xa0, 0x60)],
  honey: [rgb(0xff, 0xf0, 0xb0), rgb(0xf2, 0xc8, 0x5a)],
  matcha: [rgb(0xdc, 0xec, 0xb4), rgb(0x98, 0xc4, 0x7a)],
  sky: [rgb(0xd8, 0xec, 0xf8), rgb(0x98, 0xc8, 0xe8)],
  indigo: [rgb(0xcc, 0xd4, 0xf0), rgb(0x70, 0x80, 0xc0)],
  lilac: [rgb(0xe0, 0xd8, 0xf0), rgb(0xa8, 0x98, 0xd0)],
  wood: [rgb(0xec, 0xcc, 0xa4), rgb(0xbc, 0x88, 0x5c)],
  stone: [rgb(0xe8, 0xe0, 0xd8), rgb(0xb8, 0xac, 0xa4)],
} as const satisfies Record<string, readonly [number, number]>;

export type Hue = keyof typeof HUES;

/** A hue's ramp: its light and mid shades, outlined in the shared ink */
export function inked(hue: Hue): Ramp {
  const [light, mid] = HUES[hue];
  return [light, mid, INK];
}

/** Palette 0 everywhere: text, boxes, and quiz cards on paper */
export const UI_PALETTE = [PAPER, LATTE, COCOA, INK] as const;
/** Palette 1 everywhere: the HUD ribbon (latte band, sakura hearts, ink digits) */
export const HUD_PALETTE = [LATTE, ...HUES.sakura, INK] as const;
