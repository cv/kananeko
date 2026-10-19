/**
 * Register analysis of an assembled program: what each routine (a CALL target) writes
 * and how deep it takes the stack, followed through its jumps, calls and PUSH/POP
 * pairs, so that routine contracts (see Routine) can be checked against the code.
 *
 * Registers are a bit set over A, F, B, C, D, E, H, L. A write between PUSH rr and the
 * matching POP rr doesn't count: the routine restores it.
 */

import { type InstOp, Label, type Op, type RegName, Routine, type RoutineContract } from './types';

export const REG = { a: 1, f: 2, b: 4, c: 8, d: 16, e: 32, h: 64, l: 128 } as const;
const ALL = 0xff;
const PAIR_BITS = {
  bc: REG.b | REG.c,
  de: REG.d | REG.e,
  hl: REG.h | REG.l,
  af: REG.a | REG.f,
} as const;
/** Registers by their 3-bit encoding: B C D E H L (HL) A (6 = memory at HL) */
const R8_BITS = [REG.b, REG.c, REG.d, REG.e, REG.h, REG.l, -1, REG.a] as const;
/** Pairs by their 2-bit encoding in LD rr,nn / INC rr / ADD HL,rr (3 = SP) and PUSH/POP (3 = AF) */
const RR_BITS = [PAIR_BITS.bc, PAIR_BITS.de, PAIR_BITS.hl, 0] as const;
const STACK_BITS = [PAIR_BITS.bc, PAIR_BITS.de, PAIR_BITS.hl, PAIR_BITS.af] as const;

/** Register bits of a contract's register names */
export function regBits(names: readonly RegName[] = []): number {
  let bits = 0;
  for (const name of names)
    bits |=
      name.length === 1 ? REG[name as keyof typeof REG] : PAIR_BITS[name as keyof typeof PAIR_BITS];
  return bits;
}

/** Register names of a bit set, for messages */
export function regNames(bits: number): string {
  return (Object.keys(REG) as (keyof typeof REG)[])
    .filter((r) => (bits & REG[r]) !== 0)
    .map((r) => r.toUpperCase())
    .join(', ');
}

type Flow = 'next' | 'jump' | 'jumpcc' | 'call' | 'callcc' | 'ret' | 'retcc' | 'unknown';

interface Effect {
  reads: number;
  writes: number;
  flow: Flow;
  push?: number;
  pop?: number;
}

function r8(index: number): number {
  const bits = R8_BITS[index & 7] ?? 0;
  return bits === -1 ? 0 : bits;
}

/** (HL) as an operand reads H and L to find the byte */
function hlMem(index: number): number {
  return (index & 7) === 6 ? PAIR_BITS.hl : 0;
}

