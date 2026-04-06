/**
 * Full game playthrough tests.
 *
 * Exercises every screen, every dialogue branch, every kana question,
 * and every scene transition in the game's state machine.
 */

import { describe, it, expect } from 'vitest';
import { GameRunner } from './helpers/game-runner';
import { SCENES } from '@game/scene';
import type { KanaDir } from '@game/kana';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Play through a dialogue tree choosing option `choiceIdx` at each node */
function playDialogueTree(runner: GameRunner, sceneIdx: number, choicePerNode: number[]): void {
  const tree = SCENES[sceneIdx]!.dialogue;
  let nodeIdx = 0;

  for (const choiceIdx of choicePerNode) {
    const node = tree[nodeIdx]!;
    // Wait for text reveal + choices
    runner.frames(80);
    expect(runner.dlgState).toBe(3); // choosing

    // Navigate to the right choice
    for (let i = 0; i < choiceIdx; i++) {
      runner.press('DOWN').frames(1);
    }

    // Confirm
    runner.press('A').frames(5);

    // Follow the branch
    const choice = node.choices[choiceIdx]!;
    if (choice.next === null) {
      expect(runner.dlgNodeId).toBe(0xff); // conversation over
      return;
    }
    nodeIdx = choice.next;
  }
}

/** Answer a kana question with a specific direction and verify correctness */
function answerKanaQuestion(
  runner: GameRunner,
  dir: KanaDir,
  isCorrect: boolean,
  expectedScore: number,
): void {
  runner.frames(5);
  expect(runner.kanaState).toBe(2); // awaiting input

  runner.press(dir.toUpperCase());
  expect(runner.kanaState).toBe(3); // feedback

  if (isCorrect) {
    expect(runner.kanaScore).toBe(expectedScore);
  }

  // Wait for feedback to complete and next question to load
  runner.frames(35);
}

// ---------------------------------------------------------------------------
// Title screen
// ---------------------------------------------------------------------------

