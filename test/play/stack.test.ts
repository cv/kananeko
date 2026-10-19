/** How deep the stack goes over a whole playthrough. */

import { describe, expect, it } from 'vitest';
import { STACK_REGION, STACK_TOP } from '@game/ram';
import { STACK_CANARY, checkpoint, runnerAt } from '../helpers/checkpoints';

/** Leave room for paths the playthrough doesn't take (menus, passwords, practice) */
const MARGIN = 2;

describe('Given the player plays through the whole game', () => {
  it('keeps the stack well inside its region', () => {
    const memory = runnerAt(checkpoint.gameComplete).getMemory();
    let lowest = STACK_REGION.start;
    while (lowest < STACK_TOP && memory[lowest] === STACK_CANARY) lowest++;
    const deepest = STACK_TOP - lowest;
    expect(deepest).toBeGreaterThan(0);
    expect(deepest * MARGIN, `the stack went ${String(deepest)} bytes deep`).toBeLessThanOrEqual(
      STACK_REGION.limit - STACK_REGION.start,
    );
  });
});
