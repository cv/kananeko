/** What the player sees: layout checks on the rendered LCD image. */

import { BACKDROP } from '@game/backdrop';
import { DIALOGUE_LAYOUT } from '@game/dialogue';
import { UI_TILES } from '@game/font-data';
import { SCENES } from '@game/scene';
import { DialogueState } from '@game/state';
import { describe, expect, it } from 'vitest';

import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { GameRunner } from '../helpers/game-runner';
import {
  darkestLuma,
  inkBounds,
  inkCount,
  isBlank,
  readText,
  waitForPicture,
} from '../helpers/screen';

const NPC_TEXT = DIALOGUE_LAYOUT.text;
const CHOICE_ROWS = DIALOGUE_LAYOUT.choiceRows;
const TEXT_WIDTH = 17;
const choiceRow = (i: number): number => {
  const row = CHOICE_ROWS[i];
  if (row === undefined) throw new Error(`No choice row ${String(i)}`);
  return row;
};

describe('Given the screen changes', () => {
  it('fades the first scene in from white after START', () => {
    const runner = new GameRunner().boot().pressStart();
    const darkest: number[] = [];
    for (let f = 0; f < 60; f++) {
      runner.frames(1);
      darkest.push(darkestLuma(runner));
    }
    const final = darkest.at(-1) ?? 0;
    expect(final).toBeLessThan(100);
    // Some frame shows the scene nearly white before it settles
    expect(darkest.some((l) => l > 200)).toBe(true);
    // ...and the scene gets darker step by step as it fades in
    const fadeIn = darkest.slice(darkest.lastIndexOf(Math.max(...darkest)));
    expect(new Set(fadeIn).size).toBeGreaterThanOrEqual(3);
  });
});

describe('Given a Game Boy Color', () => {
  const rgbAt = (runner: GameRunner, x: number, y: number): [number, number, number] => {
    const s = runner.getScreen();
    const i = (y * 160 + x) * 4;
    return [s[i] ?? 0, s[i + 1] ?? 0, s[i + 2] ?? 0];
  };
  /** Most saturated pixel's dominant channel within a tile (0 = R, 1 = G, 2 = B) */
  const dominantChannel = (runner: GameRunner, row: number, col: number): number => {
    let best = { spread: -1, channel: 0 };
    for (let y = row * 8; y < row * 8 + 8; y++) {
      for (let x = col * 8; x < col * 8 + 8; x++) {
        const c = rgbAt(runner, x, y);
        const spread = Math.max(...c) - Math.min(...c);
        if (spread > best.spread) best = { spread, channel: c.indexOf(Math.max(...c)) };
      }
    }
    return best.channel;
  };

  it('draws the HUD hearts red and the street trees green', () => {
    const runner = waitForPicture(runnerAt(checkpoint.sceneStart(1)).frames(6));
    expect(dominantChannel(runner, 0, 1)).toBe(0); // heart
    const treeRow = BACKDROP.top + 3; // ' Yy  Hh  Yy  Hh  Yy '
    expect(dominantChannel(runner, treeRow, 1)).toBe(1); // tree
    expect(dominantChannel(runner, treeRow, 5)).toBe(0); // house roof
  });
});

describe('Given the player is choosing an answer', () => {
  const TEXT_LEFT = DIALOGUE_LAYOUT.choiceCol * 8;
  /** Leftmost cursor pixel between the box border and the choice text, if any */
  const cursorLeft = (runner: GameRunner, row: number): number | undefined =>
    inkBounds(runner, row, { fromX: 8, toX: TEXT_LEFT })?.left;
  const choosing = (): GameRunner =>
    waitForPicture(runnerAt(checkpoint.sceneStart(0)).waitForDialogueChoices().frames(2));

  it('points the cursor sprite at the highlighted row', () => {
    const runner = choosing();
    expect(cursorLeft(runner, choiceRow(0))).toBeDefined();
    expect(cursorLeft(runner, choiceRow(1))).toBeUndefined();
    // Shadow OAM → DMA on the next frame → shown a frame or two later
    runner.pressDown().frames(4);
    expect(cursorLeft(runner, choiceRow(0))).toBeUndefined();
    expect(cursorLeft(runner, choiceRow(1))).toBeDefined();
  });

  it('bounces the cursor while waiting', () => {
    const runner = choosing();
    const positions = new Set<number | undefined>();
    for (let f = 0; f < 20; f++) positions.add(cursorLeft(runner.frames(1), choiceRow(0)));
    expect([...positions].filter((p) => p !== undefined)).toHaveLength(2);
  });

  it('hides the cursor once a choice is confirmed', () => {
    const runner = choosing().pressA().frames(3);
    for (const row of CHOICE_ROWS) {
      expect(cursorLeft(runner, row)).toBeUndefined();
    }
  });
});

describe('Given the player is talking to someone', () => {
  it('never flashes a blank screen between dialogue nodes', () => {
    const runner = waitForPicture(runnerAt(checkpoint.sceneStart(0)));
    let blankFrames = 0;
    for (let node = 0; node < 3; node++) {
      runner.waitUntil(() => {
        if (isBlank(runner)) blankFrames++;
        return runner.dlgState === DialogueState.CHOOSING;
      }, 'choices');
      for (let f = 0; f < 6; f++) {
        runner.frames(1);
        if (isBlank(runner)) blankFrames++;
      }
      runner.chooseDialogueChoice(0);
    }
    expect(blankFrames).toBe(0);
  });
});

describe('Given a scene has loaded', () => {
  it.each(SCENES.map((scene, i) => [scene.name, i] as const))(
    'labels the dialogue box with the scene name %s',
    (name, i) => {
      // A few frames: the test emulator can show the fade's last palette step mid-frame
      const runner = waitForPicture(runnerAt(checkpoint.sceneStart(i)).frames(4));
      const length = Array.from(name).length;
      const col = DIALOGUE_LAYOUT.nameCol(length);
      expect(readText(runner, DIALOGUE_LAYOUT.boxTop, col, length + 2)).toBe(
        `${UI_TILES.TAG_LEFT}${name}${UI_TILES.TAG_RIGHT}`,
      );
    },
  );

  it.each(SCENES.map((scene, i) => [scene.name, i] as const))(
    'draws the backdrop of %s above the dialogue box',
    (_name, i) => {
      const runner = waitForPicture(runnerAt(checkpoint.sceneStart(i)).frames(1));
      const drawnRows = Array.from({ length: BACKDROP.rows }, (_, r) => BACKDROP.top + r).filter(
        (row) => inkCount(runner, row) > 0,
      );
      // Every backdrop leaves at most one row empty (e.g. open sky)
      expect(drawnRows.length).toBeGreaterThanOrEqual(BACKDROP.rows - 1);
    },
  );

  it.each(SCENES.map((scene, i) => [scene.name, i] as const))(
    'shows the complete opening line and choices in %s',
    (_name, i) => {
      const scene = SCENES[i];
      const runner = waitForPicture(
        runnerAt(checkpoint.sceneStart(i)).waitForDialogueChoices().frames(4),
      );
      const opening = scene?.dialogue[0];
      expect(readText(runner, NPC_TEXT.row, NPC_TEXT.col, TEXT_WIDTH).trimEnd()).toBe(
        opening?.text,
      );
      runner.dlgChoiceOrder.forEach((choice, row) => {
        const expected = opening?.choices[choice]?.text ?? '';
        expect(
          readText(runner, choiceRow(row), DIALOGUE_LAYOUT.choiceCol, TEXT_WIDTH - 1).trimEnd(),
        ).toBe(expected);
      });
    },
  );
});
