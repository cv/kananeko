/**
 * Sound: a tiny sequencer that plays sound effects (and music) on the Game Boy's
 * sound channels, one step per frame from the VBlank interrupt.
 *
 * Each voice plays a sequence of bytes on one channel:
 *
 *   $00-$5F  a note (NOTE_NAMES index), held for the current length
 *   $60      a rest: silence for the current length
 *   $81-$BF  set the length of the following notes (1-63 frames)
 *   $C0 nn   set the envelope (NRx2: start volume, direction, pace); on the wave
 *            channel, the output level ($20 full, $40 half, $60 quarter)
 *   $C1 nn   set the duty (NRx1: $00 12.5%, $40 25%, $80 50%, $C0 75%)
 *   $FE      go back to the start of the sequence
 *   $FF      stop
 *
 * Sequences are written in a small notation (see encodeSequence): `w2 vC2 l4 c6 e6`.
 *
 * Voices: 0 and 1 play music (pulse channel 2, wave channel 3), voice 2 plays the
 * sound effects (pulse channel 1), so effects never interrupt the tune.
 */

import { HW } from '../asm/hardware';
import { MEM } from './ram';
import {
  add,
  and,
  call,
  cp,
  db,
  dec,
  dw,
  inc,
  jr,
  label,
  ld,
  ldh,
  or,
  pop,
  push,
  ret,
  sub,
  xor,
} from '../asm/sm83';
import { type Op, type U16, ioReg, u16, Label, labelFamily, routine } from '../asm/types';
import { copyBytes, storeByte } from '../asm/macros';
import { SOUND_TICK, SFX_PLAY, MUSIC_PLAY } from './labels';
import { gameModule } from '../asm/program';

// Labels placed in this module
const VOICE_TICK = routine('voice_tick', { clobbers: ['a', 'bc', 'de', 'hl'] });
const VOICE_STEP = new Label('voice_step');
const VOICE_LENGTH = new Label('voice_length');
const VOICE_STORE = new Label('voice_store');
const VOICE_LOOP = new Label('voice_loop');
const VOICE_END = new Label('voice_end');
const VOICE_NOTE = new Label('voice_note');
const VOICE_PLAY = new Label('voice_play');
const SFX_START = new Label('sfx_start');
const SFX_DONE = new Label('sfx_done');
const MUSIC_DONE = new Label('music_done');
const NOTE_PERIODS = new Label('note_periods');
const WAVE_DATA = new Label('wave_data');
const SFX_TABLE = new Label('sfx_table');
const MUSIC_TABLE = new Label('music_table');

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

const PITCH_CLASSES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'] as const;
const LOWEST_OCTAVE = 3;
const OCTAVES = 5;

/** Note names by note number: c3 (0) to b7 (59) */
export const NOTE_NAMES: readonly string[] = Array.from({ length: OCTAVES }, (_, octave) =>
  PITCH_CLASSES.map((pitch) => `${pitch}${String(LOWEST_OCTAVE + octave)}`),
).flat();

/** Frequency of a note number, in Hz (equal temperament, A4 = 440 Hz) */
export function noteFrequency(note: number): number {
  const a4 = NOTE_NAMES.indexOf('a4');
  return 440 * 2 ** ((note - a4) / 12);
}

/**
 * The 11-bit period the pulse channels use for each note: f = 131072 / (2048 - period).
 * The wave channel plays the same period an octave lower.
 */
export function notePeriods(): number[] {
  return NOTE_NAMES.map((_, n) => Math.round(2048 - 131072 / noteFrequency(n)));
}

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

export const SEQ = {
  REST: 0x60,
  LENGTH: 0x80,
  ENVELOPE: 0xc0,
  DUTY: 0xc1,
  LOOP: 0xfe,
  END: 0xff,
} as const;

const MAX_LENGTH = 63;

/**
 * Encode a sequence written as space-separated steps:
 *
 *   c4 f#5 ...  a note (c3-b7)       r      a rest
 *   l6          length: 6 frames     vC2    envelope (two hex digits)
 *   w2          duty 50% (0-3)       loop   start over (music)
 *
 * A note or rest can carry its own length, which then applies to the steps after it
 * too: `c4:12`. Sequences end with $FF unless they loop. The first note must come
 * after a length and an envelope, since voices keep these between sequences.
 */
