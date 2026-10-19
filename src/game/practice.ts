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
  add,
  cpl,
  ld,
  xor,
  and,
  call,
  cp,
  db,
  dec,
  dw,
  inc,
  jp,
  jr,
  label,
  ldh,
  or,
  pop,
  push,
  ret,
  srl,
  sub,
} from '../asm/sm83';
import { type Op, Label, routine } from '../asm/types';
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
import { gameModule } from '../asm/program';
import { SPEED_ROUND_DATA } from './labels';

// Labels placed in this module
const PRACTICE_TABLE = new Label('practice_table');
const PRACTICE_MOD = new Label('practice_mod');
const PRACTICE_PICK = routine('practice_pick', { clobbers: ['a', 'd', 'bc'] });
const PRACTICE_SCAN = new Label('practice_scan');
const PRACTICE_SCAN_NEXT = new Label('practice_scan_next');
const PRACTICE_FOUND = new Label('practice_found');
const PRACTICE_NEXT_OK = new Label('practice_next_ok');
const PRACTICE_COPY = routine('practice_copy', { out: ['hl'], clobbers: ['a', 'b', 'de'] });
const QUESTION_COPY = routine('question_copy', { out: ['hl'], clobbers: ['a', 'b', 'de'] });
const QUESTION_COPY_BYTE = new Label('question_copy_byte');
const PRACTICE_FILL = routine('practice_fill', { clobbers: ['a', 'b', 'de', 'hl'] });
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
    ldh('a', [HW.DIV]),
    ld('b', 'a'),
    ld('a', [MEM.PRACTICE_SEED]),
    add('b'),
    add('a'),
    inc('a'),
    ld([MEM.PRACTICE_SEED], 'a'),
    label(PRACTICE_MOD),
    cp(KANA_COUNT),
    ret('c'),
    sub(KANA_COUNT),
    jr(PRACTICE_MOD),

    label(PRACTICE_PICK),
    ld('a', [MEM.PRACTICE_NEXT]),
    ld('c', 'a'),
    ld('d', KANA_COUNT),
    label(PRACTICE_SCAN),
    ld('a', 'c'),
    push('hl'),
    push('de'), // chart_bit uses DE (D counts the entries left to look at)
    ld('hl', MEM.KANA_MISSED.address),
    call(CHART_BIT),
    ld('a', ['hl']),
    pop('de'),
    pop('hl'),
    and('b'),
    jr('nz', PRACTICE_FOUND),
    inc('c'),
    ld('a', 'c'),
    cp(KANA_COUNT),
    jr('c', PRACTICE_SCAN_NEXT),
    ld('c', 0),
    label(PRACTICE_SCAN_NEXT),
    dec('d'),
    jr('nz', PRACTICE_SCAN),
    jr(PRACTICE_RAND), // nothing missed: any kana
    label(PRACTICE_FOUND),
    ld('a', 'c'),
    inc('a'),
    cp(KANA_COUNT),
    jr('c', PRACTICE_NEXT_OK),
    xor('a'),
    label(PRACTICE_NEXT_OK),
    ld([MEM.PRACTICE_NEXT], 'a'),
    ld('a', 'c'),
    ret(),

    // practice_copy: DE = entry A's question in ROM, then copy it
    label(PRACTICE_COPY),
    push('hl'),
    add('a'),
    ld('e', 'a'),
    ld('d', 0),
    ld('hl', PRACTICE_TABLE),
    add('hl', 'de'),
    ld('a', ['hl+']),
    ld('e', 'a'),
    ld('d', ['hl']),
    pop('hl'),
    // question_copy: copy the question at DE to HL (1 + word + 5 bytes), moving both past it
    label(QUESTION_COPY),
    ld('a', ['de']),
    and(0x7f), // the word's length (bit 7: a katakana question)
    add(6),
    ld('b', 'a'),
    label(QUESTION_COPY_BYTE),
    ld('a', ['de']),
    inc('de'),
    ld(['hl+'], 'a'),
    dec('b'),
    jr('nz', QUESTION_COPY_BYTE),
    ret(),

    label(PRACTICE_FILL),
    ld('hl', MEM.PRACTICE_BUF.address),
    ld('b', PRACTICE_ROUND),
    label(PRACTICE_FILL_NEXT),
    push('bc'),
    push('hl'),
    call(PRACTICE_PICK),
    pop('hl'),
    call(PRACTICE_COPY),
    pop('bc'),
    dec('b'),
    jr('nz', PRACTICE_FILL_NEXT),
    ld(['hl'], 0),
    ret(),

    label(SPEED_FILL),
    // C = the missed kana, at most the round's length
    ld('hl', MEM.KANA_MISSED.address),
    ld('c', 0),
    ld('d', 6),
    label(SPEED_COUNT_BYTE),
    ld('a', ['hl+']),
    label(SPEED_COUNT_BIT),
    or('a'),
    jr('z', SPEED_COUNT_NEXT),
    srl('a'),
    jr('nc', SPEED_COUNT_BIT),
    inc('c'),
    jr(SPEED_COUNT_BIT),
    label(SPEED_COUNT_NEXT),
    dec('d'),
    jr('nz', SPEED_COUNT_BYTE),
    ld('a', 'c'),
    cp(speedLength),
    jr('c', SPEED_COUNT_OK),
    ld('c', speedLength),
    label(SPEED_COUNT_OK),
    // The missed ones first
    ld('hl', MEM.PRACTICE_BUF.address),
    ld('a', 'c'),
    or('a'),
    jr('z', SPEED_FILL_REST),
    ld('b', 'a'),
    label(SPEED_FILL_MISSED),
    push('bc'),
    push('hl'),
    call(PRACTICE_PICK),
    pop('hl'),
    call(PRACTICE_COPY),
    pop('bc'),
    dec('b'),
    jr('nz', SPEED_FILL_MISSED),
    // Then the round's own questions, up to its length
    label(SPEED_FILL_REST),
    ld('a', 'c'),
    sub(speedLength),
    jr('z', SPEED_FILL_END),
    cpl(),
    inc('a'), // A = the round's length - C
    ld('c', 'a'),
    ld('de', speedRound),
    label(SPEED_FILL_OWN),
    push('bc'),
    call(QUESTION_COPY),
    pop('bc'),
    dec('c'),
    jr('nz', SPEED_FILL_OWN),
    label(SPEED_FILL_END),
    ld(['hl'], 0),
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
    ld([MEM.PRACTICE_NEXT], 'a'),
    label(PRACTICE_LOOP),
    call(PRACTICE_FILL),
    ...storeByte(MEM.KANA_MODE, KanaMode.PRACTICE),
    ld('de', MEM.PRACTICE_BUF.address),
    call(PLAY_ROUND),
    ld('a', [MEM.PRACTICE_QUIT]),
    or('a'),
    jr('z', PRACTICE_LOOP),
    ...fadeOut(),
    ...screenOff(),
    jp(TITLE_SCREEN),
  ];
}

export const practiceModule = gameModule({
  name: 'practice',
  code: () => [...buildPracticeRoutines(SPEED_ROUND_DATA), ...buildPracticeLoop()],
  data: buildPracticeData,
});
