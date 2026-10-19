/**
 * Run a small hand-built program in the emulator and inspect memory afterwards.
 * Used to test assembler macros by behavior rather than by byte patterns.
 */

import Gameboy from 'serverboy';
import { assemble } from '@asm/assembler';
import { di, jr, label, ld_rr_nn } from '@asm/ops';
import { storeByte } from '@asm/macros';
import { type Op, u16, Label } from '@asm/types';

// Labels placed in this module
const __HALT = new Label('__halt');

/** WRAM scratch area tests can use freely ($C100-$CEFF) */
export const SCRATCH = 0xc100;
const DONE_FLAG = u16(0xcfff);
/** Below DONE_FLAG, clear of HRAM (where the game keeps its variables) */
const STACK_TOP = u16(0xcff0);
const DONE_VALUE = 0xa5;
const MAX_FRAMES = 600;

/** Assemble `ops`, run until they finish, and return the address space. */
export function runProgram(ops: readonly Op[], data: readonly Op[] = []): Uint8Array {
  const { rom } = assemble(
    [
      di(),
      ld_rr_nn('sp', STACK_TOP),
      ...ops,
      ...storeByte(DONE_FLAG, DONE_VALUE),
      label(__HALT),
      jr(__HALT),
      ...data,
    ],
    { title: 'TEST' },
  );

  const gb = new Gameboy();
  gb.loadRom(rom);
  const memory = gb.getMemory();
  memory[DONE_FLAG] = 0;
  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    gb.doFrame();
    if (memory[DONE_FLAG] === DONE_VALUE) return memory;
  }
  throw new Error(`Program did not finish within ${String(MAX_FRAMES)} frames`);
}