export function encodeSequence(source: string): number[] {
  const bytes: number[] = [];
  let hasLength = false;
  let hasEnvelope = false;
  let loops = false;
  let notes = 0;
  for (const step of source.trim().split(/\s+/u)) {
    const [name = '', ownLength] = step.split(':');
    if (ownLength !== undefined) {
      bytes.push(...encodeLength(Number(ownLength), step));
      hasLength = true;
    }
    const noteNumber = NOTE_NAMES.indexOf(name);
    if (noteNumber >= 0 || name === 'r') {
      if (!hasLength || !hasEnvelope) {
        throw new Error(`"${step}" needs a length (l) and an envelope (v) before it: ${source}`);
      }
      bytes.push(noteNumber >= 0 ? noteNumber : SEQ.REST);
      notes++;
    } else if (/^l\d+$/u.test(name)) {
      bytes.push(...encodeLength(Number(name.slice(1)), step));
      hasLength = true;
    } else if (/^v[0-9A-F]{2}$/u.test(name)) {
      bytes.push(SEQ.ENVELOPE, parseInt(name.slice(1), 16));
      hasEnvelope = true;
    } else if (/^w[0-3]$/u.test(name)) {
      bytes.push(SEQ.DUTY, Number(name.slice(1)) << 6);
    } else if (name === 'loop') {
      bytes.push(SEQ.LOOP);
      loops = true;
    } else {
      throw new Error(`Unknown step "${step}" in sequence: ${source}`);
    }
  }
  if (notes === 0) throw new Error(`A sequence needs a note: ${source}`);
  return loops ? bytes : [...bytes, SEQ.END];
}

