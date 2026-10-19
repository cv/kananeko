/**
 * Programs built from modules. Each module brings its own boot code, subroutines and
 * data, so the main program only has to say what the game does, not where every
 * routine and table goes. link() lays the program out as:
 *
 *   boot (from $0150) · every module's init · main · every module's code · every
 *   module's data · the pool (see Pooled)
 *
 * Module code is only reached by CALL or JP (main ends in its own loop, and each init
 * falls through to the next), so the order of modules doesn't change what runs.
 */

import { pool } from './ops';
import type { Op } from './types';

export interface GameModule {
  /** For error messages */
  readonly name: string;
  /** Run once at boot, in module order, with the LCD off and RAM cleared */
  readonly init?: () => readonly Op[];
  /** Subroutines (reached by CALL or JP, never fallen into) */
  readonly code?: () => readonly Op[];
  /** Read-only data */
  readonly data?: () => readonly Op[];
}

/** A module: its init, code and data are built when the program is linked */
export function gameModule(module: GameModule): GameModule {
  return module;
}

export interface ProgramParts {
  /** Runs first, from the entry point: sets up the CPU and RAM before any module's init */
  readonly boot: readonly Op[];
  /** Runs after every init: the game itself. It never returns. */
  readonly main: readonly Op[];
  readonly modules: readonly GameModule[];
}

/** The whole program, laid out as described above */
export function link({ boot, main, modules }: ProgramParts): Op[] {
  const names = new Set<string>();
  for (const { name } of modules) {
    if (names.has(name)) throw new Error(`Two modules are called "${name}"`);
    names.add(name);
  }
  return [
    ...boot,
    ...modules.flatMap((m) => m.init?.() ?? []),
    ...main,
    ...modules.flatMap((m) => m.code?.() ?? []),
    ...modules.flatMap((m) => m.data?.() ?? []),
    pool(),
  ];
}
