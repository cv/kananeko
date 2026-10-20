/**
 * Practice (れんしゅう): endless rounds of five questions from the title menu, each on a
 * kana the player has missed (or any kana, once nothing is missed). A right answer
 * clears the miss; nothing costs hearts or points; B goes back to the title. The
 * speed round before the ending also asks about missed kana first.
 *
 * Every chart kana has one practice question, made at build time from the shortest
 * line of dialogue it appears in.
 */

import { doWhile, ifThen, loop, repeat } from '../asm/flow';
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
  invoke,
} from '../asm/sm83';
import { type Op, Label, routine } from '../asm/types';
import { at } from '../asm/util';
import { storeByte, tableEntry, zeroBytes } from '../asm/macros';
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
const PRACTICE_PICK = routine('practice_pick', { out: ['a'], clobbers: ['d', 'bc'] });
const PRACTICE_COPY = routine('practice_copy', {
  in: ['a', 'hl'],
  out: ['hl'],
  clobbers: ['a', 'b', 'de'],
});
const QUESTION_COPY = routine('question_copy', {
  in: ['de', 'hl'],
  out: ['de', 'hl'],
  clobbers: ['a', 'b'],
});
const PRACTICE_FILL = routine('practice_fill', { clobbers: ['a', 'b', 'de', 'hl'] });

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
  const found = new Label('practice_found');
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
    ...loop((again) => [cp(KANA_COUNT), ret('c'), sub(KANA_COUNT), jr(again)]),

    label(PRACTICE_PICK),
    ld('a', [MEM.PRACTICE_NEXT]),
    ld('c', 'a'),
    ...repeat(
      KANA_COUNT,
      [
        ld('a', 'c'),
        push('hl'),
        push('de'), // chart_bit uses DE (D counts the entries left to look at)
        ...invoke(CHART_BIT, { hl: MEM.KANA_MISSED.address, a: 'a' }),
        ld('a', ['hl']),
        pop('de'),
        pop('hl'),
        and('b'),
        jr('nz', found),
        inc('c'),
        ld('a', 'c'),
        cp(KANA_COUNT),
        ...ifThen('nc', [ld('c', 0)]),
      ],
      'd',
    ),
    jr(PRACTICE_RAND), // nothing missed: any kana
    label(found),
    ld('a', 'c'),
    inc('a'),
    cp(KANA_COUNT),
    ...ifThen('nc', [xor('a')]),
    ld([MEM.PRACTICE_NEXT], 'a'),
    ld('a', 'c'),
    ret(),

    // practice_copy: DE = entry A's question in ROM, then copy it
    label(PRACTICE_COPY),
    push('hl'),
    ...tableEntry(PRACTICE_TABLE, 2),
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
    ...doWhile('nz', [ld('a', ['de']), inc('de'), ld(['hl+'], 'a'), dec('b')]),
    ret(),

    label(PRACTICE_FILL),
    ld('hl', MEM.PRACTICE_BUF.address),
    ...repeat(PRACTICE_ROUND, [
      push('bc'),
      push('hl'),
      call(PRACTICE_PICK),
      pop('hl'),
      ...invoke(PRACTICE_COPY, { a: 'a', hl: 'hl' }),
      pop('bc'),
    ]),
    ld(['hl'], 0),
    ret(),

    label(SPEED_FILL),
    // C = the missed kana, at most the round's length
    ld('hl', MEM.KANA_MISSED.address),
    ld('c', 0),
    ...repeat(
      6,
      [
        ld('a', ['hl+']),
        ...loop((again, done) => [
          or('a'),
          jr('z', done),
          srl('a'),
          jr('nc', again),
          inc('c'),
          jr(again),
        ]),
      ],
      'd',
    ),
    ld('a', 'c'),
    cp(speedLength),
    ...ifThen('nc', [ld('c', speedLength)]),
    // The missed ones first
    ld('hl', MEM.PRACTICE_BUF.address),
    ld('a', 'c'),
    or('a'),
    ...ifThen('nz', [
      ld('b', 'a'),
      ...doWhile('nz', [
        push('bc'),
        push('hl'),
        call(PRACTICE_PICK),
        pop('hl'),
        ...invoke(PRACTICE_COPY, { a: 'a', hl: 'hl' }),
        pop('bc'),
        dec('b'),
      ]),
    ]),
    ld('a', 'c'),
    sub(speedLength),
    ...ifThen('nz', [
      cpl(),
      inc('a'), // A = the round's length - C
      ld('c', 'a'),
      ld('de', speedRound),
      ...doWhile('nz', [
        push('bc'),
        ...invoke(QUESTION_COPY, { de: 'de', hl: 'hl' }),
        pop('bc'),
        dec('c'),
      ]),
    ]),
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
    ...doWhile('z', [
      call(PRACTICE_FILL),
      ...storeByte(MEM.KANA_MODE, KanaMode.PRACTICE),
      ...invoke(PLAY_ROUND, { de: MEM.PRACTICE_BUF.address }),
      ld('a', [MEM.PRACTICE_QUIT]),
      or('a'),
    ]),
    ...fadeOut(),
    ...screenOff(),
    jp(TITLE_SCREEN),
  ];
}

export const practiceModule = gameModule({
  name: 'practice',
  code: () => [...buildPracticeRoutines(SPEED_ROUND_DATA), ...buildPracticeLoop()],
  data: () => [...buildPracticeData(), label(SPEED_ROUND_DATA), db(buildKanaData(SPEED_ROUND))],
});
