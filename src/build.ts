import * as fs from 'fs';
import * as path from 'path';
import { formatSymbolFile } from './asm/assembler';
import { hex } from './asm/util';
import { buildRom } from './game/main';

const outDir = path.join(import.meta.dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const { rom, symbols } = buildRom();

const romPath = path.join(outDir, 'kananeko.gb');
fs.writeFileSync(romPath, rom);
// Symbol file for emulator debuggers (BGB, Emulicious, SameBoy, ...)
fs.writeFileSync(path.join(outDir, 'kananeko.sym'), formatSymbolFile(symbols));

console.log(`ROM written to ${romPath} (${String(rom.length)} bytes)`);
console.log(`Symbols: ${String(symbols.size)}`);
for (const [name, address] of symbols) {
  console.log(`  $${hex(address, 4)} ${name}`);
}
