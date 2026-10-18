/**
 * Run a small hand-built program in the emulator and inspect memory afterwards.
 * Used to test assembler macros by behavior rather than by byte patterns.
 */

import Gameboy from 'serverboy';
import { assemble } from '@asm/assembler';
import { di, jr, label } from '@asm/ops';
import { storeByte } from '@asm/macros';
import { type Op, ref, u16 } from '@asm/types';

/** WRAM scratch area tests can use freely ($C100-$CEFF) */
export const SCRATCH = 0xc100;
const DONE_FLAG = u16(0xcfff);
const DONE_VALUE = 0xa5;
const MAX_FRAMES = 600;

/** Assemble `ops`, run until they finish, and return the address space. */
export function runProgram(ops: readonly Op[], data: readonly Op[] = []): Uint8Array {
  const { rom } = assemble(
    [
      di(),
      ...ops,
      ...storeByte(DONE_FLAG, DONE_VALUE),
      label('__halt'),
      jr(ref('__halt')),
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
