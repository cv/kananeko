/**
 * Full game playthrough tests.
 *
 * Exercises every screen, dialogue branch, kana question,
 * and scene transition in the game's state machine.
 */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import { SCENES } from '@game/scene';
import type { KanaDir } from '@game/kana';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait until dialogue state reaches `choosing` (3), then idle to debounce input */
function waitForChoices(runner: GameRunner): void {
  for (let i = 0; i < 300; i++) {
    runner.frames(1);
    if (runner.dlgState === 3) {
      runner.frames(10); // debounce: let previous A release clear from joypad edge detector
      return;
    }
  }
  throw new Error('Dialogue did not reach choosing state within 300 frames');
}

function playDialogueTree(runner: GameRunner, sceneIdx: number, choicePerNode: number[]): void {
  const tree = SCENES[sceneIdx]!.dialogue;
  let nodeIdx = 0;

  for (const choiceIdx of choicePerNode) {
    const node = tree[nodeIdx]!;
    waitForChoices(runner);

    for (let i = 0; i < choiceIdx; i++) {
      runner.press('DOWN').frames(1);
    }
    runner.press('A').frames(5);

    const choice = node.choices[choiceIdx]!;
    if (choice.next === null) {
      expect(runner.dlgNodeId).toBe(0xff);
      return;
    }
    nodeIdx = choice.next;
  }
}

function answerKana(
  runner: GameRunner,
  dir: KanaDir,
  isCorrect: boolean,
  expectedScore: number,
): void {
  runner.frames(5);
  expect(runner.kanaState).toBe(2);
  runner.press(dir.toUpperCase());
  expect(runner.kanaState).toBe(3);
  if (isCorrect) expect(runner.kanaScore).toBe(expectedScore);
  runner.frames(35);
}

// ---------------------------------------------------------------------------
// Title screen
// ---------------------------------------------------------------------------

