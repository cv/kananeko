/** Boot: the CPU, RAM and the font, before the modules' inits. */

import { ifThen } from '../asm/flow';
import { copyBlock, expandOneBit, storeByte, zeroBlock, zeroBytes, zeroPages } from '../asm/macros';
import { gameModule } from '../asm/program';
import { cp, db, di, inc, label, ld, pop, push } from '../asm/sm83';
import { Label, type Op, u16 } from '../asm/types';
import { buildPackedTileData, ONE_BIT_TILES, TILE_COUNT } from './font';
import { BUFFERS, MEM, STACK_TOP, VARIABLES } from './ram';
import { resetRunState } from './rounds';
import { END_OF_CONVERSATION } from './state';
import { bgTileAddr, screenOff } from './video';

// ---------------------------------------------------------------------------
// Font in ROM: 1-bit tiles first (expanded at boot), then 2-bit tiles, each split
// at tile 128, where $8800 addressing moves from $9000 to $8800
// ---------------------------------------------------------------------------

interface FontSegment {
  readonly label: Label;
  readonly first: number;
  readonly oneBit: boolean;
  readonly data: Uint8Array;
}

const FONT_SEGMENTS: readonly FontSegment[] = ((): FontSegment[] => {
  const { oneBit, twoBit } = buildPackedTileData();
  const total = TILE_COUNT + 1;
  const split = 128;
  const ranges = [
    { label: 'font_1bpp_low', first: 0, end: Math.min(ONE_BIT_TILES, split), oneBit: true },
    { label: 'font_1bpp_high', first: split, end: ONE_BIT_TILES, oneBit: true },
    { label: 'font_2bpp_low', first: ONE_BIT_TILES, end: Math.min(total, split), oneBit: false },
    { label: 'font_2bpp_high', first: Math.max(ONE_BIT_TILES, split), end: total, oneBit: false },
  ];
  return ranges
    .filter((r) => r.end > r.first)
    .map(({ label, first, end, oneBit: isOne }) => ({
      label: new Label(label),
      first,
      oneBit: isOne,
      data: isOne
        ? oneBit.slice(first * 8, end * 8)
        : twoBit.slice((first - ONE_BIT_TILES) * 16, (end - ONE_BIT_TILES) * 16),
    }));
})();

/** Boot: the CPU, RAM and the font, with the LCD off, before the modules' inits */
export function buildBoot(): Op[] {
  return [
    // ==== Init ====
    di(),
    // A = $11 at boot on a Game Boy Color (LD doesn't touch the flags CP set)
    cp(0x11),
    ld('a', 0),
    ...ifThen('z', [inc('a')]),
    ld('sp', STACK_TOP),
    // WRAM and HRAM start with random contents on real hardware (and in accurate
    // emulators): zero the buffers' page and every variable, keeping the GBC flag across
    push('af'),
    ...zeroPages(u16(BUFFERS.start), 1),
    ...zeroBlock(u16(VARIABLES.start), VARIABLES.end - VARIABLES.start),
    pop('af'),
    ld([MEM.IS_CGB], 'a'),

    // Clear WRAM state
    ...zeroBytes(MEM.JOYPAD_CUR, MEM.JOYPAD_PREV, MEM.JOYPAD_NEW, MEM.DLG_STATE),
    ...storeByte(MEM.DLG_NODE_ID, END_OF_CONVERSATION),
    ...resetRunState(MEM.KANA_STATE, MEM.SCENE_ID, MEM.SCENE_FLAGS, MEM.GAME_MODE, MEM.TITLE_TIMER),

    // Copy all tile data to VRAM with the LCD off
    ...screenOff(),
    // BG tiles 0-127 go to $9000 and 128+ to $8800 ($8800 addressing); 1-bit tiles expand
    ...FONT_SEGMENTS.flatMap((segment) =>
      (segment.oneBit ? expandOneBit : copyBlock)(
        u16(bgTileAddr(segment.first)),
        segment.label,
        segment.data.length,
      ),
    ),
  ];
}

/** The font's tiles, which boot copies to VRAM */
export const fontModule = gameModule({
  name: 'font',
  data: () => FONT_SEGMENTS.flatMap((segment) => [label(segment.label), db(segment.data)]),
});
