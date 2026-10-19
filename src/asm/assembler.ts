import { Label, type Op, Pooled, type Target } from './types';
import { at, hex } from './util';

export const ROM_SIZE = 32 * 1024; // 32KB, single bank, no mapper

/** Program code starts right after the cartridge header. */
export const PROGRAM_START = 0x0150;

const VBLANK_VECTOR = 0x0040;
const HEADER_START = 0x0100;
const TITLE_ADDR = 0x0134;
const TITLE_MAX_LENGTH = 11;

/** ROM regions the assembler writes itself; program bytes must not overlap them. */
const RESERVED_REGIONS: readonly { start: number; end: number; name: string }[] = [
  { start: VBLANK_VECTOR, end: VBLANK_VECTOR + 3, name: 'VBlank vector' },
  { start: HEADER_START, end: PROGRAM_START, name: 'cartridge header' },
];

// Nintendo logo — required at $0104-$0133 for the boot ROM to accept the cartridge
export const NINTENDO_LOGO = new Uint8Array([
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d,
  0x00, 0x08, 0x11, 0x1f, 0x88, 0x89, 0x00, 0x0e, 0xdc, 0xcc, 0x6e, 0xe6, 0xdd, 0xdd, 0xd9, 0x99,
  0xbb, 0xbb, 0x67, 0x63, 0x6e, 0x0e, 0xec, 0xcc, 0xdd, 0xdc, 0x99, 0x9f, 0xbb, 0xb9, 0x33, 0x3e,
]);

export interface ROMHeader {
  title: string; // Up to 11 ASCII characters
  cgbFlag?: 0x00 | 0x80 | 0xc0; // $00 = DMG, $80 = CGB+DMG, $C0 = CGB only
  cartridgeType?: number; // $00 = ROM only
  romSize?: number; // $00 = 32KB
  ramSize?: number; // $00 = none
  destinationCode?: 0x00 | 0x01; // $00 = Japan, $01 = international
  /** A VBlank interrupt handler (JP'd to from $0040); without one, VBlank just returns */
  vblankHandler?: Label;
}

export interface AssembleResult {
  rom: Uint8Array;
  /** Every label's address by name, in program order */
  symbols: Map<string, number>;
  /** Names of labels nothing refers to (dead code, or just markers), in program order */
  unreferenced: string[];
  /** Bytes of code and data the program occupies (excluding the header) */
  programBytes: number;
}

type Emitting = Extract<Op, { kind: 'inst' | 'data' }>;

interface Positioned {
  op: Emitting;
  address: number;
}

interface Layout {
  positioned: Positioned[];
  addresses: Map<Label, number>;
  /** Each pooled entry's label, by Pooled.key */
  pooled: Map<string, Label>;
}

function addr(n: number): string {
  return `$${hex(n, 4)}`;
}

function writeHeader(rom: Uint8Array, header: ROMHeader): void {
  if (header.title.length > TITLE_MAX_LENGTH || !/^[\x20-\x7e]*$/.test(header.title)) {
    throw new Error(
      `ROM title must be at most ${String(TITLE_MAX_LENGTH)} printable ASCII characters: "${header.title}"`,
    );
  }

  // VBlank interrupt handler — just RETI so HALT wakes up.
  rom[VBLANK_VECTOR] = 0xd9; // RETI

  // Entry point: NOP + JP $0150
  rom.set([0x00, 0xc3, PROGRAM_START & 0xff, PROGRAM_START >> 8], HEADER_START);

  rom.set(NINTENDO_LOGO, 0x0104);
  rom.set(
    Array.from(header.title, (ch) => ch.charCodeAt(0)),
    TITLE_ADDR,
  ); // checked ASCII above

  rom[0x0143] = header.cgbFlag ?? 0x00;
  rom[0x0147] = header.cartridgeType ?? 0x00;
  rom[0x0148] = header.romSize ?? 0x00;
  rom[0x0149] = header.ramSize ?? 0x00;
  rom[0x014a] = header.destinationCode ?? 0x01;
  rom[0x014b] = 0x33; // Old licensee code: $33 = use new licensee code
}