describe('title screen', () => {
  it('boots idle', () => {
    expect(new GameRunner().boot().dlgState).toBe(0);
  });

  it('transitions on START', () => {
    const r = new GameRunner().boot().start();
    expect(r.sceneId).toBe(0);
    expect(r.dlgState).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Scene 0: Train Station (7 nodes)
// ---------------------------------------------------------------------------

describe('scene 0: station', () => {
  const startScene = (): GameRunner => new GameRunner().boot().start();

  // Traced paths: 0→1→2→5→END (4 choices)
  it('happy path: こんにちは→げんき→まち→bye', () => {
    playDialogueTree(startScene(), 0, [0, 0, 0, 0]);
  });

  // 0→1→3→2→5→END (5 choices)
  it('tired path: →つかれました→だいじょうぶ→まち→bye', () => {
    playDialogueTree(startScene(), 0, [0, 2, 0, 0, 0]);
  });

  // 0→1→3→6→2→5→END (6 choices)
  it('water path: →みず→drink→travel→bye', () => {
    playDialogueTree(startScene(), 0, [0, 2, 2, 0, 0, 0]);
  });

  it('kana Q1+Q2 correct', () => {
    const r = startScene();
    r.completeDialogueTree(0);
    answerKana(r, 'up', true, 4);
    answerKana(r, 'left', true, 8);
  });

  it('advances to scene 1', () => {
    const r = startScene();
    r.completeScene(0);
    expect(r.sceneId).toBe(1);
    expect(r.sceneFlags & 0x01).toBe(0x01);
  });
});

// ---------------------------------------------------------------------------
// Scene 1: Street (7 nodes)
// ---------------------------------------------------------------------------

describe('scene 1: street', () => {
  const startScene = (): GameRunner => new GameRunner().boot().start().completeScene(0);

  // 0→1→3→4→5→END (5 choices)
  it('directions: はい→あちら→ありがとう→なまえ→bye', () => {
    playDialogueTree(startScene(), 1, [0, 0, 0, 0, 0]);
  });

  // 0→1→2→3→4→5→END (6 choices)
  it('dont know: →わかりません→そうですか→ありがとう→なまえ→bye', () => {
    playDialogueTree(startScene(), 1, [0, 2, 0, 0, 0, 0]);
  });

  // 0→1→3→4→6→5→END (6 choices: ask name back→たなか→bye)
  it('ask name back: →あなたは?→さくら→bye', () => {
    playDialogueTree(startScene(), 1, [0, 0, 0, 2, 0, 0]);
  });

  it('advances to scene 2', () => {
    const r = startScene();
    r.completeScene(1);
    expect(r.sceneId).toBe(2);
    expect(r.sceneFlags & 0x03).toBe(0x03);
  });
});

// ---------------------------------------------------------------------------
// Scene 2: Restaurant (9 nodes)
// ---------------------------------------------------------------------------

describe('scene 2: restaurant', () => {
  const startScene = (): GameRunner =>
    new GameRunner().boot().start().completeScene(0).completeScene(1);

  // 0→1→2→5→6→7→END (6 choices)
  it('ramen path', () => {
    playDialogueTree(startScene(), 2, [0, 0, 0, 0, 0, 0]);
  });

  // 0→1→3→5→6→7→END (6 choices)
  it('tea path', () => {
    playDialogueTree(startScene(), 2, [0, 1, 0, 0, 0, 0]);
  });

  // 0→1→4→2→5→6→7→END (7 choices)
  it('recommendation path', () => {
    playDialogueTree(startScene(), 2, [0, 2, 0, 0, 0, 0, 0]);
  });

  // 0→1→2→5→6→8→7→END (7 choices)
  it('bonus tea: すごくおいしい!', () => {
    playDialogueTree(startScene(), 2, [0, 0, 0, 0, 2, 0, 0]);
  });

  it('advances to scene 3', () => {
    const r = startScene();
    r.completeScene(2);
    expect(r.sceneId).toBe(3);
    expect(r.sceneFlags & 0x07).toBe(0x07);
  });
});

// ---------------------------------------------------------------------------
// Scene 3: Convenience Store (7 nodes)
// ---------------------------------------------------------------------------

describe('scene 3: conbini', () => {
  const startScene = (): GameRunner =>
    new GameRunner().boot().start().completeScene(0).completeScene(1).completeScene(2);

  // 0→2→5→6→END (4 choices: direct buy)
  it('direct buy: これください→100えん→bye', () => {
    playDialogueTree(startScene(), 3, [1, 0, 0, 0]);
  });

  // 0→1→4→2→5→6→END (6 choices)
  it('ask help: なにか→おにぎり→buy→bye', () => {
    playDialogueTree(startScene(), 3, [0, 0, 0, 0, 0, 0]);
  });

  // 0→3→0→2→5→6→END (6 choices: browse then buy)
  it('browse then buy', () => {
    playDialogueTree(startScene(), 3, [2, 0, 1, 0, 0, 0]);
  });

  it('advances to scene 4', () => {
    const r = startScene();
    r.completeScene(3);
    expect(r.sceneId).toBe(4);
    expect(r.sceneFlags & 0x0f).toBe(0x0f);
  });
});

// ---------------------------------------------------------------------------
// Scene 4: Evening Park (8 nodes)
// ---------------------------------------------------------------------------

describe('scene 4: park', () => {
  const startScene = (): GameRunner =>
    new GameRunner()
      .boot()
      .start()
      .completeScene(0)
      .completeScene(1)
      .completeScene(2)
      .completeScene(3);

  // 0→1→3→4→6→END (5 choices)
  it('happy path', () => {
    playDialogueTree(startScene(), 4, [0, 0, 0, 0, 0]);
  });

  // 0→2→3→4→6→END (5 choices)
  it('sunset path: きれい→ゆうやけ', () => {
    playDialogueTree(startScene(), 4, [2, 0, 0, 0, 0]);
  });

  // 0→1→3→4→7→6→END (6 choices)
  it('compliment: とてもたのしい→じょうず', () => {
    playDialogueTree(startScene(), 4, [0, 0, 0, 1, 0, 0]);
  });

  // 0→1→3→5→4→6→END (6 choices: あなたは?→さくら)
  it('ask name: →さくら→bye', () => {
    playDialogueTree(startScene(), 4, [0, 0, 2, 0, 0, 0]);
  });

  it('all flags set', () => {
    const r = startScene();
    r.completeScene(4);
    expect(r.sceneFlags & 0x1f).toBe(0x1f);
  });
});

// ---------------------------------------------------------------------------
// Full game
// ---------------------------------------------------------------------------

describe('full game', () => {
  it('plays all 5 scenes to completion', () => {
    const r = new GameRunner().boot().start();
    for (let i = 0; i < SCENES.length; i++) {
      expect(r.sceneId).toBe(i);
      r.completeScene(i);
    }
    expect(r.sceneFlags).toBe(0x1f);
  });

  it('perfect kana in every scene', () => {
    const r = new GameRunner().boot().start();
    for (let i = 0; i < SCENES.length; i++) {
      r.completeDialogueTree(i);
      for (const q of SCENES[i]!.kanaQuestions) r.answerKana(q.correctDir);
      expect(r.kanaScore).toBe(SCENES[i]!.kanaQuestions.length * 4);
      r.frames(10);
    }
  });
});
