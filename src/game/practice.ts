/**
 * Practice (れんしゅう): endless rounds of five questions from the title menu, each on a
 * kana the player has missed (or any kana, once nothing is missed). A right answer
 * clears the miss; nothing costs hearts or points; B goes back to the title. The
 * speed round before the ending also asks about missed kana first.
 *
 * Every chart kana has one practice question, made at build time from the shortest
 * line of dialogue it appears in.
 */

import { HW } from '../asm/hardware';
import { MEM } from './ram';
import {
  add_n,
  cpl,
  ld_hl_n,
  xor_r,
  add_hl_rr,
  add_r,
  and_n,
  and_r,
  call,
  cp_n,
  db,
  dec_r,
  dw,
  inc_r,
  inc_rr,
  jp,
  jr,
  jr_cc,
  label,
  ld_a_de,
  ld_a_nn,
  ld_nn_a,
  ld_r_n,
  ld_r_r,
  ld_rr_nn,
  ldh_a_n,
  ldi_a_hl,
  ldi_hl_a,
  or_r,
  pop,
  push,
  ret,
  ret_cc,
  srl,
  sub_n,
} from '../asm/ops';
import { type Op, u8, Label } from '../asm/types';
import { at } from '../asm/util';
import { storeByte, zeroBytes } from '../asm/macros';
import { CHART_KANA } from './chart';
import { type KanaQuestion, MAX_KANA_WORD_LENGTH, buildKanaData } from './kana';
import { distractorsFor, phrasesOf } from './quiz';
import { SCENES, SPEED_ROUND } from './scene';
import { KanaMode, MAX_LIVES } from './state';
import { fadeOut, screenOff } from './video';
import {
  CHART_BIT,
  PLAY_ROUND,
  TITLE_SCREEN,
  PRACTICE_RAND,
  SPEED_FILL,
  PRACTICE_START,
} from './labels';

// Labels placed in this module
const PRACTICE_TABLE = new Label('practice_table');
const PRACTICE_MOD = new Label('practice_mod');
const PRACTICE_PICK = new Label('practice_pick');
const PRACTICE_SCAN = new Label('practice_scan');
const PRACTICE_SCAN_NEXT = new Label('practice_scan_next');
const PRACTICE_FOUND = new Label('practice_found');
const PRACTICE_NEXT_OK = new Label('practice_next_ok');
const PRACTICE_COPY = new Label('practice_copy');
const QUESTION_COPY = new Label('question_copy');
const QUESTION_COPY_BYTE = new Label('question_copy_byte');
const PRACTICE_FILL = new Label('practice_fill');
const PRACTICE_FILL_NEXT = new Label('practice_fill_next');
const SPEED_COUNT_BYTE = new Label('speed_count_byte');
const SPEED_COUNT_BIT = new Label('speed_count_bit');
const SPEED_COUNT_NEXT = new Label('speed_count_next');
const SPEED_COUNT_OK = new Label('speed_count_ok');
const SPEED_FILL_MISSED = new Label('speed_fill_missed');
const SPEED_FILL_REST = new Label('speed_fill_rest');
const SPEED_FILL_OWN = new Label('speed_fill_own');
const SPEED_FILL_END = new Label('speed_fill_end');
const PRACTICE_LOOP = new Label('practice_loop');

/** Words for kana no line of dialogue has */
const FALLBACK_WORDS: Readonly<Record<string, string>> = { ぬ: 'いぬ' };

/** Questions in a practice round */
export const PRACTICE_ROUND = 5;
const KANA_COUNT = Array.from(CHART_KANA).length;

/** The practice question for a kana: the shortest phrase it's in, with it blanked */
export function practiceQuestionFor(kana: string, phrases: readonly string[]): KanaQuestion {
  const fits = phrases
    .filter((p) => p.includes(kana) && Array.from(p).length <= MAX_KANA_WORD_LENGTH)
    .sort((a, b) => Array.from(a).length - Array.from(b).length);
  const word = fits[0] ?? FALLBACK_WORDS[kana];
  if (word === undefined) throw new Error(`No word to practice ${kana} with`);
  // Look-alikes first; kana with too few (や: ゆ, よ) borrow the ones after it in the chart
  const chart = Array.from(CHART_KANA);
  const after = chart.slice(chart.indexOf(kana) + 1).concat(chart);
  const options = [...new Set([...distractorsFor(kana), ...after])].filter((k) => k !== kana);
  // (always three or more: it can borrow from the whole chart)
  const distractors = options.slice(0, 3) as [string, string, string];
  return { word, blankIndex: Array.from(word).indexOf(kana), correct: kana, distractors };
}

