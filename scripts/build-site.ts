/**
 * Assemble the GitHub Pages site in build/site: the page, the bundled player,
 * binjgb, the ROM (built from source), a few screenshots, and icons drawn from
 * the cat's sprite.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from 'esbuild';
import { buildRom } from '../src/game/main';
import { catArt } from '../src/game/cat-art';
import { CAT_PALETTE } from '../src/game/cat';
import { PAPER } from '../src/game/palette';
import { createImage, encodePng, scale, blit, type Image } from './png';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'site');
export const OUT = path.join(ROOT, 'build', 'site');
const SCREENSHOTS = ['title', 'scene1-choices', 'kana-correct', 'scene2-intro', 'scene4-choices'];

/** RGB555 → RGBA */
function rgba(color: number): number[] {
  const channel = (shift: number): number => Math.round((((color >> shift) & 31) * 255) / 31);
  return [channel(0), channel(5), channel(10), 255];
}

/** The cat's neutral face on paper, `size` pixels square */
function catIcon(size: number): Image {
  const art = catArt('neutral');
  const cat = createImage(32, 24, rgba(PAPER));
  art.forEach((row, y) => {
    Array.from(row).forEach((shade, x) => {
      const index = '.-+#'.indexOf(shade);
      if (index > 0) cat.pixels.set(rgba(CAT_PALETTE[index] ?? 0), (y * 32 + x) * 4);
    });
  });
  const square = createImage(32, 32, rgba(PAPER));
  blit(square, cat, 0, 6);
  return scale(square, size / 32);
}

export async function buildSite(): Promise<void> {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });

  await build({
    entryPoints: [path.join(SITE, 'src', 'play.ts')],
    outfile: path.join(OUT, 'play.js'),
    bundle: true,
    format: 'iife',
    target: ['chrome100', 'safari15'],
    minify: true,
    sourcemap: true,
    logLevel: 'warning',
  });
  for (const file of ['index.html', 'style.css']) {
    fs.copyFileSync(path.join(SITE, file), path.join(OUT, file));
  }
  for (const file of fs.readdirSync(path.join(SITE, 'vendor'))) {
    fs.copyFileSync(path.join(SITE, 'vendor', file), path.join(OUT, 'vendor', file));
  }
  fs.writeFileSync(path.join(OUT, 'kananeko.gb'), buildRom().rom);
  for (const name of SCREENSHOTS) {
    fs.copyFileSync(
      path.join(ROOT, 'docs', 'screenshots', `${name}.png`),
      path.join(OUT, 'screenshots', `${name}.png`),
    );
  }
  fs.writeFileSync(path.join(OUT, 'icon.png'), encodePng(catIcon(64)));
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), encodePng(catIcon(192)));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
}

if (process.argv[1] === import.meta.filename) {
  await buildSite();
  console.log(`Site written to ${path.relative(ROOT, OUT)}`);
}
