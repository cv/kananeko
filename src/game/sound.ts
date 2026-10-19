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

import { HW, MEM } from '../asm/hardware';
import {
  add_hl_rr,
  add_n,
  add_r,
  and_n,
  call,
  cp_n,
  cp_r,
  db,
  dec_r,
  dec_rr,
  dw,
  inc_r,
  inc_rr,
  jr,
  jr_cc,
  label,
  ld_a_de,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldh_c_a,
  ldh_n_a,
  ldi_a_hl,
  or_n,
  or_r,
  pop,
  push,
  ret,
  ret_cc,
  sub_n,
  xor_r,
} from '../asm/ops';
import { type Op, type U16, ioReg, ref, u16, u8 } from '../asm/types';
import { copyBytes, storeByte } from '../asm/macros';

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

const PITCH_CLASSES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'] as const;
const LOWEST_OCTAVE = 3;
const OCTAVES = 5;

/** Note names by note number: c3 (0) to b7 (59) */
export const NOTE_NAMES: readonly string[] = Array.from({ length: OCTAVES * 12 }, (_, n) => {
  return `${PITCH_CLASSES[n % 12] ?? ''}${String(LOWEST_OCTAVE + Math.floor(n / 12))}`;
});

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
  return [push('af'), ld_r_n('a', u8(songId(name))), call(ref('music_play')), pop('af')];
}

/** How many frames a sequence lasts, up to its end or loop */
export function sequenceFrames(source: string): number {
  let length = 0;
  let frames = 0;
  const bytes = encodeSequence(source);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? SEQ.END;
    if (b === SEQ.ENVELOPE || b === SEQ.DUTY) i++;
    else if (b >= SEQ.LENGTH && b < SEQ.ENVELOPE) length = b & MAX_LENGTH;
    else if (b <= SEQ.REST) frames += length;
  }
  return frames;
}

const SFX_NAMES = Object.keys(SFX) as SfxName[];

/** SFX_ID before any effect has played */
export const SFX_NONE = 0;

/** An effect's ID (1-based, so a cleared SFX_ID means none) */
export function sfxId(name: SfxName): number {
  return SFX_NAMES.indexOf(name) + 1;
}

/** Play a sound effect. Preserves every register and the flags. */
export function playSfx(name: SfxName): Op[] {
  return [push('af'), ld_r_n('a', u8(sfxId(name))), call(ref('sfx_play')), pop('af')];
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
  return u16(MEM.SND_VOICES + voice * VOICE_SIZE + VOICE[field]);
}

/** Channel 3's waveform: a soft, rounded triangle (32 4-bit samples) */
const WAVE = [
  0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
];

