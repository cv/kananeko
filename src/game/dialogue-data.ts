/**
 * Dialogue data types and ROM encoder.
 *
 * Defines the dialogue tree structure and packs it into the binary format
 * consumed by the dialogue engine at runtime.
 */

import { hi, lo } from '../asm/util';
import type { TupleIndex } from './fixed';
import { textToTiles } from './font';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * How appropriate a reply is:
 *   good — the model answer: +10 and a life back
 *   ok   — a fine reply that isn't the model answer: no change
 *   bad  — inappropriate (silence to a greeting, こんにちは at night, ...): -5 and a life
 */
export type ChoiceRating = 'good' | 'ok' | 'bad';

export interface DialogueChoice<Next extends number | null = number | null> {
  readonly text: string;
  readonly next: Next; // next node index, null = end conversation
  readonly hint?: string; // what the NPC might say to this reply (not shown yet)
  /** Defaults to 'good' for the first choice and 'ok' for the others */
  readonly rating?: ChoiceRating;
}

/** A choice's rating, applying the defaults */
export function choiceRating(
  choice: { readonly rating?: ChoiceRating | undefined },
  index: number,
): ChoiceRating {
  return choice.rating ?? (index === 0 ? 'good' : 'ok');
}

/** Set in a next-node byte when the choice is a bad answer */
export const BAD_CHOICE_FLAG = 0x80;
/** next-node value (without the flag) meaning "end of conversation" */
export const NEXT_END = 0x7f;

export type DialogueChoices<Next extends number | null = number | null> =
  | readonly []
  | readonly [DialogueChoice<Next>]
  | readonly [DialogueChoice<Next>, DialogueChoice<Next>]
  | readonly [DialogueChoice<Next>, DialogueChoice<Next>, DialogueChoice<Next>];

export interface DialogueNode<Next extends number | null = number | null> {
  readonly text: string;
  readonly choices: DialogueChoices<Next>;
}

export type DialogueTree = readonly DialogueNode[];

type ValidNext<T extends readonly unknown[]> = TupleIndex<T> | null;

type ValidateChoice<Choice, Next extends number | null> = Choice extends {
  readonly text: infer Text extends string;
  readonly next: infer ChoiceNext extends number | null;
  readonly hint?: infer Hint extends string | undefined;
  readonly rating?: infer Rating extends ChoiceRating | undefined;
}
  ? {
      readonly text: Text;
      readonly next: ChoiceNext extends Next ? ChoiceNext : Next;
      readonly hint?: Hint;
      readonly rating?: Rating;
    }
  : DialogueChoice<Next>;

type ValidateChoices<
  Choices extends readonly unknown[],
  Next extends number | null,
> = Choices extends readonly []
  ? readonly []
  : Choices extends readonly [infer A]
    ? readonly [ValidateChoice<A, Next>]
    : Choices extends readonly [infer A, infer B]
      ? readonly [ValidateChoice<A, Next>, ValidateChoice<B, Next>]
      : Choices extends readonly [infer A, infer B, infer C]
        ? readonly [ValidateChoice<A, Next>, ValidateChoice<B, Next>, ValidateChoice<C, Next>]
        : DialogueChoices<Next>;

type ValidateNode<Node, Next extends number | null> = Node extends {
  readonly text: infer Text extends string;
  readonly choices: infer Choices extends readonly unknown[];
}
  ? {
      readonly text: Text;
      readonly choices: ValidateChoices<Choices, Next>;
    }
  : DialogueNode<Next>;

type ValidateDialogueTree<T extends readonly unknown[]> = {
  readonly [K in keyof T]: ValidateNode<T[K], ValidNext<T>>;
};

export function defineDialogueTree<const T extends readonly DialogueNode[]>(
  tree: T & ValidateDialogueTree<T>,
): T & ValidateDialogueTree<T> {
  return tree;
}

// ---------------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------------

/**
 * Sentinel bytes — deliberately outside the TileIndex range (0x00-0xFD)
 * so they can never collide with valid tile data.
 */
/** End of a text string (tile 0 = space, so 0x00 is valid content) */
export const TEXT_END = 0xfe;

/**
 * Pack a dialogue tree into ROM data with an offset table for random access.
 *
 * Per node:
 *   [text_tiles...] 0xFE                 ← compressed (text-codec.ts) in the ROM
 *   [choice_count]
 *   [next_node × choice_count]           ← bits 0-6: node (NEXT_END = end),
 *                                           bit 7: BAD_CHOICE_FLAG
 *
 * Ratings: the first choice is the model answer ('good'); later choices are
 * 'ok' unless flagged bad. Ratings that don't fit this are rejected.
 *   [choice_0_text...] 0xFE
 *   [choice_1_text...] 0xFE
 *   ...
 */
/**
 * @param encode compresses each text's tiles (see text-codec.ts); the default stores
 *   them as they are
 */
export function buildDialogueTree(
  tree: DialogueTree,
  encode: (tiles: readonly number[]) => readonly number[] = (tiles) => tiles,
): Uint8Array {
  if (tree.length >= NEXT_END) {
    throw new RangeError(`Dialogue trees are limited to ${String(NEXT_END)} nodes`);
  }
  const nodeChunks: number[][] = [];
  for (const node of tree) {
    const chunk: number[] = [];
    // NPC text, null-terminated
    chunk.push(...encode(textToTiles(node.text)), TEXT_END);

    // Choice count
    chunk.push(node.choices.length);

    // Next-node lookup table (one byte per choice, right after count)
    node.choices.forEach((choice, i) => {
      const rating = choiceRating(choice, i);
      if ((i === 0) !== (rating === 'good') && rating !== 'bad') {
        throw new Error(`Only the first choice can be 'good' ("${choice.text}")`);
      }
      chunk.push((choice.next ?? NEXT_END) | (rating === 'bad' ? BAD_CHOICE_FLAG : 0));
    });

    // Choice texts, each null-terminated
    for (const choice of node.choices) {
      chunk.push(...encode(textToTiles(choice.text)), TEXT_END);
    }

    nodeChunks.push(chunk);
  }

  // Header: node_count + offset table (2 bytes per node)
  const headerSize = 1 + tree.length * 2;
  const header: number[] = [tree.length];

  let currentOffset = headerSize;
  for (const chunk of nodeChunks) {
    header.push(lo(currentOffset), hi(currentOffset));
    currentOffset += chunk.length;
  }

  const bytes = [...header];
  for (const chunk of nodeChunks) {
    for (const b of chunk) {
      bytes.push(b);
    }
  }

  return new Uint8Array(bytes);
}
