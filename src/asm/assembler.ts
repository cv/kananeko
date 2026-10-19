import { type Op } from './types';
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
  cgbFlag?: number; // $00 = DMG, $80 = CGB+DMG, $C0 = CGB only
  cartridgeType?: number; // $00 = ROM only
  romSize?: number; // $00 = 32KB
  ramSize?: number; // $00 = none
  destinationCode?: number; // $00 = Japan, $01 = international
  /** Label of a VBlank interrupt handler (JP'd to from $0040); without one, VBlank just returns */
  vblankHandler?: string;
}

export interface AssembleResult {
  rom: Uint8Array;
  symbols: Map<string, number>;
}

type Emitting = Extract<Op, { kind: 'inst' | 'data' }>;

interface Positioned {
  op: Emitting;
  address: number;
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
  rom.set(new TextEncoder().encode(header.title), TITLE_ADDR);

  rom[0x0143] = header.cgbFlag ?? 0x00;
  rom[0x0147] = header.cartridgeType ?? 0x00;
  rom[0x0148] = header.romSize ?? 0x00;
  rom[0x0149] = header.ramSize ?? 0x00;
  rom[0x014a] = header.destinationCode ?? 0x01;
  rom[0x014b] = 0x33; // Old licensee code: $33 = use new licensee code
}

/** Pass 1: assign addresses, record labels, and reject overlapping or out-of-range output. */
function layout(program: readonly Op[]): {
  positioned: Positioned[];
  symbols: Map<string, number>;
} {
  const symbols = new Map<string, number>();
  const positioned: Positioned[] = [];
  let pc = PROGRAM_START;

  for (const op of program) {
    switch (op.kind) {
      case 'label':
        if (symbols.has(op.name)) {
          throw new Error(`Duplicate label: "${op.name}"`);
        }
        symbols.set(op.name, pc);
        break;
      case 'org':
        pc = op.address;
        break;
      case 'inst':
      case 'data':
        positioned.push({ op, address: pc });
        pc += op.bytes.length;
        break;
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

  return { positioned, symbols };
}

/** Pass 2: copy bytes and patch label references. */
function emit(
  rom: Uint8Array,
  positioned: readonly Positioned[],
  symbols: Map<string, number>,
): void {
  for (const { op, address } of positioned) {
    rom.set(op.bytes, address);
    if (op.kind !== 'inst' || op.refs === undefined) continue;

    for (const r of op.refs) {
      const target = symbols.get(r.label);
      if (target === undefined) {
        throw new Error(`Undefined label: "${r.label}" (referenced at ${addr(address)})`);
      }

      if (r.type === 'rel8') {
        // Relative offset from the END of this instruction
        const offset = target - (address + op.bytes.length);
        if (offset < -128 || offset > 127) {
          throw new Error(
            `JR target "${r.label}" out of range: offset ${String(offset)} at ${addr(address)}`,
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
 * Two-pass assembler: resolves labels and emits a valid Game Boy ROM.
 *
 * The program should NOT include the entry point or header — the assembler
 * writes those automatically. Program code begins at $0150.
 */
export function assemble(program: readonly Op[], header: ROMHeader): AssembleResult {
  const rom = new Uint8Array(ROM_SIZE);
  writeHeader(rom, header);

  const { positioned, symbols } = layout(program);
  emit(rom, positioned, symbols);
  if (header.vblankHandler !== undefined) {
    const handler = symbols.get(header.vblankHandler);
    if (handler === undefined) {
      throw new Error(`Undefined VBlank handler label: "${header.vblankHandler}"`);
    }
    rom.set([0xc3, handler & 0xff, handler >> 8], VBLANK_VECTOR); // JP handler
  }

  rom[0x014d] = headerChecksum(rom);
  const global = globalChecksum(rom);
  rom[0x014e] = (global >> 8) & 0xff;
  rom[0x014f] = global & 0xff;

  return { rom, symbols };
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
