/**
 * Suggest register contracts from what the code does: for each routine, the registers
 * it changes, and which of those its callers use afterwards (its outputs). Prints the
 * routines whose declared contract (see routine() in src/asm/types.ts) differs, as
 * routine() calls to paste in. With --json, prints every suggestion as JSON.
 *
 *   npm run contracts
 */

import { analyze, regBits } from '../src/asm/analysis';
import { assembleForAnalysis } from '../src/asm/assembler';
import { type Label, type RegName, Routine, type RoutineContract } from '../src/asm/types';
import { ROM_HEADER, buildProgram } from '../src/game/main';

const SINGLE: readonly RegName[] = ['a', 'b', 'c', 'd', 'e', 'h', 'l'];
const F = regBits(['f']);

/** Register names for a bit set, with whole pairs as pairs and F left out */
function names(bits: number): RegName[] {
  const out: RegName[] = [];
  for (const pair of ['bc', 'de', 'hl'] as const) {
    const pairBits = regBits([pair]);
    if ((bits & pairBits) === pairBits) {
      out.push(pair);
      bits &= ~pairBits;
    }
  }
  return [...SINGLE.filter((n) => (bits & regBits([n])) !== 0), ...out];
}

/** out (with F when a flag is a result) and clobbers, leaving out empty lists */
function contractOf(out: number, writes: number): RoutineContract {
  const outNames: RegName[] = [...names(out), ...((out & F) !== 0 ? ['f' as const] : [])];
  const clobbers = names(writes & ~out);
  return {
    ...(outNames.length > 0 ? { out: outNames } : {}),
    ...(clobbers.length > 0 ? { clobbers } : {}),
    ...((writes & F) === 0 ? { keepsFlags: true } : {}),
  };
}

const { ops, names: labelNames, interrupts } = assembleForAnalysis(buildProgram(), ROM_HEADER);
const writesOf = new Map<Label, number>();
const outOf = new Map<Label, number>();
let contracts = new Map<Label, RoutineContract>();
for (let round = 0; round < 50; round++) {
  const analysis = analyze(ops, labelNames, interrupts, { contracts });
  for (const [label, s] of analysis.summaries) writesOf.set(label, s.writes);
  let changed = round === 0;
  for (const { callee, bits } of analysis.lost) {
    if (typeof callee === 'string') continue;
    const out = outOf.get(callee) ?? 0;
    if ((out | bits) !== out) {
      outOf.set(callee, out | bits);
      changed = true;
    }
  }
  contracts = new Map(
    [...writesOf].map(([label, writes]) => [label, contractOf(outOf.get(label) ?? 0, writes)]),
  );
  if (!changed) break;
}

const suggestions: Record<string, RoutineContract> = {};
const differing: string[] = [];
for (const [label, contract] of contracts) {
  if (interrupts.includes(label)) continue;
  const name = labelNames.get(label) ?? label.toString();
  suggestions[name] = contract;
  const declared = label instanceof Routine ? label.contract : undefined;
  if (declared === undefined || JSON.stringify(declared) !== JSON.stringify(contract)) {
    differing.push(`routine('${name}', ${JSON.stringify(contract).replaceAll('"', "'")})`);
  }
}
console.log(
  process.argv.includes('--json') ? JSON.stringify(suggestions, null, 2) : differing.join('\n'),
);
