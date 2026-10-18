/**
 * Conversation partners as 16x16 sprites (four 8x8 sprites) standing just above
 * the dialogue box. Each scene loads its cast's tiles and GBC palettes; the
 * speaker is chosen per dialogue node from the scene's segment table.
 */

import { HW, MEM } from '../asm/hardware';
import { copyBlock, loadPointer, storeByte, storePointer, zeroBytes } from '../asm/macros';
import {
  add_n,
  add_r,
  cp_n,
  cp_r,
  dec_r,
  inc_r,
  jp_cc,
  jr,
  jr_cc,
  label,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldh_n_a,
  ldi_a_hl,
  and_n,
  ret,
  ret_cc,
} from '../asm/ops';
import { type Op, ref, u8, u16 } from '../asm/types';
import { sliceArt } from './art';
import { encodeGlyph } from './font';
import { type NpcLook, npcArt } from './npc-art';
import { type SceneCast } from './scenes/npcs';
import { OAM_X_OFFSET, OAM_Y_OFFSET, SPRITE_SLOT, oamField } from './sprites';

const NONE = 0xff;
/** First sprite tile of the cast (tile 0 is the cursor) */
export const NPC_TILE_BASE = 1;
/** Up to 7 GBC OBJ palettes are free (0 is the cursor's) */
export const MAX_CAST = 7;

/** Where the speaker stands: left of the name label, feet on the dialogue box's top edge */
export const NPC_POSITION = { x: 32, y: 56 } as const;
const OAM_X = NPC_POSITION.x + OAM_X_OFFSET;
const OAM_Y = NPC_POSITION.y + OAM_Y_OFFSET;
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
  return {
    tiles: Uint8Array.from(tiles),
    palettes: Uint8Array.from(palettes),
    table: Uint8Array.from([...table, NONE]),
  };
}

/** At scene load (LCD off): copy the cast's tiles and palettes and select its table. */
export function loadCast(
  name: string,
  labels: { tiles: string; palettes: string; table: string },
  cast: PackedCast,
): Op[] {
  return [
    ...copyBlock(
      `${name}_tiles`,
      u16(MEM.OBJ_TILES + NPC_TILE_BASE * 16),
      ref(labels.tiles),
      cast.tiles.length,
    ),
    // GBC OBJ palettes 1..n (ignored on DMG)
    ld_r_n('a', u8(0x80 | 8)),
    ldh_n_a(HW.OCPS),
    ...copyBlockToPort(`${name}_pal`, labels.palettes, cast.palettes.length),
    ld_rr_nn('hl', ref(labels.table)),
    ...storePointer('hl', MEM.NPC_TABLE_LO, MEM.NPC_TABLE_HI),
    ...storeByte(MEM.NPC_CURRENT, NONE),
  ];
}

/** Write `count` bytes from ROM to OCPD (LCD off). */
function copyBlockToPort(name: string, src: string, count: number): Op[] {
  return [
    ld_rr_nn('hl', ref(src)),
    ld_r_n('b', u8(count)),
    label(name),
    ldi_a_hl(),
    ldh_n_a(HW.OCPD),
    dec_r('b'),
    jr_cc('nz', ref(name)),
  ];
}

/** Subroutines npc_select (show the speaker for DLG_NODE_ID), npc_update (bob), npc_hide. */
export function buildNpcRoutines(): Op[] {
  const field = (i: number, f: 'y' | 'x' | 'tile' | 'attr'): ReturnType<typeof oamField> =>
    oamField(SPRITE_SLOT.npc + i, f);
  return [
    label('npc_select'),
    ...loadPointer('hl', MEM.NPC_TABLE_LO, MEM.NPC_TABLE_HI),
    ld_a_nn(MEM.DLG_NODE_ID),
    ld_r_r('b', 'a'),
    ld_r_n('c', u8(NONE)),
    label('npc_scan'),
    ldi_a_hl(), // segment start node ($FF = end of table)
    cp_n(u8(NONE)),
    jr_cc('z', ref('npc_found')),
    ld_r_r('d', 'a'),
    ld_r_r('a', 'b'),
    cp_r('d'),
    jr_cc('c', ref('npc_found')), // node is before this segment
    ldi_a_hl(),
    ld_r_r('c', 'a'),
    jr(ref('npc_scan')),
    label('npc_found'),
    ld_r_r('a', 'c'),
    ld_nn_a(MEM.NPC_CURRENT),
    cp_n(u8(NONE)),
    jp_cc('z', ref('npc_hide')),
    // D = first tile (NPC_TILE_BASE + 4 * npc), E = attributes (GBC palette npc + 1)
    add_r('a'),
    add_r('a'),
    add_n(u8(NPC_TILE_BASE)),
    ld_r_r('d', 'a'),
    ld_r_r('a', 'c'),
    inc_r('a'),
    ld_r_r('e', 'a'),
    ...SLOTS.flatMap((_, i) => [
      ld_r_r('a', 'd'),
      ...(i > 0 ? [add_n(u8(i))] : []),
      ld_nn_a(field(i, 'tile')),
      ld_r_r('a', 'e'),
      ld_nn_a(field(i, 'attr')),
      ...storeByte(field(i, 'x'), OAM_X + (i % 2) * 8),
    ]),
    ...zeroBytes(MEM.NPC_TIMER),
    // fall through to place it

    label('npc_update'),
    ld_a_nn(MEM.NPC_CURRENT),
    cp_n(u8(NONE)),
    ret_cc('z'),
    ld_a_nn(MEM.NPC_TIMER),
    inc_r('a'),
    ld_nn_a(MEM.NPC_TIMER),
    and_n(u8(BOB_BIT)),
    ld_r_n('a', u8(OAM_Y)),
    jr_cc('z', ref('npc_bob_set')),
    dec_r('a'),
    label('npc_bob_set'),
    ld_nn_a(field(0, 'y')),
    ld_nn_a(field(1, 'y')),
    add_n(u8(8)),
    ld_nn_a(field(2, 'y')),
    ld_nn_a(field(3, 'y')),
    ret(),

    label('npc_hide'),
    ...zeroBytes(field(0, 'y'), field(1, 'y'), field(2, 'y'), field(3, 'y')),
    ...storeByte(MEM.NPC_CURRENT, NONE),
    ret(),
  ];
}
