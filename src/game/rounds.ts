/**
 * When kana rounds happen: a short round about what was just said each time a
 * conversation ends, and the scene's review round when its dialogue is over.
 *
 * ROM layout of a scene's rounds (see buildRoundsData):
 *   count
 *   count × [node, offset lo, offset hi]   node that triggers the round (END_OF_CONVERSATION = scene end);
 *                                          offset of its question list from the start of this data
 *   question lists (see buildKanaData)
 */

import { type DialogueNode } from './dialogue';
import { choiceRating } from './dialogue-data';
import { buildKanaData, type KanaQuestion } from './kana';
import { type QuizHistory, generateQuestions } from './quiz';
import { type SceneCast } from './scenes/npcs';
import { END_OF_CONVERSATION } from './state';

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
}

/**
 * Plan a scene's kana: a round after each conversation asking about phrases from it,
 * the authored review questions at the end, and a chance to win a life back after
 * each node's bad answer, asking about that node's line.
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

  const chances = dialogue.flatMap((node, n) => {
    if (!node.choices.some((choice, i) => choiceRating(choice, i) === 'bad')) return [];
    const own = generateQuestions([node], 1, history);
    const questions = own.length > 0 ? own : generateQuestions(conversation(n), 1, history);
    return questions.length > 0 ? [{ key: n | REDEEM_KEY, questions }] : [];
  });

  return { rounds: [...rounds, { at: END_OF_CONVERSATION, questions: review }], chances };
}

/** A question list found by a one-byte key (see buildQuestionTable) */
export interface KeyedQuestions {
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
    bytes.push(key, offset & 0xff, offset >> 8);
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
