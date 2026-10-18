/** What the player sees: layout checks on the rendered LCD image. */

import { describe, expect, it } from 'vitest';
import { SCENES } from '@game/scene';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { GameRunner } from '../helpers/game-runner';
import { BACKDROP } from '@game/backdrop';
import { DialogueState } from '@game/state';
import {
  SCREEN_W,
  inkBounds,
  inkCount,
  darkestLuma,
  isBlank,
  readText,
  waitForPicture,
} from '../helpers/screen';

const SCENE_NAME_ROW = 1;
const NPC_TEXT = { row: 12, col: 2 };
const CHOICES = { row: 14, col: 3 };
const TEXT_WIDTH = 17;

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

describe('Given the player is choosing an answer', () => {
  const CHOICE_ROW = 14;
  const TEXT_LEFT = 24; // choice text starts at column 3
  /** Leftmost cursor pixel between the box border and the choice text, if any */
  const cursorLeft = (runner: GameRunner, row: number): number | undefined =>
    inkBounds(runner, row, { fromX: 8, toX: TEXT_LEFT })?.left;
  const choosing = (): GameRunner =>
    waitForPicture(runnerAt(checkpoint.sceneStart(0)).waitForDialogueChoices().frames(2));

  it('points the cursor sprite at the highlighted row', () => {
    const runner = choosing();
    expect(cursorLeft(runner, CHOICE_ROW)).toBeDefined();
    expect(cursorLeft(runner, CHOICE_ROW + 1)).toBeUndefined();
    // Shadow OAM → DMA on the next frame → shown a frame or two later
    runner.pressDown().frames(4);
    expect(cursorLeft(runner, CHOICE_ROW)).toBeUndefined();
    expect(cursorLeft(runner, CHOICE_ROW + 1)).toBeDefined();
  });

  it('bounces the cursor while waiting', () => {
    const runner = choosing();
    const positions = new Set<number | undefined>();
    for (let f = 0; f < 20; f++) positions.add(cursorLeft(runner.frames(1), CHOICE_ROW));
    expect([...positions].filter((p) => p !== undefined)).toHaveLength(2);
  });

  it('hides the cursor once a choice is confirmed', () => {
    const runner = choosing().pressA().frames(3);
    for (const row of [CHOICE_ROW, CHOICE_ROW + 1, CHOICE_ROW + 2]) {
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
    'centers the scene name %s',
    (_name, i) => {
      const runner = waitForPicture(runnerAt(checkpoint.sceneStart(i)).frames(1));
      const bounds = inkBounds(runner, SCENE_NAME_ROW);
      expect(bounds).toBeDefined();
      const center = ((bounds?.left ?? 0) + (bounds?.right ?? 0) + 1) / 2;
      // Tile-aligned centering of an odd-length name can be off by half a tile
      expect(Math.abs(center - SCREEN_W / 2)).toBeLessThanOrEqual(4);
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
        expect(readText(runner, CHOICES.row + row, CHOICES.col, TEXT_WIDTH - 1).trimEnd()).toBe(
          expected,
        );
      });
    },
  );
});
