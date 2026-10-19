/**
 * Kana questions generated from what a conversation actually said.
 *
 * A question shows a phrase from one of the NPC's lines with one kana blanked;
 * the wrong options are kana that look like it (さ/ち/き, シ/ツ/ソ/ン, ...),
 * then its voiced forms (か/が), then its neighbors in the same kana row.
 * Everything is deterministic, so the ROM stays reproducible.
 */

import { CHAR_MAP } from './font';
import { type KanaQuestion, MAX_KANA_WORD_LENGTH } from './kana';
import type { DialogueNode } from './dialogue';

/** Anything with words in it: a dialogue node, or a reply */
export type Line = Pick<DialogueNode, 'text'>;

/** Kana that are easy to mix up, most similar first */
const LOOKALIKES: readonly string[] = [
  // Hiragana
  'さちき',
  'ぬめのあお',
  'われね',
  'はほけ',
  'るろそ',
  'いりこ',
  'こにた',
  'うつら',
  'くへし',
  'てそと',
  'まもよ',
  'ゆよ',
  'なた',
  'んろ',
  'しつ',
  // Katakana
  'シツソン',
  'クケタワ',
  'ウワフラ',
  'アマヤ',
  'コユロ',
  'チテ',
  'スヌ',
  'ナメノ',
  'セヤ',
  'ルレ',
  'エユ',
  'ニミ',
  'オホ',
];

/** Rows of the kana table: same consonant, different vowel (plus voiced forms in their own rows) */
const ROWS: readonly string[] = [
  'あいうえお',
  'かきくけこ',
  'がぎぐげご',
  'さしすせそ',
  'ざじずぜぞ',
  'たちつてと',
  'だぢづでど',
  'なにぬねの',
  'はひふへほ',
  'ばびぶべぼ',
  'ぱぴぷぺぽ',
  'まみむめも',
  'やゆよ',
  'らりるれろ',
  'わをん',
  'アイウエオ',
  'カキクケコ',
  'ガギグゲゴ',
  'サシスセソ',
  'ザジズゼゾ',
  'タチツテト',
  'ダヂヅデド',
  'ナニヌネノ',
  'ハヒフヘホ',
  'バビブベボ',
  'パピプペポ',
  'マミムメモ',
  'ヤユヨ',
  'ラリルレロ',
  'ワヲン',
];

/** Kana that never get blanked: small kana, the long-vowel mark, and particles read differently */
const NEVER_BLANK = new Set(Array.from('っゃゅょッャュョーはをへ'));

const isHiragana = (ch: string): boolean => /[\u3041-\u3096]/u.test(ch);
const isKatakana = (ch: string): boolean => /[\u30a1-\u30fa\u30fc]/u.test(ch);
const inFont = (ch: string): boolean => ch in CHAR_MAP;

/** Kana with the same base shape: か/が, は/ば/ぱ */
function voicings(ch: string): string[] {
  const base = ch.normalize('NFD').charAt(0);
  return [base, `${base}\u3099`, `${base}\u309a`]
    .map((s) => s.normalize('NFC'))
    .filter((s) => s.length === 1);
}

function lookalikes(ch: string): string[] {
  return LOOKALIKES.filter((group) => group.includes(ch)).flatMap((group) => Array.from(group));
}

/** Wrong options for a kana, best first: same script, in the font, all different */
export function distractorsFor(ch: string): string[] {
  const sameScript = isHiragana(ch) ? isHiragana : isKatakana;
  const row = ROWS.filter((r) => r.includes(ch)).flatMap((r) => Array.from(r));
  const candidates = [...lookalikes(ch), ...voicings(ch), ...row];
  return [...new Set(candidates)].filter(
    (other) => other !== ch && sameScript(other) && inFont(other) && !NEVER_BLANK.has(other),
  );
}

/** Whether a kana can be blanked: it has a look-alike and enough wrong options */
function blankable(ch: string): boolean {
  if (NEVER_BLANK.has(ch) || !(isHiragana(ch) || isKatakana(ch))) return false;
  return (
    lookalikes(ch).some((other) => other !== ch && inFont(other)) && distractorsFor(ch).length >= 3
  );
}

/** Small deterministic hash, to vary choices without randomness */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** The item a seed lands on */
export function pick<T>(items: readonly T[], seed: number): T {
  const item = items[seed % items.length];
  if (item === undefined) throw new RangeError('Nothing to pick from');
  return item;
}

/**
 * A question for one phrase, or undefined if no kana in it can be blanked.
 * Blanks a kana outside `avoid` when there is one.
 */
