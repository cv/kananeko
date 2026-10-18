/**
 * Assemble the GitHub Pages site in build/site: the page, the bundled player,
 * binjgb, the ROM (built from source), a few screenshots, and icons drawn from
 * the cat's sprite.
 */

import { createHash } from 'node:crypto';
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

/** Short hash of a file's content */
function contentHash(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 10);
}

/** name.ext → name.<hash>.ext */
function hashed(name: string, data: Uint8Array): string {
  const ext = path.extname(name);
  return `${path.basename(name, ext)}.${contentHash(data)}${ext}`;
}

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

  // The site sits behind a CDN that caches for hours: name files by their content,
  // so a new build is never served with old scripts, styles, or ROM
  const rom = buildRom().rom;
  const romVersion = contentHash(rom);
  await build({
    entryPoints: [path.join(SITE, 'src', 'play.ts')],
    outfile: path.join(OUT, 'play.js'),
    define: { __ROM_URL__: JSON.stringify(`kananeko.gb?v=${romVersion}`) },
    bundle: true,
    format: 'iife',
    target: ['chrome100', 'safari15'],
    minify: true,
    logLevel: 'warning',
  });
  const script = hashed('play.js', fs.readFileSync(path.join(OUT, 'play.js')));
  fs.renameSync(path.join(OUT, 'play.js'), path.join(OUT, script));
  const css = fs.readFileSync(path.join(SITE, 'style.css'));
  const stylesheet = hashed('style.css', css);
  fs.writeFileSync(path.join(OUT, stylesheet), css);
  const html = fs
    .readFileSync(path.join(SITE, 'index.html'), 'utf8')
    .replace('href="style.css"', `href="${stylesheet}"`)
    .replace('src="play.js"', `src="${script}"`);
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  for (const file of fs.readdirSync(path.join(SITE, 'vendor'))) {
    fs.copyFileSync(path.join(SITE, 'vendor', file), path.join(OUT, 'vendor', file));
  }
  fs.writeFileSync(path.join(OUT, 'kananeko.gb'), rom);
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
