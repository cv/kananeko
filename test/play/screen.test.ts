/** What the player sees: layout checks on the rendered LCD image. */

import { describe, expect, it } from 'vitest';
import { SCENES } from '@game/scene';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { SCREEN_W, inkBounds, waitForPicture } from '../helpers/screen';

const SCENE_NAME_ROW = 1;

describe('Given a scene has loaded', () => {
  it.each(SCENES.map((scene, i) => [scene.name, i] as const))(
    'centers the scene name %s',
    (_name, i) => {
      const runner = waitForPicture(runnerAt(checkpoint.sceneStart(i)).frames(1));
      const bounds = inkBounds(runner, SCENE_NAME_ROW);
      expect(bounds).toBeDefined();
      const center = ((bounds?.left ?? 0) + (bounds?.right ?? 0) + 1) / 2;
      // Tile-aligned centering of an odd-length name can be off by half a tile
      expect(Math.abs(center - SCREEN_W / 2)).toBeLessThanOrEqual(4);
    },
  );
});
