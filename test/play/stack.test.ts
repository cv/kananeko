/** How deep the stack goes over a whole playthrough. */

import { STACK_REGION, STACK_TOP } from '@game/ram';
import { describe, expect, it } from 'vitest';

import { checkpoint, runnerAt, STACK_CANARY } from '../helpers/checkpoints';
import { stackDepth } from '../helpers/game-runner';

describe('Given the player plays through the whole game', () => {
  it('keeps the stack well inside its region', () => {
    const memory = runnerAt(checkpoint.gameComplete).getMemory();
    let lowest = STACK_REGION.start;
    while (lowest < STACK_TOP && memory[lowest] === STACK_CANARY) lowest++;
    const deepest = STACK_TOP - lowest;
    expect(deepest).toBeGreaterThan(0);
    // The assembler's bound covers every path, so the playthrough can't go deeper
    expect(deepest, `the stack went ${String(deepest)} bytes deep`).toBeLessThanOrEqual(
      stackDepth ?? 0,
    );
  });

  it('fits the deepest the stack can ever go in its region', () => {
    expect(stackDepth).toBeGreaterThan(0);
    expect(stackDepth).toBeLessThanOrEqual(STACK_REGION.limit - STACK_REGION.start);
  });
});
