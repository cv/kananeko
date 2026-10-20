/** The kana chart: its 46 kana, what counts toward each, and where they're drawn. */

import { CHART_KANA, chartCell, chartIndexOf } from '@game/chart';
import { CHAR_MAP } from '@game/font';
import { sceneRounds, SCENES, SPEED_ROUND } from '@game/scene';
import { describe, expect, it } from 'vitest';

describe('Given the chart', () => {
  it('has the 46 basic hiragana, all in the font', () => {
    expect(Array.from(CHART_KANA)).toHaveLength(46);
    expect(new Set(CHART_KANA).size).toBe(46);
    for (const kana of CHART_KANA) expect(CHAR_MAP[kana]).toBeDefined();
  });

  it.each([
    ['か', 'か'],
    ['カ', 'か'],
    ['が', 'か'],
    ['ガ', 'か'],
    ['ぱ', 'は'],
    ['っ', 'つ'],
    ['ゃ', 'や'],
    ['ン', 'ん'],
  ])('counts %s toward %s', (kana, base) => {
    expect(chartIndexOf(kana)).toBe(CHART_KANA.indexOf(base));
  });

  it.each(['ー', '!', 'A', '一'])("doesn't count %s", (ch) => {
    expect(chartIndexOf(ch)).toBe(-1);
  });

  it('draws every kana in its own cell on the screen', () => {
    const cells = Array.from(CHART_KANA, (_, i) => chartCell(i));
    expect(new Set(cells.map(({ row, col }) => `${String(row)},${String(col)}`)).size).toBe(46);
    for (const { row, col } of cells) {
      expect(row).toBeGreaterThan(1);
      expect(row).toBeLessThan(15);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(20);
    }
  });

  it('has no cell past the last kana', () => {
    expect(() => chartCell(CHART_KANA.length)).toThrow();
  });

  it('counts every quiz answer in the game toward some kana', () => {
    const answers = [
      ...SCENES.flatMap((_, i) =>
        sceneRounds(SCENES[i]!).flatMap((round) => round.questions.map((q) => q.correct)),
      ),
      ...SCENES.flatMap((scene) => scene.kanaQuestions.map((q) => q.correct)),
      ...SPEED_ROUND.map((q) => q.correct),
    ];
    for (const kana of answers) expect(chartIndexOf(kana), kana).toBeGreaterThanOrEqual(0);
  });
});
