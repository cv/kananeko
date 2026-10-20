/** The sound driver: notes, the sequence notation, and voices stepping in the emulator. */

import { describe, expect, it } from 'vitest';
import { MEM } from '@game/ram';
import { call, db, dec, invoke, jr, label, ld } from '@asm/sm83';
import { type Op, u16, Label } from '@asm/types';
import {
  NOTE_NAMES,
  SEQ,
  SFX,
  SFX_VOICE,
  SONGS,
  SEQ as STEP,
  songId,
  sequenceFrames,
  buildSoundData,
  buildSoundDriver,
  buildSoundInit,
  encodeSequence,
  noteFrequency,
  notePeriods,
  sfxId,
  voiceField,
} from '@game/sound';
import { SCRATCH, runProgram } from './helpers/run-program';
import { SOUND_TICK, SFX_PLAY, MUSIC_PLAY } from '@game/labels';

// Labels placed in this module
const SEQ_DATA = new Label('seq_data');

describe('Given the note table', () => {
  it('tunes A4 to 440 Hz on the pulse channels', () => {
    const period = notePeriods()[NOTE_NAMES.indexOf('a4')] ?? 0;
    expect(131072 / (2048 - period)).toBeCloseTo(440, -1);
  });

  it('rises with every note and fits in 11 bits', () => {
    const periods = notePeriods();
    periods.forEach((p, i) => {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(2048);
      if (i > 0) expect(p).toBeGreaterThan(periods[i - 1] ?? 0);
    });
  });

  it('spans c3 to b7, an octave being twice the frequency', () => {
    expect(NOTE_NAMES[0]).toBe('c3');
    expect(NOTE_NAMES.at(-1)).toBe('b7');
    expect(noteFrequency(NOTE_NAMES.indexOf('a5'))).toBeCloseTo(880);
  });
});

describe('Given a sequence in the notation', () => {
  it('encodes the duty, envelope, length and notes, and stops at the end', () => {
    expect(encodeSequence('w2 vC2 l4 c6 e6')).toEqual([
      SEQ.DUTY,
      0x80,
      SEQ.ENVELOPE,
      0xc2,
      SEQ.LENGTH | 4,
      36,
      40,
      SEQ.END,
    ]);
  });

  it('lets a note or rest set the length, and loops instead of stopping', () => {
    expect(encodeSequence('v20 l6 c3:12 r loop')).toEqual([
      SEQ.ENVELOPE,
      0x20,
      SEQ.LENGTH | 6,
      SEQ.LENGTH | 12,
      0,
      SEQ.REST,
      SEQ.LOOP,
    ]);
  });

  it.each([
    ['a note before any length', 'v20 c4'],
    ['a note before any envelope', 'l4 c4'],
    ['an unknown step', 'v20 l4 h4'],
    ['a length too long', 'v20 l64 c4'],
    ['no note at all', 'v20 l4'],
    ['a note out of range', 'v20 l4 c8'],
  ])('rejects %s', (_, source) => {
    expect(() => encodeSequence(source)).toThrow();
  });

  it('encodes every sound effect, each setting its own duty, envelope and length', () => {
    for (const { sequence } of Object.values(SFX)) {
      const bytes = encodeSequence(sequence);
      expect(bytes).toContain(SEQ.DUTY);
      expect(bytes.at(-1)).toBe(SEQ.END);
    }
  });

  it('ranks the letter blip below every other effect', () => {
    const others = Object.entries(SFX).filter(([name]) => name !== 'blip');
    for (const [, effect] of others) expect(effect.priority).toBeGreaterThan(SFX.blip.priority);
  });
});

// ---------------------------------------------------------------------------
// The driver, running in the emulator
// ---------------------------------------------------------------------------

const VOICE_STATE_BYTES = 8;

let tickLoops = 0;

/** Step the sound `count` (1-255) frames */
function ticks(count: number): Op[] {
  const loop = new Label(`ticks_${String(tickLoops++)}`);
  return [
    ld('a', count),
    ld([u16(SCRATCH)], 'a'),
    label(loop),
    call(SOUND_TICK),
    ld('a', [u16(SCRATCH)]),
    dec('a'),
    ld([u16(SCRATCH)], 'a'),
    jr('nz', loop),
  ];
}

/** Run `setup`, then step the sound `count` frames, and return the address space */
function runSound(setup: readonly Op[], count: number, data: readonly Op[] = []): Uint8Array {
  return runProgram(
    [...buildSoundInit(), ...setup, ...ticks(count)],
    [...buildSoundDriver(), ...buildSoundData(), ...data],
  );
}

const play = (name: keyof typeof SFX): Op[] => invoke(SFX_PLAY, { a: sfxId(name) });

/** Point voice 0 (pulse channel 2) at a sequence labelled `seq` */
const startVoice0: Op[] = [
  ld('hl', SEQ_DATA),
  ...(
    [
      ['PTR_LO', 'l'],
      ['START_LO', 'l'],
      ['START_HI', 'h'],
      ['PTR_HI', 'h'],
    ] as const
  ).flatMap(([field, reg]) => [ld('a', reg), ld([voiceField(0, field)], 'a')]),
  ld('a', 1),
  ld([voiceField(0, 'TIMER')], 'a'),
];

