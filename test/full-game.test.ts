/**
 * Full game playthrough tests.
 *
 * Exercises every screen, dialogue branch, kana question,
 * and scene transition in the game's state machine.
 */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import { SCENES } from '@game/scene';
// KanaDir removed — answers are randomized, tests use answerKanaCorrectly()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function playDialogueTree(runner: GameRunner, sceneIdx: number, choicePerNode: number[]): void {
  const tree = SCENES[sceneIdx]!.dialogue;
  let nodeIdx = 0;

  for (const choiceIdx of choicePerNode) {
    const node = tree[nodeIdx]!;
    runner.waitForDialogueChoices();
    expect(runner.dlgState).toBe(3);

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

/** Answer kana correctly and check score increased by 100 */
function answerKanaAndCheckDelta(runner: GameRunner, expectedDelta: number): void {
  const before = runner.kanaScore;
  runner.answerKanaCorrectly();
  expect(runner.kanaScore - before).toBe(expectedDelta);
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
// Scene 0: Train Station (80 nodes)
// ---------------------------------------------------------------------------

describe('scene 0: station', () => {
  const startScene = (): GameRunner => new GameRunner().boot().start();

  // Happy path through all 80 nodes (4 NPCs)
  it('happy path: all 4 NPCs choice 0', () => {
    playDialogueTree(startScene(), 0, Array<number>(52).fill(0));
  });

  // Tired path: node 1 choice 2 -> node 3 (つかれた)
  it('tired path: つかれました -> だいじょうぶ', () => {
    playDialogueTree(startScene(), 0, [0, 2, 0, ...Array<number>(49).fill(0)]);
  });

  // Name detour: node 15 choice 2 -> node 17 (あなたは? -> たなか)
  it('name detour: あなたは? -> たなか', () => {
    playDialogueTree(startScene(), 0, [0, 0, 0, 0, 0, 0, 0, 0, 2, 0, ...Array<number>(42).fill(0)]);
  });

  it('kana Q1+Q2 correct', () => {
    const r = startScene();
    r.completeDialogueTree(0);
    answerKanaAndCheckDelta(r, 100); // Q1 correct first try = +100
    answerKanaAndCheckDelta(r, 100); // Q2 correct first try = +100
  });

  it('advances to scene 1', () => {
    const r = startScene();
    r.completeScene(0);
    expect(r.sceneId).toBe(1);
    expect(r.sceneFlags & 0x01).toBe(0x01);
  });
});

// ---------------------------------------------------------------------------
// Scene 1: Street (80 nodes)
// ---------------------------------------------------------------------------

describe('scene 1: street', () => {
  const startScene = (): GameRunner => new GameRunner().boot().start().completeScene(0);

  // Happy path through all 80 nodes (4 NPCs)
  it('happy path: all 4 NPCs choice 0', () => {
    playDialogueTree(startScene(), 1, Array<number>(57).fill(0));
  });

  // Lost path: node 1 choice 2 -> node 4 (わからない)
  it('lost path: わかりません -> すみません', () => {
    playDialogueTree(startScene(), 1, [0, 2, 0, ...Array<number>(54).fill(0)]);
  });

  // Return visitor: node 22 choice 1 -> node 25 (にかいめ)
  it('return visitor: にかいめです -> おかえり', () => {
    playDialogueTree(startScene(), 1, [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      ...Array<number>(38).fill(0),
    ]);
  });

  it('advances to scene 2', () => {
    const r = startScene();
    r.completeScene(1);
    expect(r.sceneId).toBe(2);
    expect(r.sceneFlags & 0x03).toBe(0x03);
  });
});

// ---------------------------------------------------------------------------
// Scene 2: Restaurant (80 nodes)
// ---------------------------------------------------------------------------

describe('scene 2: restaurant', () => {
  const startScene = (): GameRunner =>
    new GameRunner().boot().start().completeScene(0).completeScene(1);

  // Happy path through all 80 nodes (4 NPCs)
  it('happy path: all 4 NPCs choice 0', () => {
    playDialogueTree(startScene(), 2, Array<number>(56).fill(0));
  });

  // Curry path: node 5 choice 1 -> node 8
  it('curry path: カレー ください', () => {
    playDialogueTree(startScene(), 2, [0, 0, 0, 0, 1, 0, ...Array<number>(50).fill(0)]);
  });

  // Tea + sweet path: node 5 choice 2 -> node 9, node 25 choice 1 -> node 27
  it('tea + sweet path: おちゃ + つめたくてあまい', () => {
    playDialogueTree(startScene(), 2, [
      0,
      0,
      0,
      0,
      2,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      ...Array<number>(38).fill(0),
    ]);
  });

  it('advances to scene 3', () => {
    const r = startScene();
    r.completeScene(2);
    expect(r.sceneId).toBe(3);
    expect(r.sceneFlags & 0x07).toBe(0x07);
  });
});

// ---------------------------------------------------------------------------
// Scene 3: Convenience Store (80 nodes)
// ---------------------------------------------------------------------------

describe('scene 3: conbini', () => {
  const startScene = (): GameRunner =>
    new GameRunner().boot().start().completeScene(0).completeScene(1).completeScene(2);

  // Happy path through all 80 nodes (4 NPCs)
  it('happy path: all 4 NPCs choice 0', () => {
    playDialogueTree(startScene(), 3, Array<number>(58).fill(0));
  });

  // Browse path: node 1 choice 2 -> node 4
  it('browse path: みるだけ -> ゆっくり', () => {
    playDialogueTree(startScene(), 3, [0, 2, 0, ...Array<number>(55).fill(0)]);
  });

  // Sweets path: node 1 choice 1 -> node 3
  it('sweets path: おかし -> チョコ', () => {
    playDialogueTree(startScene(), 3, [0, 1, 0, ...Array<number>(55).fill(0)]);
  });

  it('advances to scene 4', () => {
    const r = startScene();
    r.completeScene(3);
    expect(r.sceneId).toBe(4);
    expect(r.sceneFlags & 0x0f).toBe(0x0f);
  });
});

// ---------------------------------------------------------------------------
// Scene 4: Evening Park (80 nodes)
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

  // Happy path through all 80 nodes (4 NPCs)
  it('happy path: all 4 NPCs choice 0', () => {
    playDialogueTree(startScene(), 4, Array<number>(62).fill(0));
  });

  // Weather path: node 4 choice 1 -> node 7
  it('weather path: おてんき -> あたたかかった', () => {
    playDialogueTree(startScene(), 4, [0, 0, 0, 1, 0, ...Array<number>(57).fill(0)]);
  });

  // Lonely path: node 14 choice 1 -> node 16
  it('lonely path: さびしい -> ともだちほしい', () => {
    playDialogueTree(startScene(), 4, [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      ...Array<number>(51).fill(0),
    ]);
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

  it('perfect kana — score increases with each correct answer', () => {
    const r = new GameRunner().boot().start();
    for (let i = 0; i < SCENES.length; i++) {
      r.completeDialogueTree(i);
      for (let j = 0; j < SCENES[i]!.kanaQuestions.length; j++) {
        const before = r.kanaScore;
        r.answerKanaCorrectly();
        expect(r.kanaScore - before).toBe(100); // each correct = +100
      }
      r.frames(10);
    }
    // Score includes dialogue bonuses + kana bonuses — at least 2500 from kana alone
    expect(r.kanaScore).toBeGreaterThanOrEqual(2500);
  });
});
