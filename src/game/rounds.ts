/**
 * When kana rounds happen: a short round about what was just said each time a
 * conversation ends, and the scene's review round when its dialogue is over. Its
 * routines (roundsModule) find and play them.
 *
 * ROM layout of a scene's rounds (see buildRoundsData):
 *   count
 *   count × [node, offset lo, offset hi]   node that triggers the round (END_OF_CONVERSATION = scene end);
 *                                          offset of its question list from the start of this data
 *   question lists (see buildKanaData)
 */

import { ifElse, loop } from '../asm/flow';
import { loadPointer, storeByte, zeroBytes } from '../asm/macros';
import { gameModule } from '../asm/program';
import {
  add,
  and,
  call,
  cp,
  dec,
  inc,
  invoke,
  jr,
  label,
  ld,
  or,
  pop,
  push,
  ret,
  sla,
  xor,
} from '../asm/sm83';
import { Label, type Op, routine, type U16 } from '../asm/types';
import { hi, lo } from '../asm/util';
import type { DialogueNode } from './dialogue';
import { choiceRating } from './dialogue-data';
import { CAT_TILES } from './font-data';
import { buildKanaData, type KanaQuestion } from './kana';
import {
  CAT_TICK,
  HUD_UPDATE,
  JOY_READ,
  KANA_START,
  KANA_UPDATE,
  NPC_HIDE,
  PLAY_ROUND,
} from './labels';
import { generateQuestions, matchQuestionFor, phrasesOf, type QuizHistory } from './quiz';
import { MEM } from './ram';
import type { SceneCast } from './scenes/npcs';
import { runDma } from './sprites';
import { BAD_PICK, END_OF_CONVERSATION, KanaMode, MAX_LIVES } from './state';
import { frameWait } from './video';

/** Rounds per scene are tracked in one byte of "already played" flags */
export const MAX_ROUNDS = 8;

export interface KanaCheckpoint {
  /** The round runs when the dialogue reaches this node, before it opens (or at the scene's end) */
  readonly at: number;
  readonly questions: readonly KanaQuestion[];
}

/** The first node after each conversation, except the last one (which ends the scene) */
export function conversationBreaks(cast: SceneCast): number[] {
  return cast.segments
    .filter((segment, i) => segment.from > 0 && (cast.segments[i - 1]?.npc ?? null) !== null)
    .map((segment) => segment.from);
}

/** Questions in each round between conversations */
export const QUESTIONS_PER_BREAK = 2;

/** Chances key bit marking a redemption (the rest of the key is the node of the bad answer) */
export const REDEEM_KEY = 0x80;

export interface QuizPlan {
  /** A round after each conversation, then the review at the end */
  readonly rounds: readonly KanaCheckpoint[];
  /** One-question rounds keyed by the node a choice was made at (see REDEEM_KEY) */
  readonly chances: readonly KeyedQuestions[];
  /** The dialogue as packed: each fill-in reply shows its blank */
  readonly dialogue: readonly DialogueNode[];
}

/** The tile shown in place of the kana to fill in */
export const FILL_IN_BLANK = CAT_TILES.BLANK;

/**
 * Plan a scene's kana: a round after each conversation asking about phrases from it,
 * the authored review questions at the end, a reply per conversation that the player
 * fills in themselves, and a chance to win a life back after each bad answer, asking
 * about the line it was given to.
 */
