/** Kana passwords: the reference codec, and the game's routines agreeing with it. */

import { describe, expect, it } from 'vitest';
import { MEM } from '@game/ram';
import { call, ld_nn_a } from '@asm/ops';
import { u16 } from '@asm/types';
import { storeByte } from '@asm/macros';
import { CHAR_MAP } from '@game/font';
import { MAX_SCORE } from '@game/kana-hud';
import {
  PASSWORD_ALPHABET,
  PASSWORD_LENGTH,
  type Progress,
  buildPasswordData,
  buildPasswordRoutines,
  decodePassword,
  encodePassword,
} from '@game/password';
import { SCENES } from '@game/scene';
import { MAX_LIVES } from '@game/state';
import { buildVramPut } from '@game/video';
import { SCRATCH, runProgram } from './helpers/run-program';
import { PASS_ENCODE, PASS_DECODE, PASS_APPLY } from '@game/labels';

const SCENE_COUNT = SCENES.length;
const SCORES = [0, 5, 255, 256, 1234, 12345, MAX_SCORE];

/** The password with kana `i` replaced */
function replaceAt(kana: readonly string[], i: number, other: string): string {
  const copy = [...kana];
  copy[i] = other;
  return copy.join('');
}

const everyProgress: Progress[] = SCENES.flatMap((_, scene) =>
  [1, 2, 3].flatMap((lives) => SCORES.map((score) => ({ scene, lives, score }))),
);

describe('Given the password alphabet', () => {
  it('has 32 different kana, all in the font', () => {
    expect(new Set(PASSWORD_ALPHABET).size).toBe(32);
    for (const kana of PASSWORD_ALPHABET) expect(CHAR_MAP[kana]).toBeDefined();
  });

  it('leaves out kana that are easy to mix up', () => {
    for (const kana of 'ぬめわれねるろはほさちき') expect(PASSWORD_ALPHABET).not.toContain(kana);
  });
});

describe('Given a run to save', () => {
  it.each(everyProgress.map((p) => [p.scene, p.lives, p.score, p] as const))(
    'brings back scene %i, %i hearts and %i points',
    (_s, _l, _p, progress) => {
      const password = encodePassword(progress);
      expect(Array.from(password)).toHaveLength(PASSWORD_LENGTH);
      expect(decodePassword(password, SCENE_COUNT)).toEqual(progress);
    },
  );

  it('gives different runs different-looking passwords', () => {
    const passwords = new Set(everyProgress.map(encodePassword));
    expect(passwords.size).toBe(everyProgress.length);
    const firstKana = new Set(
      SCENES.map((_, scene) => encodePassword({ scene, lives: 3, score: 0 })[0]),
    );
    expect(firstKana.size).toBeGreaterThan(1);
  });
});

describe('Given a password that is not one', () => {
  it.each([
    ['too short', 'あいうえお'],
    ['too long', 'あいうえおかく'],
    ['a kana outside the alphabet', 'あいうえおぬ'],
  ])('rejects one %s', (_, password) => {
    expect(decodePassword(password, SCENE_COUNT)).toBeUndefined();
  });

  it.each([
    ['a scene past the last', { scene: SCENE_COUNT, lives: 3, score: 0 }],
    ['no hearts', { scene: 0, lives: 0, score: 0 }],
    ['a score past the cap', { scene: 0, lives: 3, score: MAX_SCORE + 1 }],
  ])('rejects one with %s', (_, progress) => {
    expect(decodePassword(encodePassword(progress), SCENE_COUNT)).toBeUndefined();
  });

  it('catches almost every one-kana typo', () => {
    let typos = 0;
    let caught = 0;
    for (const progress of everyProgress) {
      const password = Array.from(encodePassword(progress));
      password.forEach((kana, i) => {
        for (const other of PASSWORD_ALPHABET) {
          if (other === kana) continue;
          const typo = replaceAt(password, i, other);
          typos++;
          if (decodePassword(typo, SCENE_COUNT) === undefined) caught++;
        }
      });
    }
    expect(caught / typos).toBeGreaterThan(0.99);
  });
});

// ---------------------------------------------------------------------------
// The game's routines
// ---------------------------------------------------------------------------

const ROUTINES = [...buildPasswordRoutines(SCENE_COUNT), ...buildPasswordData(), ...buildVramPut()];

function gameEncode({ scene, lives, score }: Progress): string {
  const memory = runProgram(
    [
      ...storeByte(MEM.SCENE_ID, scene),
      ...storeByte(MEM.KANA_LIVES, lives),
      ...storeByte(MEM.KANA_SCORE_LO, score & 0xff),
      ...storeByte(MEM.KANA_SCORE_HI, score >> 8),
      call(PASS_ENCODE),
    ],
    ROUTINES,
  );
  return Array.from(memory.slice(MEM.PASS_CHARS, MEM.PASS_CHARS + PASSWORD_LENGTH))
    .map((i) => PASSWORD_ALPHABET[i] ?? '?')
    .join('');
}

function gameDecode(password: string): { valid: boolean; memory: Uint8Array } {
  const memory = runProgram(
    [
      ...Array.from(password).flatMap((kana, i) =>
        storeByte(u16(MEM.PASS_CHARS + i), PASSWORD_ALPHABET.indexOf(kana)),
      ),
      call(PASS_DECODE),
      ld_nn_a(u16(SCRATCH)),
      call(PASS_APPLY),
    ],
    ROUTINES,
  );
  return { valid: memory[SCRATCH] === 0, memory };
}

describe("Given the game's password routines", () => {
  const samples: Progress[] = [
    { scene: 0, lives: MAX_LIVES, score: 0 },
    { scene: 2, lives: MAX_LIVES, score: 1234 },
    { scene: SCENE_COUNT - 1, lives: MAX_LIVES, score: MAX_SCORE },
  ];

  it.each(samples.map((p) => [p.scene, p.score, p] as const))(
    'writes the same password as the reference for scene %i, %i points (hearts full)',
    (_s, _p, progress) => {
      expect(gameEncode(progress)).toBe(encodePassword(progress));
    },
  );

  it.each(samples.map((p) => [p.scene, p.score, p] as const))(
    'reads it back: scene %i, %i points, hearts, and the stamps of the scenes before',
    (scene, score, progress) => {
      const { valid, memory } = gameDecode(encodePassword({ ...progress, lives: 2 }));
      expect(valid).toBe(true);
      expect(memory[MEM.SCENE_ID]).toBe(scene);
      expect(memory[MEM.KANA_LIVES]).toBe(2);
      expect((memory[MEM.KANA_SCORE_HI] ?? 0) * 256 + (memory[MEM.KANA_SCORE_LO] ?? 0)).toBe(score);
      expect(memory[MEM.SCENE_FLAGS]).toBe((1 << scene) - 1);
    },
  );

  it('turns away the same passwords the reference does', () => {
    const password = Array.from(encodePassword(samples[1] ?? { scene: 0, lives: 3, score: 0 }));
    for (const other of PASSWORD_ALPHABET) {
      const typo = replaceAt(password, 3, other);
      expect(gameDecode(typo).valid).toBe(decodePassword(typo, SCENE_COUNT) !== undefined);
    }
  });
});