/** What one instruction reads and writes, and where control goes after it */
export function effect(bytes: readonly number[]): Effect {
  const op = bytes[0] ?? 0;
  const e = (reads: number, writes: number, flow: Flow = 'next'): Effect => ({
    reads,
    writes,
    flow,
  });
  if (op === 0xcb) {
    const cb = bytes[1] ?? 0;
    const r = cb & 7;
    const group = cb >> 6;
    const target = r8(r);
    const addr = hlMem(r);
    if (group === 1) return e(target | addr, REG.f); // BIT
    if (group === 0) return e(target | addr, target | REG.f); // rotates, shifts, SWAP
    return e(target | addr, target); // RES, SET
  }
  if (op >= 0x40 && op < 0x80 && op !== 0x76) {
    const dst = (op >> 3) & 7;
    const src = op & 7;
    return e(r8(src) | hlMem(src) | hlMem(dst), r8(dst));
  }
  // XOR A and SUB A zero A whatever it held
  if (op === 0xaf || op === 0x97) return e(0, REG.a | REG.f);
  if (op >= 0x80 && op < 0xc0) {
    const src = op & 7;
    const isCp = op >= 0xb8;
    const carryIn = (op >= 0x88 && op < 0x90) || (op >= 0x98 && op < 0xa0) ? REG.f : 0;
    return e(REG.a | r8(src) | hlMem(src) | carryIn, (isCp ? 0 : REG.a) | REG.f);
  }
  if ((op & 0xc7) === 0x06) return e(hlMem(op >> 3), r8(op >> 3)); // LD r,n
  if ((op & 0xc7) === 0x04 || (op & 0xc7) === 0x05) {
    const r = (op >> 3) & 7; // INC r, DEC r
    return e(r8(r) | hlMem(r), r8(r) | REG.f);
  }
  if ((op & 0xcf) === 0x01) return e(0, RR_BITS[(op >> 4) & 3] ?? 0); // LD rr,nn
  if ((op & 0xcf) === 0x03 || (op & 0xcf) === 0x0b) {
    const rr = RR_BITS[(op >> 4) & 3] ?? 0; // INC rr, DEC rr
    return e(rr, rr);
  }
  if ((op & 0xcf) === 0x09)
    return e(PAIR_BITS.hl | (RR_BITS[(op >> 4) & 3] ?? 0), PAIR_BITS.hl | REG.f);
  if ((op & 0xcf) === 0xc5)
    return {
      reads: STACK_BITS[(op >> 4) & 3] ?? 0,
      writes: 0,
      flow: 'next',
      push: STACK_BITS[(op >> 4) & 3] ?? 0,
    };
  if ((op & 0xcf) === 0xc1)
    return { reads: 0, writes: 0, flow: 'next', pop: STACK_BITS[(op >> 4) & 3] ?? 0 };
  if ((op & 0xc7) === 0xc6) {
    const kind = (op >> 3) & 7; // ALU A,n
    const carryIn = kind === 1 || kind === 3 ? REG.f : 0;
    return e(REG.a | carryIn, (kind === 7 ? 0 : REG.a) | REG.f);
  }
  if (op === 0x18 || op === 0xc3) return e(0, 0, 'jump');
  if ((op & 0xe7) === 0x20 || (op & 0xe7) === 0xc2) return e(REG.f, 0, 'jumpcc');
  if (op === 0xcd) return e(0, 0, 'call');
  if ((op & 0xe7) === 0xc4) return e(REG.f, 0, 'callcc');
  if (op === 0xc9 || op === 0xd9) return e(0, 0, 'ret');
  if ((op & 0xe7) === 0xc0) return e(REG.f, 0, 'retcc');
  switch (op) {
    case 0x00: // NOP
    case 0x76: // HALT
    case 0xf3: // DI
    case 0xfb: // EI
      return e(0, 0);
    case 0x02:
      return e(REG.a | PAIR_BITS.bc, 0); // LD (BC),A
    case 0x12:
      return e(REG.a | PAIR_BITS.de, 0); // LD (DE),A
    case 0x22:
    case 0x32:
      return e(REG.a | PAIR_BITS.hl, PAIR_BITS.hl); // LD (HL±),A
    case 0x0a:
      return e(PAIR_BITS.bc, REG.a); // LD A,(BC)
    case 0x1a:
      return e(PAIR_BITS.de, REG.a); // LD A,(DE)
    case 0x2a:
    case 0x3a:
      return e(PAIR_BITS.hl, REG.a | PAIR_BITS.hl); // LD A,(HL±)
    case 0x07:
    case 0x0f:
    case 0x17:
    case 0x1f:
      return e(REG.a | REG.f, REG.a | REG.f); // RLCA RRCA RLA RRA
    case 0x27:
    case 0x2f:
      return e(REG.a | REG.f, REG.a | REG.f); // DAA, CPL
    case 0x37:
    case 0x3f:
      return e(REG.f, REG.f); // SCF, CCF
    case 0xe0:
    case 0xea:
      return e(REG.a, 0); // LDH (n),A / LD (nn),A
    case 0xf0:
    case 0xfa:
      return e(0, REG.a); // LDH A,(n) / LD A,(nn)
    case 0xe2:
      return e(REG.a | REG.c, 0); // LD (C),A
    case 0xf2:
      return e(REG.c, REG.a); // LD A,(C)
    case 0xf9:
      return e(PAIR_BITS.hl, 0); // LD SP,HL
  }
  return e(ALL, ALL, 'unknown');
}

/** What a routine does to the registers and the stack */
export interface Summary {
  /** Registers it changes (and doesn't restore) */
  writes: number;
  /** Most stack bytes it uses below its return address, calls included */
  depth: number;
  /** Indices of the instructions it runs (its own code, not its callees') */
  body: Set<number>;
}

interface Frame {
  pair: number;
  pending: number;
  /** Index of the PUSH */
  at: number;
}

/** A PUSH and the POPs that restore the same pair (a save), or a POP into another pair (a move) */
interface Save {
  pops: Set<number>;
  move: boolean;
}

