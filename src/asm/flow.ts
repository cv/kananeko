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

import { dec_r, jp, jp_cc, label, ld_r_n } from './ops';
import { type CCName, Label, type Op } from './types';
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
  return [jp_cc(INVERSE[cc], skip), ...body, label(skip)];
}

/** Run `then` when `cc` holds and `otherwise` when it doesn't. */
export function ifElse(cc: CCName, then: readonly Op[], otherwise: readonly Op[]): Op[] {
  const otherwiseLabel = new Label();
  const end = new Label();
  return [
    jp_cc(INVERSE[cc], otherwiseLabel),
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
  return [ld_r_n(reg, lo(count)), label(again), ...body, dec_r(reg), jp_cc('nz', again)];
}

/** `body` gets a label just after it: jumping to `done` leaves the block. */
export function block(body: (done: Label) => readonly Op[]): Op[] {
  const done = new Label();
  return [...body(done), label(done)];
}

/** Run `body`, then go round again while `cc` holds. */
export function doWhile(cc: CCName, body: readonly Op[]): Op[] {
  const again = new Label();
  return [label(again), ...body, jp_cc(cc, again)];
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
