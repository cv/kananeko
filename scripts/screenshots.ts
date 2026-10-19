/**
 * Capture a gallery of screenshots by driving the real ROM in the emulator.
 *
 *   npm run screenshots
 *
 * Writes docs/screenshots/*.png (3x), a contact sheet, and a README gallery.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SCENES, sceneRounds } from '../src/game/scene';
import { checkpoint, runnerAt } from '../test/helpers/checkpoints';
import { GameRunner } from '../test/helpers/game-runner';
import { blit, createImage, encodePng, type Image, scale } from './png';

const OUT_DIR = path.join(import.meta.dirname, '..', 'docs', 'screenshots');
const SCREEN_W = 160;
const SCREEN_H = 144;
const SCALE = 3;
/** Frames to render after a state change (snapshots don't include the screen, and
 * the first frame after the LCD turns back on is blank) */
const SETTLE_FRAMES = 4;

interface Shot {
  readonly file: string;
  readonly caption: string;
  readonly capture: () => GameRunner;
}

/** The title menu, faded in */
function title(): GameRunner {
  const runner = new GameRunner().boot();
  return runner.waitUntil(() => runner.music === 'title', 'the title').frames(30);
}

/** The password screen, from the title menu's つづき */
function passwordScreen(): GameRunner {
  return title().pressDown().frames(1).pressA().frames(40);
}

const SHOTS: Shot[] = [
  { file: 'title', caption: 'Title screen', capture: title },
  {
    file: 'title-continue',
    caption: 'Title menu: continue (つづき)',
    capture: () => title().pressDown().frames(SETTLE_FRAMES),
  },
  {
    file: 'password',
    caption: 'Typing a password (あいことば)',
    capture: () => passwordScreen().typePassword('のこす').frames(SETTLE_FRAMES),
  },
  ...SCENES.flatMap((scene, i): Shot[] => [
    {
      file: `scene${String(i)}-intro`,
      caption: `${scene.name}: text revealing`,
      capture: () => runnerAt(checkpoint.sceneStart(i)).frames(12),
    },
    {
      file: `scene${String(i)}-choices`,
      caption: `${scene.name}: choices`,
      capture: () =>
        runnerAt(checkpoint.sceneStart(i)).waitForDialogueChoices().frames(SETTLE_FRAMES),
    },
    {
      file: `scene${String(i)}-kana`,
      caption: `${scene.name}: kana round`,
      capture: () => runnerAt(checkpoint.kanaStart(i)).frames(SETTLE_FRAMES),
    },
  ]),
  {
    file: 'dialogue-bad-choice',
    caption: 'After a bad choice: -5 and a lost heart',
    capture: () => runnerAt(checkpoint.sceneStart(0)).chooseDialogueChoice(1).frames(20),
  },
  {
    file: 'kana-correct',
    caption: 'Kana: correct answer feedback',
    capture: () => runnerAt(checkpoint.kanaStart(0)).resetStreak().pressKanaAnswer(true).frames(10),
  },
  {
    file: 'kana-streak',
    caption: 'Kana: three first tries in a row pay a bonus',
    capture: () =>
      runnerAt(checkpoint.kanaStart(0))
        .resetStreak()
        .answerKanaCorrectly()
        .answerKanaCorrectly()
        .pressKanaAnswer(true)
        .frames(10),
  },
  {
    file: 'kana-katakana',
    caption: 'Kana: the review ends with a word to write in katakana',
    capture: (): GameRunner => {
      const runner = runnerAt(checkpoint.kanaStart(0));
      const review = sceneRounds(SCENES[0]).at(-1)?.questions ?? [];
      review.slice(0, -1).forEach(() => runner.answerKanaCorrectly());
      return runner.waitForKanaInput().frames(SETTLE_FRAMES);
    },
  },
  {
    file: 'speed-round',
    caption: 'Speed round: one more from each scene, against the clock',
    capture: () => runnerAt(checkpoint.speedRound).frames(SETTLE_FRAMES + 60),
  },
  {
    file: 'kana-wrong',
    caption: 'Kana: wrong answer feedback',
    capture: () => runnerAt(checkpoint.kanaStart(0)).pressKanaAnswer(false).frames(10),
  },
  {
    file: 'chart',
    caption: 'Kana chart between scenes (one kana missed, in red)',
    capture: (): GameRunner => {
      const runner = runnerAt(checkpoint.kanaStart(0)).resetStreak();
      runner.answerKanaWrong().completeKanaQuestions(0);
      return runner.waitUntil(() => runner.chartWaiting, 'the chart').frames(SETTLE_FRAMES * 2);
    },
  },
  {
    file: 'ending',
    caption: 'Ending: every scene cleared',
    capture: () => runnerAt(checkpoint.gameComplete),
  },
  {
    file: 'game-over',
    caption: 'Game over',
    capture: (): GameRunner => {
      const runner = runnerAt(checkpoint.kanaStart(0));
      for (let i = 0; i < 9 && runner.kanaLives > 0; i++) runner.answerKanaWrong();
      return runner.frames(30);
    },
  },
];

/** Advance until the LCD shows something (it renders blank while switched off). */
function screenImage(runner: GameRunner): Image {
  runner.waitUntil(() => {
    const screen = runner.getScreen();
    return screen.some((value, i) => value !== screen[i % 4]);
  }, 'a non-blank screen');
  return { width: SCREEN_W, height: SCREEN_H, pixels: Uint8Array.from(runner.getScreen()) };
}

function contactSheet(images: readonly Image[], columns: number, gap = 8): Image {
  const rows = Math.ceil(images.length / columns);
  const sheet = createImage(
    columns * (SCREEN_W * 2 + gap) + gap,
    rows * (SCREEN_H * 2 + gap) + gap,
    [32, 32, 32, 255],
  );
  images.forEach((image, i) => {
    const x = gap + (i % columns) * (SCREEN_W * 2 + gap);
    const y = gap + Math.floor(i / columns) * (SCREEN_H * 2 + gap);
    blit(sheet, scale(image, 2), x, y);
  });
  return sheet;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const images: Image[] = [];
for (const shot of SHOTS) {
  const image = screenImage(shot.capture());
  images.push(image);
  fs.writeFileSync(path.join(OUT_DIR, `${shot.file}.png`), encodePng(scale(image, SCALE)));
  console.log(`  ${shot.file}.png — ${shot.caption}`);
}
fs.writeFileSync(path.join(OUT_DIR, 'contact-sheet.png'), encodePng(contactSheet(images, 4)));

const rows: string[] = [];
for (let i = 0; i < SHOTS.length; i += 3) {
  const group = SHOTS.slice(i, i + 3);
  rows.push(`| ${group.map((s) => `![${s.caption}](${s.file}.png)`).join(' | ')} |`);
  rows.push(`| ${group.map((s) => s.caption).join(' | ')} |`);
}
fs.writeFileSync(
  path.join(OUT_DIR, 'README.md'),
  `# Screenshots

Captured from the real ROM in the test emulator by \`npm run screenshots\`.


| | | |
| --- | --- | --- |
${rows.join('\n')}
`,
);
console.log(
  `Wrote ${String(SHOTS.length)} screenshots to ${path.relative(process.cwd(), OUT_DIR)}`,
);
