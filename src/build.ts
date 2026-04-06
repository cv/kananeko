import * as fs from 'fs';
import * as path from 'path';
import { assemble } from './asm/assembler';
import { buildProgram } from './game/main';

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const program = buildProgram();
const { rom, symbols } = assemble(program, {
  title: 'KANANEKO',
  destinationCode: 0x00, // Japan
});

const romPath = path.join(outDir, 'kananeko.gb');
fs.writeFileSync(romPath, rom);

// Write symbol file for emulator debuggers
const symLines = [...symbols.entries()]
  .sort((a, b) => a[1] - b[1])
  .map(
    ([name, addr]) =>
      `${(addr >> 8).toString(16).padStart(2, '0')}:${(addr & 0xff).toString(16).padStart(4, '0')} ${name}`,
  );

fs.writeFileSync(path.join(outDir, 'kananeko.sym'), symLines.join('\n') + '\n');

console.log(`ROM written to ${romPath} (${String(rom.length)} bytes)`);
console.log(`Symbols: ${String(symbols.size)}`);
for (const [name, addr] of symbols) {
  console.log(`  $${addr.toString(16).padStart(4, '0')} ${name}`);
}
