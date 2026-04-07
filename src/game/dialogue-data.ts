/**
 * Dialogue data types and ROM encoder.
 *
 * Defines the dialogue tree structure and packs it into the binary format
 * consumed by the dialogue engine at runtime.
 */

import { type TupleIndex } from './fixed';
import { textToTiles } from './font';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DialogueChoice<Next extends number | null = number | null> {
  readonly text: string;
  readonly next: Next; // next node index, null = end conversation
  readonly hint?: string; // shown briefly if this isn't the ideal response
}

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
}
  ? {
      readonly text: Text;
      readonly next: ChoiceNext extends Next ? ChoiceNext : Next;
      readonly hint?: Hint;
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
const END_MARKER = 0xff; // end of conversation (node.next = null)
const TEXT_END = 0xfe; // end of text string (tile 0 = space, so 0x00 is valid content)

/**
 * Pack a dialogue tree into ROM data with an offset table for random access.
 *
 * Per node:
 *   [text_tiles...] 0xFE
 *   [choice_count]
 *   [next_node × choice_count]           ← compact lookup table
 *   [good_flag × choice_count]           ← 1 = good answer (+10), 0 = bad (-5)
 *   [choice_0_text...] 0xFE
 *   [choice_1_text...] 0xFE
 *   ...
 */
export function buildDialogueTree(tree: DialogueTree): Uint8Array {
  const nodeChunks: number[][] = [];
  for (const node of tree) {
    const chunk: number[] = [];
    // NPC text, null-terminated
    for (const tile of textToTiles(node.text)) {
      chunk.push(tile);
    }
    chunk.push(TEXT_END);

    // Choice count
    chunk.push(node.choices.length);

    // Next-node lookup table (one byte per choice, right after count)
    for (const choice of node.choices) {
      chunk.push(choice.next ?? END_MARKER);
    }

    // Good-answer flags (first choice = good, rest = bad)
    for (let ci = 0; ci < node.choices.length; ci++) {
      chunk.push(ci === 0 ? 1 : 0);
    }

    // Choice texts, each null-terminated
    for (const choice of node.choices) {
      for (const tile of textToTiles(choice.text)) {
        chunk.push(tile);
      }
      chunk.push(TEXT_END);
    }

    nodeChunks.push(chunk);
  }

  // Header: node_count + offset table (2 bytes per node)
  const headerSize = 1 + tree.length * 2;
  const header: number[] = [tree.length];

  let currentOffset = headerSize;
  for (const chunk of nodeChunks) {
    header.push(currentOffset & 0xff);
    header.push((currentOffset >> 8) & 0xff);
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
