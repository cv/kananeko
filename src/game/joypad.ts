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

import { type Op, u8 } from '../asm/types';
import {
  label,
  ld_r_n,
  ld_r_r,
  ldh_n_a,
  ldh_a_n,
  ld_a_nn,
  ld_nn_a,
  cpl,
  and_n,
  and_r,
  or_r,
  swap,
  ret,
} from '../asm/ops';
import { HW, MEM } from '../asm/hardware';

export function buildReadJoypad(): Op[] {
  return [
    label('joy_read'),

    // Save previous state
    ld_a_nn(MEM.JOYPAD_CUR),
    ld_nn_a(MEM.JOYPAD_PREV),

    // Select d-pad (write $20 to P1)
    ld_r_n('a', u8(0x20)),
    ldh_n_a(HW.P1),
    // Read twice — bus needs time to settle
    ldh_a_n(HW.P1),
    ldh_a_n(HW.P1),
    // Invert (active-low → active-high), mask low nibble
    cpl(),
    and_n(u8(0x0f)),
    // Swap into high nibble (d-pad = bits 7-4)
    swap('a'),
    ld_r_r('b', 'a'), // save d-pad in B

    // Select buttons (write $10 to P1)
    ld_r_n('a', u8(0x10)),
    ldh_n_a(HW.P1),
    // Read twice
    ldh_a_n(HW.P1),
    ldh_a_n(HW.P1),
    // Invert, mask low nibble (buttons = bits 3-0)
    cpl(),
    and_n(u8(0x0f)),

    // Combine: A = d-pad (high) | buttons (low)
    or_r('b'),
    // Store as current state
    ld_nn_a(MEM.JOYPAD_CUR),

    // Edge detect: newly_pressed = current AND (NOT previous)
    ld_r_r('b', 'a'), // B = current
    ld_a_nn(MEM.JOYPAD_PREV),
    cpl(), // A = NOT previous
    and_r('b'), // A = current AND (NOT previous)
    ld_nn_a(MEM.JOYPAD_NEW),

    // Deselect joypad lines (standard cleanup)
    ld_r_n('a', u8(0x30)),
    ldh_n_a(HW.P1),

    ret(),
  ];
}
