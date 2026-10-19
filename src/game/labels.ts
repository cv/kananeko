/**
 * Labels of the routines and data that more than one module uses: the ROM's global
 * symbols. Keeping them in this module, which depends only on the RAM map, means any
 * module can refer to them without an import cycle; labels used by just one module are
 * declared there.
 */

import { type ExternalRoutine, Label, routine } from '../asm/types';
import { MEM } from './ram';

/** The OAM DMA routine once boot has copied it to HRAM (see sprites.ts): it uses A and F */
export const OAM_DMA: ExternalRoutine = {
  name: 'oam_dma',
  address: MEM.OAM_DMA.address,
  contract: { clobbers: ['a'] },
};

// Placed by anim.ts
export const ANIM_TICK = routine('anim_tick', { clobbers: ['a', 'bc', 'de', 'hl'] });

// Placed by cat.ts
export const CAT_REST = routine('cat_rest', { clobbers: ['a', 'b', 'hl'] });
export const CAT_REACT = routine('cat_react', { clobbers: ['a', 'b', 'hl'] });
export const CAT_TICK = routine('cat_tick', { clobbers: ['a', 'b', 'hl'] });

// Placed by chart.ts
export const CHART_SEEN = routine('chart_seen', { clobbers: ['a'] });
export const CHART_MISSED = routine('chart_missed', { clobbers: ['a'] });
export const CHART_UNMISS = routine('chart_unmiss', { clobbers: ['a'] });
export const CHART_BIT = routine('chart_bit', { out: ['b', 'hl', 'f'], clobbers: ['a', 'de'] });
export const CHART_SHOW = routine('chart_show', { clobbers: ['a', 'bc', 'de', 'hl'] });

// Placed by dialogue.ts
export const DLG_DRAW_BOX = routine('dlg_draw_box', { clobbers: ['a', 'b', 'hl'] });
export const TEXT_NEXT = routine('text_next', { out: ['a'] });
export const DLG_UPDATE = routine('dlg_update', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const DLG_OPEN_TREE = routine('dlg_open_tree', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const DLG_OPEN_NODE = routine('dlg_open_node', { clobbers: ['a', 'bc', 'de', 'hl'] });

// Placed by joypad.ts
export const JOY_READ = routine('joy_read', { clobbers: ['a', 'b'] });

// Placed by kana-hud.ts
export const SCORE_DIGITS = routine('score_digits', { clobbers: ['a', 'c', 'l', 'de'] });
export const HUD_UPDATE = routine('hud_update', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const KANA_DRAW_HUD = routine('kana_draw_hud', { clobbers: ['a', 'bc', 'de', 'hl'] });

// Placed by kana.ts
export const KANA_START = routine('kana_start', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const KANA_UPDATE = routine('kana_update', { clobbers: ['a', 'bc', 'de', 'hl'] });

// Placed by main.ts
export const PLAY_ROUND = routine('play_round', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const TITLE_SCREEN = new Label('title_screen');
export const SCENE_LOAD = new Label('scene_load');
export const TEXT_DICT = new Label('text_dict');
export const SHARED_PALETTES = new Label('shared_palettes');

// Placed by menu.ts
export const MENU_DRAW = routine('menu_draw', { clobbers: ['a', 'hl'] });
export const MENU_UPDATE = routine('menu_update', { out: ['a'], clobbers: ['b'] });

// Placed by npc.ts
export const NPC_SELECT = routine('npc_select', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const NPC_UPDATE = routine('npc_update', { clobbers: ['a'] });
export const NPC_HIDE = routine('npc_hide', { clobbers: ['a'] });

// Placed by password.ts
export const PASS_ENCODE = routine('pass_encode', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const PASS_DECODE = routine('pass_decode', {
  out: ['f'],
  clobbers: ['a', 'bc', 'de', 'hl'],
});
export const PASS_APPLY = routine('pass_apply', { clobbers: ['a', 'b'] });
export const PASS_DRAW = routine('pass_draw', { clobbers: ['a', 'b', 'de', 'hl'] });
export const PASSWORD_SCREEN = new Label('password_screen');

// Placed by practice.ts
export const PRACTICE_RAND = routine('practice_rand', { out: ['a'], clobbers: ['b'] });
export const SPEED_FILL = routine('speed_fill', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const PRACTICE_START = new Label('practice_start');

// Placed by scene-table.ts
export const SCENE_DESC = routine('scene_desc', { clobbers: ['a', 'de', 'hl'] });

// Placed by sound.ts
export const SOUND_TICK = routine('sound_tick', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const SFX_PLAY = routine('sfx_play', { clobbers: ['a'] });
export const MUSIC_PLAY = routine('music_play', { clobbers: ['a'] });

// Placed by sprites.ts
export const SPRITES_OFF = routine('sprites_off', { clobbers: ['a', 'bc', 'hl'] });

// Placed by video.ts
export const VBLANK_HANDLER = new Label('vblank_handler');
export const VRAM_PUT = routine('vram_put', { out: ['hl'], keepsFlags: true });
export const DRAW_TILES = routine('draw_tiles', { clobbers: ['a', 'de', 'hl'] });
export const FILL_TILES = routine('fill_tiles', { out: ['hl'] });
export const DRAW_RUNS = routine('draw_runs', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const FADE_IN = routine('fade_in', { clobbers: ['a', 'd', 'bc'] });
