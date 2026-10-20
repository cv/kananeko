/** Assembler layout, label resolution, validation, header, and symbol output. */

import {
  assemble,
  formatSymbolFile,
  globalChecksum,
  headerChecksum,
  NINTENDO_LOGO,
  PROGRAM_START,
  ROM_SIZE,
} from '@asm/assembler';
import { call, db, dw, jp, jr, label, ld, nop, org, pool, ret } from '@asm/sm83';
import { Label, labelFamily, type Op, Pooled, u16 } from '@asm/types';
import { describe, expect, it } from 'vitest';

// Labels placed in this module
const START = new Label('start');
const AFTER = new Label('after');
const TARGET = new Label('target');
const LOOP = new Label('loop');
const NEXT = new Label('next');
const BLOB = new Label('blob');
const A = new Label('a');
const FAR = new Label('far');
const NOWHERE = new Label('nowhere');

const HEADER = { title: 'TEST' };

function build(program: Op[]): ReturnType<typeof assemble> {
  return assemble(program, HEADER);
}

describe('label resolution', () => {
  it('assigns labels the address of the following instruction', () => {
    const { symbols } = build([label(START), nop(), nop(), label(AFTER)]);
    expect(symbols.get('start')).toBe(PROGRAM_START);
    expect(symbols.get('after')).toBe(PROGRAM_START + 2);
  });

  it('patches forward imm16 references little-endian', () => {
    const { rom } = build([call(TARGET), nop(), label(TARGET)]);
    const target = PROGRAM_START + 4;
    expect([...rom.slice(PROGRAM_START, PROGRAM_START + 3)]).toEqual([
      0xcd,
      target & 0xff,
      target >> 8,
    ]);
  });

  it('patches rel8 offsets relative to the end of the instruction', () => {
    const { rom } = build([label(LOOP), jr(LOOP), jr('z', NEXT), label(NEXT)]);
    expect(rom[PROGRAM_START + 1]).toBe(0xfe); // -2: back to itself
    expect(rom[PROGRAM_START + 3]).toBe(0x00); // falls through
  });

  it('places code and data at org addresses', () => {
    const { rom, symbols } = build([org(u16(0x4000)), label(BLOB), db([0xde, 0xad])]);
    expect(symbols.get('blob')).toBe(0x4000);
    expect([rom[0x4000], rom[0x4001]]).toEqual([0xde, 0xad]);
  });
});

describe('jump relaxation', () => {
  it('makes a JP a JR when the label is in range', () => {
    const { rom } = build([jp(TARGET), nop(), label(TARGET)]);
    expect(Array.from(rom.slice(PROGRAM_START, PROGRAM_START + 3))).toEqual([0x18, 0x01, 0x00]);
  });

  it('keeps a JP when the label is out of JR range', () => {
    const { rom } = build([jp('z', FAR), db(new Uint8Array(200)), label(FAR)]);
    const far = PROGRAM_START + 3 + 200;
    expect(Array.from(rom.slice(PROGRAM_START, PROGRAM_START + 3))).toEqual([
      0xca,
      far & 0xff,
      far >> 8,
    ]);
  });

  it('lengthens jumps that a lengthened jump pushes out of range', () => {
    // Exactly in range while the inner jump is short; its growth to a JP pushes TARGET a byte too far
    const { rom, symbols } = build([
      jp(TARGET),
      jp(FAR),
      db(new Uint8Array(125)),
      label(TARGET),
      db(new Uint8Array(200)),
      label(FAR),
    ]);
    expect(rom[PROGRAM_START]).toBe(0xc3);
    expect(rom[PROGRAM_START + 3]).toBe(0xc3);
    expect(symbols.get('target')).toBe(PROGRAM_START + 6 + 125);
  });

  it('still reports a jump to an undefined label', () => {
    expect(() => build([jp(NOWHERE)])).toThrow(/Undefined label: "nowhere"/);
  });
});

describe('local labels', () => {
  it('are named after the named label before them', () => {
    const first = new Label();
    const second = new Label();
    const early = new Label();
    const { symbols, unreferenced } = build([
      label(early),
      nop(),
      label(START),
      label(first),
      nop(),
      label(second),
      jr(first),
      jr(second),
      jr(early),
    ]);
    expect([...symbols.keys()]).toEqual(['local.1', 'start', 'start.1', 'start.2']);
    expect(unreferenced).toEqual(['start']);
  });

  it('say which local label is out of range', () => {
    const far = new Label();
    expect(() => build([label(START), jr(far), db(new Uint8Array(200)), label(far)])).toThrow(
      /JR target "start.1" out of range/,
    );
  });
});

