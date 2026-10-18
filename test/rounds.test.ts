import { describe, expect, it } from 'vitest';
import { SCENES, sceneRounds } from '@game/scene';
import { MAX_ROUNDS, buildRoundsData, conversationBreaks, planRounds } from '@game/rounds';
import { type KanaQuestion, buildKanaData } from '@game/kana';
import { END_OF_CONVERSATION } from '@game/state';
import { type SceneCast } from '@game/scenes/npcs';

const q = (word: string): KanaQuestion => ({
  word,
  blankIndex: 0,
  correct: 'あ',
  distractors: ['い', 'う', 'え'],
});

const CAST: SceneCast = {
  npcs: [],
  segments: [
    { from: 0, npc: 0 },
    { from: 10, npc: null }, // looking around after the first conversation
    { from: 12, npc: 1 },
    { from: 20, npc: 2 }, // straight into the next conversation
  ],
};

describe('conversationBreaks', () => {
  it('breaks where a conversation gives way to someone else or to nobody', () => {
    expect(conversationBreaks(CAST)).toEqual([10, 20]);
  });

  it('has no breaks with a single conversation', () => {
    expect(conversationBreaks({ npcs: [], segments: [{ from: 0, npc: 0 }] })).toEqual([]);
  });
});

describe('planRounds', () => {
  it('spreads the questions in order, with leftovers at the end', () => {
    const questions = ['あい', 'あう', 'あえ', 'あお', 'あか'].map(q);
    const rounds = planRounds(CAST, questions);
    expect(rounds.map((r) => r.at)).toEqual([10, 20, END_OF_CONVERSATION]);
    expect(rounds.map((r) => r.questions.map((x) => x.word))).toEqual([
      ['あい'],
      ['あう', 'あえ'],
      ['あお', 'あか'],
    ]);
  });
});

describe('buildRoundsData', () => {
  it('writes a table of trigger nodes and offsets, then the question lists', () => {
    const rounds = [
      { at: 10, questions: [q('あい')] },
      { at: END_OF_CONVERSATION, questions: [q('あう'), q('あえ')] },
    ];
    const data = buildRoundsData(rounds);
    const first = buildKanaData(rounds[0]?.questions ?? []);
    const second = buildKanaData(rounds[1]?.questions ?? []);
    const header = 1 + 3 * 2;
    expect([...data.slice(0, header)]).toEqual([
      2,
      10,
      header,
      0,
      END_OF_CONVERSATION,
      header + first.length,
      0,
    ]);
    expect([...data.slice(header)]).toEqual([...first, ...second]);
  });

  it('rejects empty rounds and too many rounds', () => {
    expect(() => buildRoundsData([])).toThrow(RangeError);
    expect(() => buildRoundsData([{ at: 1, questions: [] }])).toThrow(RangeError);
    const many = Array.from({ length: MAX_ROUNDS + 1 }, (_, i) => ({
      at: i,
      questions: [q('あい')],
    }));
    expect(() => buildRoundsData(many)).toThrow(RangeError);
  });
});

describe.each(SCENES.map((scene) => [scene.name, scene] as const))('%s', (_name, scene) => {
  const rounds = sceneRounds(scene);

  it('has a round after each conversation and one at the end', () => {
    expect(rounds.length).toBeGreaterThan(1);
    expect(rounds.at(-1)?.at).toBe(END_OF_CONVERSATION);
  });

  it('triggers every mid-scene round at a node the dialogue can reach', () => {
    const reachable = new Set([0]);
    const queue = [0];
    for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
      for (const choice of scene.dialogue[node]?.choices ?? []) {
        if (choice.next !== null && !reachable.has(choice.next)) {
          reachable.add(choice.next);
          queue.push(choice.next);
        }
      }
    }
    for (const round of rounds.slice(0, -1)) expect(reachable.has(round.at)).toBe(true);
  });
});