/** Pass 0: replace pool() with the Pooled data the program refers to, one copy each. */
function expandPool(program: readonly Op[]): { ops: Op[]; pooled: Map<string, Label> } {
  const entries = new Map<string, { label: Label; bytes: Uint8Array }>();
  const counts = new Map<string, number>();
  for (const op of program) {
    if (op.kind !== 'inst' || op.refs === undefined) continue;
    for (const { target } of op.refs) {
      if (!(target instanceof Pooled) || entries.has(target.key)) continue;
      const n = counts.get(target.prefix) ?? 0;
      counts.set(target.prefix, n + 1);
      entries.set(target.key, {
        label: new Label(`${target.prefix}_${String(n)}`),
        bytes: target.bytes,
      });
    }
  }

  const pools = program.filter((op) => op.kind === 'pool').length;
  if (pools > 1) throw new Error(`A program can have only one pool(), found ${String(pools)}`);
  if (pools === 0 && entries.size > 0) {
    throw new Error('The program refers to pooled data but has no pool() to store it in');
  }

  const data = [...entries.values()].flatMap(({ label, bytes }): Op[] => [
    { kind: 'label', label },
    { kind: 'data', bytes },
  ]);
  const ops =
    pools === 0 ? [...program] : program.flatMap((op) => (op.kind === 'pool' ? data : [op]));
  return { ops, pooled: new Map([...entries].map(([key, { label }]) => [key, label])) };
}

/**
 * Pass 0b: encode each jump to a label as a JR when the label is in range, else a JP.
 * Every jump starts short, and the ones that can't reach are lengthened until none
 * change. Lengthening only moves code apart, so this always settles.
 */
function chooseJumps(ops: readonly Op[]): Op[] {
  const long = new Set<number>();
  for (;;) {
    const labels = new Map<Label, number>();
    const jumps: { index: number; address: number; target: Label }[] = [];
    let pc = PROGRAM_START;
    for (const [index, op] of ops.entries()) {
      switch (op.kind) {
        case 'label':
          labels.set(op.label, pc);
          break;
        case 'org':
          pc = op.address;
          break;
        case 'jump':
          if (!long.has(index)) jumps.push({ index, address: pc, target: op.target });
          pc += (long.has(index) ? op.long : op.short).bytes.length;
          break;
        case 'inst':
        case 'data':
          pc += op.bytes.length;
          break;
        case 'pool':
          break;
      }
    }

    let changed = false;
    for (const { index, address, target } of jumps) {
      const to = labels.get(target);
      if (to === undefined) continue; // reported as undefined when emitting
      const offset = to - (address + 2);
      if (offset < -128 || offset > 127) {
        long.add(index);
        changed = true;
      }
    }
    if (!changed) {
      return ops.map((op, index) =>
        op.kind === 'jump' ? (long.has(index) ? op.long : op.short) : op,
      );
    }
  }
}

/** Pass 1: assign addresses, place labels, and reject overlapping or out-of-range output. */
function layout(program: readonly Op[]): Layout {
  const expanded = expandPool(program);
  const { pooled } = expanded;
  const ops = chooseJumps(expanded.ops);
  const addresses = new Map<Label, number>();
  const names = new Set<string>();
  const positioned: Positioned[] = [];
  let pc = PROGRAM_START;

  for (const op of ops) {
    switch (op.kind) {
      case 'label':
        if (addresses.has(op.label)) {
          throw new Error(`Label "${op.label.name}" is placed twice`);
        }
        if (names.has(op.label.name)) {
          throw new Error(`Duplicate label: "${op.label.name}"`);
        }
        names.add(op.label.name);
        addresses.set(op.label, pc);
        break;
      case 'org':
        pc = op.address;
        break;
      case 'inst':
      case 'data':
        positioned.push({ op, address: pc });
        pc += op.bytes.length;
        break;
      case 'pool':
      case 'jump':
        throw new Error(`${op.kind} left after expandPool and chooseJumps`); // unreachable
    }
  }

  const ranges = positioned
    .filter(({ op }) => op.bytes.length > 0)
    .map(({ op, address }) => ({ start: address, end: address + op.bytes.length }))
    .sort((a, b) => a.start - b.start);

  for (const [i, range] of ranges.entries()) {
    if (range.end > ROM_SIZE) {
      throw new Error(
        `Program does not fit in ROM: bytes at ${addr(range.start)} extend to ${addr(range.end)} (limit ${addr(ROM_SIZE)})`,
      );
    }
    for (const reserved of RESERVED_REGIONS) {
      if (range.start < reserved.end && reserved.start < range.end) {
        throw new Error(`Program bytes at ${addr(range.start)} overlap the ${reserved.name}`);
      }
    }
    const next = ranges[i + 1];
    if (next !== undefined && next.start < range.end) {
      throw new Error(`Program bytes overlap at ${addr(next.start)}`);
    }
  }

  return { positioned, addresses, pooled };
}