export interface Analysis {
  summaries: Map<Label, Summary>;
  /** Worst-case stack depth of the main program, from its entry */
  mainDepth: number;
  violations: string[];
  /** Calls after which a register the callee changes is still needed */
  lost: Lost[];
  /** Registers live at each routine's entry (what it reads before writing) */
  inputs: Map<Label, number>;
}

/** A register still needed after a call that changes it */
export interface Lost {
  at: string;
  callee: Label | string;
  bits: number;
}

/** A callee's contract, for calls to fixed addresses (code copied to RAM) */
export type CalleeContract = RoutineContract & { readonly name: string };

/** What a contract allows a routine to change */
export function allowedBits(contract: RoutineContract): number {
  return (
    regBits(contract.out) | regBits(contract.clobbers) | (contract.keepsFlags === true ? 0 : REG.f)
  );
}

export interface AnalyzeOptions {
  /** Contracts to use instead of the routines' own (for inferring them) */
  readonly contracts?: ReadonlyMap<Label, RoutineContract>;
}

/**
 * Analyse `ops` (labels placed, jumps chosen), whose code starts at index 0, with
 * `names` naming labels for messages and `interrupts` the interrupt handlers.
 */
export function analyze(
  ops: readonly Op[],
  names: ReadonlyMap<Label, string>,
  interrupts: readonly Label[],
  options: AnalyzeOptions = {},
): Analysis {
  const labelAt = new Map<Label, number>();
  const nameAt: (string | undefined)[] = [];
  let current: string | undefined;
  for (const [i, op] of ops.entries()) {
    if (op.kind === 'label') {
      labelAt.set(op.label, i);
      current = names.get(op.label);
    }
    nameAt[i] = current;
  }
  const where = (i: number): string => nameAt[i] ?? 'the program start';
  const nameOf = (label: Label): string => names.get(label) ?? label.toString();
  const violations: string[] = [];
  const violation = (message: string): void => {
    if (!violations.includes(message)) violations.push(message);
  };
  const contractOf = (label: Label | undefined): RoutineContract | undefined =>
    label === undefined
      ? undefined
      : (options.contracts?.get(label) ?? (label instanceof Routine ? label.contract : undefined));

  /** The next instruction at or after index i, or why there isn't one */
  const nextInst = (i: number): number | string => {
    for (let j = i; j < ops.length; j++) {
      const op = ops[j];
      if (op === undefined) break;
      if (op.kind === 'inst') return j;
      if (op.kind === 'data') return 'runs into data';
      if (op.kind === 'org') return 'runs into an org';
    }
    return 'runs off the end of the program';
  };

  const entries = new Set<Label>(interrupts);
  for (const op of ops) {
    const opcode = op.kind === 'inst' ? (op.bytes[0] ?? 0) : 0;
    if (op.kind === 'inst' && (opcode === 0xcd || (opcode & 0xe7) === 0xc4)) {
      const target = op.refs?.[0]?.target;
      if (target instanceof Label) entries.add(target);
    }
  }

  const summaries = new Map<Label, Summary>();
  const saves = new Map<number, Save>();

  /** Effects of what an instruction calls (or tail-jumps to) */
  function calleeOf(
    op: InstOp,
  ): { writes: number; depth: number; contract?: RoutineContract; label?: Label } | undefined {
    const target = op.refs?.[0]?.target;
    if (target instanceof Label) {
      const s = summaries.get(target);
      const contract = contractOf(target);
      return {
        writes: s?.writes ?? 0,
        depth: s?.depth ?? 0,
        label: target,
        ...(contract === undefined ? {} : { contract }),
      };
    }
    if (op.callee !== undefined)
      return { writes: allowedBits(op.callee), depth: op.callee.depth ?? 0, contract: op.callee };
    return undefined;
  }

  /** A jump to another routine's entry, from outside it: that routine returns for this one */
  const isTailCall = (target: unknown, i: number, self: Label | undefined): target is Label =>
    target instanceof Label &&
    entries.has(target) &&
    target !== self &&
    summaries.get(target)?.body.has(i) !== true;

  function summarize(start: number, self: Label | undefined): Summary {
    let writes = 0;
    let depth = 0;
    const body = new Set<number>();
    const seen = new Set<string>();
    const work: { i: number; frames: Frame[] }[] = [];
    const go = (i: number | string, frames: Frame[], from: number): void => {
      if (typeof i === 'string') violation(`${where(from)} ${i}`);
      else work.push({ i, frames });
    };
    const write = (bits: number, frames: Frame[]): void => {
      for (let bit = 1; bit <= 0x80; bit <<= 1) {
        if ((bits & bit) === 0) continue;
        const frame = [...frames].reverse().find((f) => (f.pair & bit) !== 0);
        if (frame === undefined) writes |= bit;
        else frame.pending |= bit;
      }
    };
    go(nextInst(start), [], start);
    for (let state = work.pop(); state !== undefined; state = work.pop()) {
      const { i } = state;
      const key = `${String(i)}:${state.frames.map((f) => String(f.pair)).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      body.add(i);
      const op = ops[i];
      if (op?.kind !== 'inst') continue;
      const frames = state.frames.map((f) => ({ ...f }));
      const fx = effect(op.bytes);
      const stackBytes = frames.length * 2;
      write(fx.writes, frames);
      if (fx.push !== undefined) frames.push({ pair: fx.push, pending: 0, at: i });
      if (fx.pop !== undefined) {
        const top = frames.pop();
        if (top === undefined) violation(`${where(i)} pops more than it pushed`);
        else {
          const save = saves.get(top.at) ?? { pops: new Set<number>(), move: false };
          saves.set(top.at, save);
          if (top.pair === fx.pop) save.pops.add(i);
          else {
            save.move = true;
            write(top.pending | fx.pop, frames);
          }
        }
      }
      depth = Math.max(depth, frames.length * 2);
      const target = op.refs?.[0]?.target;
      const targetIndex = target instanceof Label ? labelAt.get(target) : undefined;
      switch (fx.flow) {
        case 'next':
          go(nextInst(i + 1), frames, i);
          break;
        case 'call':
        case 'callcc': {
          const callee = calleeOf(op);
          if (callee === undefined) {
            violation(`${where(i)} calls a fixed address with no contract`);
            writes = ALL;
          } else {
            write(callee.writes, frames);
            depth = Math.max(depth, stackBytes + 2 + callee.depth);
          }
          go(nextInst(i + 1), frames, i);
          break;
        }
        case 'ret':
        case 'retcc':
          if (frames.length > 0) {
            violation(`${where(i)} returns with ${String(frames.length * 2)} bytes still pushed`);
          }
          if (fx.flow === 'retcc') go(nextInst(i + 1), frames, i);
          break;
        case 'jump':
        case 'jumpcc':
          if (fx.flow === 'jumpcc') go(nextInst(i + 1), frames, i);
          if (isTailCall(target, i, self)) {
            const callee = summaries.get(target);
            write(callee?.writes ?? 0, frames);
            depth = Math.max(depth, stackBytes + (callee?.depth ?? 0));
          } else if (targetIndex !== undefined) {
            go(nextInst(targetIndex), frames, i);
          } else if (op.callee !== undefined) {
            write(allowedBits(op.callee), frames);
            depth = Math.max(depth, stackBytes + (op.callee.depth ?? 0));
          } else {
            violation(`${where(i)} jumps to a fixed address with no contract`);
            writes = ALL;
          }
          break;
        case 'unknown':
          violation(
            `${where(i)} has an instruction the analysis doesn't know ($${(op.bytes[0] ?? 0).toString(16)})`,
          );
          writes = ALL;
          go(nextInst(i + 1), frames, i);
          break;
      }
    }
    return { writes, depth, body };
  }

  // Routines call each other: summarize until nothing changes
  for (let round = 0; round < 20; round++) {
    let changed = false;
    for (const entry of entries) {
      const start = labelAt.get(entry);
      if (start === undefined) continue;
      const before = summaries.get(entry);
      const after = summarize(start, entry);
      if (
        before?.writes !== after.writes ||
        before.depth !== after.depth ||
        before.body.size !== after.body.size
      ) {
        changed = true;
      }
      summaries.set(entry, after);
    }
    if (!changed) break;
  }
  const main = summarize(0, undefined);

  // Contracts: a routine changes only what it says it may
  for (const [label, summary] of summaries) {
    if (interrupts.includes(label)) {
      if (summary.writes !== 0) {
        violation(
          `interrupt handler ${nameOf(label)} changes ${regNames(summary.writes)}: it must save and restore them`,
        );
      }
      continue;
    }
    const contract = contractOf(label);
    if (contract === undefined) {
      violation(`routine ${nameOf(label)} has no contract: declare it with routine()`);
      continue;
    }
    const extra = summary.writes & ~allowedBits(contract);
    if (extra !== 0)
      violation(`${nameOf(label)} changes ${regNames(extra)}, which its contract doesn't allow`);
  }

  // Liveness: at each call, nothing the callee clobbers may still be needed after it
  const retOut = new Map<number, number>();
  for (const [label, summary] of summaries) {
    const contract = contractOf(label);
    const out = interrupts.includes(label) ? 0 : regBits(contract?.out);
    for (const i of summary.body) retOut.set(i, (retOut.get(i) ?? 0) | out);
  }
  const nodes = new Set<number>(main.body);
  for (const s of summaries.values()) for (const i of s.body) nodes.add(i);
  const liveIn = new Map<number, number>();
  const live = (i: number | string): number => (typeof i === 'string' ? 0 : (liveIn.get(i) ?? 0));
  /** What's live after a POP: it falls through to the next instruction */
  const liveOut = (i: number): number => live(nextInst(i + 1));

  const transfer = (
    i: number,
  ): { out: number; in: number; clobbered: number; callee?: Label | string } => {
    const op = ops[i];
    if (op?.kind !== 'inst') return { out: 0, in: 0, clobbered: 0 };
    const fx = effect(op.bytes);
    const target = op.refs?.[0]?.target;
    const targetIndex = target instanceof Label ? labelAt.get(target) : undefined;
    const next = nextInst(i + 1);
    let out = 0;
    let reads = fx.reads;
    let writes = fx.writes | (fx.pop ?? 0);
    // A PUSH that's only a save needs the pair only if it's needed after the restore
    const save = fx.push === undefined ? undefined : saves.get(i);
    if (save !== undefined && !save.move) {
      let neededAfter = 0;
      for (const pop of save.pops) neededAfter |= liveOut(pop);
      reads &= ~(fx.push ?? 0) | neededAfter;
    }
    let clobbered = 0;
    let calleeName: Label | string | undefined;
    switch (fx.flow) {
      case 'next':
        out = live(next);
        break;
      case 'jump':
      case 'jumpcc':
        if (isTailCall(target, i, undefined)) {
          const contract = contractOf(target);
          out = retOut.get(i) ?? 0;
          reads |= regBits(contract?.in);
          writes |= summaries.get(target)?.writes ?? 0;
        } else if (targetIndex !== undefined) {
          out = live(nextInst(targetIndex));
        } else if (op.callee !== undefined) {
          out = retOut.get(i) ?? 0;
          reads |= regBits(op.callee.in);
          writes |= allowedBits(op.callee);
        }
        if (fx.flow === 'jumpcc') out |= live(next);
        break;
      case 'call':
      case 'callcc': {
        out = live(next);
        const callee = calleeOf(op);
        if (callee !== undefined) {
          reads |= regBits(callee.contract?.in);
          writes |= callee.writes;
          clobbered = callee.writes & ~regBits(callee.contract?.out);
          calleeName = callee.label ?? op.callee?.name;
        }
        break;
      }
      case 'ret':
        out = retOut.get(i) ?? 0;
        break;
      case 'retcc':
        out = (retOut.get(i) ?? 0) | live(next);
        break;
      case 'unknown':
        out = ALL;
        break;
    }
    return {
      out,
      in: reads | (out & ~writes),
      clobbered,
      ...(calleeName === undefined ? {} : { callee: calleeName }),
    };
  };

  const order = [...nodes].sort((a, b) => b - a);
  for (let round = 0; round < 200; round++) {
    let changed = false;
    for (const i of order) {
      const t = transfer(i).in;
      if (t !== (liveIn.get(i) ?? 0)) {
        liveIn.set(i, t);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const lost: Lost[] = [];
  for (const i of order) {
    const { out, clobbered, callee } = transfer(i);
    const bits = out & clobbered;
    if (bits !== 0 && callee !== undefined) {
      lost.push({ at: where(i), callee, bits });
      const calleeText = typeof callee === 'string' ? callee : nameOf(callee);
      violation(
        `${where(i)} still needs ${regNames(bits)} after calling ${calleeText}, which changes it`,
      );
    }
  }

  const inputs = new Map<Label, number>();
  for (const entry of entries) {
    const start = labelAt.get(entry);
    if (start === undefined) continue;
    inputs.set(entry, live(nextInst(start)));
  }
  return { summaries, mainDepth: main.depth, violations, lost, inputs };
}
