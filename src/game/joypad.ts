/**
 * Joypad input reading subroutine.
 *
 * Reads the Game Boy P1 register (two phases: d-pad, then buttons),
 * debounces, and edge-detects. Stores results in WRAM:
 *   $C000 — current frame's button state (active-high)
 *   $C001 — previous frame's button state
 *   $C002 — newly pressed this frame (rising edge)
 *
 * Bit layout (after read): DULR SsBA
 *   7=Down 6=Up 5=Left 4=Right 3=Start 2=Select 1=B 0=A
 */

import type { Op } from '../asm/types';
import { label, ld, ldh, cpl, and, or, swap, ret } from '../asm/sm83';
import { HW } from '../asm/hardware';
import { MEM } from './ram';
import { JOY_READ } from './labels';
import { gameModule } from '../asm/program';

// Labels placed in this module

export function buildReadJoypad(): Op[] {
  return [
    label(JOY_READ),

    // Save previous state
    ld('a', [MEM.JOYPAD_CUR]),
    ld([MEM.JOYPAD_PREV], 'a'),

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
