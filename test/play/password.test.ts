/** The title menu, the password at game over, and typing it back in. */

import { describe, expect, it } from 'vitest';
import { MEM } from '@asm/hardware';
import { MENU_TEXT_COL, MENU_TOP_ROW, TITLE_MENU } from '@game/menu';
import {
  PASSWORD_LABEL,
  PASSWORD_LENGTH,
  PASSWORD_PROMPT,
  PASSWORD_SCREEN,
  PASSWORD_WRONG,
  decodePassword,
  encodePassword,
  passwordLineCol,
} from '@game/password';
import { SCENES } from '@game/scene';
import { DialogueState, MAX_LIVES } from '@game/state';
import { centerStartCol } from '@game/tilemap';
import { checkpoint, runnerAt } from '../helpers/checkpoints';
import { GameRunner } from '../helpers/game-runner';
import { loseOneKanaLife } from '../helpers/play';
import { asSeenOnScreen, readText } from '../helpers/screen';

const GAME_OVER_PASSWORD_ROW = 16;
/** Frames for a fade to settle */
const SETTLE = 8;

function readCentered(runner: GameRunner, row: number, text: string): string {
  const length = Array.from(text).length;
  return readText(runner, row, centerStartCol(length), length);
}

/** Booted, with the title menu faded in */
function atTitle(): GameRunner {
  const runner = new GameRunner().boot();
  return runner.waitUntil(() => runner.music === 'title', 'the title').frames(SETTLE * 4);
}

function openPasswordScreen(runner: GameRunner): GameRunner {
  runner.pressDown().frames(1).pressA();
  return runner
    .waitUntil(
      () =>
        readCentered(runner, PASSWORD_SCREEN.promptRow, PASSWORD_PROMPT) ===
        asSeenOnScreen(PASSWORD_PROMPT),
      'the password screen',
    )
    .frames(SETTLE);
}

/** Lose the last heart in scene `scene`'s kana round and wait for the game over screen */
function gameOverIn(scene: number): GameRunner {
  const runner = runnerAt(checkpoint.kanaStart(scene)).setLives(1);
  loseOneKanaLife(runner);
  // The music starts as the screen is drawn; then it fades in
  return runner.waitUntil(() => runner.music === 'gameOver', 'game over').frames(SETTLE * 4);
}

function readPassword(runner: GameRunner): string {
  const col = passwordLineCol() + Array.from(PASSWORD_LABEL).length + 1;
  return readText(runner, GAME_OVER_PASSWORD_ROW, col, PASSWORD_LENGTH).trim();
}

describe('Given the title screen', () => {
  it('offers to start a new game or continue one', () => {
    const runner = atTitle();
    TITLE_MENU.forEach((item, i) => {
      const text = readText(runner, MENU_TOP_ROW + 1 + i, MENU_TEXT_COL, Array.from(item).length);
      expect(text).toBe(asSeenOnScreen(item));
    });
  });

  it('starts a new game from the first item', () => {
    const runner = atTitle().pressA();
    runner.waitUntil(() => runner.dlgState !== DialogueState.IDLE, 'the first conversation');
    expect(runner.sceneId).toBe(0);
  });

  it('opens the password screen from つづき', () => {
    const runner = openPasswordScreen(atTitle());
    expect(readCentered(runner, PASSWORD_SCREEN.promptRow, PASSWORD_PROMPT)).toBe(
      asSeenOnScreen(PASSWORD_PROMPT),
    );
  });
});

describe('Given the game is over', () => {
  it('shows the password that continues from that scene, hearts full', () => {
    const runner = gameOverIn(1);
    const password = encodePassword({ scene: 1, lives: MAX_LIVES, score: runner.kanaScore });
    expect(readPassword(runner)).toBe(asSeenOnScreen(password));
    expect(decodePassword(password, SCENES.length)?.scene).toBe(1);
  });
});

describe('Given a password typed in', () => {
  it('continues the run it holds: scene, hearts, score, and stamps', () => {
    const password = encodePassword({ scene: 2, lives: 2, score: 1234 });
    const runner = openPasswordScreen(atTitle()).typePassword(password);
    runner.waitUntil(() => runner.dlgState !== DialogueState.IDLE, 'the conversation');
    expect(runner.sceneId).toBe(2);
    expect(runner.kanaLives).toBe(2);
    expect(runner.kanaScore).toBe(1234);
    expect(runner.sceneFlags).toBe(0b11);
  });

  it('says ちがうよ to a wrong one, and B takes a kana back', () => {
    const wrong = 'ああああああ';
    expect(decodePassword(wrong, SCENES.length)).toBeUndefined();
    const runner = openPasswordScreen(atTitle()).typePassword(wrong).frames(2);
    expect(readCentered(runner, PASSWORD_SCREEN.messageRow, PASSWORD_WRONG)).toBe(
      asSeenOnScreen(PASSWORD_WRONG),
    );
    expect(runner.sfx).toBe('wrong');
    runner.pressB().frames(2);
    expect(runner.readMem(MEM.PASS_LEN)).toBe(PASSWORD_LENGTH - 1);
    expect(readCentered(runner, PASSWORD_SCREEN.messageRow, PASSWORD_WRONG).trim()).toBe('');
  });

  it('goes back to the title on B with nothing typed', () => {
    const runner = openPasswordScreen(atTitle()).pressB();
    runner.waitUntil(
      () => readText(runner, MENU_TOP_ROW + 1, MENU_TEXT_COL, 4) === asSeenOnScreen('はじめる'),
      'the title menu',
    );
  });
});
