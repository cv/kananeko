import { describe, expect, it } from 'vitest';
import { SCENES, sceneRounds } from '@game/scene';
import {
  MAX_ROUNDS,
  QUESTIONS_PER_BREAK,
  buildRoundsData,
  conversationBreaks,
  REDEEM_KEY,
  planQuiz,
} from '@game/rounds';
import { type DialogueNode } from '@game/dialogue';
import { CHAR_MAP } from '@game/font';
import { phrasesOf } from '@game/quiz';
import { type KanaQuestion, buildKanaData } from '@game/kana';
import { BAD_PICK, END_OF_CONVERSATION } from '@game/state';
import { BAD_CHOICE_FLAG } from '@game/dialogue-data';
import { type SceneCast } from '@game/scenes/npcs';

const q = (word: string): KanaQuestion => ({
  word,
  blankIndex: 0,
  correct: 'あ',
  distractors: ['い', 'う', 'え'],
});

const line = (text: string): DialogueNode => ({ text, choices: [{ text: 'はい', next: null }] });

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
  const dialogue = Array.from({ length: 24 }, (_, i) =>
    line(i < 10 ? 'おはよう ございます' : i < 20 ? 'さくらが きれい' : 'たのしい ですね'),
  );

  it('asks about each conversation after it, then the review at the end', () => {
    const review = [q('あい')];
    const { rounds } = planQuiz(CAST, dialogue, review);
    expect(rounds.map((r) => r.at)).toEqual([10, 20, END_OF_CONVERSATION]);
    expect(rounds[0]?.questions.map((x) => x.word)).toEqual(['おはよう', 'ございます']);
    expect(rounds[1]?.questions.map((x) => x.word)).toEqual(['さくらが', 'きれい']);
    expect(rounds[2]?.questions).toBe(review);
  });
});

describe('planQuiz chances', () => {
  const bad = (text: string): DialogueNode => ({
    text,
    choices: [
      { text: 'はい', next: 1 },
      { text: 'いいえ', next: 1, rating: 'bad' },
    ],
  });

  it('asks about the line a bad answer was given to', () => {
    const dialogue = [bad('おはよう ございます'), line('さくらが きれい')];
    const { chances } = planQuiz({ npcs: [], segments: [{ from: 0, npc: 0 }] }, dialogue, [
      q('あい'),
    ]);
    expect(chances.map((c) => c.key)).toEqual([0 | REDEEM_KEY]);
    expect(['おはよう', 'ございます']).toContain(chances[0]?.questions[0]?.word);
  });

  it('falls back to the rest of the conversation when the line has nothing to ask', () => {
    const dialogue = [line('さくらが きれい'), bad('え?')];
    const { chances } = planQuiz({ npcs: [], segments: [{ from: 0, npc: 0 }] }, dialogue, [
      q('あい'),
    ]);
    expect(chances.map((c) => c.key)).toEqual([1 | REDEEM_KEY]);
    expect(['さくらが', 'きれい']).toContain(chances[0]?.questions[0]?.word);
  });

  it('skips a bad answer when there is nothing left to ask', () => {
    const { chances } = planQuiz(
      { npcs: [], segments: [{ from: 0, npc: 0 }] },
      [bad('え?')],
      [q('あい')],
    );
    expect(chances).toEqual([]);
  });

  it('marks bad picks the way the dialogue data marks bad answers', () => {
    expect(BAD_PICK).toBe(BAD_CHOICE_FLAG);
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

  it.each(rounds.slice(0, -1).map((round) => [round.at, round] as const))(
    'asks %i about phrases its conversation just used',
    (at, round) => {
      const breaks = rounds.map((r) => r.at);
      const start = breaks[breaks.indexOf(at) - 1] ?? 0;
      const said = phrasesOf(scene.dialogue.slice(start, at));
      expect(round.questions).toHaveLength(QUESTIONS_PER_BREAK);
      for (const question of round.questions) {
        expect(said).toContain(question.word);
        expect(Array.from(question.word)[question.blankIndex]).toBe(question.correct);
        const options = [question.correct, ...question.distractors];
        expect(new Set(options).size).toBe(4);
        for (const option of options) expect(CHAR_MAP).toHaveProperty(option);
      }
    },
  );

  it('never asks the same phrase twice in a scene', () => {
    const words = rounds.flatMap((round) => round.questions.map((q) => q.word));
    expect(new Set(words).size).toBe(words.length);
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
