/**
 * Capture a gallery of screenshots by driving the real ROM in the emulator.
 *
 *   npm run screenshots
 *
 * Writes docs/screenshots/*.png (3x), a contact sheet, and a README gallery.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { MEM } from '../src/asm/hardware';
import { SCENES } from '../src/game/scene';
import { checkpoint, runnerAt } from '../test/helpers/checkpoints';
import { GameRunner } from '../test/helpers/game-runner';
import { blit, createImage, encodePng, type Image, scale } from './png';

const OUT_DIR = path.join(import.meta.dirname, '..', 'docs', 'screenshots');
const SCREEN_W = 160;
const SCREEN_H = 144;
const SCALE = 3;
const BLINK_BIT = 0x20;
/** Frames to render after a state change (snapshots don't include the screen, and
 * the first frame after the LCD turns back on is blank) */
const SETTLE_FRAMES = 4;

interface Shot {
  readonly file: string;
  readonly caption: string;
  readonly capture: () => GameRunner;
}

function titleWithPrompt(visible: boolean): GameRunner {
  const runner = new GameRunner().boot();
  return runner
    .waitUntil(
      () => ((runner.readMem(MEM.TITLE_TIMER) & BLINK_BIT) === 0) === visible,
      'title prompt blink phase',
    )
    .frames(SETTLE_FRAMES);
}

const SHOTS: Shot[] = [
  { file: 'title', caption: 'Title screen', capture: () => titleWithPrompt(true) },
  {
    file: 'title-blink',
    caption: 'Title, prompt blinked off',
    capture: () => titleWithPrompt(false),
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
    capture: () => runnerAt(checkpoint.kanaStart(0)).pressKanaAnswer(true).frames(10),
  },
  {
    file: 'kana-wrong',
    caption: 'Kana: wrong answer feedback',
    capture: () => runnerAt(checkpoint.kanaStart(0)).pressKanaAnswer(false).frames(10),
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

> **Emulator caveat:** gaps in text that is still being revealed (すみません! showing as \`すみ ん!\`) come from
> serverboy, not the ROM. Its HALT emulation does not wake reliably on VBlank, so the test
> harness disables the VBlank interrupt and the per-character VRAM writes land outside VBlank.
> Text drawn with the LCD off (choices, kana rounds) is unaffected.

| | | |
| --- | --- | --- |
${rows.join('\n')}
`,
);
console.log(
  `Wrote ${String(SHOTS.length)} screenshots to ${path.relative(process.cwd(), OUT_DIR)}`,
);
