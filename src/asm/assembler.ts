import { type Op } from './types';

const ROM_SIZE = 32 * 1024; // 32KB

/** Checked array/Uint8Array read — throws on out-of-bounds instead of returning undefined */
function at(arr: ArrayLike<number>, i: number): number {
  const v = arr[i];
  if (v === undefined) {
    throw new RangeError(`Out of bounds read at index ${String(i)}`);
  }
  return v;
}

// Nintendo logo — required at $0104-$0133 for the boot ROM to accept the cartridge
const NINTENDO_LOGO = new Uint8Array([
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d,
  0x00, 0x08, 0x11, 0x1f, 0x88, 0x89, 0x00, 0x0e, 0xdc, 0xcc, 0x6e, 0xe6, 0xdd, 0xdd, 0xd9, 0x99,
  0xbb, 0xbb, 0x67, 0x63, 0x6e, 0x0e, 0xec, 0xcc, 0xdd, 0xdc, 0x99, 0x9f, 0xbb, 0xb9, 0x33, 0x3e,
]);

export interface ROMHeader {
  title: string; // Up to 11 characters
  cgbFlag?: number; // $00 = DMG, $80 = CGB+DMG, $C0 = CGB only
  cartridgeType?: number; // $00 = ROM only
  romSize?: number; // $00 = 32KB
  ramSize?: number; // $00 = none
  destinationCode?: number; // $00 = Japan, $01 = international
}

export interface AssembleResult {
  rom: Uint8Array;
  symbols: Map<string, number>;
}

/**
 * Two-pass assembler: resolves labels and emits a valid Game Boy ROM.
 *
 * The program should NOT include the entry point or header — the assembler
 * writes those automatically. Program code begins at $0150.
 */
export function assemble(program: Op[], header: ROMHeader): AssembleResult {
  const rom = new Uint8Array(ROM_SIZE);
  const symbols = new Map<string, number>();

  // -----------------------------------------------------------------------
  // Write header ($0100 – $014F)
  // -----------------------------------------------------------------------

  // Entry point: NOP + JP $0150
  rom[0x0100] = 0x00; // NOP
  rom[0x0101] = 0xc3; // JP
  rom[0x0102] = 0x50; // lo($0150)
  rom[0x0103] = 0x01; // hi($0150)

  // Nintendo logo
  rom.set(NINTENDO_LOGO, 0x0104);

  // Title (up to 11 bytes, padded with zeroes)
  const titleBytes = new TextEncoder().encode(header.title.slice(0, 11));
  rom.set(titleBytes, 0x0134);

  // CGB flag
  rom[0x0143] = header.cgbFlag ?? 0x00;

  // Cartridge type
  rom[0x0147] = header.cartridgeType ?? 0x00;

  // ROM size
  rom[0x0148] = header.romSize ?? 0x00;

  // RAM size
  rom[0x0149] = header.ramSize ?? 0x00;

  // Destination code
  rom[0x014a] = header.destinationCode ?? 0x01;

  // Old licensee code ($33 = use new licensee code)
  rom[0x014b] = 0x33;

  // -----------------------------------------------------------------------
  // Pass 1: assign addresses and record labels
  // -----------------------------------------------------------------------

  // Flat list of positioned operations for pass 2
  const positioned: { op: Op; address: number }[] = [];
  let pc = 0x0150; // program starts after header

  for (const op of program) {
    switch (op.kind) {
      case 'label':
        symbols.set(op.name, pc);
        break;
      case 'org':
        pc = op.address;
        break;
      case 'inst':
        positioned.push({ op, address: pc });
        pc += op.bytes.length;
        break;
      case 'data':
        positioned.push({ op, address: pc });
        pc += op.bytes.length;
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Pass 2: resolve references and write bytes
  // -----------------------------------------------------------------------

  for (const { op, address } of positioned) {
    if (op.kind === 'data') {
      rom.set(op.bytes, address);
      continue;
    }

    if (op.kind !== 'inst') continue;

    // Copy raw bytes
    for (let i = 0; i < op.bytes.length; i++) {
      rom[address + i] = at(op.bytes, i);
    }

    // Resolve label references
    if (op.refs) {
      for (const r of op.refs) {
        const target = symbols.get(r.label);
        if (target === undefined) {
          throw new Error(`Undefined label: "${r.label}" (referenced at $${address.toString(16)})`);
        }

        if (r.type === 'rel8') {
          // Relative offset from the END of this instruction
          const instrEnd = address + op.bytes.length;
          const offset = target - instrEnd;
          if (offset < -128 || offset > 127) {
            throw new Error(
              `JR target "${r.label}" out of range: offset ${String(offset)} at $${address.toString(16)}`,
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

  // -----------------------------------------------------------------------
  // Checksums
  // -----------------------------------------------------------------------

  // Header checksum ($014D): complement of sum of $0134-$014C
  let headerSum = 0;
  for (let i = 0x0134; i <= 0x014c; i++) {
    headerSum = (headerSum - at(rom, i) - 1) & 0xff;
  }
  rom[0x014d] = headerSum;

  // Global checksum ($014E-$014F): sum of all bytes except the checksum itself
  let globalSum = 0;
  for (let i = 0; i < ROM_SIZE; i++) {
    if (i === 0x014e || i === 0x014f) continue;
    globalSum = (globalSum + at(rom, i)) & 0xffff;
  }
  rom[0x014e] = (globalSum >> 8) & 0xff;
  rom[0x014f] = globalSum & 0xff;

  return { rom, symbols };
}
