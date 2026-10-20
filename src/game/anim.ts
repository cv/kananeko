/**
 * Animated backdrop tiles: every few frames the next frame's 16 bytes are copied
 * into the tile's VRAM, so every copy of it on screen animates at once.
 */

import { MEM } from './ram';
import { ifThen, repeat } from '../asm/flow';
import { incByte, loadPointer } from '../asm/macros';
import { add, and, cp, inc, label, ld, pop, push, ret, swap, xor } from '../asm/sm83';
import type { Op } from '../asm/types';
import type { SceneArt } from './backdrop';
import { encodeGlyph } from './font';
import { SCENERY, isProp } from './scenery';
import type { TileAnimation } from './scenes/animations';
import { bgTileAddr, vramPut } from './video';
import { ANIM_TICK } from './labels';
import { gameModule } from '../asm/program';

// Labels placed in this module

const MAX_FRAMES = 16; // frame offset is computed with SWAP (frame * 16 < 256)

/**
 * [VRAM address lo, hi, frame count, period mask, frames × 16 bytes], or a
 * count of 0 for no animation.
 */
export function packAnimation(animation: TileAnimation | undefined, art: SceneArt): Uint8Array {
  if (animation === undefined) return Uint8Array.from([0, 0, 0]);
  const { cell, frames, period } = animation;
  const tile = art.tileOfCell.get(cell);
  const scenery = SCENERY[cell];
  const base = scenery === undefined || isProp(scenery) ? undefined : scenery;
  if (tile === undefined || base === undefined) {
    throw new Error(`Animated cell "${cell}" isn't a scene tile in this backdrop`);
  }
  if (period < 1 || period > 128 || (period & (period - 1)) !== 0) {
    throw new RangeError(
      `Animation period must be a power of two up to 128, got ${String(period)}`,
    );
  }
  const all = [base, ...frames];
  if (all.length > MAX_FRAMES) throw new RangeError(`At most ${String(MAX_FRAMES)} frames`);
  const addr = bgTileAddr(tile);
  return Uint8Array.from([
    addr & 0xff,
    addr >> 8,
    all.length,
    period - 1,
    ...all.flatMap((glyph) => Array.from(encodeGlyph(glyph))),
  ]);
}

/** Subroutine anim_tick: advance the scene's tile animation (call once per frame, LCD on). */
function buildAnimRoutines(): Op[] {
  return [
    label(ANIM_TICK),
    ...loadPointer('hl', MEM.ANIM),
    ld('a', ['hl+']),
    ld('e', 'a'), // DE = tile's VRAM address
    ld('a', ['hl+']),
    ld('d', 'a'),
    ld('a', ['hl+']),
    cp(0),
    ret('z'), // no animation in this scene
    ld('b', 'a'), // B = frame count
    ld('a', ['hl+']),
    ld('c', 'a'), // C = period mask
    ...incByte(MEM.ANIM_TIMER),
    and('c'),
    ret('nz'),

    // Next frame, wrapping to 0
    ld('a', [MEM.ANIM_FRAME]),
    inc('a'),
    cp('b'),
    ...ifThen('nc', [xor('a')]),
    ld([MEM.ANIM_FRAME], 'a'),
    swap('a'), // A = frame * 16
    ld('c', 'a'),
    ld('b', 0),
    add('hl', 'bc'), // HL = frame data

    // Copy 16 bytes from [HL] to VRAM at DE
    ...repeat(16, [
      ld('a', ['hl+']),
      push('hl'),
      ld('h', 'd'),
      ld('l', 'e'),
      ...vramPut(),
      ld('d', 'h'),
      ld('e', 'l'),
      pop('hl'),
    ]),
    ret(),
  ];
}

export const animModule = gameModule({ name: 'anim', code: buildAnimRoutines });