describe('label families', () => {
  it('give the same Label for the same key', () => {
    const scene = labelFamily((i: number) => `scene${String(i)}`);
    expect(scene(1)).toBe(scene(1));
    expect(scene(1)).not.toBe(scene(2));
    expect(scene(2).name).toBe('scene2');
  });
});

describe('pooled data', () => {
  const list = (...bytes: number[]): Pooled => new Pooled('list', bytes);

  it('stores identical data once, at pool(), in order of first reference', () => {
    const { rom, symbols } = build([
      ld('hl', list(7, 8)),
      ld('de', list(9)),
      dw(list(7, 8)),
      pool(),
    ]);
    const first = PROGRAM_START + 3 + 3 + 2;
    expect(symbols.get('list_0')).toBe(first);
    expect(symbols.get('list_1')).toBe(first + 2);
    expect(symbols.size).toBe(2);
    expect(Array.from(rom.slice(first, first + 3))).toEqual([7, 8, 9]);
    // Both references to [7, 8] point at the one copy
    expect([rom[PROGRAM_START + 1], rom[PROGRAM_START + 2]]).toEqual([first & 0xff, first >> 8]);
    expect([rom[PROGRAM_START + 6], rom[PROGRAM_START + 7]]).toEqual([first & 0xff, first >> 8]);
  });

  it('needs exactly one pool() when anything is pooled', () => {
    expect(() => build([ld('hl', list(1))])).toThrow(/no pool\(\)/);
    expect(() => build([pool(), pool()])).toThrow(/only one pool\(\)/);
    expect(build([nop()]).symbols.size).toBe(0);
  });

  it('rejects bytes out of range', () => {
    expect(() => list(256)).toThrow(RangeError);
  });
});

describe('unreferenced labels', () => {
  it('lists labels nothing refers to', () => {
    const { unreferenced } = build([
      label(START),
      call(TARGET),
      label(LOOP),
      jr(LOOP),
      label(TARGET),
      ret(),
      label(AFTER),
      ld('hl', list(1)),
      pool(),
    ]);
    expect(unreferenced).toEqual(['start', 'after']);
  });

  it('leaves out local labels: a loop with no way out never uses its done', () => {
    const { unreferenced } = build([label(START), nop(), label(new Label()), jr(START)]);
    expect(unreferenced).toEqual([]);
  });

  it('counts the VBlank handler as referenced and jumps to it from $0040', () => {
    const { rom, unreferenced } = assemble([nop(), label(TARGET), ret()], {
      ...HEADER,
      vblankHandler: TARGET,
    });
    expect(unreferenced).toEqual([]);
    const target = PROGRAM_START + 1;
    expect(Array.from(rom.slice(0x40, 0x43))).toEqual([0xc3, target & 0xff, target >> 8]);
  });

  function list(...bytes: number[]): Pooled {
    return new Pooled('list', bytes);
  }
});

describe('validation', () => {
  it('rejects undefined labels', () => {
    expect(() => build([jp(NOWHERE)])).toThrow(/Undefined label: "nowhere"/);
  });

  it('rejects a label placed twice', () => {
    expect(() => build([label(A), nop(), label(A)])).toThrow(/"a" is placed twice/);
  });

  it('rejects two labels with the same name', () => {
    expect(() => build([label(A), nop(), label(new Label('a'))])).toThrow(/Duplicate label: "a"/);
  });

  it('matches labels by identity, not by name', () => {
    expect(() => build([label(new Label('nowhere')), jp(NOWHERE)])).toThrow(
      /Undefined label: "nowhere".*different Label with that name/,
    );
  });

  it('rejects invalid label names', () => {
    expect(() => new Label('no spaces')).toThrow(/Invalid label name/);
    expect(() => new Label('')).toThrow(/Invalid label name/);
  });

  it('rejects relative jumps beyond ±127 bytes', () => {
    expect(() => build([jr(FAR), db(new Uint8Array(200)), label(FAR)])).toThrow(/out of range/);
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
