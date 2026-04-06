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

function answerKana(
  runner: GameRunner,
  dir: KanaDir,
  isCorrect: boolean,
  expectedScore: number,
): void {
  runner.waitForKanaInput();
  runner.press(dir.toUpperCase());
  expect(runner.kanaState).toBe(3);
  if (isCorrect) expect(runner.kanaScore).toBe(expectedScore);
  runner.waitUntil(() => runner.kanaState !== 3, 'kana feedback');
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
// Scene 0: Train Station (40 nodes)
// ---------------------------------------------------------------------------

describe('scene 0: station', () => {
  const startScene = (): GameRunner => new GameRunner().boot().start();

  // Happy path: 0->1->2->5->6->7->11->12->15->16->18->19->20->21->22->23->26->27->30->31->34->35->38->39->END
  it('happy path: clerk + passenger all choice 0', () => {
    playDialogueTree(
      startScene(),
      0,
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  // Tired path: node 1 choice 2 -> node 3 (つかれた)
  it('tired path: つかれました -> だいじょうぶ', () => {
    playDialogueTree(
      startScene(),
      0,
      [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  // Name detour: node 15 choice 2 -> node 17 (あなたは? -> たなか)
  it('name detour: あなたは? -> たなか', () => {
    playDialogueTree(
      startScene(),
      0,
      [0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
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
// Scene 1: Street (40 nodes)
// ---------------------------------------------------------------------------

describe('scene 1: street', () => {
  const startScene = (): GameRunner => new GameRunner().boot().start().completeScene(0);

  // Happy path: 0->1->2->3->7->8->9->10->12->13->15->16->17->18->19->20->21->22->23->26->27->30->31->34->35->37->38->39->END
  it('happy path: directions + shopkeeper all choice 0', () => {
    playDialogueTree(
      startScene(),
      1,
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  // Lost path: node 1 choice 2 -> node 4 (わからない)
  it('lost path: わかりません -> すみません', () => {
    playDialogueTree(
      startScene(),
      1,
      [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  // Return visitor: node 22 choice 1 -> node 25 (にかいめ)
  it('return visitor: にかいめです -> おかえり', () => {
    playDialogueTree(
      startScene(),
      1,
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  it('advances to scene 2', () => {
    const r = startScene();
    r.completeScene(1);
    expect(r.sceneId).toBe(2);
    expect(r.sceneFlags & 0x03).toBe(0x03);
  });
});

// ---------------------------------------------------------------------------
// Scene 2: Restaurant (40 nodes)
// ---------------------------------------------------------------------------

describe('scene 2: restaurant', () => {
  const startScene = (): GameRunner =>
    new GameRunner().boot().start().completeScene(0).completeScene(1);

  // Happy path: 0->1->2->4->5->7->10->11->14->15->16->17->19->20->21->22->25->26->29->30->32->33->35->36->38->39->END
  it('happy path: ラーメン + あつい', () => {
    playDialogueTree(
      startScene(),
      2,
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  // Curry path: node 5 choice 1 -> node 8
  it('curry path: カレー ください', () => {
    playDialogueTree(
      startScene(),
      2,
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  // Tea + sweet path: node 5 choice 2 -> node 9, node 25 choice 1 -> node 27
  it('tea + sweet path: おちゃ + つめたくてあまい', () => {
    playDialogueTree(
      startScene(),
      2,
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  it('advances to scene 3', () => {
    const r = startScene();
    r.completeScene(2);
    expect(r.sceneId).toBe(3);
    expect(r.sceneFlags & 0x07).toBe(0x07);
  });
});

// ---------------------------------------------------------------------------
// Scene 3: Convenience Store (40 nodes)
// ---------------------------------------------------------------------------

describe('scene 3: conbini', () => {
  const startScene = (): GameRunner =>
    new GameRunner().boot().start().completeScene(0).completeScene(1).completeScene(2);

  // Happy path: 0->1->2->5->8->11->12->14->15->16->17->18->19->20->21->22->25->26->29->30->32->33->35->36->37->38->39->END
  it('happy path: おにぎり -> buy', () => {
    playDialogueTree(
      startScene(),
      3,
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  // Browse path: node 1 choice 2 -> node 4
  it('browse path: みるだけ -> ゆっくり', () => {
    playDialogueTree(
      startScene(),
      3,
      [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  // Sweets path: node 1 choice 1 -> node 3
  it('sweets path: おかし -> チョコ', () => {
    playDialogueTree(
      startScene(),
      3,
      [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  it('advances to scene 4', () => {
    const r = startScene();
    r.completeScene(3);
    expect(r.sceneId).toBe(4);
    expect(r.sceneFlags & 0x0f).toBe(0x0f);
  });
});

// ---------------------------------------------------------------------------
// Scene 4: Evening Park (40 nodes)
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

  // Happy path: 0->1->2->4->5->6->10->11->12->14->15->17->18->19->20->21->22->23->24->25->27->28->30->31->33->34->36->37->39->END
  it('happy path: きょうのこと -> たのしい -> ともだち', () => {
    playDialogueTree(
      startScene(),
      4,
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  // Weather path: node 4 choice 1 -> node 7
  it('weather path: おてんき -> あたたかかった', () => {
    playDialogueTree(
      startScene(),
      4,
      [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  // Lonely path: node 14 choice 1 -> node 16
  it('lonely path: さびしい -> ともだちほしい', () => {
    playDialogueTree(
      startScene(),
      4,
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
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