/** The practice questions, in chart order */
export function practiceQuestions(): KanaQuestion[] {
  const phrases = SCENES.flatMap((scene) => phrasesOf(scene.dialogue));
  return Array.from(CHART_KANA, (kana) => practiceQuestionFor(kana, phrases));
}

export function buildPracticeData(): Op[] {
  const questions = practiceQuestions();
  const labels = questions.map((_, i) => new Label(`practice_q${String(i)}`));
  return [
    label(PRACTICE_TABLE),
    ...labels.map((l) => dw(l)),
    ...questions.flatMap((q, i) => [
      label(at(labels, i)),
      db(buildKanaData([q]).slice(0, -1)), // one question, without the list's end
    ]),
  ];
}

/**
 * practice_rand   A = a random chart entry
 * practice_pick   A = the next missed entry from PRACTICE_NEXT on (or a random one if
 *                 none is missed); PRACTICE_NEXT moves past it
 * practice_copy   copy entry A's question to HL, moving HL past it
 * practice_fill   PRACTICE_BUF = PRACTICE_ROUND picked questions, then the end
 * speed_fill      PRACTICE_BUF = a question per missed kana (up to the speed round's
 *                 length), then the speed round's own questions to fill it, then the end
 */
export function buildPracticeRoutines(speedRound: Label): Op[] {
  const speedLength = SPEED_ROUND.length;
  return [
    label(PRACTICE_RAND),
    ldh_a_n(HW.DIV),
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.PRACTICE_SEED),
    add_r('b'),
    add_r('a'),
    inc_r('a'),
    ld_nn_a(MEM.PRACTICE_SEED),
    label(PRACTICE_MOD),
    cp_n(u8(KANA_COUNT)),
    ret_cc('c'),
    sub_n(u8(KANA_COUNT)),
    jr(PRACTICE_MOD),

    label(PRACTICE_PICK),
    ld_a_nn(MEM.PRACTICE_NEXT),
    ld_r_r('c', 'a'),
    ld_r_n('d', u8(KANA_COUNT)),
    label(PRACTICE_SCAN),
    ld_r_r('a', 'c'),
    push('hl'),
    push('de'), // chart_bit uses DE (D counts the entries left to look at)
    ld_rr_nn('hl', MEM.KANA_MISSED.address),
    call(CHART_BIT),
    ld_r_r('a', 'hl_ptr'),
    pop('de'),
    pop('hl'),
    and_r('b'),
    jr_cc('nz', PRACTICE_FOUND),
    inc_r('c'),
    ld_r_r('a', 'c'),
    cp_n(u8(KANA_COUNT)),
    jr_cc('c', PRACTICE_SCAN_NEXT),
    ld_r_n('c', u8(0)),
    label(PRACTICE_SCAN_NEXT),
    dec_r('d'),
    jr_cc('nz', PRACTICE_SCAN),
    jr(PRACTICE_RAND), // nothing missed: any kana
    label(PRACTICE_FOUND),
    ld_r_r('a', 'c'),
    inc_r('a'),
    cp_n(u8(KANA_COUNT)),
    jr_cc('c', PRACTICE_NEXT_OK),
    xor_r('a'),
    label(PRACTICE_NEXT_OK),
    ld_nn_a(MEM.PRACTICE_NEXT),
    ld_r_r('a', 'c'),
    ret(),

    // practice_copy: DE = entry A's question in ROM, then copy it
    label(PRACTICE_COPY),
    push('hl'),
    add_r('a'),
    ld_r_r('e', 'a'),
    ld_r_n('d', u8(0)),
    ld_rr_nn('hl', PRACTICE_TABLE),
    add_hl_rr('de'),
    ldi_a_hl(),
    ld_r_r('e', 'a'),
    ld_r_r('d', 'hl_ptr'),
    pop('hl'),
    // question_copy: copy the question at DE to HL (1 + word + 5 bytes), moving both past it
    label(QUESTION_COPY),
    ld_a_de(),
    and_n(u8(0x7f)), // the word's length (bit 7: a katakana question)
    add_n(u8(6)),
    ld_r_r('b', 'a'),
    label(QUESTION_COPY_BYTE),
    ld_a_de(),
    inc_rr('de'),
    ldi_hl_a(),
    dec_r('b'),
    jr_cc('nz', QUESTION_COPY_BYTE),
    ret(),

    label(PRACTICE_FILL),
    ld_rr_nn('hl', MEM.PRACTICE_BUF.address),
    ld_r_n('b', u8(PRACTICE_ROUND)),
    label(PRACTICE_FILL_NEXT),
    push('bc'),
    push('hl'),
    call(PRACTICE_PICK),
    pop('hl'),
    call(PRACTICE_COPY),
    pop('bc'),
    dec_r('b'),
    jr_cc('nz', PRACTICE_FILL_NEXT),
    ld_hl_n(u8(0)),
    ret(),

    label(SPEED_FILL),
    // C = the missed kana, at most the round's length
    ld_rr_nn('hl', MEM.KANA_MISSED.address),
    ld_r_n('c', u8(0)),
    ld_r_n('d', u8(6)),
    label(SPEED_COUNT_BYTE),
    ldi_a_hl(),
    label(SPEED_COUNT_BIT),
    or_r('a'),
    jr_cc('z', SPEED_COUNT_NEXT),
    srl('a'),
    jr_cc('nc', SPEED_COUNT_BIT),
    inc_r('c'),
    jr(SPEED_COUNT_BIT),
    label(SPEED_COUNT_NEXT),
    dec_r('d'),
    jr_cc('nz', SPEED_COUNT_BYTE),
    ld_r_r('a', 'c'),
    cp_n(u8(speedLength)),
    jr_cc('c', SPEED_COUNT_OK),
    ld_r_n('c', u8(speedLength)),
    label(SPEED_COUNT_OK),
    // The missed ones first
    ld_rr_nn('hl', MEM.PRACTICE_BUF.address),
    ld_r_r('a', 'c'),
    or_r('a'),
    jr_cc('z', SPEED_FILL_REST),
    ld_r_r('b', 'a'),
    label(SPEED_FILL_MISSED),
    push('bc'),
    push('hl'),
    call(PRACTICE_PICK),
    pop('hl'),
    call(PRACTICE_COPY),
    pop('bc'),
    dec_r('b'),
    jr_cc('nz', SPEED_FILL_MISSED),
    // Then the round's own questions, up to its length
    label(SPEED_FILL_REST),
    ld_r_r('a', 'c'),
    sub_n(u8(speedLength)),
    jr_cc('z', SPEED_FILL_END),
    cpl(),
    inc_r('a'), // A = the round's length - C
    ld_r_r('c', 'a'),
    ld_rr_nn('de', speedRound),
    label(SPEED_FILL_OWN),
    push('bc'),
    call(QUESTION_COPY),
    pop('bc'),
    dec_r('c'),
    jr_cc('nz', SPEED_FILL_OWN),
    label(SPEED_FILL_END),
    ld_hl_n(u8(0)),
    ret(),
  ];
}

/** practice_start: the practice loop, from the title menu; B leads back to the title */
export function buildPracticeLoop(): Op[] {
  return [
    label(PRACTICE_START),
    ...zeroBytes(
      MEM.KANA_SCORE.lo,
      MEM.KANA_SCORE.hi,
      MEM.DELTA_TYPE,
      MEM.DELTA_TIMER,
      MEM.KANA_STREAK,
      MEM.PRACTICE_QUIT,
    ),
    ...storeByte(MEM.KANA_LIVES, MAX_LIVES),
    call(PRACTICE_RAND),
    ld_nn_a(MEM.PRACTICE_NEXT),
    label(PRACTICE_LOOP),
    call(PRACTICE_FILL),
    ...storeByte(MEM.KANA_MODE, KanaMode.PRACTICE),
    ld_rr_nn('de', MEM.PRACTICE_BUF.address),
    call(PLAY_ROUND),
    ld_a_nn(MEM.PRACTICE_QUIT),
    or_r('a'),
    jr_cc('z', PRACTICE_LOOP),
    ...fadeOut(),
    ...screenOff(),
    jp(TITLE_SCREEN),
  ];
}
