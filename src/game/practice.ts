/**
 * Practice (れんしゅう): endless rounds of five questions from the title menu, each on a
 * kana the player has missed (or any kana, once nothing is missed). A right answer
 * clears the miss; nothing costs hearts or points; B goes back to the title. The
 * speed round before the ending also asks about missed kana first.
 *
 * Every chart kana has one practice question, made at build time from the shortest
 * line of dialogue it appears in.
 */

import { HW, MEM } from '../asm/hardware';
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
import { type Op, ref, u8 } from '../asm/types';
import { storeByte, zeroBytes } from '../asm/macros';
import { CHART_KANA } from './chart';
import { type KanaQuestion, MAX_KANA_WORD_LENGTH, buildKanaData } from './kana';
import { distractorsFor, phrasesOf } from './quiz';
import { SCENES, SPEED_ROUND } from './scene';
import { KanaMode, MAX_LIVES } from './state';
import { fadeOut, screenOff } from './video';

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
  return [
    label('practice_table'),
    ...questions.map((_, i) => dw(ref(`practice_q${String(i)}`))),
    ...questions.flatMap((q, i) => [
      label(`practice_q${String(i)}`),
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
export function buildPracticeRoutines(speedRound: string): Op[] {
  const speedLength = SPEED_ROUND.length;
  return [
    label('practice_rand'),
    ldh_a_n(HW.DIV),
    ld_r_r('b', 'a'),
    ld_a_nn(MEM.PRACTICE_SEED),
    add_r('b'),
    add_r('a'),
    inc_r('a'),
    ld_nn_a(MEM.PRACTICE_SEED),
    label('practice_mod'),
    cp_n(u8(KANA_COUNT)),
    ret_cc('c'),
    sub_n(u8(KANA_COUNT)),
    jr(ref('practice_mod')),

    label('practice_pick'),
    ld_a_nn(MEM.PRACTICE_NEXT),
    ld_r_r('c', 'a'),
    ld_r_n('d', u8(KANA_COUNT)),
    label('practice_scan'),
    ld_r_r('a', 'c'),
    push('hl'),
    push('de'), // chart_bit uses DE (D counts the entries left to look at)
    ld_rr_nn('hl', MEM.KANA_MISSED),
    call(ref('chart_bit')),
    ld_r_r('a', 'hl_ptr'),
    pop('de'),
    pop('hl'),
    and_r('b'),
    jr_cc('nz', ref('practice_found')),
    inc_r('c'),
    ld_r_r('a', 'c'),
    cp_n(u8(KANA_COUNT)),
    jr_cc('c', ref('practice_scan_next')),
    ld_r_n('c', u8(0)),
    label('practice_scan_next'),
    dec_r('d'),
    jr_cc('nz', ref('practice_scan')),
    jr(ref('practice_rand')), // nothing missed: any kana
    label('practice_found'),
    ld_r_r('a', 'c'),
    inc_r('a'),
    cp_n(u8(KANA_COUNT)),
    jr_cc('c', ref('practice_next_ok')),
    xor_r('a'),
    label('practice_next_ok'),
    ld_nn_a(MEM.PRACTICE_NEXT),
    ld_r_r('a', 'c'),
    ret(),

    // practice_copy: DE = entry A's question in ROM, then copy it
    label('practice_copy'),
    push('hl'),
    add_r('a'),
    ld_r_r('e', 'a'),
    ld_r_n('d', u8(0)),
    ld_rr_nn('hl', ref('practice_table')),
    add_hl_rr('de'),
    ldi_a_hl(),
    ld_r_r('e', 'a'),
    ld_r_r('d', 'hl_ptr'),
    pop('hl'),
    // question_copy: copy the question at DE to HL (1 + word + 5 bytes), moving both past it
    label('question_copy'),
    ld_a_de(),
    and_n(u8(0x7f)), // the word's length (bit 7: a katakana question)
    add_n(u8(6)),
    ld_r_r('b', 'a'),
    label('question_copy_byte'),
    ld_a_de(),
    inc_rr('de'),
    ldi_hl_a(),
    dec_r('b'),
    jr_cc('nz', ref('question_copy_byte')),
    ret(),

    label('practice_fill'),
    ld_rr_nn('hl', MEM.PRACTICE_BUF),
    ld_r_n('b', u8(PRACTICE_ROUND)),
    label('practice_fill_next'),
    push('bc'),
    push('hl'),
    call(ref('practice_pick')),
    pop('hl'),
    call(ref('practice_copy')),
    pop('bc'),
    dec_r('b'),
    jr_cc('nz', ref('practice_fill_next')),
    ld_hl_n(u8(0)),
    ret(),

    label('speed_fill'),
    // C = the missed kana, at most the round's length
    ld_rr_nn('hl', MEM.KANA_MISSED),
    ld_r_n('c', u8(0)),
    ld_r_n('d', u8(6)),
    label('speed_count_byte'),
    ldi_a_hl(),
    label('speed_count_bit'),
    or_r('a'),
    jr_cc('z', ref('speed_count_next')),
    srl('a'),
    jr_cc('nc', ref('speed_count_bit')),
    inc_r('c'),
    jr(ref('speed_count_bit')),
    label('speed_count_next'),
    dec_r('d'),
    jr_cc('nz', ref('speed_count_byte')),
    ld_r_r('a', 'c'),
    cp_n(u8(speedLength)),
    jr_cc('c', ref('speed_count_ok')),
    ld_r_n('c', u8(speedLength)),
    label('speed_count_ok'),
    // The missed ones first
    ld_rr_nn('hl', MEM.PRACTICE_BUF),
    ld_r_r('a', 'c'),
    or_r('a'),
    jr_cc('z', ref('speed_fill_rest')),
    ld_r_r('b', 'a'),
    label('speed_fill_missed'),
    push('bc'),
    push('hl'),
    call(ref('practice_pick')),
    pop('hl'),
    call(ref('practice_copy')),
    pop('bc'),
    dec_r('b'),
    jr_cc('nz', ref('speed_fill_missed')),
    // Then the round's own questions, up to its length
    label('speed_fill_rest'),
    ld_r_r('a', 'c'),
    sub_n(u8(speedLength)),
    jr_cc('z', ref('speed_fill_end')),
    cpl(),
    inc_r('a'), // A = the round's length - C
    ld_r_r('c', 'a'),
    ld_rr_nn('de', ref(speedRound)),
    label('speed_fill_own'),
    push('bc'),
    call(ref('question_copy')),
    pop('bc'),
    dec_r('c'),
    jr_cc('nz', ref('speed_fill_own')),
    label('speed_fill_end'),
    ld_hl_n(u8(0)),
    ret(),
  ];
}

/** practice_start: the practice loop, from the title menu; B leads back to the title */
export function buildPracticeLoop(): Op[] {
  return [
    label('practice_start'),
    ...zeroBytes(
      MEM.KANA_SCORE_LO,
      MEM.KANA_SCORE_HI,
      MEM.DELTA_TYPE,
      MEM.DELTA_TIMER,
      MEM.KANA_STREAK,
      MEM.PRACTICE_QUIT,
    ),
    ...storeByte(MEM.KANA_LIVES, MAX_LIVES),
    call(ref('practice_rand')),
    ld_nn_a(MEM.PRACTICE_NEXT),
    label('practice_loop'),
    call(ref('practice_fill')),
    ...storeByte(MEM.KANA_MODE, KanaMode.PRACTICE),
    ld_rr_nn('de', MEM.PRACTICE_BUF),
    call(ref('play_round')),
    ld_a_nn(MEM.PRACTICE_QUIT),
    or_r('a'),
    jr_cc('z', ref('practice_loop')),
    ...fadeOut(),
    ...screenOff('practice_to_title'),
    jp(ref('title_screen')),
  ];
}
