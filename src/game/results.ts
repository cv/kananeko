/** The screens a run ends on: the ending, and game over (with a password to continue). */

import { buildPaletteSet } from './color';
import { DRAW_START_BOX, TITLE_BLINK } from './title';
import { resetRunState } from './rounds';
import { JOY } from '../asm/hardware';
import { MEM } from './ram';
import { gameModule } from '../asm/program';
import {
  CAT_REST,
  CAT_TICK,
  JOY_READ,
  KANA_DRAW_HUD,
  SCORE_DIGITS,
  PASS_ENCODE,
  PASS_DRAW,
  TITLE_SCREEN,
} from './labels';
import { CAT_SPOTS, type CatFace, catFace, placeCat } from './cat';
import { pressed } from './joypad';
import { buildDrawScoreDigits, SCORE_DIGIT_COUNT } from './kana-hud';
import { PASSWORD_LABEL, passwordLineCol } from './password';
import { type SongName, playMusic, playSfx } from './sound';
import { runDma } from './sprites';
import {
  clearScreen,
  fadeIn,
  frameWait,
  fadeOut,
  screenOff,
  writeCenteredRow,
  drawTiles,
} from './video';
import { storeByte, zeroBytes } from '../asm/macros';
import { and, call, jp, jr, label, ld, ret, invoke, db } from '../asm/sm83';
import { type Op, u16, Label, labelFamily, routine } from '../asm/types';
import { requireTiles, textToTiles } from './font';
import { centerStartCol, tilemapAddr } from './tilemap';
import { SCENES } from './scene';
import { MAX_LIVES } from './state';
import type { ColorScheme } from './color';
import { ENDING_COLORS, GAME_OVER_COLORS } from './scenes/colors';

const DRAW_STAMPS = routine('draw_stamps', { clobbers: ['a', 'hl'] });

const ENDING_TITLE = 'おめでとう!';
const ENDING_SCORE_LABEL = 'とくてん ';
const ENDING_ROWS = { cat: 2, title: 6, stamps: 8, score: 10, password: 16 } as const;

export interface ResultScreen {
  /** Where the game jumps to; its name prefixes the screen's internal labels */
  readonly entry: Label;
  /** The cat's face here (a neutral cat blinks) */
  readonly face: CatFace;
  readonly title: string;
  readonly colors: ColorScheme;
  /** The music it plays */
  readonly song: SongName;
  /** Show the password that continues from the scene being played */
  readonly password?: boolean;
}

export const ENDING: ResultScreen = {
  entry: new Label('game_complete'),
  face: 'happy',
  song: 'ending',
  title: ENDING_TITLE,
  colors: ENDING_COLORS,
};

export const GAME_OVER_SCREEN: ResultScreen = {
  entry: new Label('game_over'),
  face: 'sad',
  song: 'gameOver',
  password: true,
  title: 'ゲームオーバー',
  colors: GAME_OVER_COLORS,
};

export const resultFadeLabel = labelFamily(
  (screen: ResultScreen) => `${screen.entry.toString()}_fade`,
);

/** Width of the stamp row: each scene icon is 2 tiles, one blank tile apart */
const STAMP_ROW_WIDTH = SCENES.length * 3 - 1;

/** Draw the icon of every scene whose SCENE_FLAGS bit is set (LCD off) */
function drawClearedStamps(row: number): Op[] {
  const startCol = centerStartCol(STAMP_ROW_WIDTH);
  return SCENES.flatMap((scene, i) => {
    const skip = new Label();
    return [
      ld('a', [MEM.SCENE_FLAGS]),
      and(1 << i),
      jr('z', skip),
      ld('hl', u16(tilemapAddr(row, startCol + i * 3))),
      ...requireTiles(scene.icon).flatMap((tile) => [ld('a', tile), ld(['hl+'], 'a')]),
      label(skip),
    ];
  });
}

/** Subroutine draw_stamps: the result screens' row of cleared-scene stamps (LCD off) */
function buildDrawStamps(): Op[] {
  return [label(DRAW_STAMPS), ...drawClearedStamps(ENDING_ROWS.stamps), ret()];
}

/** End-of-run screen: cat, title, cleared-scene stamps, final score; START returns to the title. */
export function resultScreen(screen: ResultScreen): Op[] {
  const { entry } = screen;
  const loop = new Label();
  const labelTiles = textToTiles(ENDING_SCORE_LABEL);
  const scoreCol = centerStartCol(labelTiles.length + SCORE_DIGIT_COUNT);
  return [
    label(entry),
    ...fadeOut(),
    ...screenOff(),
    ...playMusic(screen.song),
    ...clearScreen(),
    ...zeroBytes(MEM.TITLE_TIMER), // prompt starts visible

    call(KANA_DRAW_HUD),
    ...writeCenteredRow(ENDING_ROWS.title, textToTiles(screen.title)),
    call(DRAW_STAMPS),
    ld('hl', u16(tilemapAddr(ENDING_ROWS.score, scoreCol))),
    ...labelTiles.flatMap((tile) => [ld('a', tile), ld(['hl+'], 'a')]),
    call(SCORE_DIGITS),
    ...buildDrawScoreDigits(ENDING_ROWS.score, scoreCol + labelTiles.length),
    call(DRAW_START_BOX),
    ...(screen.password === true
      ? [
          ...storeByte(MEM.KANA_LIVES, MAX_LIVES), // continuing starts with full hearts
          call(PASS_ENCODE),
          ...drawTiles(
            tilemapAddr(ENDING_ROWS.password, passwordLineCol()),
            textToTiles(`${PASSWORD_LABEL} `),
          ),
          ...invoke(PASS_DRAW, { hl: 'hl' }),
        ]
      : []),
    ...fadeIn(resultFadeLabel(screen)),
    ...catFace(CAT_REST, screen.face),
    ...placeCat(CAT_SPOTS.portrait),

    label(loop),
    ...frameWait(),
    ...runDma(),
    call(JOY_READ),
    call(TITLE_BLINK),
    call(CAT_TICK),
    ...pressed(JOY.START),
    jr('z', loop),
    ...playSfx('confirm'),

    ...resetRunState(MEM.SCENE_FLAGS),
    ...fadeOut(),
    ...screenOff(),
    jp(TITLE_SCREEN),
  ];
}

export const resultsModule = gameModule({
  name: 'results',
  code: buildDrawStamps,
  data: () =>
    [ENDING, GAME_OVER_SCREEN].flatMap((screen) => [
      label(resultFadeLabel(screen)),
      db(buildPaletteSet(screen.colors)),
    ]),
});
