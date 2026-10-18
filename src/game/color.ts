/**
 * Game Boy Color palettes. Each screen has a palette set: up to 8 BG palettes that
 * all share color 0 (the screen's paper) and differ in their three darker shades.
 * Tiles pick a palette through the CGB attribute map; the DMG ignores all of this
 * and draws every tile with BGP.
 */

import { type Triple } from './fixed';
import { PAL, rgb } from './video';

export { PAL };

/** Light, mid, and ink shades layered on a screen's paper color */
export type Ramp = Triple<number>;

export interface ColorScheme {
  /** Color 0 of every palette: the background the art sits on */
  readonly paper: number;
  /** Named ramps; 'ui' (text, HUD, box) is palette 0. 'hearts' is added as palette 1. */
  readonly ramps: { readonly ui: Ramp } & Readonly<Record<string, Ramp>>;
  /** Backdrop map character → ramp name (cells not listed use 'ui') */
  readonly cells?: Readonly<Record<string, string>>;
  /** Backdrop map characters drawn in front of sprites (e.g. a counter people stand behind) */
  readonly front?: string;
}

/** CGB attribute bit 7: this tile's colors 1-3 draw over sprites */
const BG_PRIORITY = 0x80;

/** Ramp shared by every screen for the HUD hearts */
export const HEARTS: Ramp = [rgb(0xf8, 0xb8, 0xc0), rgb(0xe0, 0x48, 0x58), rgb(0x70, 0x18, 0x20)];

const MAX_PALETTES = 8;

/** Ramp names in palette order: ui, hearts, then the scheme's others */
function rampOrder(scheme: ColorScheme): string[] {
  return ['ui', 'hearts', ...Object.keys(scheme.ramps).filter((name) => name !== 'ui')];
}

/** Palette number of a named ramp */
export function paletteOf(scheme: ColorScheme, ramp: string): number {
  const index = rampOrder(scheme).indexOf(ramp);
  if (index < 0) throw new Error(`No ramp named "${ramp}"`);
  return index;
}

/** Palette number for a backdrop map character */
export function paletteOfCell(scheme: ColorScheme, cell: string): number {
  return paletteOf(scheme, scheme.cells?.[cell] ?? 'ui');
}

/** CGB attribute byte for a backdrop map character: palette, plus priority for front cells */
export function attributeOfCell(scheme: ColorScheme, cell: string): number {
  return paletteOfCell(scheme, cell) | ((scheme.front ?? '').includes(cell) ? BG_PRIORITY : 0);
}

/** Encode a scheme as [palette count, then 4 RGB555 colors (little-endian) per palette]. */
export function buildPaletteSet(scheme: ColorScheme): Uint8Array {
  const names = rampOrder(scheme);
  if (names.length > MAX_PALETTES) {
    throw new RangeError(`At most ${String(MAX_PALETTES)} palettes, got ${String(names.length)}`);
  }
  const others = Object.entries(scheme.ramps)
    .filter(([name]) => name !== 'ui')
    .map(([, ramp]) => ramp);
  const ramps = [scheme.ramps.ui, HEARTS, ...others];
  const colors = ramps.flatMap((ramp) => [scheme.paper, ...ramp]);
  return Uint8Array.from([names.length, ...colors.flatMap((c) => [c & 0xff, c >> 8])]);
}
