/**
 * Joypad input reading subroutine.
 *
 * Reads the Game Boy P1 register (two phases: d-pad, then buttons),
 * debounces, and edge-detects:
 *   JOYPAD_CUR  — this frame's buttons (1 = held)
 *   JOYPAD_PREV — last frame's
 *   JOYPAD_NEW  — pressed this frame
 *
 * Bit layout (after read): DULR SsBA
 *   7=Down 6=Up 5=Left 4=Right 3=Start 2=Select 1=B 0=A
 */

import { ifThen } from '../asm/flow';
import { copyByte } from '../asm/macros';
import type { Op } from '../asm/types';
import { label, ld, ldh, cpl, and, or, swap, ret } from '../asm/sm83';
import { HW } from '../asm/hardware';
import { MEM } from './ram';
import { JOY_READ } from './labels';
import { gameModule } from '../asm/program';

/** NZ if any of `buttons` (JOY flags) was pressed this frame. Clobbers A. */
export function pressed(buttons: number): Op[] {
  return [ld('a', [MEM.JOYPAD_NEW]), and(buttons)];
}

/** NZ if any of `buttons` is held down. Clobbers A. */
export function held(buttons: number): Op[] {
  return [ld('a', [MEM.JOYPAD_CUR]), and(buttons)];
}

/** Run `body` if any of `buttons` was pressed this frame. */
export function ifPressed(buttons: number, body: readonly Op[]): Op[] {
  return [...pressed(buttons), ...ifThen('nz', body)];
}

/** Run `body` while any of `buttons` is held down. */
export function ifHeld(buttons: number, body: readonly Op[]): Op[] {
  return [...held(buttons), ...ifThen('nz', body)];
}

function buildReadJoypad(): Op[] {
  return [
    label(JOY_READ),

    ...copyByte(MEM.JOYPAD_PREV, MEM.JOYPAD_CUR),

    // Select d-pad (write $20 to P1)
    ld('a', 0x20),
    ldh([HW.P1], 'a'),
    // Read twice — bus needs time to settle
    ldh('a', [HW.P1]),
    ldh('a', [HW.P1]),
    // Invert (active-low → active-high), mask low nibble
    cpl(),
    and(0x0f),
    // Swap into high nibble (d-pad = bits 7-4)
    swap('a'),
    ld('b', 'a'), // save d-pad in B

    // Select buttons (write $10 to P1)
    ld('a', 0x10),
    ldh([HW.P1], 'a'),
    // Read twice
    ldh('a', [HW.P1]),
    ldh('a', [HW.P1]),
    // Invert, mask low nibble (buttons = bits 3-0)
    cpl(),
    and(0x0f),

    // Combine: A = d-pad (high) | buttons (low)
    or('b'),
    // Store as current state
    ld([MEM.JOYPAD_CUR], 'a'),

    // Edge detect: newly_pressed = current AND (NOT previous)
    ld('b', 'a'), // B = current
    ld('a', [MEM.JOYPAD_PREV]),
    cpl(), // A = NOT previous
    and('b'), // A = current AND (NOT previous)
    ld([MEM.JOYPAD_NEW], 'a'),

    // Deselect joypad lines (standard cleanup)
    ld('a', 0x30),
    ldh([HW.P1], 'a'),

    ret(),
  ];
}

export const joypadModule = gameModule({ name: 'joypad', code: buildReadJoypad });
