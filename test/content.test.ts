/**
 * Static checks over all authored game content: every scene's dialogue graph,
 * text layout limits, kana questions, and their ROM encodings.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_CHOICE_TEXT_WIDTH,
  MAX_NPC_TEXT_WIDTH,
  buildDialogueTree,
  type DialogueNode,
} from '@game/dialogue';
import { textToTiles } from '@game/font';
import { buildKanaData } from '@game/kana';
import { SCENES } from '@game/scene';
import { END_OF_CONVERSATION } from '@game/state';
import { SCREEN_COLS } from '@game/tilemap';
import { decodeDialogueTree, decodeKanaData } from './helpers/decode';

const width = (text: string): number => Array.from(text).length;

/** Nodes reachable from node 0 */
function reachable(tree: readonly DialogueNode[]): Set<number> {
  const seen = new Set<number>();
  const stack = [0];
  while (stack.length > 0) {
    const id = stack.pop() ?? 0;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const choice of tree[id]?.choices ?? []) {
      if (choice.next !== null) stack.push(choice.next);
    }
  }
  return seen;
}

/** Nodes from which some sequence of choices ends the conversation */
function canFinish(tree: readonly DialogueNode[]): Set<number> {
  const done = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    tree.forEach((node, id) => {
      if (done.has(id)) return;
      if (node.choices.some((c) => c.next === null || done.has(c.next))) {
        done.add(id);
        changed = true;
      }
    });
  }
  return done;
}

describe.each(SCENES.map((scene, index) => ({ scene, index })))(
  'scene $index ($scene.name)',
  ({ scene }) => {
    const tree: readonly DialogueNode[] = scene.dialogue;

    describe('dialogue', () => {
      it('has fewer nodes than the end-of-conversation marker', () => {
        expect(tree.length).toBeGreaterThan(0);
        expect(tree.length).toBeLessThan(END_OF_CONVERSATION);
      });

      it('gives every node one to three choices that point at real nodes', () => {
        tree.forEach((node) => {
          expect(node.choices.length).toBeGreaterThanOrEqual(1);
          expect(node.choices.length).toBeLessThanOrEqual(3);
          for (const choice of node.choices) {
            if (choice.next !== null) {
              expect(choice.next).toBeGreaterThanOrEqual(0);
              expect(choice.next).toBeLessThan(tree.length);
            }
          }
        });
      });

      it('makes every node reachable from the opening node', () => {
        const unreachable = tree.map((_, id) => id).filter((id) => !reachable(tree).has(id));
        expect(unreachable).toEqual([]);
      });

      it('lets the player finish the conversation from every node', () => {
        const stuck = tree.map((_, id) => id).filter((id) => !canFinish(tree).has(id));
        expect(stuck).toEqual([]);
      });

      it('ends the always-pick-the-good-answer path without looping', () => {
        const visited = new Set<number>();
        let id: number | null = 0;
        while (id !== null) {
          expect(visited.has(id)).toBe(false);
          visited.add(id);
          id = tree[id]?.choices[0]?.next ?? null;
        }
      });

      it('fits every line inside the textbox', () => {
        const tooWide: string[] = [];
        tree.forEach((node, id) => {
          if (width(node.text) > MAX_NPC_TEXT_WIDTH) tooWide.push(`${String(id)}: ${node.text}`);
          for (const choice of node.choices) {
            if (width(choice.text) > MAX_CHOICE_TEXT_WIDTH) {
              tooWide.push(`${String(id)}> ${choice.text}`);
            }
          }
        });
        expect(tooWide).toEqual([]);
      });

      it('round-trips through the ROM encoding', () => {
        const decoded = decodeDialogueTree(buildDialogueTree(tree));
        expect(decoded).toEqual(
          tree.map((node) => ({
            text: node.text,
            choices: node.choices.map((c, i) => ({ text: c.text, next: c.next, good: i === 0 })),
          })),
        );
      });
    });

    describe('kana round', () => {
      it.each(scene.kanaQuestions.map((q) => [q.word, q] as const))('%s', (_word, q) => {
        const chars = Array.from(q.word);
        expect(chars[q.blankIndex]).toBe(q.correct);
        expect(new Set([q.correct, ...q.distractors]).size).toBe(4);
        expect(() => textToTiles(q.word + q.distractors.join(''))).not.toThrow();
      });

      it('round-trips through the ROM encoding', () => {
        expect(decodeKanaData(buildKanaData(scene.kanaQuestions))).toEqual(
          scene.kanaQuestions.map((q) => ({ ...q, distractors: [...q.distractors] })),
        );
      });
    });

    it('has a name that fits on screen', () => {
      expect(width(scene.name)).toBeLessThanOrEqual(SCREEN_COLS);
    });
  },
);