export function questionFor(
  phrase: string,
  avoid: ReadonlySet<string> = new Set(),
): KanaQuestion | undefined {
  const eligible = Array.from(phrase).flatMap((ch, i) => (blankable(ch) ? [{ ch, i }] : []));
  if (eligible.length === 0) return undefined;
  const fresh = eligible.filter(({ ch }) => !avoid.has(ch));
  const blank = pick(fresh.length > 0 ? fresh : eligible, hash(phrase));
  // The closest look-alike always, then two more picked by the phrase
  const options = distractorsFor(blank.ch);
  const rest = options.slice(1);
  const seed = hash(`${phrase}/${blank.ch}`);
  const second = pick(rest, seed);
  const third = pick(
    rest.filter((option) => option !== second),
    seed >>> 8,
  );
  return {
    word: phrase,
    blankIndex: blank.i,
    correct: blank.ch,
    distractors: [pick(options, 0), second, third],
  };
}

/** Particles and sentence endings that follow a word */
const PARTICLES = new Set(Array.from('がはをにでのもへとねよか'));

/** The katakana for a hiragana character (same sound) */
function toKatakana(ch: string): string {
  return String.fromCharCode(ch.charCodeAt(0) + 0x60);
}

/**
 * A question pairing a hiragana phrase with its katakana (さんぽ サン□), blanking a
 * katakana, or undefined if the phrase is too long or the font lacks its katakana.
 */
export function matchQuestionFor(phrase: string): KanaQuestion | undefined {
  const chars = Array.from(phrase);
  if (chars.length * 2 + 1 > MAX_KANA_WORD_LENGTH || !chars.every(isHiragana)) return undefined;
  // A word, not a word plus particle: はなが would ask for ハナガ
  if (PARTICLES.has(phrase.slice(-1))) return undefined;
  const katakana = chars.map(toKatakana);
  if (!katakana.every(inFont)) return undefined;
  const eligible = katakana.flatMap((ch, i) => (blankable(ch) ? [{ ch, i }] : []));
  if (eligible.length === 0) return undefined;
  const blank = pick(eligible, hash(phrase));
  const options = distractorsFor(blank.ch);
  const seed = hash(`${phrase}/${blank.ch}`);
  const second = pick(options.slice(1), seed);
  const third = pick(
    options.slice(1).filter((option) => option !== second),
    seed >>> 8,
  );
  return {
    word: `${phrase} ${katakana.join('')}`,
    blankIndex: chars.length + 1 + blank.i,
    correct: blank.ch,
    distractors: [pick(options, 0), second, third],
    prompt: 'katakana',
  };
}

/** What a scene has already asked about, so later rounds pick something new */
export interface QuizHistory {
  readonly phrases: Set<string>;
  readonly kana: Set<string>;
}

/** Phrases of the NPC's lines, in order: split on spaces and punctuation, kana only, short enough */
export function phrasesOf(nodes: readonly Line[]): string[] {
  const phrases = nodes.flatMap((node) => node.text.split(/[\s!?、。…・.,「」]+/u));
  return [
    ...new Set(
      phrases.filter((phrase) => {
        const chars = Array.from(phrase);
        return (
          chars.length >= 3 &&
          chars.length <= MAX_KANA_WORD_LENGTH &&
          chars.every((ch) => (isHiragana(ch) || isKatakana(ch)) && inFont(ch))
        );
      }),
    ),
  ];
}

/**
 * Up to `count` questions about what was said in `nodes`, recording them in `history`.
 * Prefers phrases not asked before that blank a kana not asked before, then phrases of
 * 4-7 kana; ties are spread over the conversation by hash.
 */
export function generateQuestions(
  nodes: readonly Line[],
  count: number,
  history: QuizHistory,
): KanaQuestion[] {
  const picked: KanaQuestion[] = [];
  while (picked.length < count) {
    const candidates = phrasesOf(nodes)
      .filter((phrase) => !history.phrases.has(phrase))
      .flatMap((phrase) => {
        const question = questionFor(phrase, history.kana);
        if (question === undefined) return [];
        const length = Array.from(phrase).length;
        const rank =
          (history.kana.has(question.correct) ? 0 : 2) + (length >= 4 && length <= 7 ? 1 : 0);
        return [{ question, rank, tie: hash(phrase) }];
      })
      .sort((x, y) => y.rank - x.rank || x.tie - y.tie);
    const best = candidates[0];
    if (best === undefined) break;
    picked.push(best.question);
    history.phrases.add(best.question.word);
    history.kana.add(best.question.correct);
  }
  return picked;
}