export function planQuiz(
  cast: SceneCast,
  dialogue: readonly DialogueNode[],
  review: readonly KanaQuestion[],
): QuizPlan {
  const history: QuizHistory = {
    phrases: new Set(review.map((q) => q.word)),
    kana: new Set(review.map((q) => q.correct)),
  };
  const breaks = conversationBreaks(cast);
  const conversation = (node: number): readonly DialogueNode[] =>
    dialogue.slice(
      breaks.filter((b) => b <= node).at(-1) ?? 0,
      breaks.find((b) => b > node) ?? dialogue.length,
    );

  const rounds = breaks.map((at, i) => ({
    at,
    questions: generateQuestions(
      dialogue.slice(breaks[i - 1] ?? 0, at),
      QUESTIONS_PER_BREAK,
      history,
    ),
  }));

  const sayIts = [0, ...breaks].flatMap((start, i) => {
    const end = breaks[i] ?? dialogue.length;
    const middle = (start + end) / 2;
    const candidates = dialogue
      .map((node, n) => ({ node, n }))
      .slice(start, end)
      .filter(({ node, n }) => n > 0 && isFillInCandidate(node))
      .sort((x, y) => Math.abs(x.n - middle) - Math.abs(y.n - middle) || x.n - y.n);
    for (const { node, n } of candidates) {
      const [question] = generateQuestions(node.choices.slice(0, 1), 1, history);
      if (question !== undefined) return [{ key: n, questions: [question] }];
    }
    return [];
  });

  const redemptions = dialogue.flatMap((node, n) => {
    if (!node.choices.some((choice, i) => choiceRating(choice, i) === 'bad')) return [];
    const own = generateQuestions([node], 1, history);
    const questions = own.length > 0 ? own : generateQuestions(conversation(n), 1, history);
    return questions.length > 0 ? [{ key: n | REDEEM_KEY, questions }] : [];
  });

  const fillIns = new Map(sayIts.map((sayIt) => [sayIt.key, sayIt]));
  // The review ends with a hiragana phrase from the scene to write in katakana
  const match = phrasesOf(dialogue)
    .map(matchQuestionFor)
    .find((question) => question !== undefined);

  return {
    rounds: [
      ...rounds,
      { at: END_OF_CONVERSATION, questions: match ? [...review, match] : review },
    ],
    chances: [...sayIts.map(({ key, questions }) => ({ key, questions })), ...redemptions],
    dialogue: dialogue.map((node, n) => {
      const fillIn = fillIns.get(n);
      const [first, ...others] = node.choices;
      const question = fillIn?.questions[0];
      if (first === undefined || question === undefined) return node;
      return { ...node, choices: [{ ...first, text: blankOut(first.text, question) }, ...others] };
    }),
  };
}

/** A node whose good reply can become a fill-in: it has no bad answer and leads on */
function isFillInCandidate(node: DialogueNode): boolean {
  return (
    (node.choices[0]?.next ?? null) !== null &&
    !node.choices.some((choice, i) => choiceRating(choice, i) === 'bad')
  );
}

/** The reply with the question's kana replaced by the blank */
function blankOut(reply: string, question: KanaQuestion): string {
  const chars = Array.from(reply);
  const at = Array.from(reply.slice(0, reply.indexOf(question.word))).length + question.blankIndex;
  chars[at] = FILL_IN_BLANK;
  return chars.join('');
}

/** A question list found by a one-byte key (see buildQuestionTable) */
interface KeyedQuestions {
  readonly key: number;
  readonly questions: readonly KanaQuestion[];
}

/**
 * ROM layout shared by rounds and chances:
 *   count, count × [key, offset lo, offset hi], then the question lists (see buildKanaData);
 *   offsets count from the start of the table.
 */
export function buildQuestionTable(entries: readonly KeyedQuestions[]): Uint8Array {
  const packed = entries.map(({ key, questions }) => {
    if (questions.length === 0) throw new RangeError(`Empty question list for key ${String(key)}`);
    return { key, list: buildKanaData(questions) };
  });
  const bytes: number[] = [entries.length];
  let offset = 1 + 3 * entries.length;
  for (const { key, list } of packed) {
    bytes.push(key, lo(offset), hi(offset));
    offset += list.length;
  }
  for (const { list } of packed) bytes.push(...list);
  return new Uint8Array(bytes);
}

export function buildRoundsData(rounds: readonly KanaCheckpoint[]): Uint8Array {
  if (rounds.length === 0 || rounds.length > MAX_ROUNDS) {
    throw new RangeError(
      `A scene needs 1-${String(MAX_ROUNDS)} kana rounds, got ${String(rounds.length)}`,
    );
  }
  return buildQuestionTable(rounds.map(({ at, questions }) => ({ key: at, questions })));
}

// ---------------------------------------------------------------------------
// The routines that run the rounds
// ---------------------------------------------------------------------------

const TABLE_FIND = routine('table_find', {
  in: ['d', 'hl'],
  out: ['c', 'de', 'f'],
  clobbers: ['a', 'b', 'hl'],
});
export const ROUND_CHECK = routine('round_check', { clobbers: ['a', 'bc', 'de', 'hl'] });
export const CHANCE_CHECK = routine('chance_check', { clobbers: ['a', 'bc', 'de', 'hl'] });

