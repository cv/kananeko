/**
 * Game Boy Color palettes. Every screen has palette 0 for the UI and palette 1 for
 * the HUD ribbon (both from palette.ts, the same on every screen), then up to six
 * of its own ramps for the scenery, all on the screen's paper (its sky or wall).
 * Tiles pick a palette through the CGB attribute map; the DMG ignores all of this
 * and draws every tile with BGP.
 */

import { HUD_PALETTE, type Ramp, UI_PALETTE } from './palette';
import { PAL } from './video';

export { PAL };
export type { Ramp };

export interface ColorScheme {
  /** Color 0 of the scene's own ramps: the sky or wall the scenery sits on */
  readonly paper: number;
  /** Scenery ramps by name; the first also colors backdrop cells not listed in `cells` */
  readonly ramps: Readonly<Record<string, Ramp>>;
  /** Backdrop map character → ramp name */
  readonly cells?: Readonly<Record<string, string>>;
  /** Backdrop map characters drawn in front of sprites (e.g. a counter people stand behind) */
  readonly front?: string;
}

/** CGB attribute bit 7: this tile's colors 1-3 draw over sprites */
const BG_PRIORITY = 0x80;

const MAX_PALETTES = 8;
/** Palettes every screen has before its own: ui, hud */
const SHARED = ['ui', 'hud'] as const;

/** Palette names in order: ui, hud, then the scheme's ramps */
function paletteNames(scheme: ColorScheme): string[] {
  return [...SHARED, ...Object.keys(scheme.ramps)];
}

/** Palette number of a named ramp (or of 'ui' / 'hud') */
export function paletteOf(scheme: ColorScheme, ramp: string): number {
  const index = paletteNames(scheme).indexOf(ramp);
  if (index < 0) throw new Error(`No ramp named "${ramp}"`);
  return index;
}

/** Palette number for a backdrop map character */
export function paletteOfCell(scheme: ColorScheme, cell: string): number {
  const ramp = scheme.cells?.[cell];
  return ramp === undefined ? SHARED.length : paletteOf(scheme, ramp);
}

/** CGB attribute byte for a backdrop map character: palette, plus priority for front cells */
export function attributeOfCell(scheme: ColorScheme, cell: string): number {
  return paletteOfCell(scheme, cell) | ((scheme.front ?? '').includes(cell) ? BG_PRIORITY : 0);
}

/** Encode a scheme as [palette count, then 4 RGB555 colors (little-endian) per palette]. */
export function buildPaletteSet(scheme: ColorScheme): Uint8Array {
  const names = paletteNames(scheme);
  if (names.length > MAX_PALETTES) {
    throw new RangeError(`At most ${String(MAX_PALETTES)} palettes, got ${String(names.length)}`);
  }
  const own = Object.values(scheme.ramps).map((ramp) => [scheme.paper, ...ramp]);
  const colors = [UI_PALETTE, HUD_PALETTE, ...own].flat();
  return Uint8Array.from([names.length, ...colors.flatMap((c) => [c & 0xff, c >> 8])]);
}