const voice = (memory: Uint8Array, v: number): number[] =>
  Array.from(memory.slice(voiceField(v, 'PTR_LO'), voiceField(v, 'PTR_LO') + VOICE_STATE_BYTES));

describe('Given a sound effect starts', () => {
  it('plays its first note on the next frame: duty, envelope and length set', () => {
    const memory = runSound(play('confirm'), 1);
    expect(memory[MEM.SFX_ID]).toBe(sfxId('confirm'));
    expect(memory[voiceField(SFX_VOICE, 'TIMER')]).toBe(3);
    expect(memory[voiceField(SFX_VOICE, 'LENGTH')]).toBe(3);
    expect(memory[voiceField(SFX_VOICE, 'ENVELOPE')]).toBe(0xb1);
    expect(memory[voiceField(SFX_VOICE, 'DUTY')]).toBe(0x80);
    expect(memory[0xff12]).toBe(0xb1); // NR12: channel 1's envelope
  });

  it('goes quiet once its last note has had its length', () => {
    // confirm: two notes of 3 frames each, then the end
    expect(runSound(play('confirm'), 6)[voiceField(SFX_VOICE, 'PTR_HI')]).not.toBe(0);
    expect(runSound(play('confirm'), 7)[voiceField(SFX_VOICE, 'PTR_HI')]).toBe(0);
  });

  it('is not cut off by a less important effect', () => {
    const memory = runSound([...play('heartDown'), ...play('blip')], 2);
    expect(memory[MEM.SFX_ID]).toBe(sfxId('heartDown'));
  });

  it('gives way to an equally or more important one', () => {
    const memory = runSound([...play('cursor'), ...play('confirm')], 2);
    expect(memory[MEM.SFX_ID]).toBe(sfxId('confirm'));
  });

  it('lets anything play once it has finished', () => {
    // heartDown: 5 + 5 + 12 frames, plus the frame its first note waits for
    const memory = runSound([...play('heartDown'), ...ticks(23), ...play('blip')], 1);
    expect(memory[MEM.SFX_ID]).toBe(sfxId('blip'));
  });
});

describe('Given the songs', () => {
  it.each(Object.entries(SONGS))('keeps the melody and bass of %s together', (_, song) => {
    expect(sequenceFrames(song.melody)).toBe(sequenceFrames(song.bass));
  });

  it('loops every song but the game over phrase, which ends quiet', () => {
    for (const [name, song] of Object.entries(SONGS)) {
      for (const part of [song.melody, song.bass]) {
        const bytes = encodeSequence(part);
        if (name === 'gameOver') expect(bytes.slice(-2)).toEqual([STEP.REST, STEP.END]);
        else expect(bytes.at(-1)).toBe(STEP.LOOP);
      }
    }
  });
});

const playSong = (id: number): Op[] => invoke(MUSIC_PLAY, { a: id });

describe('Given a song starts', () => {
  it('plays its melody and bass on the music voices', () => {
    const memory = runSound(playSong(songId('quiz')), 1);
    expect(memory[MEM.MUSIC_ID]).toBe(songId('quiz'));
    expect(memory[voiceField(0, 'PTR_HI')]).not.toBe(0);
    expect(memory[voiceField(1, 'PTR_HI')]).not.toBe(0);
    expect(memory[voiceField(0, 'LENGTH')]).toBe(10); // quiz: l10
    expect(memory[voiceField(1, 'LENGTH')]).toBe(20); // its bass: l20
  });

  it('carries on, rather than restarting, when asked for again', () => {
    const memory = runSound(
      [...playSong(songId('quiz')), ...ticks(15), ...playSong(songId('quiz'))],
      1,
    );
    // Notes start on frames 1 and 11, so 16 frames in the second has 5 left (a
    // restart would show a fresh first note's 10)
    expect(memory[voiceField(0, 'TIMER')]).toBe(5);
  });

  it('stops both voices and goes quiet for song 0', () => {
    const memory = runSound([...playSong(songId('title')), ...ticks(5), ...playSong(0)], 1);
    expect(memory[voiceField(0, 'PTR_HI')]).toBe(0);
    expect(memory[voiceField(1, 'PTR_HI')]).toBe(0);
    expect(memory[0xff17]).toBe(0); // NR22
  });
});

describe('Given a looping sequence', () => {
  const seq = [label(SEQ_DATA), db(encodeSequence('w1 v70 l2 c4 r loop'))];

  it('starts over after its last step, holding each for its length', () => {
    // c4 (2 frames), rest (2 frames), then c4 again: frame 5 restarts the loop
    const memory = runSound(startVoice0, 5, seq);
    const state = voice(memory, 0);
    expect(state[1]).not.toBe(0); // still playing
    expect(state[2]).toBe(2); // a fresh note's full length
    expect(memory[0xff17]).toBe(0x70); // NR22: the note's envelope is back after the rest
  });

  it('silences the channel during a rest', () => {
    const memory = runSound(startVoice0, 3, seq);
    expect(memory[0xff17]).toBe(0); // NR22: volume 0
  });
});
