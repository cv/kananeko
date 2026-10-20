/**
 * Structured control flow: branches and loops whose labels are made for you.
 *
 *   cp(3), ...ifThen('z', [inc('b')])                // if A == 3: B++
 *   ...ifElse('c', [ld('a', 1)], [xor('a')])         // A = carry ? 1 : 0
 *   ...repeat(4, [ld(['hl+'], 'a')])                 // B counts down
 *   ...doWhile('nz', [ld(['hl+'], 'a'), dec('c')])   // until C reaches 0
 *   ...block((done) => [cp(3), jr('z', done), ..., cp(5), jr('z', done), ...])
 *   ...loop((again, done) => [ld('a', ['hl']), or('a'), jr('z', done), ..., jr(again)])
 *
 * The jumps they make are left to the assembler, which uses JR whenever it reaches.
 */

import type { ByteValue } from './ram';
import { cp, dec, jp, label, ld, ret } from './sm83';
import { type CCName, Label, type Op, type U16 } from './types';
import { lo } from './util';

/** The condition that holds when `cc` doesn't */
export const INVERSE: Readonly<Record<CCName, CCName>> = { nz: 'z', z: 'nz', nc: 'c', c: 'nc' };

const RET = 0xc9;
const JP = 0xc3;
const JR = 0x18;
const RETI = 0xd9;

/** True when `ops` always leaves (RET, RETI, or an unconditional jump), so nothing follows */
function exits(ops: readonly Op[]): boolean {
  const last = ops.at(-1);
  if (last === undefined) return false;
  if (last.kind === 'jump') return last.long.bytes[0] === JP;
  if (last.kind !== 'inst') return false;
  const opcode = last.bytes[0];
  return opcode === RET || opcode === RETI || opcode === JP || opcode === JR;
}

/** Run `body` only when `cc` holds (after a CP, AND, DEC...); otherwise skip it. */
export function ifThen(cc: CCName, body: readonly Op[]): Op[] {
  const skip = new Label();
  return [jp(INVERSE[cc], skip), ...body, label(skip)];
}

/** Run `then` when `cc` holds and `otherwise` when it doesn't. */
export function ifElse(cc: CCName, then: readonly Op[], otherwise: readonly Op[]): Op[] {
  const otherwiseLabel = new Label();
  const end = new Label();
  return [
    jp(INVERSE[cc], otherwiseLabel),
    ...then,
    ...(exits(then) ? [] : [jp(end)]),
    label(otherwiseLabel),
    ...otherwise,
    label(end),
  ];
}

/** Run `body` `count` (1-256) times, counting down in `reg` (B unless `body` needs it). */
export function repeat(count: number, body: readonly Op[], reg: 'b' | 'c' | 'd' | 'e' = 'b'): Op[] {
  if (!Number.isInteger(count) || count < 1 || count > 256) {
    throw new RangeError(`repeat count must be 1-256, got ${String(count)}`);
  }
  const again = new Label();
  return [ld(reg, lo(count)), label(again), ...body, dec(reg), jp('nz', again)];
}

/** `body` gets a label just after it: jumping to `done` leaves the block. */
export function block(body: (done: Label) => readonly Op[]): Op[] {
  const done = new Label();
  return [...body(done), label(done)];
}

/** Run `body`, then go round again while `cc` holds. */
export function doWhile(cc: CCName, body: readonly Op[]): Op[] {
  const again = new Label();
  return [label(again), ...body, jp(cc, again)];
}

/**
 * A loop: `body` gets the labels of its top (jump there to go round again) and of
 * the point just after it (jump there to leave).
 */
export function loop(body: (again: Label, done: Label) => readonly Op[]): Op[] {
  const again = new Label();
  const done = new Label();
  return [label(again), ...body(again, done), label(done)];
}

// ---------------------------------------------------------------------------
// Branching on a variable's value
// ---------------------------------------------------------------------------

/**
 * A = the variable; Z set if it holds `value`. A variable declared with byteOf only
 * compares with values of its own kind.
 */
export function compare<A extends U16>(variable: A, value: ByteValue<A>): Op[] {
  return [ld('a', [variable]), cp(value)];
}

/** Run `body` only when the variable holds `value` (A = the variable). */
export function ifEquals<A extends U16>(
  variable: A,
  value: ByteValue<A>,
  body: readonly Op[],
): Op[] {
  return [...compare(variable, value), ...ifThen('z', body)];
}

/** Run `body` only when the variable doesn't hold `value` (A = the variable). */
export function ifNotEquals<A extends U16>(
  variable: A,
  value: ByteValue<A>,
  body: readonly Op[],
): Op[] {
  return [...compare(variable, value), ...ifThen('nz', body)];
}

/** What dispatch does with one value: jump to a label, return, or carry on after it */
export type Case = Label | 'ret' | 'continue';

/** Passes when `E` names every value the variable can hold */
type Covers<A extends U16, E> =
  number extends ByteValue<A>
    ? unknown
    : [Exclude<ByteValue<A>, E[keyof E]>] extends [never]
      ? unknown
      : { readonly missing: Exclude<ByteValue<A>, E[keyof E]> };

/**
 * Branch on a variable's value, with a case for every name in `values` (its enum):
 *
 *   ...dispatch(MEM.KANA_STATE, KanaState, {
 *     IDLE: 'ret',
 *     AWAITING: 'continue',
 *     ADVANCE_FEEDBACK: correctFeedback,
 *     RETRY_FEEDBACK: wrongFeedback,
 *   })
 *
 * Leaving out a name, or passing another variable's enum, is a type error. The values
 * are tested in the enum's order; when no case continues, the last one needs no test.
 */
export function dispatch<A extends U16, const E extends Readonly<Record<string, ByteValue<A>>>>(
  variable: A,
  values: E & Covers<A, E>,
  cases: { readonly [K in keyof E]: Case },
): Op[] {
  for (const name of Object.keys(values)) {
    if (!(name in cases)) throw new Error(`dispatch has no case for ${name}`);
  }
  const tested = Object.entries(values as E).filter(([name]) => cases[name] !== 'continue');
  if (tested.length === 0) throw new Error('dispatch needs a case that returns or jumps');
  const falls = tested.length < Object.keys(values).length;
  return [
    ld('a', [variable]),
    ...tested.flatMap(([name, value], i) => {
      const action = cases[name] as Exclude<Case, 'continue'>;
      if (!falls && i === tested.length - 1) return [action === 'ret' ? ret() : jp(action)];
      return [cp(value), action === 'ret' ? ret('z') : jp('z', action)];
    }),
  ];
}
