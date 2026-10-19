/** Assembler layout, label resolution, validation, header, and symbol output. */

import { describe, expect, it } from 'vitest';
import {
  NINTENDO_LOGO,
  PROGRAM_START,
  ROM_SIZE,
  assemble,
  formatSymbolFile,
  globalChecksum,
  headerChecksum,
} from '@asm/assembler';
import { call, db, jp, jr, jr_cc, label, nop, org } from '@asm/ops';
import { type Op, ref, u16 } from '@asm/types';

const HEADER = { title: 'TEST' };

function build(program: Op[]): ReturnType<typeof assemble> {
  return assemble(program, HEADER);
}

describe('label resolution', () => {
  it('assigns labels the address of the following instruction', () => {
    const { symbols } = build([label('start'), nop(), nop(), label('after')]);
    expect(symbols.get('start')).toBe(PROGRAM_START);
    expect(symbols.get('after')).toBe(PROGRAM_START + 2);
  });

  it('patches forward imm16 references little-endian', () => {
    const { rom } = build([call(ref('target')), nop(), label('target')]);
    const target = PROGRAM_START + 4;
    expect([...rom.slice(PROGRAM_START, PROGRAM_START + 3)]).toEqual([
      0xcd,
      target & 0xff,
      target >> 8,
    ]);
  });

  it('patches rel8 offsets relative to the end of the instruction', () => {
    const { rom } = build([label('loop'), jr(ref('loop')), jr_cc('z', ref('next')), label('next')]);
    expect(rom[PROGRAM_START + 1]).toBe(0xfe); // -2: back to itself
    expect(rom[PROGRAM_START + 3]).toBe(0x00); // falls through
  });

  it('places code and data at org addresses', () => {
    const { rom, symbols } = build([org(u16(0x4000)), label('blob'), db([0xde, 0xad])]);
    expect(symbols.get('blob')).toBe(0x4000);
    expect([rom[0x4000], rom[0x4001]]).toEqual([0xde, 0xad]);
  });
});

describe('validation', () => {
  it('rejects undefined labels', () => {
    expect(() => build([jp(ref('nowhere'))])).toThrow(/Undefined label: "nowhere"/);
  });

  it('rejects duplicate labels', () => {
    expect(() => build([label('a'), nop(), label('a')])).toThrow(/Duplicate label: "a"/);
  });

  it('rejects relative jumps beyond ±127 bytes', () => {
    expect(() => build([jr(ref('far')), db(new Uint8Array(200)), label('far')])).toThrow(
      /out of range/,
    );
  });

  it('rejects programs that run past the end of the ROM', () => {
    expect(() => build([org(u16(ROM_SIZE - 1)), db([1, 2])])).toThrow(/does not fit/);
  });

  it('rejects output overlapping the cartridge header', () => {
    expect(() => build([org(u16(0x0130)), nop()])).toThrow(/cartridge header/);
  });

  it('rejects output overlapping the VBlank vector', () => {
    expect(() => build([org(u16(0x0040)), nop()])).toThrow(/VBlank vector/);
  });

  it('rejects overlapping output', () => {
    expect(() => build([org(u16(0x0200)), nop(), nop(), org(u16(0x0201)), nop()])).toThrow(
      /overlap at \$0201/,
    );
  });

  it('rejects titles longer than 11 characters', () => {
    expect(() => assemble([], { title: 'TWELVE CHARS' })).toThrow(/ROM title/);
  });
});

describe('header', () => {
  const { rom } = assemble([nop()], {
    title: 'HELLO',
    cgbFlag: 0x80,
    destinationCode: 0x00,
  });

  it('writes the entry point, logo, title, and flags', () => {
    expect([...rom.slice(0x0100, 0x0104)]).toEqual([0x00, 0xc3, 0x50, 0x01]);
    expect(rom.slice(0x0104, 0x0134)).toEqual(NINTENDO_LOGO);
    expect(new TextDecoder().decode(rom.slice(0x0134, 0x0139))).toBe('HELLO');
    expect(rom[0x0143]).toBe(0x80);
    expect(rom[0x0147]).toBe(0x00);
    expect(rom[0x014a]).toBe(0x00);
    expect(rom[0x0040]).toBe(0xd9); // RETI at the VBlank vector
  });

  it('stores a header checksum the boot ROM accepts', () => {
    // Boot ROM rule: sum($0134..$014C) + 25 + checksum ≡ 0 (mod 256)
    let sum = 25;
    for (let i = 0x0134; i <= 0x014d; i++) sum += rom[i] ?? 0;
    expect(sum & 0xff).toBe(0);
    expect(rom[0x014d]).toBe(headerChecksum(rom));
  });

  it('stores the global checksum big-endian', () => {
    let sum = 0;
    rom.forEach((byte, i) => {
      if (i !== 0x014e && i !== 0x014f) sum += byte;
    });
    expect(((rom[0x014e] ?? 0) << 8) | (rom[0x014f] ?? 0)).toBe(sum & 0xffff);
    expect(globalChecksum(rom)).toBe(sum & 0xffff);
  });
});

describe('symbol file', () => {
  it('lists symbols as bank:address sorted by address', () => {
    const symbols = new Map([
      ['late', 0x4abc],
      ['start', 0x0150],
    ]);
    expect(formatSymbolFile(symbols)).toBe('00:0150 start\n01:4abc late\n');
  });

  it('puts RAM symbols in bank 0', () => {
    const symbols = new Map([
      ['vram', 0x9800],
      ['wram', 0xc000],
      ['hram', 0xff80],
    ]);
    expect(formatSymbolFile(symbols)).toBe('00:9800 vram\n00:c000 wram\n00:ff80 hram\n');
  });
});
