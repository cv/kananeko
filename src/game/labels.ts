/**
 * Labels of the routines and data that more than one module uses: the ROM's global
 * symbols. Keeping them in this dependency-free module means any module can refer to
 * them without an import cycle; labels used by just one module are declared there.
 */

import { Label } from '../asm/types';

// Placed by anim.ts
export const ANIM_TICK = new Label('anim_tick');

// Placed by cat.ts
export const CAT_REST = new Label('cat_rest');
export const CAT_REACT = new Label('cat_react');
export const CAT_TICK = new Label('cat_tick');

// Placed by chart.ts
export const CHART_SEEN = new Label('chart_seen');
export const CHART_MISSED = new Label('chart_missed');
export const CHART_UNMISS = new Label('chart_unmiss');
export const CHART_BIT = new Label('chart_bit');
export const CHART_SHOW = new Label('chart_show');

// Placed by dialogue.ts
export const DLG_DRAW_BOX = new Label('dlg_draw_box');
export const TEXT_NEXT = new Label('text_next');
export const DLG_UPDATE = new Label('dlg_update');
export const DLG_OPEN_TREE = new Label('dlg_open_tree');
export const DLG_OPEN_NODE = new Label('dlg_open_node');

// Placed by joypad.ts
export const JOY_READ = new Label('joy_read');

// Placed by kana-hud.ts
export const SCORE_DIGITS = new Label('score_digits');
export const HUD_UPDATE = new Label('hud_update');
export const KANA_DRAW_HUD = new Label('kana_draw_hud');

// Placed by kana.ts
export const KANA_START = new Label('kana_start');
export const KANA_UPDATE = new Label('kana_update');

// Placed by main.ts
export const PLAY_ROUND = new Label('play_round');
export const TITLE_SCREEN = new Label('title_screen');
export const SCENE_LOAD = new Label('scene_load');
export const TEXT_DICT = new Label('text_dict');
export const SHARED_PALETTES = new Label('shared_palettes');

// Placed by menu.ts
export const MENU_DRAW = new Label('menu_draw');
export const MENU_UPDATE = new Label('menu_update');

// Placed by npc.ts
export const NPC_SELECT = new Label('npc_select');
export const NPC_UPDATE = new Label('npc_update');
export const NPC_HIDE = new Label('npc_hide');

// Placed by password.ts
export const PASS_ENCODE = new Label('pass_encode');
export const PASS_DECODE = new Label('pass_decode');
export const PASS_APPLY = new Label('pass_apply');
export const PASS_DRAW = new Label('pass_draw');
export const PASSWORD_SCREEN = new Label('password_screen');

// Placed by practice.ts
export const PRACTICE_RAND = new Label('practice_rand');
export const SPEED_FILL = new Label('speed_fill');
export const PRACTICE_START = new Label('practice_start');

// Placed by scene-table.ts
export const SCENE_DESC = new Label('scene_desc');

// Placed by sound.ts
export const SOUND_TICK = new Label('sound_tick');
export const SFX_PLAY = new Label('sfx_play');
export const MUSIC_PLAY = new Label('music_play');

// Placed by sprites.ts
export const SPRITES_OFF = new Label('sprites_off');

// Placed by video.ts
export const VBLANK_HANDLER = new Label('vblank_handler');
export const VRAM_PUT = new Label('vram_put');
export const DRAW_TILES = new Label('draw_tiles');
export const FILL_TILES = new Label('fill_tiles');
export const DRAW_RUNS = new Label('draw_runs');
export const FADE_IN = new Label('fade_in');