function encodeLength(frames: number, step: string): number[] {
  if (!Number.isInteger(frames) || frames < 1 || frames > MAX_LENGTH) {
    throw new RangeError(`Length must be 1-${String(MAX_LENGTH)} frames: "${step}"`);
  }
  return [SEQ.LENGTH | frames];
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

interface SoundEffect {
  /** A playing effect is only cut off by one of the same or higher priority */
  readonly priority: number;
  readonly sequence: string;
}

/** The sound effects, in ID order */
export const SFX = {
  /** A letter of dialogue appears */
  blip: { priority: 0, sequence: 'w2 v31 l2 a5' },
  /** The choice cursor moves */
  cursor: { priority: 1, sequence: 'w2 vA1 l3 e6' },
  /** A choice is picked */
  confirm: { priority: 1, sequence: 'w2 vB1 l3 c6 g6' },
  /** The speed round's clock ticks */
  tick: { priority: 1, sequence: 'w1 v81 l2 a6' },
  /** A kana answer is right */
  correct: { priority: 2, sequence: 'w2 vC2 l4 c6 e6 g6 l10 c7' },
  /** A kana answer is wrong */
  wrong: { priority: 2, sequence: 'w3 vC3 l6 d#4 l12 c4' },
  /** A heart is won */
  heartUp: { priority: 3, sequence: 'w1 vC2 l3 e5 a5 l8 e6' },
  /** A heart is lost */
  heartDown: { priority: 3, sequence: 'w3 vC4 l5 a4 f4 l12 d4' },
  /** れんぞく! — every third first try in a row */
  streak: { priority: 3, sequence: 'w2 vD2 l3 c6 e6 g6 c7 l2 r l10 e7' },
  /** START on the title screen */
  start: { priority: 3, sequence: 'w2 vC2 l4 g5 c6 e6 l12 g6' },
} as const satisfies Record<string, SoundEffect>;

export type SfxName = keyof typeof SFX;

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------

interface Song {
  /** Pulse channel 2 */
  readonly melody: string;
  /** Wave channel 3, an octave below the notes written */
  readonly bass: string;
}

/**
 * The songs, in ID order: short tunes in the major pentatonic scale (C D E G A),
 * plucked on the pulse channel over a soft bass. Melody and bass must last as long
 * as each other, so they stay together when they loop.
 */
export const SONGS = {
  /** A gentle, catchy theme */
  title: {
    melody: `w2 v73
      l12 e5 g5 a5 g5 l24 e5 d5 l12 c5 d5 e5 g5 l48 d5
      l12 e5 g5 a5 c6 l24 a5 g5 l12 a5 g5 e5 d5 l48 e5
      l12 g5 a5 c6 a5 l24 g5 e5 l12 d5 e5 g5 e5 l24 d5 c5
      l12 a4 c5 d5 e5 l24 g5 e5 l12 d5 c5 d5 e5 l48 c5 loop`,
    bass: `v40 l24
      c3 g3 c4 g3 g3 d4 g3 d4 a3 e4 a3 e4 c3 g3 c4 g3
      f3 c4 f3 c4 g3 d4 g3 d4 a3 e4 a3 e4 g3 d4 c3:48 loop`,
  },
  /** For the conversations: calm and sparse, so it doesn't tire while reading */
  travel: {
    melody: `w1 v52
      l14 g4 a4 c5 a4 l28 g4 e4 l14 d4 e4 g4 e4 l56 d4
      l14 g4 a4 c5 d5 l28 e5 d5 l14 c5 a4 g4 a4 l56 c5
      l14 e5 d5 c5 d5 l28 e5 g5 l14 a5 g5 e5 d5 l56 e5
      l14 d5 c5 a4 c5 l28 d5 e5 l14 d5 c5 a4 g4 l56 c5 loop`,
    bass: `v60 l28
      c3 g3 c3 g3 g3 d4 g3 d4 a3 e4 a3 e4 f3 c4 c3:56
      l28 c3 g3 c3 g3 a3 e4 a3 e4 f3 c4 g3 d4 c3 g3 c3:56 loop`,
  },
  /** For kana rounds: bouncy */
  quiz: {
    melody: `w2 v73
      l10 c5 e5 g5 e5 a5 g5 e5 g5 l10 d5 e5 g5 a5 l20 g5 e5
      l10 c5 e5 g5 e5 a5 c6 a5 g5 l10 e5 d5 c5 d5 l40 c5 loop`,
    bass: `v40 l20
      c3 g3 c3 g3 g3 d4 g3 d4 a3 e4 a3 e4 g3 d4 c3:40 loop`,
  },
  /** The ending: a happy fanfare */
  ending: {
    melody: `w2 v84
      l12 g5 g5 a5 g5 l24 c6 a5 l12 g5 e5 d5 e5 l48 g5
      l12 a5 a5 c6 a5 l24 g5 e5 l12 d5 e5 g5 d5 l48 c5 loop`,
    bass: `v20 l24
      c3 g3 c4 g3 c3 g3 g3 d4 f3 c4 f3 c4 g3 d4 c3:48 loop`,
  },
  /** Game over: a short, sad phrase, then quiet */
  gameOver: {
    melody: 'w1 v64 l18 a4 g4 e4 d4 l48 e4 r:1',
    bass: 'v40 l36 a3 e3 l48 a3 r:1',
  },
} as const satisfies Record<string, Song>;

export type SongName = keyof typeof SONGS;

const SONG_NAMES = Object.keys(SONGS) as SongName[];

/** MUSIC_ID when nothing plays (at boot) */
export const MUSIC_NONE = 0;

/** A song's ID (1-based; MUSIC_NONE is silence) */
export function songId(name: SongName): number {
  return SONG_NAMES.indexOf(name) + 1;
}

/** Play a song, unless it's already playing. Preserves every register and the flags. */
export function playMusic(name: SongName): Op[] {
  return [push('af'), ld('a', songId(name)), call(MUSIC_PLAY), pop('af')];
}

/** How many frames a sequence lasts, up to its end or loop */
export function sequenceFrames(source: string): number {
  let length = 0;
  let frames = 0;
  let argument = false; // the byte after $C0 or $C1
  for (const b of encodeSequence(source)) {
    if (argument) argument = false;
    else if (b === SEQ.ENVELOPE || b === SEQ.DUTY) argument = true;
    else if (b >= SEQ.LENGTH && b < SEQ.ENVELOPE) length = b & MAX_LENGTH;
    else if (b <= SEQ.REST) frames += length;
  }
  return frames;
}

const SFX_NAMES = Object.keys(SFX) as SfxName[];

const sfxData = labelFamily((name: SfxName) => `sfx_data_${name}`);
const songMelody = labelFamily((name: SongName) => `song_${name}_melody`);
const songBass = labelFamily((name: SongName) => `song_${name}_bass`);

/** SFX_ID before any effect has played */
export const SFX_NONE = 0;

/** An effect's ID (1-based, so a cleared SFX_ID means none) */
export function sfxId(name: SfxName): number {
  return SFX_NAMES.indexOf(name) + 1;
}

/** Play a sound effect. Preserves every register and the flags. */
export function playSfx(name: SfxName): Op[] {
  return [push('af'), ld('a', sfxId(name)), call(SFX_PLAY), pop('af')];
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

/** Bytes of state per voice */
export const VOICE_SIZE = 8;
const VOICE = {
  PTR_LO: 0,
  PTR_HI: 1,
  TIMER: 2,
  LENGTH: 3,
  ENVELOPE: 4,
  DUTY: 5,
  START_LO: 6,
  START_HI: 7,
} as const;

/** Each voice's channel, by its first register ($FF10, $FF15, $FF1A) */
const VOICE_CHANNELS = [0x15, 0x1a, 0x10] as const;
export const SOUND_VOICES = VOICE_CHANNELS.length;
export const SFX_VOICE = 2;

/** WRAM address of a voice's field */
export function voiceField(voice: number, field: keyof typeof VOICE): U16 {
  return MEM.SND_VOICES.at(voice * VOICE_SIZE + VOICE[field]);
}

/** Channel 3's waveform: a soft, rounded triangle (32 4-bit samples) */
const WAVE = [
  0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
];

/** Turn the sound on, loud and centered, and load channel 3's waveform. */
export function buildSoundInit(): Op[] {
  return [
    ...storeByte(MEM.SFX_ID, SFX_NONE),
    ld('a', 0x80),
    ldh([HW.NR52], 'a'), // sound on (must come first)
    ld('a', 0x77),
    ldh([HW.NR50], 'a'), // full volume both sides
    ld('a', 0xff),
    ldh([HW.NR51], 'a'), // every channel on both sides
    xor('a'),
    ldh([HW.NR30], 'a'), // the wave DAC must be off to load the waveform
    ...copyBytes(u16(0xff00 + HW.WAVE_RAM), WAVE_DATA, WAVE.length),
  ];
}

/**
 * sound_tick: advance every voice by a frame (called from the VBlank handler, which
 * saves the registers). sfx_play: start effect A unless one of higher priority is
 * playing; clobbers A, preserves BC, DE, HL.
 *
 * The voices' state never crosses a 256-byte page, so fields are reached by
 * changing L alone.
 */
export function buildSoundDriver(): Op[] {
  return [
    label(SOUND_TICK),
    ...VOICE_CHANNELS.flatMap((channel, voice) => [
      ld('hl', voiceField(voice, 'PTR_LO')),
      ld('c', channel),
      call(VOICE_TICK),
    ]),
    ret(),

    // voice_tick: HL = voice, C = its channel's first register
    label(VOICE_TICK),
    inc('l'), // PTR_HI: 0 while idle
    ld('a', ['hl']),
    or('a'),
    ret('z'),
    ld('d', 'a'),
    inc('l'), // TIMER
    dec(['hl']),
    ret('nz'),
    dec('l'),
    dec('l'),
    ld('e', ['hl']), // DE = the next step, HL = the voice

    label(VOICE_STEP),
    ld('a', ['de']),
    inc('de'),
    cp(SEQ.LENGTH),
    jr('c', VOICE_NOTE),
    ld('b', 'l'),
    cp(SEQ.ENVELOPE),
    jr('c', VOICE_LENGTH),
    cp(SEQ.LOOP),
    jr('z', VOICE_LOOP),
    jr('nc', VOICE_END),
    // $C0 nn / $C1 nn: the ENVELOPE or DUTY field
    sub(SEQ.ENVELOPE - VOICE.ENVELOPE),
    add('l'),
    ld('l', 'a'),
    ld('a', ['de']),
    inc('de'),
    jr(VOICE_STORE),

    label(VOICE_LENGTH),
    and(MAX_LENGTH),
    ...Array.from({ length: VOICE.LENGTH }, () => inc('l')),
    label(VOICE_STORE),
    ld(['hl'], 'a'),
    ld('l', 'b'),
    jr(VOICE_STEP),

    label(VOICE_LOOP),
    ld('a', 'l'),
    add(VOICE.START_LO),
    ld('l', 'a'),
    ld('a', ['hl+']),
    ld('d', ['hl']),
    ld('e', 'a'),
    ld('l', 'b'),
    jr(VOICE_STEP),

    label(VOICE_END),
    inc('l'),
    xor('a'),
    ld(['hl'], 'a'), // PTR_HI = 0: idle
    ret(),

    // A = a note or a rest: save the position, hold it for LENGTH frames, play it
    label(VOICE_NOTE),
    ld('b', 'a'),
    ld(['hl'], 'e'),
    inc('l'),
    ld(['hl'], 'd'),
    inc('l'),
    inc('l'), // LENGTH
    ld('a', ['hl']),
    dec('l'),
    ld(['hl'], 'a'), // TIMER = LENGTH
    inc('l'),
    inc('l'), // ENVELOPE
    ld('a', 'b'),
    cp(SEQ.REST),
    jr('nz', VOICE_PLAY),
    // A rest: zero volume (on the pulse channels this also turns the DAC off until
    // the next note restarts it)
    inc('c'),
    inc('c'),
    xor('a'),
    ld(['c'], 'a'),
    ret(),

    label(VOICE_PLAY),
    // Register 0: off, then $80. Restarting the wave channel while it plays can
    // corrupt its waveform on a DMG, so its DAC goes off and on first; on channel 1
    // this turns the sweep off, and channel 2 has no register 0.
    xor('a'),
    ld(['c'], 'a'),
    ld('a', 0x80),
    ld(['c'], 'a'),
    inc('c'),
    inc('l'),
    ld('a', ['hl']), // DUTY
    ld(['c'], 'a'),
    inc('c'),
    dec('l'),
    ld('a', ['hl']), // ENVELOPE
    ld(['c'], 'a'),
    inc('c'),
    ld('a', 'b'),
    add('a'),
    ld('e', 'a'),
    ld('d', 0),
    ld('hl', NOTE_PERIODS),
    add('hl', 'de'),
    ld('a', ['hl+']),
    ld(['c'], 'a'), // period, low byte
    inc('c'),
    ld('a', ['hl']),
    or(0x80), // restart the note
    ld(['c'], 'a'),
    ret(),

    // sfx_play: A = effect ID
    label(SFX_PLAY),
    push('bc'),
    push('de'),
    push('hl'),
    ld('c', 'a'),
    ld('hl', SFX_TABLE),
    ld('b', 0),
    add('hl', 'bc'),
    add('hl', 'bc'),
    add('hl', 'bc'), // 3 bytes each: address, priority
    ld('a', [voiceField(SFX_VOICE, 'PTR_HI')]),
    or('a'),
    jr('z', SFX_START),
    inc('hl'),
    inc('hl'),
    ld('a', [MEM.SFX_PRIO]),
    ld('b', 'a'),
    ld('a', ['hl']),
    dec('hl'),
    dec('hl'),
    cp('b'),
    jr('c', SFX_DONE), // a more important effect is playing
    label(SFX_START),
    // The VBlank handler skips the voice while PTR_HI is 0, so it never sees it half set
    xor('a'),
    ld([voiceField(SFX_VOICE, 'PTR_HI')], 'a'),
    ld('a', 'c'),
    ld([MEM.SFX_ID], 'a'),
    ld('a', ['hl+']),
    ld('e', 'a'),
    ld('a', ['hl+']),
    ld('d', 'a'),
    ld('a', ['hl']),
    ld([MEM.SFX_PRIO], 'a'),
    ld('a', 'e'),
    ld([voiceField(SFX_VOICE, 'PTR_LO')], 'a'),
    ld([voiceField(SFX_VOICE, 'START_LO')], 'a'),
    ld('a', 'd'),
    ld([voiceField(SFX_VOICE, 'START_HI')], 'a'),
    ld('a', 1),
    ld([voiceField(SFX_VOICE, 'TIMER')], 'a'), // the first step plays on the next frame
    ld('a', 'd'),
    ld([voiceField(SFX_VOICE, 'PTR_HI')], 'a'),
    label(SFX_DONE),
    pop('hl'),
    pop('de'),
    pop('bc'),
    ret(),

    // music_play: A = song ID (MUSIC_NONE: silence); does nothing if it's playing.
    // Clobbers A, preserves BC, DE, HL.
    label(MUSIC_PLAY),
    push('bc'),
    push('de'),
    push('hl'),
    ld('hl', MEM.MUSIC_ID),
    cp(['hl']),
    jr('z', MUSIC_DONE),
    ld(['hl'], 'a'),
    ld('c', 'a'),
    // Stop both music voices and quiet their channels
    xor('a'),
    ld([voiceField(0, 'PTR_HI')], 'a'),
    ld([voiceField(1, 'PTR_HI')], 'a'),
    ldh([ioReg(0x17)], 'a'), // NR22: channel 2's volume
    ldh([ioReg(0x1c)], 'a'), // NR32: channel 3's output level
    ld('a', 'c'),
    or('a'),
    jr('z', MUSIC_DONE),
    // HL = the song's two sequence addresses (4 bytes per song, from ID 1)
    dec('a'),
    add('a'),
    add('a'),
    ld('e', 'a'),
    ld('d', 0),
    ld('hl', MUSIC_TABLE),
    add('hl', 'de'),
    ...[0, 1].flatMap((voice) => [
      ld('a', ['hl+']),
      ld('e', 'a'),
      ld('a', ['hl+']),
      ld('d', 'a'),
      ld('a', 'e'),
      ld([voiceField(voice, 'PTR_LO')], 'a'),
      ld([voiceField(voice, 'START_LO')], 'a'),
      ld('a', 'd'),
      ld([voiceField(voice, 'START_HI')], 'a'),
      ld('a', 1),
      ld([voiceField(voice, 'TIMER')], 'a'),
      ld('a', 'd'),
      ld([voiceField(voice, 'PTR_HI')], 'a'), // last: the voice starts now
    ]),
    label(MUSIC_DONE),
    pop('hl'),
    pop('de'),
    pop('bc'),
    ret(),
  ];
}

/** The note table, waveform and sound effect sequences */
export function buildSoundData(): Op[] {
  const periods = notePeriods();
  return [
    label(NOTE_PERIODS),
    db(periods.flatMap((p) => [p & 0xff, p >> 8])),
    label(WAVE_DATA),
    db(WAVE),
    // Effect n is at entry n (entry 0, SFX_NONE, is never played)
    label(SFX_TABLE),
    db([0, 0, 0]),
    ...SFX_NAMES.flatMap((name) => [dw(sfxData(name)), db([SFX[name].priority])]),
    ...SFX_NAMES.flatMap((name) => [label(sfxData(name)), db(encodeSequence(SFX[name].sequence))]),
    // Song n is at entry n - 1: melody, then bass
    label(MUSIC_TABLE),
    ...SONG_NAMES.flatMap((name) => [dw(songMelody(name)), dw(songBass(name))]),
    ...SONG_NAMES.flatMap((name) => [
      label(songMelody(name)),
      db(encodeSequence(SONGS[name].melody)),
      label(songBass(name)),
      db(encodeSequence(SONGS[name].bass)),
    ]),
  ];
}

export const soundModule = gameModule({
  name: 'sound',
  init: buildSoundInit,
  code: buildSoundDriver,
  data: buildSoundData,
});