/** Turn the sound on, loud and centered, and load channel 3's waveform. */
export function buildSoundInit(): Op[] {
  return [
    ...storeByte(MEM.SFX_ID, SFX_NONE),
    ld_r_n('a', u8(0x80)),
    ldh_n_a(HW.NR52), // sound on (must come first)
    ld_r_n('a', u8(0x77)),
    ldh_n_a(HW.NR50), // full volume both sides
    ld_r_n('a', u8(0xff)),
    ldh_n_a(HW.NR51), // every channel on both sides
    xor_r('a'),
    ldh_n_a(HW.NR30), // the wave DAC must be off to load the waveform
    ...copyBytes('sound_wave_copy', u16(0xff00 + HW.WAVE_RAM), ref('wave_data'), WAVE.length),
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
    label('sound_tick'),
    ...VOICE_CHANNELS.flatMap((channel, voice) => [
      ld_rr_nn('hl', voiceField(voice, 'PTR_LO')),
      ld_r_n('c', u8(channel)),
      call(ref('voice_tick')),
    ]),
    ret(),

    // voice_tick: HL = voice, C = its channel's first register
    label('voice_tick'),
    inc_r('l'), // PTR_HI: 0 while idle
    ld_r_r('a', 'hl_ptr'),
    or_r('a'),
    ret_cc('z'),
    ld_r_r('d', 'a'),
    inc_r('l'), // TIMER
    dec_r('hl_ptr'),
    ret_cc('nz'),
    dec_r('l'),
    dec_r('l'),
    ld_r_r('e', 'hl_ptr'), // DE = the next step, HL = the voice

    label('voice_step'),
    ld_a_de(),
    inc_rr('de'),
    cp_n(u8(SEQ.LENGTH)),
    jr_cc('c', ref('voice_note')),
    ld_r_r('b', 'l'),
    cp_n(u8(SEQ.ENVELOPE)),
    jr_cc('c', ref('voice_length')),
    cp_n(u8(SEQ.LOOP)),
    jr_cc('z', ref('voice_loop')),
    jr_cc('nc', ref('voice_end')),
    // $C0 nn / $C1 nn: the ENVELOPE or DUTY field
    sub_n(u8(SEQ.ENVELOPE - VOICE.ENVELOPE)),
    add_r('l'),
    ld_r_r('l', 'a'),
    ld_a_de(),
    inc_rr('de'),
    jr(ref('voice_store')),

    label('voice_length'),
    and_n(u8(MAX_LENGTH)),
    ...Array.from({ length: VOICE.LENGTH }, () => inc_r('l')),
    label('voice_store'),
    ld_r_r('hl_ptr', 'a'),
    ld_r_r('l', 'b'),
    jr(ref('voice_step')),

    label('voice_loop'),
    ld_r_r('a', 'l'),
    add_n(u8(VOICE.START_LO)),
    ld_r_r('l', 'a'),
    ldi_a_hl(),
    ld_r_r('d', 'hl_ptr'),
    ld_r_r('e', 'a'),
    ld_r_r('l', 'b'),
    jr(ref('voice_step')),

    label('voice_end'),
    inc_r('l'),
    xor_r('a'),
    ld_r_r('hl_ptr', 'a'), // PTR_HI = 0: idle
    ret(),

    // A = a note or a rest: save the position, hold it for LENGTH frames, play it
    label('voice_note'),
    ld_r_r('b', 'a'),
    ld_r_r('hl_ptr', 'e'),
    inc_r('l'),
    ld_r_r('hl_ptr', 'd'),
    inc_r('l'),
    inc_r('l'), // LENGTH
    ld_r_r('a', 'hl_ptr'),
    dec_r('l'),
    ld_r_r('hl_ptr', 'a'), // TIMER = LENGTH
    inc_r('l'),
    inc_r('l'), // ENVELOPE
    ld_r_r('a', 'b'),
    cp_n(u8(SEQ.REST)),
    jr_cc('nz', ref('voice_play')),
    // A rest: zero volume (on the pulse channels this also turns the DAC off until
    // the next note restarts it)
    inc_r('c'),
    inc_r('c'),
    xor_r('a'),
    ldh_c_a(),
    ret(),

    label('voice_play'),
    // Register 0: off, then $80. Restarting the wave channel while it plays can
    // corrupt its waveform on a DMG, so its DAC goes off and on first; on channel 1
    // this turns the sweep off, and channel 2 has no register 0.
    xor_r('a'),
    ldh_c_a(),
    ld_r_n('a', u8(0x80)),
    ldh_c_a(),
    inc_r('c'),
    inc_r('l'),
    ld_r_r('a', 'hl_ptr'), // DUTY
    ldh_c_a(),
    inc_r('c'),
    dec_r('l'),
    ld_r_r('a', 'hl_ptr'), // ENVELOPE
    ldh_c_a(),
    inc_r('c'),
    ld_r_r('a', 'b'),
    add_r('a'),
    ld_r_r('e', 'a'),
    ld_r_n('d', u8(0)),
    ld_rr_nn('hl', ref('note_periods')),
    add_hl_rr('de'),
    ldi_a_hl(),
    ldh_c_a(), // period, low byte
    inc_r('c'),
    ld_r_r('a', 'hl_ptr'),
    or_n(u8(0x80)), // restart the note
    ldh_c_a(),
    ret(),

    // sfx_play: A = effect ID
    label('sfx_play'),
    push('bc'),
    push('de'),
    push('hl'),
    ld_r_r('c', 'a'),
    ld_rr_nn('hl', ref('sfx_table')),
    ld_r_n('b', u8(0)),
    add_hl_rr('bc'),
    add_hl_rr('bc'),
    add_hl_rr('bc'), // 3 bytes each: address, priority
    ld_a_nn(voiceField(SFX_VOICE, 'PTR_HI')),
    or_r('a'),
    jr_cc('z', ref('sfx_start')),
    inc_rr('hl'),
    inc_rr('hl'),
    ld_a_nn(MEM.SFX_PRIO),
    ld_r_r('b', 'a'),
    ld_r_r('a', 'hl_ptr'),
    dec_rr('hl'),
    dec_rr('hl'),
    cp_r('b'),
    jr_cc('c', ref('sfx_done')), // a more important effect is playing
    label('sfx_start'),
    // The VBlank handler skips the voice while PTR_HI is 0, so it never sees it half set
    xor_r('a'),
    ld_nn_a(voiceField(SFX_VOICE, 'PTR_HI')),
    ld_r_r('a', 'c'),
    ld_nn_a(MEM.SFX_ID),
    ldi_a_hl(),
    ld_r_r('e', 'a'),
    ldi_a_hl(),
    ld_r_r('d', 'a'),
    ld_r_r('a', 'hl_ptr'),
    ld_nn_a(MEM.SFX_PRIO),
    ld_r_r('a', 'e'),
    ld_nn_a(voiceField(SFX_VOICE, 'PTR_LO')),
    ld_nn_a(voiceField(SFX_VOICE, 'START_LO')),
    ld_r_r('a', 'd'),
    ld_nn_a(voiceField(SFX_VOICE, 'START_HI')),
    ld_r_n('a', u8(1)),
    ld_nn_a(voiceField(SFX_VOICE, 'TIMER')), // the first step plays on the next frame
    ld_r_r('a', 'd'),
    ld_nn_a(voiceField(SFX_VOICE, 'PTR_HI')),
    label('sfx_done'),
    pop('hl'),
    pop('de'),
    pop('bc'),
    ret(),

    // music_play: A = song ID (MUSIC_NONE: silence); does nothing if it's playing.
    // Clobbers A, preserves BC, DE, HL.
    label('music_play'),
    push('bc'),
    push('de'),
    push('hl'),
    ld_rr_nn('hl', MEM.MUSIC_ID),
    cp_r('hl_ptr'),
    jr_cc('z', ref('music_done')),
    ld_r_r('hl_ptr', 'a'),
    ld_r_r('c', 'a'),
    // Stop both music voices and quiet their channels
    xor_r('a'),
    ld_nn_a(voiceField(0, 'PTR_HI')),
    ld_nn_a(voiceField(1, 'PTR_HI')),
    ldh_n_a(ioReg(0x17)), // NR22: channel 2's volume
    ldh_n_a(ioReg(0x1c)), // NR32: channel 3's output level
    ld_r_r('a', 'c'),
    or_r('a'),
    jr_cc('z', ref('music_done')),
    // HL = the song's two sequence addresses (4 bytes per song, from ID 1)
    dec_r('a'),
    add_r('a'),
    add_r('a'),
    ld_r_r('e', 'a'),
    ld_r_n('d', u8(0)),
    ld_rr_nn('hl', ref('music_table')),
    add_hl_rr('de'),
    ...[0, 1].flatMap((voice) => [
      ldi_a_hl(),
      ld_r_r('e', 'a'),
      ldi_a_hl(),
      ld_r_r('d', 'a'),
      ld_r_r('a', 'e'),
      ld_nn_a(voiceField(voice, 'PTR_LO')),
      ld_nn_a(voiceField(voice, 'START_LO')),
      ld_r_r('a', 'd'),
      ld_nn_a(voiceField(voice, 'START_HI')),
      ld_r_n('a', u8(1)),
      ld_nn_a(voiceField(voice, 'TIMER')),
      ld_r_r('a', 'd'),
      ld_nn_a(voiceField(voice, 'PTR_HI')), // last: the voice starts now
    ]),
    label('music_done'),
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
    label('note_periods'),
    db(periods.flatMap((p) => [p & 0xff, p >> 8])),
    label('wave_data'),
    db(WAVE),
    // Effect n is at entry n (entry 0, SFX_NONE, is never played)
    label('sfx_table'),
    db([0, 0, 0]),
    ...SFX_NAMES.flatMap((name) => [dw(ref(`sfx_data_${name}`)), db([SFX[name].priority])]),
    ...SFX_NAMES.flatMap((name) => [
      label(`sfx_data_${name}`),
      db(encodeSequence(SFX[name].sequence)),
    ]),
    // Song n is at entry n - 1: melody, then bass
    label('music_table'),
    ...SONG_NAMES.flatMap((name) => [dw(ref(`song_${name}_melody`)), dw(ref(`song_${name}_bass`))]),
    ...SONG_NAMES.flatMap((name) => [
      label(`song_${name}_melody`),
      db(encodeSequence(SONGS[name].melody)),
      label(`song_${name}_bass`),
      db(encodeSequence(SONGS[name].bass)),
    ]),
  ];
}
