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

/**
 * A round after each conversation, asking about phrases from that conversation,
 * then the scene's authored review questions at the end.
 */
export function planRounds(
  cast: SceneCast,
  dialogue: readonly DialogueNode[],
  review: readonly KanaQuestion[],
): readonly KanaCheckpoint[] {
  const history: QuizHistory = {
    phrases: new Set(review.map((q) => q.word)),
    kana: new Set(review.map((q) => q.correct)),
  };
  const breaks = conversationBreaks(cast);
  const rounds = breaks.map((at, i) => ({
    at,
    questions: generateQuestions(
      dialogue.slice(breaks[i - 1] ?? 0, at),
      QUESTIONS_PER_BREAK,
      history,
    ),
  }));
  return [...rounds, { at: END_OF_CONVERSATION, questions: review }];
}

export function buildRoundsData(rounds: readonly KanaCheckpoint[]): Uint8Array {
  if (rounds.length === 0 || rounds.length > MAX_ROUNDS) {
    throw new RangeError(
      `A scene needs 1-${String(MAX_ROUNDS)} kana rounds, got ${String(rounds.length)}`,
    );
  }
  const packed = rounds.map((round) => {
    if (round.questions.length === 0)
      throw new RangeError(`Empty kana round at node ${String(round.at)}`);
    return { at: round.at, list: buildKanaData(round.questions) };
  });
  const bytes: number[] = [rounds.length];
  let offset = 1 + 3 * rounds.length;
  for (const { at, list } of packed) {
    bytes.push(at, offset & 0xff, offset >> 8);
    offset += list.length;
  }
  for (const { list } of packed) bytes.push(...list);
  return new Uint8Array(bytes);
}
