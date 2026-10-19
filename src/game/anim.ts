/**
 * Animated backdrop tiles: every few frames the next frame's 16 bytes are copied
 * into the tile's VRAM, so every copy of it on screen animates at once.
 */

import { MEM } from './ram';
import { loadPointer } from '../asm/macros';
import {
  add_hl_rr,
  and_r,
  cp_n,
  cp_r,
  dec_r,
  inc_r,
  jr_cc,
  label,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ldi_a_hl,
  pop,
  push,
  ret,
  ret_cc,
  swap,
  xor_r,
} from '../asm/ops';
import { type Op, u8, Label } from '../asm/types';
import type { SceneArt } from './backdrop';
import { encodeGlyph } from './font';
import { SCENERY, isProp } from './scenery';
import type { TileAnimation } from './scenes/animations';
import { bgTileAddr, vramPut } from './video';
import { ANIM_TICK } from './labels';

// Labels placed in this module
const ANIM_FRAME_OK = new Label('anim_frame_ok');
const ANIM_COPY = new Label('anim_copy');

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
export function buildAnimRoutines(): Op[] {
  return [
    label(ANIM_TICK),
    ...loadPointer('hl', MEM.ANIM_LO, MEM.ANIM_HI),
    ldi_a_hl(),
    ld_r_r('e', 'a'), // DE = tile's VRAM address
    ldi_a_hl(),
    ld_r_r('d', 'a'),
    ldi_a_hl(),
    cp_n(u8(0)),
    ret_cc('z'), // no animation in this scene
    ld_r_r('b', 'a'), // B = frame count
    ldi_a_hl(),
    ld_r_r('c', 'a'), // C = period mask
    ld_a_nn(MEM.ANIM_TIMER),
    inc_r('a'),
    ld_nn_a(MEM.ANIM_TIMER),
    and_r('c'),
    ret_cc('nz'),

    // Next frame, wrapping to 0
    ld_a_nn(MEM.ANIM_FRAME),
    inc_r('a'),
    cp_r('b'),
    jr_cc('c', ANIM_FRAME_OK),
    xor_r('a'),
    label(ANIM_FRAME_OK),
    ld_nn_a(MEM.ANIM_FRAME),
    swap('a'), // A = frame * 16
    ld_r_r('c', 'a'),
    ld_r_n('b', u8(0)),
    add_hl_rr('bc'), // HL = frame data

    // Copy 16 bytes from [HL] to VRAM at DE
    ld_r_n('b', u8(16)),
    label(ANIM_COPY),
    ldi_a_hl(),
    push('hl'),
    ld_r_r('h', 'd'),
    ld_r_r('l', 'e'),
    ...vramPut(),
    ld_r_r('d', 'h'),
    ld_r_r('e', 'l'),
    pop('hl'),
    dec_r('b'),
    jr_cc('nz', ANIM_COPY),
    ret(),
  ];
}
