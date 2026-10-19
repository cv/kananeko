/**
 * Conversation partners as 16x16 sprites (four 8x8 sprites) standing just above
 * the dialogue box. Each scene loads its cast's tiles and GBC palettes; the
 * speaker is chosen per dialogue node from the scene's segment table.
 */

import { MEM } from './ram';
import { loadPointer, storeByte, zeroBytes } from '../asm/macros';
import { add, cp, dec, inc, jp, jr, label, ld, and, ret } from '../asm/sm83';
import { type Op, Label } from '../asm/types';
import { sliceArt } from './art';
import { encodeGlyph } from './font';
import { type NpcLook, npcArt } from './npc-art';
import type { SceneCast } from './scenes/npcs';
import { OAM_X_OFFSET, OAM_Y_OFFSET, SPRITE_SLOT, oamField } from './sprites';
import { NPC_SELECT, NPC_UPDATE, NPC_HIDE } from './labels';
import { gameModule } from '../asm/program';

// Labels placed in this module
const NPC_SCAN = new Label('npc_scan');
const NPC_FOUND = new Label('npc_found');
const NPC_BOB_SET = new Label('npc_bob_set');

/** NPC_CURRENT when nobody is shown */
export const NPC_NONE = 0xff;
const NONE = NPC_NONE;
/** First sprite tile of the cast (tile 0 is the cursor) */
export const NPC_TILE_BASE = 1;
/** GBC OBJ palettes 1-6 are free (0 is the cursor's, 7 the cat's) */
export const MAX_CAST = 6;

/** Default stage: right of the cat, feet on the dialogue box's top edge */
export const DEFAULT_STAGE = { x: 56, y: 56 } as const;
/** NPC_TIMER bit that toggles the 1-pixel idle bob (upwards, off the box border) */
const BOB_BIT = 0x10;

/** Shadow OAM slots used by the NPC: top-left, top-right, bottom-left, bottom-right */
const SLOTS = [0, 1, 2, 3].map((i) => SPRITE_SLOT.npc + i);

export interface PackedCast {
  /** 4 tiles per NPC, row-major (TL, TR, BL, BR) */
  readonly tiles: Uint8Array;
  /** One GBC OBJ palette per NPC: transparent, skin, clothes, hair */
  readonly palettes: Uint8Array;
  /** [from node, npc index or $FF] pairs, ended by $FF */
  readonly table: Uint8Array;
  /** OAM x/y of the speaker's top-left sprite */
  readonly stage: { readonly x: number; readonly y: number };
}

export function packCast(cast: SceneCast): PackedCast {
  if (cast.npcs.length > MAX_CAST)
    throw new RangeError(`At most ${String(MAX_CAST)} NPCs per scene`);
  const tiles = cast.npcs.flatMap((look: NpcLook) =>
    sliceArt(npcArt(look)).flatMap((glyph) => Array.from(encodeGlyph(glyph))),
  );
  const palettes = cast.npcs.flatMap((look) =>
    [0, ...look.colors].flatMap((c) => [c & 0xff, c >> 8]),
  );
  let previous = -1;
  const table = cast.segments.flatMap(({ from, npc }) => {
    if (from <= previous) throw new Error('NPC segments must be in ascending node order');
    if (npc !== null && (npc < 0 || npc >= cast.npcs.length))
      throw new RangeError(`No NPC ${String(npc)}`);
    previous = from;
    return [from, npc ?? NONE];
  });
  const { x, y } = cast.stage ?? DEFAULT_STAGE;
  return {
    tiles: Uint8Array.from(tiles),
    palettes: Uint8Array.from(palettes),
    table: Uint8Array.from([...table, NONE]),
    stage: { x: x + OAM_X_OFFSET, y: y + OAM_Y_OFFSET },
  };
}

/** Subroutines npc_select (show the speaker for DLG_NODE_ID), npc_update (bob), npc_hide. */
export function buildNpcRoutines(): Op[] {
  const field = (i: number, f: 'y' | 'x' | 'tile' | 'attr'): ReturnType<typeof oamField> =>
    oamField(SPRITE_SLOT.npc + i, f);
  return [
    label(NPC_SELECT),
    ...loadPointer('hl', MEM.NPC_TABLE),
    ld('a', [MEM.DLG_NODE_ID]),
    ld('b', 'a'),
    ld('c', NONE),
    label(NPC_SCAN),
    ld('a', ['hl+']), // segment start node ($FF = end of table)
    cp(NONE),
    jr('z', NPC_FOUND),
    ld('d', 'a'),
    ld('a', 'b'),
    cp('d'),
    jr('c', NPC_FOUND), // node is before this segment
    ld('a', ['hl+']),
    ld('c', 'a'),
    jr(NPC_SCAN),
    label(NPC_FOUND),
    ld('a', 'c'),
    ld([MEM.NPC_CURRENT], 'a'),
    cp(NONE),
    jp('z', NPC_HIDE),
    // D = first tile (NPC_TILE_BASE + 4 * npc), E = attributes (GBC palette npc + 1)
    add('a'),
    add('a'),
    add(NPC_TILE_BASE),
    ld('d', 'a'),
    ld('a', 'c'),
    inc('a'),
    ld('e', 'a'),
    ...SLOTS.flatMap((_, i) => [
      ld('a', 'd'),
      ...(i > 0 ? [add(i)] : []),
      ld([field(i, 'tile')], 'a'),
      ld('a', 'e'),
      ld([field(i, 'attr')], 'a'),
    ]),
    ld('a', [MEM.NPC_X]),
    ld([field(0, 'x')], 'a'),
    ld([field(2, 'x')], 'a'),
    add(8),
    ld([field(1, 'x')], 'a'),
    ld([field(3, 'x')], 'a'),
    ...zeroBytes(MEM.NPC_TIMER),
    // fall through to place it

    label(NPC_UPDATE),
    ld('a', [MEM.NPC_CURRENT]),
    cp(NONE),
    ret('z'),
    ld('a', [MEM.NPC_TIMER]),
    inc('a'),
    ld([MEM.NPC_TIMER], 'a'),
    and(BOB_BIT),
    ld('a', [MEM.NPC_Y]), // LD leaves the flags from AND
    jr('z', NPC_BOB_SET),
    dec('a'),
    label(NPC_BOB_SET),
    ld([field(0, 'y')], 'a'),
    ld([field(1, 'y')], 'a'),
    add(8),
    ld([field(2, 'y')], 'a'),
    ld([field(3, 'y')], 'a'),
    ret(),

    label(NPC_HIDE),
    ...zeroBytes(field(0, 'y'), field(1, 'y'), field(2, 'y'), field(3, 'y')),
    ...storeByte(MEM.NPC_CURRENT, NONE),
    ret(),
  ];
}

export const npcModule = gameModule({ name: 'npc', code: buildNpcRoutines });
