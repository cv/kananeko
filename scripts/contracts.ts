/**
 * Suggest register contracts from what the code does: for each routine, the registers
 * it reads before setting them (its arguments), the registers it changes, and which
 * of those its callers use afterwards (its outputs). Prints the
 * routines whose declared contract (see routine() in src/asm/types.ts) differs, as
 * routine() calls to paste in. With --json, prints every suggestion as JSON.
 *
 *   npm run contracts
 */

import { analyze, regBits } from '../src/asm/analysis';
import { assembleForAnalysis } from '../src/asm/assembler';
import {
  type ArgReg,
  type Label,
  type RegName,
  Routine,
  type RoutineContract,
} from '../src/asm/types';
import { ROM_HEADER, buildProgram } from '../src/game/main';

const SINGLE: readonly ArgReg[] = ['a', 'b', 'c', 'd', 'e', 'h', 'l'];
const F = regBits(['f']);

/** Register names for a bit set, with whole pairs as pairs and F left out */
function names(bits: number): ArgReg[] {
  const out: ArgReg[] = [];
  for (const pair of ['bc', 'de', 'hl'] as const) {
    const pairBits = regBits([pair]);
    if ((bits & pairBits) === pairBits) {
      out.push(pair);
      bits &= ~pairBits;
    }
  }
  return [...SINGLE.filter((n) => (bits & regBits([n])) !== 0), ...out];
}

/** in, out (with F when a flag is a result) and clobbers, leaving out empty lists */
function contractOf(inputs: number, out: number, writes: number): RoutineContract {
  const inNames = names(inputs);
  const outNames: RegName[] = [...names(out), ...((out & F) !== 0 ? ['f' as const] : [])];
  const clobbers = names(writes & ~out);
  return {
    ...(inNames.length > 0 ? { in: inNames } : {}),
    ...(outNames.length > 0 ? { out: outNames } : {}),
    ...(clobbers.length > 0 ? { clobbers } : {}),
    ...((writes & F) === 0 ? { keepsFlags: true } : {}),
  };
}

/** The same registers and flags, however the lists are written (B, C or BC) */
function sameContract(a: RoutineContract, b: RoutineContract): boolean {
  return (
    regBits(a.in) === regBits(b.in) &&
    regBits(a.out) === regBits(b.out) &&
    regBits(a.clobbers) === regBits(b.clobbers) &&
    (a.keepsFlags === true) === (b.keepsFlags === true) &&
    a.depth === b.depth
  );
}

const { ops, names: labelNames, interrupts } = assembleForAnalysis(buildProgram(), ROM_HEADER);
const writesOf = new Map<Label, number>();
/** Outputs start from the declared contracts: callers' needs only add to them */
const outOf = new Map<Label, number>();
for (const op of ops) {
  if (op.kind === 'label' && op.label instanceof Routine) {
    outOf.set(op.label, regBits(op.label.contract.out));
  }
}
const inputsOf = new Map<Label, number>();
let contracts = new Map<Label, RoutineContract>();
for (let round = 0; round < 50; round++) {
  const analysis = analyze(ops, labelNames, interrupts, { contracts });
  for (const [label, s] of analysis.summaries) writesOf.set(label, s.writes);
  let changed = round === 0;
  for (const [label, bits] of analysis.inputs) {
    if ((inputsOf.get(label) ?? 0) !== (bits & ~F)) {
      inputsOf.set(label, bits & ~F);
      changed = true;
    }
  }
  for (const { callee, bits } of analysis.lost) {
    if (typeof callee === 'string') continue;
    const out = outOf.get(callee) ?? 0;
    if ((out | bits) !== out) {
      outOf.set(callee, out | bits);
      changed = true;
    }
  }
  contracts = new Map(
    [...writesOf].map(([label, writes]) => [
      label,
      contractOf(inputsOf.get(label) ?? 0, outOf.get(label) ?? 0, writes),
    ]),
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
  if (declared === undefined || !sameContract(declared, contract)) {
    differing.push(`routine('${name}', ${JSON.stringify(contract).replaceAll('"', "'")})`);
  }
}
console.log(
  process.argv.includes('--json') ? JSON.stringify(suggestions, null, 2) : differing.join('\n'),
);
