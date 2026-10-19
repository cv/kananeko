/**
 * Who you talk to in each scene, and from which dialogue node they appear.
 * A segment with npc: null shows nobody (the player is looking around).
 */

import { type NpcLook } from '../npc-art';
import { rgb } from '../video';
import { INK } from '../palette';

const SKIN = {
  light: rgb(0xf8, 0xd8, 0xb8),
  medium: rgb(0xe8, 0xb8, 0x90),
  tan: rgb(0xc8, 0x90, 0x68),
} as const;
const HAIR = {
  black: INK, // dark hair doubles as the outline: the game's one ink
  brown: rgb(0x58, 0x30, 0x18),
  grey: rgb(0x70, 0x70, 0x78),
  blonde: rgb(0xa0, 0x78, 0x20),
} as const;

export interface SceneCast {
  readonly npcs: readonly NpcLook[];
  /**
   * Where the speaker stands (screen pixels, top-left of the 16x16 sprite).
   * Backdrop cells listed in the scene's ColorScheme.front draw over them.
   */
  readonly stage?: { readonly x: number; readonly y: number };
  /** Ascending by node: from `from` on, show npcs[npc] (or nobody) */
  readonly segments: readonly { readonly from: number; readonly npc: number | null }[];
}

const FRIEND: NpcLook = {
  hair: 'short',
  outfit: 'plain',
  extras: ['glasses'],
  colors: [SKIN.light, rgb(0x50, 0x90, 0xd0), HAIR.black],
};

export const STATION_CAST: SceneCast = {
  stage: { x: 72, y: 56 }, // on the platform, between the trains
  npcs: [
    { hair: 'cap', outfit: 'uniform', colors: [SKIN.light, rgb(0x38, 0x48, 0x80), HAIR.black] }, // ticket clerk
    { hair: 'long', outfit: 'dress', colors: [SKIN.light, rgb(0xe0, 0x70, 0x90), HAIR.brown] }, // みき
    {
      hair: 'cap',
      outfit: 'uniform',
      extras: ['moustache'],
      colors: [SKIN.medium, rgb(0x40, 0x70, 0x48), HAIR.black],
    }, // guard
    { hair: 'short', outfit: 'apron', colors: [SKIN.tan, rgb(0xc0, 0x60, 0x30), HAIR.black] }, // vendor
  ],
  segments: [
    { from: 0, npc: 0 },
    { from: 19, npc: null },
    { from: 20, npc: 1 },
    { from: 40, npc: 2 },
    { from: 54, npc: null },
    { from: 56, npc: 3 },
  ],
};

export const STREET_CAST: SceneCast = {
  npcs: [
    {
      hair: 'short',
      outfit: 'plain',
      extras: ['backpack'],
      colors: [SKIN.light, rgb(0xd0, 0x90, 0x30), HAIR.blonde],
    }, // lost tourist
    { hair: 'bun', outfit: 'apron', colors: [SKIN.light, rgb(0xe0, 0x88, 0xa8), HAIR.black] }, // さくら
    {
      hair: 'elder',
      outfit: 'coat',
      extras: ['moustache'],
      colors: [SKIN.medium, rgb(0x78, 0x60, 0x48), HAIR.grey],
    }, // elder
    { hair: 'pigtails', outfit: 'plain', colors: [SKIN.light, rgb(0xe0, 0x40, 0x40), HAIR.brown] }, // child
  ],
  segments: [
    { from: 0, npc: 0 },
    { from: 19, npc: null },
    { from: 20, npc: 1 },
    { from: 40, npc: 2 },
    { from: 53, npc: null },
    { from: 54, npc: 3 },
  ],
};

export const RESTAURANT_CAST: SceneCast = {
  stage: { x: 72, y: 44 }, // in the kitchen doorway, behind the counter (GBC)
  npcs: [
    { hair: 'short', outfit: 'apron', colors: [SKIN.light, rgb(0x30, 0x30, 0x38), HAIR.black] }, // waiter
    { hair: 'bob', outfit: 'plain', colors: [SKIN.medium, rgb(0x60, 0xa8, 0x70), HAIR.brown] }, // customer
    { hair: 'chef', outfit: 'plain', colors: [SKIN.light, rgb(0xf0, 0xf0, 0xf0), HAIR.black] }, // chef
    FRIEND,
  ],
  segments: [
    { from: 0, npc: 0 },
    { from: 20, npc: 1 },
    { from: 40, npc: 2 },
    { from: 56, npc: null },
    { from: 57, npc: 3 },
  ],
};

export const CONBINI_CAST: SceneCast = {
  npcs: [
    { hair: 'cap', outfit: 'uniform', colors: [SKIN.light, rgb(0x40, 0x90, 0x60), HAIR.brown] }, // clerk
    FRIEND,
    {
      hair: 'cap',
      outfit: 'plain',
      extras: ['box'],
      colors: [SKIN.tan, rgb(0x30, 0x60, 0xa0), HAIR.black],
    }, // delivery
    {
      hair: 'short',
      outfit: 'plain',
      extras: ['backpack'],
      colors: [SKIN.light, rgb(0x48, 0x88, 0x40), HAIR.blonde],
    }, // マイク
  ],
  segments: [
    { from: 0, npc: 0 },
    { from: 19, npc: null },
    { from: 20, npc: 1 },
    { from: 40, npc: 2 },
    { from: 55, npc: null },
    { from: 57, npc: 3 },
  ],
};

export const SHRINE_CAST: SceneCast = {
  npcs: [
    { hair: 'long', outfit: 'dress', colors: [SKIN.light, rgb(0xd8, 0x40, 0x40), HAIR.black] }, // shrine maiden
    { hair: 'pigtails', outfit: 'plain', colors: [SKIN.medium, rgb(0xf0, 0xb0, 0x30), HAIR.brown] }, // child
    { hair: 'elder', outfit: 'coat', colors: [SKIN.light, rgb(0x70, 0x90, 0x70), HAIR.grey] }, // grandmother
  ],
  segments: [
    { from: 0, npc: 0 }, // how to pray
    { from: 15, npc: 0 }, // a fortune
    { from: 30, npc: 1 }, // a wish
    { from: 45, npc: 2 }, // the shrine cat
  ],
};

export const PARK_CAST: SceneCast = {
  npcs: [
    { hair: 'long', outfit: 'dress', colors: [SKIN.light, rgb(0x90, 0x80, 0xd0), HAIR.black] }, // ゆき
    { hair: 'short', outfit: 'sport', colors: [SKIN.tan, rgb(0xe0, 0x80, 0x30), HAIR.black] }, // jogger
    {
      hair: 'bob',
      outfit: 'coat',
      extras: ['flute'],
      colors: [SKIN.light, rgb(0x60, 0x48, 0x80), HAIR.brown],
    }, // musician
  ],
  segments: [
    { from: 0, npc: 0 },
    { from: 40, npc: 1 },
    { from: 54, npc: null },
    { from: 56, npc: 2 },
  ],
};