/** Reset score, delta flash, streak, and lives (plus any extra bytes to zero) for a new run. */
export function resetRunState(...alsoZero: U16[]): Op[] {
  return [
    ...zeroBytes(
      ...alsoZero,
      MEM.KANA_SCORE.lo,
      MEM.KANA_SCORE.hi,
      MEM.DELTA_TYPE,
      MEM.DELTA_TIMER,
      MEM.KANA_STREAK,
    ),
    ...storeByte(MEM.KANA_LIVES, MAX_LIVES),
  ];
}

/**
 * Per-frame engine loop: wait a frame, refresh HUD and input, run `update`,
 * and repeat while the engine's state byte is non-zero.
 */
export function engineLoop(loop: Label, update: Label, stateAddr: U16): Op[] {
  return [
    label(loop),
    ...frameWait(),
    ...runDma(),
    call(HUD_UPDATE), // refresh HUD early in VBlank window
    call(CAT_TICK),
    call(JOY_READ),
    call(update),
    ld('a', [stateAddr]),
    or('a'),
    jr('nz', loop),
  ];
}

/**
 * Kana rounds inside a scene:
 * - table_find: HL = question table (see buildQuestionTable), D = key.
 *   Z if absent; NZ with DE = the question list and C = the entry's bit (1 << index).
 * - round_check: play the unplayed round at DLG_NODE_ID, if any.
 * - chance_check: after a bad answer, a chance to win the life back; after picking a
 *   reply to fill in, the fill-in.
 * - play_round: DE = question list, KANA_MODE set; hides the speaker, plays, sets ROUND_RAN.
 */
function buildRoundRoutines(): Op[] {
  const found = new Label('table_found');
  return [
    label(TABLE_FIND),
    push('hl'), // table start, for the offset
    ld('a', ['hl+']),
    ld('b', 'a'), // entries left
    ld('c', 1),
    ...loop((again, done) => [
      ld('a', 'b'),
      or('a'),
      jr('z', done),
      ld('a', ['hl+']),
      cp('d'),
      jr('z', found),
      inc('hl'), // skip the offset
      inc('hl'),
      sla('c'),
      dec('b'),
      jr(again),
    ]),
    pop('hl'),
    xor('a'), // Z
    ret(),
    label(found),
    ld('a', ['hl+']),
    ld('e', 'a'),
    ld('d', ['hl']), // DE = offset
    pop('hl'),
    add('hl', 'de'),
    ld('d', 'h'),
    ld('e', 'l'),
    ld('a', 1),
    or('a'), // NZ
    ret(),

    label(ROUND_CHECK),
    ...loadPointer('hl', MEM.ROUNDS),
    ld('a', [MEM.DLG_NODE_ID]),
    ...invoke(TABLE_FIND, { d: 'a', hl: 'hl' }),
    ret('z'),
    ld('a', [MEM.ROUNDS_DONE]),
    and('c'),
    ret('nz'), // already played (the dialogue looped back)
    ld('a', [MEM.ROUNDS_DONE]),
    or('c'),
    ld([MEM.ROUNDS_DONE], 'a'),
    ...storeByte(MEM.KANA_MODE, KanaMode.NORMAL),
    jr(PLAY_ROUND),

    label(CHANCE_CHECK),
    ld('a', [MEM.DLG_PICK]),
    ld('b', 'a'),
    and(BAD_PICK),
    ...ifElse(
      'nz',
      [
        ld('a', [MEM.KANA_LIVES]),
        or('a'),
        ret('z'), // the conversation is over anyway
        ld('a', [MEM.DLG_FROM_NODE]),
        or(REDEEM_KEY),
        ld('d', 'a'),
        ld('a', KanaMode.REDEEM),
      ],
      [
        ld('a', 'b'),
        or('a'),
        ret('nz'), // only the first reply can be a fill-in
        ld('a', [MEM.DLG_FROM_NODE]),
        ld('d', 'a'),
        ld('a', KanaMode.SAY_IT),
      ],
    ),
    ld([MEM.KANA_MODE], 'a'),
    ...loadPointer('hl', MEM.CHANCES),
    ...invoke(TABLE_FIND, { d: 'd', hl: 'hl' }),
    ret('z'),

    label(PLAY_ROUND),
    push('de'),
    call(NPC_HIDE),
    pop('de'),
    ...invoke(KANA_START, { de: 'de' }),
    ...engineLoop(new Label('round_loop'), KANA_UPDATE, MEM.KANA_STATE),
    ...storeByte(MEM.ROUND_RAN, 1),
    ret(),
  ];
}

export const roundsModule = gameModule({
  name: 'rounds',
  code: buildRoundRoutines,
});