/** The address of a label or pooled entry; `at` is where it's referenced, for errors */
function resolve({ addresses, pooled }: Layout, target: Target, at: number): number {
  const label = target instanceof Pooled ? pooled.get(target.key) : target;
  const address = label === undefined ? undefined : addresses.get(label);
  if (address !== undefined) return address;

  const name = label?.name ?? (target instanceof Pooled ? target.prefix : target.name);
  const sameName = [...addresses.keys()].some((placed) => placed.name === name);
  throw new Error(
    `Undefined label: "${name}" (referenced at ${addr(at)})` +
      (sameName ? '; a different Label with that name is placed (labels match by identity)' : ''),
  );
}

/** Pass 2: copy bytes and patch references. Returns the labels referred to. */
function emit(rom: Uint8Array, program: Layout): Set<Label> {
  const referenced = new Set<Label>();
  for (const { op, address } of program.positioned) {
    rom.set(op.bytes, address);
    if (op.kind !== 'inst' || op.refs === undefined) continue;

    for (const r of op.refs) {
      const target = resolve(program, r.target, address);
      const label = r.target instanceof Pooled ? program.pooled.get(r.target.key) : r.target;
      if (label !== undefined) referenced.add(label);

      if (r.type === 'rel8') {
        // Relative offset from the END of this instruction
        const offset = target - (address + op.bytes.length);
        if (offset < -128 || offset > 127) {
          throw new Error(
            `JR target "${r.target.name}" out of range: offset ${String(offset)} at ${addr(address)}`,
          );
        }
        rom[address + r.offset] = offset & 0xff;
      } else {
        // imm16: little-endian absolute address
        rom[address + r.offset] = target & 0xff;
        rom[address + r.offset + 1] = (target >> 8) & 0xff;
      }
    }
  }
  return referenced;
}

/** Header checksum ($014D): complement of sum of $0134-$014C */
export function headerChecksum(rom: Uint8Array): number {
  let sum = 0;
  for (let i = TITLE_ADDR; i <= 0x014c; i++) {
    sum = (sum - at(rom, i) - 1) & 0xff;
  }
  return sum;
}

/** Global checksum ($014E-$014F): 16-bit sum of all bytes except the checksum itself */
export function globalChecksum(rom: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < rom.length; i++) {
    if (i === 0x014e || i === 0x014f) continue;
    sum = (sum + at(rom, i)) & 0xffff;
  }
  return sum;
}

/**
 * Assembler: resolves labels and pooled data and emits a valid Game Boy ROM.
 *
 * The program should NOT include the entry point or header — the assembler
 * writes those automatically. Program code begins at $0150.
 */
export function assemble(program: readonly Op[], header: ROMHeader): AssembleResult {
  const rom = new Uint8Array(ROM_SIZE);
  writeHeader(rom, header);

  const laidOut = layout(program);
  const referenced = emit(rom, laidOut);
  if (header.vblankHandler !== undefined) {
    const handler = resolve(laidOut, header.vblankHandler, VBLANK_VECTOR);
    referenced.add(header.vblankHandler);
    rom.set([0xc3, handler & 0xff, handler >> 8], VBLANK_VECTOR); // JP handler
  }

  rom[0x014d] = headerChecksum(rom);
  const global = globalChecksum(rom);
  rom[0x014e] = (global >> 8) & 0xff;
  rom[0x014f] = global & 0xff;

  const placed = [...laidOut.addresses];
  return {
    rom,
    symbols: new Map(placed.map(([label, address]) => [label.name, address])),
    unreferenced: placed.filter(([label]) => !referenced.has(label)).map(([label]) => label.name),
    programBytes: laidOut.positioned.reduce((sum, { op }) => sum + op.bytes.length, 0),
  };
}

function symbolBank(address: number): number {
  return address >= 0x4000 && address < 0x8000 ? 1 : 0;
}

/**
 * Render symbols in the BGB/no$gmb `.sym` format (`bank:addr name`), sorted by address.
 * Without a mapper, $0000-$3FFF is bank 0 and $4000-$7FFF is bank 1; RAM addresses are bank 0.
 */
export function formatSymbolFile(symbols: ReadonlyMap<string, number>): string {
  return [...symbols.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name, address]) => `${hex(symbolBank(address), 2)}:${hex(address, 4)} ${name}\n`)
    .join('');
}