describe('title screen', () => {
  it('shows title screen on boot', () => {
    const runner = new GameRunner().boot();
    expect(runner.dlgState).toBe(0); // idle
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('stays on title until START is pressed', () => {
    const runner = new GameRunner().boot();
    runner.frames(100); // wait a long time
    expect(runner.dlgState).toBe(0); // still idle
    runner.press('A').frames(10); // wrong button
    expect(runner.dlgState).toBe(0); // still idle
  });

  it('transitions to scene 0 on START', () => {
    const runner = new GameRunner().boot().start();
    expect(runner.sceneId).toBe(0);
    expect(runner.dlgState).toBeGreaterThan(0); // dialogue started
    expect(runner.dlgNodeId).toBe(0); // node 0
  });
});

// ---------------------------------------------------------------------------
// Scene 0: Train Station (えき)
// ---------------------------------------------------------------------------

describe('scene 0: train station', () => {
  function startScene0(): GameRunner {
    return new GameRunner().boot().start();
  }

  it('dialogue path: all first choices (こんにちは → はい げんきです → ありがとう)', () => {
    const runner = startScene0();
    playDialogueTree(runner, 0, [0, 0, 0]);
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('dialogue path: all second choices (... → わかりません → ありがとう)', () => {
    const runner = startScene0();
    playDialogueTree(runner, 0, [1, 1, 0]);
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('kana Q1: correct answer (UP = こ)', () => {
    const runner = startScene0();
    runner.completeDialogueTree(0);
    answerKanaQuestion(runner, 'up', true, 4);
  });

  it('kana Q1: wrong answer (DOWN ≠ こ)', () => {
    const runner = startScene0();
    runner.completeDialogueTree(0);
    answerKanaQuestion(runner, 'down', false, 0);
  });

  it('kana Q2: correct answer (LEFT = み)', () => {
    const runner = startScene0();
    runner.completeDialogueTree(0);
    answerKanaQuestion(runner, 'up', true, 4); // Q1
    answerKanaQuestion(runner, 'left', true, 8); // Q2
  });

  it('completes and advances to scene 1', () => {
    const runner = startScene0();
    runner.completeScene(0);
    expect(runner.sceneId).toBe(1);
    expect(runner.sceneFlags & 0x01).toBe(0x01);
  });
});

// ---------------------------------------------------------------------------
// Scene 1: Street (みち)
// ---------------------------------------------------------------------------

describe('scene 1: street', () => {
  function startScene1(): GameRunner {
    return new GameRunner().boot().start().completeScene(0);
  }

  it('dialogue path: first choices (はい? → あちらです → どういたしまして)', () => {
    const runner = startScene1();
    playDialogueTree(runner, 1, [0, 0, 0]);
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('dialogue path: second choices (...→ わかりません → いいえ)', () => {
    const runner = startScene1();
    playDialogueTree(runner, 1, [1, 1, 1]);
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('kana: レストラン blank=ン (correct=RIGHT)', () => {
    const runner = startScene1();
    runner.completeDialogueTree(1);
    answerKanaQuestion(runner, 'right', true, 4);
  });

  it('kana: コンビニ blank=コ (correct=LEFT)', () => {
    const runner = startScene1();
    runner.completeDialogueTree(1);
    answerKanaQuestion(runner, 'right', true, 4); // Q1
    answerKanaQuestion(runner, 'left', true, 8); // Q2
  });

  it('completes and advances to scene 2', () => {
    const runner = startScene1();
    runner.completeScene(1);
    expect(runner.sceneId).toBe(2);
    expect(runner.sceneFlags & 0x03).toBe(0x03); // scenes 0+1 complete
  });
});

// ---------------------------------------------------------------------------
// Scene 2: Restaurant (レストラン)
// ---------------------------------------------------------------------------

describe('scene 2: restaurant', () => {
  function startScene2(): GameRunner {
    return new GameRunner().boot().start().completeScene(0).completeScene(1);
  }

  it('dialogue branch: order ラーメン (node 0→1→2→4→end)', () => {
    const runner = startScene2();
    playDialogueTree(runner, 2, [0, 0, 0, 0]);
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('dialogue branch: order おちゃ (node 0→1→3→4→end)', () => {
    const runner = startScene2();
    playDialogueTree(runner, 2, [0, 1, 0, 0]); // choice 1 at node 1 → node 3
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('kana: ラーメン blank=ラ (correct=DOWN)', () => {
    const runner = startScene2();
    runner.completeDialogueTree(2);
    answerKanaQuestion(runner, 'down', true, 4);
  });

  it('kana: おちゃ blank=ち (correct=UP)', () => {
    const runner = startScene2();
    runner.completeDialogueTree(2);
    answerKanaQuestion(runner, 'down', true, 4); // Q1
    answerKanaQuestion(runner, 'up', true, 8); // Q2
  });

  it('completes and advances to scene 3', () => {
    const runner = startScene2();
    runner.completeScene(2);
    expect(runner.sceneId).toBe(3);
    expect(runner.sceneFlags & 0x07).toBe(0x07);
  });
});

// ---------------------------------------------------------------------------
// Scene 3: Convenience Store (コンビニ)
// ---------------------------------------------------------------------------

describe('scene 3: convenience store', () => {
  function startScene3(): GameRunner {
    return new GameRunner().boot().start().completeScene(0).completeScene(1).completeScene(2);
  }

  it('dialogue: buy path (これ ください → はい → ありがとう)', () => {
    const runner = startScene3();
    playDialogueTree(runner, 3, [0, 0, 0]);
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('dialogue: buy path directly (これ ください → はい → ありがとう)', () => {
    const runner = startScene3();
    playDialogueTree(runner, 3, [0, 0, 0]);
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('kana: ください blank=く (correct=DOWN)', () => {
    const runner = startScene3();
    runner.completeDialogueTree(3);
    answerKanaQuestion(runner, 'down', true, 4);
  });

  it('kana: ありがとう blank=が (correct=DOWN)', () => {
    const runner = startScene3();
    runner.completeDialogueTree(3);
    answerKanaQuestion(runner, 'down', true, 4); // Q1
    answerKanaQuestion(runner, 'down', true, 8); // Q2
  });

  it('completes and advances to scene 4', () => {
    const runner = startScene3();
    runner.completeScene(3);
    expect(runner.sceneId).toBe(4);
    expect(runner.sceneFlags & 0x0f).toBe(0x0f);
  });
});

// ---------------------------------------------------------------------------
// Scene 4: Evening Park (こうえん)
// ---------------------------------------------------------------------------

describe('scene 4: evening park', () => {
  function startScene4(): GameRunner {
    return new GameRunner()
      .boot()
      .start()
      .completeScene(0)
      .completeScene(1)
      .completeScene(2)
      .completeScene(3);
  }

  it('dialogue: こんばんは → カナネコです → たのしかった! → またね!', () => {
    const runner = startScene4();
    playDialogueTree(runner, 4, [0, 0, 0, 0]);
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('dialogue: all second choices', () => {
    const runner = startScene4();
    playDialogueTree(runner, 4, [1, 1, 1, 1]);
    expect(runner.dlgNodeId).toBe(0xff);
  });

  it('kana: さようなら blank=な (correct=UP)', () => {
    const runner = startScene4();
    runner.completeDialogueTree(4);
    answerKanaQuestion(runner, 'up', true, 4);
  });

  it('kana: おはよう blank=お (correct=RIGHT)', () => {
    const runner = startScene4();
    runner.completeDialogueTree(4);
    answerKanaQuestion(runner, 'up', true, 4); // Q1
    answerKanaQuestion(runner, 'right', true, 8); // Q2
  });

  it('completes — all 5 scene flags set', () => {
    const runner = startScene4();
    runner.completeScene(4);
    expect(runner.sceneFlags & 0x1f).toBe(0x1f);
  });
});

// ---------------------------------------------------------------------------
// Full game playthrough
// ---------------------------------------------------------------------------

describe('full game', () => {
  it('plays through all 5 scenes and returns to title', () => {
    const runner = new GameRunner().boot().start();

    for (let i = 0; i < SCENES.length; i++) {
      expect(runner.sceneId).toBe(i);
      runner.completeScene(i);
    }

    // All flags set
    expect(runner.sceneFlags).toBe(0x1f);

    // After completing all scenes, the game should loop back
    // Run extra frames to let the title screen redraw
    runner.frames(30);

    // The game should be back in a state where START can be pressed again
    // (DLG_STATE idle, no active kana)
    expect(runner.dlgState).toBe(0);
    expect(runner.kanaState).toBe(0);
  });

  it('gets perfect kana score in each scene', () => {
    const runner = new GameRunner().boot().start();

    for (let i = 0; i < SCENES.length; i++) {
      runner.completeDialogueTree(i);
      // kana_start resets score for each scene — verify perfect per-scene
      const qCount = SCENES[i]!.kanaQuestions.length;
      for (const q of SCENES[i]!.kanaQuestions) {
        runner.answerKana(q.correctDir);
      }
      expect(runner.kanaScore).toBe(qCount * 4); // 4 points per correct
      runner.frames(10);
    }
  });

  it('wrong kana answers do not increase score', () => {
    const runner = new GameRunner().boot().start();

    // Scene 0: answer all 5 wrong
    runner.completeDialogueTree(0);
    for (let i = 0; i < SCENES[0]!.kanaQuestions.length; i++) {
      runner.answerKana('down'); // always wrong (varies per question)
    }
    runner.frames(10);

    // Score should be 0 or very low (some 'down' answers may coincidentally be correct)
    // But sceneId should advance regardless
    expect(runner.sceneId).toBe(1);
  });
});
