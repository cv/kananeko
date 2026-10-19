/** Conversation partners shown as sprites. */

import { describe, expect, it } from 'vitest';
import { NPC_TILE_BASE } from '@game/npc';
import { STATION_CAST } from '@game/scenes/npcs';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import type { GameRunner } from '../helpers/game-runner';

const OAM = 0xfe00;
const NPC_SLOTS = [1, 2, 3, 4];

/** First tile of the NPC on screen, or undefined if hidden (all four sprites at y = 0) */
function npcTile(runner: GameRunner): number | undefined {
  const ys = NPC_SLOTS.map((slot) => runner.readMem(OAM + slot * 4));
  if (ys.every((y) => y === 0)) return undefined;
  return runner.readMem(OAM + NPC_SLOTS[0]! * 4 + 2);
}

/** Answer with the model answer until the dialogue reaches `node` */
function goodPathTo(runner: GameRunner, node: number): GameRunner {
  for (let i = 0; i < 100 && runner.dlgNodeId !== node; i++) runner.chooseDialogueChoice(0);
  expect(runner.dlgNodeId).toBe(node);
  return runner.frames(4);
}

describe('Given the player meets people at the station', () => {
  it('shows the ticket clerk from the first line', () => {
    expect(npcTile(runnerAt(checkpoint.sceneStart(0)).frames(4))).toBe(NPC_TILE_BASE);
  });

  it('shows nobody while the player looks around, then the next person', () => {
    const runner = goodPathTo(runnerAt(checkpoint.sceneStart(0)), 19);
    expect(npcTile(runner)).toBeUndefined();
    runner.chooseDialogueChoice(0).frames(4);
    expect(npcTile(runner)).toBe(NPC_TILE_BASE + 4);
  });

  it('bobs the speaker up and down while they talk', () => {
    const runner = runnerAt(checkpoint.sceneStart(0));
    const ys = new Set<number>();
    for (let f = 0; f < 40; f++) ys.add(runner.frames(1).readMem(OAM + NPC_SLOTS[0]! * 4));
    expect(ys.size).toBe(2);
  });

  it('stands them on the platform between the trains', () => {
    const runner = runnerAt(checkpoint.sceneStart(0)).frames(4);
    expect(runner.readMem(OAM + NPC_SLOTS[0]! * 4 + 1)).toBe(STATION_CAST.stage!.x + 8);
  });

  it('clears the stage for the kana round', () => {
    expect(npcTile(runnerAt(checkpoint.kanaStart(0)).frames(4))).toBeUndefined();
  });
});
