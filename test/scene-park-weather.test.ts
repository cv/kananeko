/**
 * Scene 4 (park) weather-chat dialogue test.
 */

import { describe, it } from 'vitest';
import { playDialogueTree, runnerAtScene } from './helpers/dialogue-helpers';
import { PARK_WEATHER_PATH } from './helpers/scene-paths';

describe('scene 4: park weather dialogue path', () => {
  it('reaches the kana round via the weather chat path', { timeout: 120_000 }, () => {
    playDialogueTree(runnerAtScene(4), 4, [...PARK_WEATHER_PATH]);
  });
});
