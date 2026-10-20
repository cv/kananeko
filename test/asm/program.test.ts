/** Linking modules into a program. */

import { gameModule, link } from '@asm/program';
import { db, nop, ret } from '@asm/sm83';
import type { Op } from '@asm/types';
import { describe, expect, it } from 'vitest';

const tag = (n: number): Op => db([n]);

describe('link', () => {
  it('lays out boot, inits, main, code, data, then the pool', () => {
    const a = gameModule({
      name: 'a',
      init: () => [tag(1)],
      code: () => [tag(3)],
      data: () => [tag(5)],
    });
    const b = gameModule({
      name: 'b',
      init: () => [tag(2)],
      code: () => [tag(4)],
      data: () => [tag(6)],
    });
    const program = link({ boot: [tag(0)], main: [tag(9)], modules: [a, b] });
    const order = program.map((op) => (op.kind === 'data' ? op.bytes[0] : op.kind));
    expect(order).toEqual([0, 1, 2, 9, 3, 4, 5, 6, 'pool']);
  });

  it('lets modules leave out what they have none of', () => {
    const program = link({
      boot: [nop()],
      main: [ret()],
      modules: [gameModule({ name: 'empty' })],
    });
    expect(program.map((op) => op.kind)).toEqual(['inst', 'inst', 'pool']);
  });

  it('rejects two modules with the same name', () => {
    const m = gameModule({ name: 'same' });
    expect(() => link({ boot: [], main: [], modules: [m, gameModule({ name: 'same' })] })).toThrow(
      /Two modules are called "same"/,
    );
  });
});
