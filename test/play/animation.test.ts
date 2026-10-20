/** Animated backdrop tiles. */

import { buildSceneData, SCENES } from '@game/scene';
import { describe, expect, it } from 'vitest';

import { checkpoint, runnerAt } from '../helpers/checkpoints';

const packed = buildSceneData();

describe.each(SCENES.map((scene, i) => [scene.name, i] as const))(
  'Given the %s scene is on screen',
  (_name, i) => {
    const data = packed[i]?.animation ?? new Uint8Array();
    const addr = (data[0] ?? 0) | ((data[1] ?? 0) << 8);
    const count = data[2] ?? 0;
    const period = (data[3] ?? 0) + 1;
    const frame = (k: number): string =>
      Array.from(data.slice(4 + k * 16, 4 + (k + 1) * 16)).join();

    it('cycles its animated tile through every frame', () => {
      expect(count).toBeGreaterThan(1);
      const runner = runnerAt(checkpoint.sceneStart(i));
      const seen = new Set<string>();
      for (let f = 0; f < period * (count + 1); f++) {
        const mem = runner.frames(1).getMemory();
        seen.add(Array.from(mem.slice(addr, addr + 16)).join());
      }
      for (let k = 0; k < count; k++) expect(seen).toContain(frame(k));
    });
  },
);
