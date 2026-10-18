/**
 * Emulator checkpoints at the start of every scene and kana round, so tests
 * can begin anywhere in the game without replaying everything before it.
 *
 * Checkpoints come from one continuous playthrough (always choosing the good
 * answer). They are cached on disk, keyed by the ROM and by the source of the
 * helpers that drive the playthrough, so warm runs skip it entirely. On a cold
 * cache one worker records them while the others wait on a lock file.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SCENES } from '@game/scene';
import { GameRunner, type GameRunnerSnapshot, rom } from './game-runner';

export type Checkpoint = `scene${string}:start` | `scene${string}:kana` | 'game:complete';

export const checkpoint = {
  /** Scene `i` has just loaded and its opening dialogue is revealing */
  sceneStart: (i: number): Checkpoint => `scene${String(i)}:start`,
  /** Scene `i`'s dialogue was finished on the good path; the first kana question awaits input */
  kanaStart: (i: number): Checkpoint => `scene${String(i)}:kana`,
  /** All scenes completed; the game has returned to the title screen */
  gameComplete: 'game:complete' as const,
};

type Checkpoints = Partial<Record<Checkpoint, GameRunnerSnapshot>>;

const CACHE_DIR = path.join(import.meta.dirname, '..', '..', 'node_modules', '.cache', 'kananeko');
const LOCK_STALE_MS = 5 * 60_000;
const LOCK_POLL_MS = 100;

/** Play the whole game once, recording a snapshot at every checkpoint. */
export function recordCheckpoints(): Checkpoints {
  const out: Checkpoints = {};
  const runner = new GameRunner().boot().start();
  SCENES.forEach((_, i) => {
    out[checkpoint.sceneStart(i)] = runner.snapshot();
    runner.completeDialogueTree().waitForKanaInput();
    out[checkpoint.kanaStart(i)] = runner.snapshot();
    runner.completeKanaQuestions(i);
  });
  out[checkpoint.gameComplete] = runner.snapshot();
  return out;
}

function cacheKey(): string {
  const hash = createHash('sha256').update(rom);
  for (const file of ['game-runner.ts', 'checkpoints.ts']) {
    hash.update(fs.readFileSync(path.join(import.meta.dirname, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readCache(file: string): Checkpoints | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Checkpoints;
  } catch {
    return undefined;
  }
}

function tryLock(lock: string): boolean {
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    const age = Date.now() - (fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? 0);
    if (age > LOCK_STALE_MS) fs.rmSync(lock, { force: true });
    return false;
  }
}

function loadOrRecord(): Checkpoints {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `checkpoints-${cacheKey()}.json`);
  const lock = `${file}.lock`;

  for (;;) {
    const cached = readCache(file);
    if (cached !== undefined) return cached;

    if (tryLock(lock)) {
      try {
        const recorded = recordCheckpoints();
        // Write atomically so readers never see a partial file
        const tmp = `${file}.${String(process.pid)}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(recorded));
        fs.renameSync(tmp, file);
        for (const old of fs.readdirSync(CACHE_DIR)) {
          if (old.startsWith('checkpoints-') && old.endsWith('.json') && !file.endsWith(old)) {
            fs.rmSync(path.join(CACHE_DIR, old), { force: true });
          }
        }
        return recorded;
      } finally {
        fs.rmSync(lock, { force: true });
      }
    }
    sleep(LOCK_POLL_MS);
  }
}

let checkpoints: Checkpoints | undefined;

/** A fresh runner restored to the given checkpoint. */
export function runnerAt(name: Checkpoint): GameRunner {
  checkpoints ??= loadOrRecord();
  const snapshot = checkpoints[name];
  if (snapshot === undefined) throw new Error(`Unknown checkpoint: ${name}`);
  return GameRunner.fromSnapshot(snapshot);
}
