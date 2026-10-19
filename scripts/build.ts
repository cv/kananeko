import * as fs from 'node:fs';
import * as path from 'node:path';
import { PROGRAM_START, formatSymbolFile } from '../src/asm/assembler';
import { hex } from '../src/asm/util';
import { buildRom } from '../src/game/main';
import { ramSymbols } from '../src/game/ram';

const outDir = path.join(import.meta.dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const { rom, symbols, unreferenced, programBytes, stackDepth } = buildRom();

const romPath = path.join(outDir, 'kananeko.gb');
fs.writeFileSync(romPath, rom);
// Symbol file for emulator debuggers (BGB, Emulicious, SameBoy, ...)
fs.writeFileSync(
  path.join(outDir, 'kananeko.sym'),
  formatSymbolFile(new Map([...symbols, ...ramSymbols()])),
);

console.log(`ROM written to ${romPath} (${String(rom.length)} bytes)`);
console.log(
  `Program: ${String(programBytes)} bytes, ${String(rom.length - PROGRAM_START - programBytes)} free`,
);
console.log(`Stack: at most ${String(stackDepth)} bytes`);
console.log(`Symbols: ${String(symbols.size)}`);
for (const [name, address] of symbols) {
  console.log(`  $${hex(address, 4)} ${name}`);
}
if (unreferenced.length > 0) {
  console.warn(
    `Labels nothing refers to (dead code, or reached by falling through): ${unreferenced.join(', ')}`,
  );
}
