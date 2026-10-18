/**
 * When kana rounds happen: a short round each time a conversation ends,
 * and a last one when the scene's dialogue is over.
 *
 * ROM layout of a scene's rounds (see buildRoundsData):
 *   count
 *   count × [node, offset lo, offset hi]   node that triggers the round (END_OF_CONVERSATION = scene end);
 *                                          offset of its question list from the start of this data
 *   question lists (see buildKanaData)
 */

import { buildKanaData, type KanaQuestion } from './kana';
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

/**
 * Spread a scene's questions over a round per conversation break plus one at the end,
 * in order; later rounds get the leftovers.
 */
export function planRounds(
  cast: SceneCast,
  questions: readonly KanaQuestion[],
): readonly KanaCheckpoint[] {
  const stops = [...conversationBreaks(cast), END_OF_CONVERSATION];
  const base = Math.floor(questions.length / stops.length);
  const extra = questions.length % stops.length;
  let next = 0;
  return stops.map((at, i) => {
    const size = base + (i >= stops.length - extra ? 1 : 0);
    const round = { at, questions: questions.slice(next, next + size) };
    next += size;
    return round;
  });
}

export function buildRoundsData(rounds: readonly KanaCheckpoint[]): Uint8Array {
  if (rounds.length === 0 || rounds.length > MAX_ROUNDS) {
    throw new RangeError(
      `A scene needs 1-${String(MAX_ROUNDS)} kana rounds, got ${String(rounds.length)}`,
    );
  }
  const lists = rounds.map((round) => {
    if (round.questions.length === 0)
      throw new RangeError(`Empty kana round at node ${String(round.at)}`);
    return buildKanaData(round.questions);
  });
  const bytes: number[] = [rounds.length];
  let offset = 1 + 3 * rounds.length;
  rounds.forEach((round, i) => {
    bytes.push(round.at, offset & 0xff, offset >> 8);
    offset += lists[i]?.length ?? 0;
  });
  for (const list of lists) bytes.push(...list);
  return new Uint8Array(bytes);
}
