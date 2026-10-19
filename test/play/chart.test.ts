/** The kana chart between scenes and before the ending. */

import { describe, expect, it } from 'vitest';
import { MEM } from '@game/ram';
import { CHART_KANA, CHART_PASSWORD_ROW, CHART_TITLE, chartCell, chartIndexOf } from '@game/chart';
import { CHAR_MAP } from '@game/font';
import { PASSWORD_LABEL, PASSWORD_LENGTH, decodePassword, passwordLineCol } from '@game/password';
import { SCENES } from '@game/scene';
import { DialogueState } from '@game/state';
import { centerStartCol } from '@game/tilemap';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import type { GameRunner } from '../helpers/game-runner';
import { asSeenOnScreen, readText } from '../helpers/screen';

const SETTLE = 8;
const TILE = 8;

const bit = (runner: GameRunner, base: number, i: number): boolean =>
  (runner.readMem(base + (i >> 3)) & (1 << (i & 7))) !== 0;

const chartPassword = (runner: GameRunner): string =>
  readText(
    runner,
    CHART_PASSWORD_ROW,
    passwordLineCol() + Array.from(PASSWORD_LABEL).length + 1,
    PASSWORD_LENGTH,
  );

/** The reddest pixel in a cell: red minus blue, highest for the missed kana's tomato ink */
function redness(runner: GameRunner, row: number, col: number): number {
  const screen = runner.getScreen();
  let most = -255;
  for (let y = row * TILE; y < (row + 1) * TILE; y++) {
    for (let x = col * TILE; x < (col + 1) * TILE; x++) {
      const i = (y * 160 + x) * 4;
      most = Math.max(most, (screen[i] ?? 0) - (screen[i + 2] ?? 0));
    }
  }
  return most;
}

const kanaTileName = (runner: GameRunner): string => {
  const tile = runner.readMem(MEM.KANA_SHUFFLE);
  return Object.entries(CHAR_MAP).find(([, t]) => t === tile)?.[0] ?? '?';
};

describe('Given the first scene is cleared', () => {
  // (snapshots don't hold the picture: let a few frames draw it)
  const chart = (): GameRunner => runnerAt(checkpoint.chartAfter(0)).frames(SETTLE);

  it('shows the kana chart', () => {
    const runner = chart();
    const length = Array.from(CHART_TITLE).length;
    expect(readText(runner, 1, centerStartCol(length), length)).toBe(asSeenOnScreen(CHART_TITLE));
  });

  it('shows each kana answered right, and a dash for the rest', () => {
    const runner = chart();
    let seen = 0;
    Array.from(CHART_KANA).forEach((kana, i) => {
      const { row, col } = chartCell(i);
      const expected = bit(runner, MEM.KANA_SEEN, i) ? kana : '─';
      if (expected === kana) seen++;
      expect(readText(runner, row, col, 1), kana).toBe(asSeenOnScreen(expected));
    });
    expect(seen).toBeGreaterThan(3);
    expect(seen).toBeLessThan(CHART_KANA.length);
  });

  it('gives the password for the next scene', () => {
    const runner = chart();
    const progress = decodePassword(chartPassword(runner), SCENES.length);
    expect(progress).toEqual({ scene: 1, lives: runner.kanaLives, score: runner.kanaScore });
  });

  it('moves on to the next scene on A', () => {
    const runner = chart().pressA();
    runner.waitUntil(() => runner.dlgState !== DialogueState.IDLE, 'the next scene');
    expect(runner.sceneId).toBe(1);
  });
});

describe('Given a kana answered wrong', () => {
  it('marks it missed, toward its basic hiragana', () => {
    const runner = runnerAt(checkpoint.kanaStart(0)).resetStreak();
    runner.waitForKanaInput();
    const index = chartIndexOf(kanaTileName(runner));
    expect(bit(runner, MEM.KANA_MISSED, index)).toBe(false);
    runner.answerKanaWrong();
    expect(bit(runner, MEM.KANA_MISSED, index)).toBe(true);
  });

  it('draws it in red on the chart (Game Boy Color)', () => {
    const runner = runnerAt(checkpoint.kanaStart(0)).resetStreak();
    runner.waitForKanaInput();
    const missed = chartIndexOf(kanaTileName(runner));
    runner.answerKanaWrong().completeKanaQuestions(0);
    runner.waitUntil(() => runner.chartWaiting, 'the chart').frames(SETTLE);
    expect(runner.readMem(MEM.IS_CGB)).toBe(1);
    const seenOnly = Array.from(CHART_KANA).findIndex(
      (_, i) => bit(runner, MEM.KANA_SEEN, i) && !bit(runner, MEM.KANA_MISSED, i),
    );
    const at = (i: number): number => redness(runner, chartCell(i).row, chartCell(i).col);
    expect(at(missed)).toBeGreaterThan(at(seenOnly) + 50);
  });
});

describe('Given the speed round is over', () => {
  it('shows the chart once more, without a password, then the ending', () => {
    const runner = runnerAt(checkpoint.finalChart).frames(SETTLE);
    expect(chartPassword(runner).trim()).toBe('');
    runner.pressA();
    runner.waitUntil(() => runner.music === 'ending', 'the ending');
  });
});
