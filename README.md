# 🐱 Kananeko

> A tiny Game Boy Color ROM where a cat guides you through Japan — one kana at a time.

You wander through six little locations — a train station, a street, a shrine, a restaurant, a convenience store, and a park — chatting your way through short Japanese scenes and answering kana quizzes to keep going, to a little pentatonic soundtrack. Miss too many and it's game over (with a kana password to pick up where you left off). Nail them and watch your score climb.

The whole thing is hand-assembled from TypeScript. No engine, no SDK — just raw opcodes wired into a 32 KB ROM.

**▶ [Play it in your browser](https://lixo.org/kananeko/)**, on a computer (keyboard or gamepad) or a phone (touch controls).

## 🗾 Locations

| Scene      | Name              | Vibe                     |
| ---------- | ----------------- | ------------------------ |
| えき       | Station           | Arriving somewhere new   |
| みち       | Street            | Wandering around town    |
| じんじゃ   | Shrine            | Praying, fortunes, a cat |
| レストラン | Restaurant        | Ordering food (poorly)   |
| コンビニ   | Convenience store | Late-night snack run     |
| こうえん   | Park              | A quiet ending           |

## 🎮 How it works

1. Pick はじめる on the title screen and arrive at the station
2. Chat with the people you meet (in Japanese!): good replies earn points and hearts, rude ones cost a heart. Hold B to make the text appear faster
3. After each conversation, a short kana quiz asks about phrases you just read: pick the missing kana with the d-pad
4. Some replies have a kana missing (はい みえ□す!): pick one to say it and fill in the blank
5. Gave a bad answer? Get the next kana right to win the heart back
6. Each location ends with a review round, closing with a word to write in katakana; three first tries in a row pay a streak bonus
7. Between locations, the kana chart (かなの きろく) shows every kana you've answered right, the ones you've missed in red, and a password (あいことば) for the next location
8. Clear all six locations, then beat the clock in a speed round, which asks about your missed kana first, before the ending

From the title menu, つづき takes a password (game over gives you one too), and れんしゅう practices the kana you've missed, five at a time, with nothing at stake.

## 🖼️ Screenshots

![Contact sheet of every screen](docs/screenshots/contact-sheet.png)

See [the gallery](docs/screenshots/README.md); regenerate it with `npm run screenshots`.

## 🔧 Setup

Needs **Node.js 25+** — older versions (e.g. 18) won't work with the current toolchain.

```bash
npm install
npm run build
```

Out comes `build/kananeko.gb` — load it in any Game Boy emulator and go.

A symbol file (`build/kananeko.sym`, BGB/no$gmb format) is also produced for debugging.

## 🧪 Tests

```bash
npm test                   # run all tests
npm run test:coverage      # with coverage
npm run check              # typecheck + lint + format check + tests (what CI runs)
```

- `test/asm/` — opcode encodings, assembler validation, and macros (run in the emulator)
- `test/content.test.ts` — static checks over every scene: dialogue graph, text widths, kana questions, ROM encoding round-trips
- `test/play/` and `test/scenes/` — the real ROM driven by joypad input in [serverboy](https://gitlab.com/piglet-plays/serverboy.js), a headless Game Boy emulator

Emulator tests start from checkpoints (the start of each scene and kana round) recorded from one continuous playthrough. Checkpoints are cached in `node_modules/.cache/kananeko/`, keyed by the ROM and the test driver source, so only the first run after a change pays for the playthrough.

Each scene's test file lists the dialogue paths worth exercising as detours from the good path:

```ts
describeScene(0, [
  { name: 'tired clerk', detours: { 1: 2 } }, // at node 1, pick choice 2
]);
```

## 🌐 Website

The [GitHub Pages site](https://lixo.org/kananeko/) runs the ROM in [binjgb](https://github.com/binji/binjgb), a Game Boy emulator compiled to WebAssembly (vendored in `site/vendor/`), with a small player of our own (`site/src/`): touch controls, keyboard and gamepad input, and sound.

```bash
npm run site          # build/site: the page, the player, binjgb, and the ROM built from source
npm run site:serve    # serve it at http://localhost:4173
npm run test:site     # build it and test it in Chrome and in WebKit on an iPhone-sized screen
SITE_URL=https://lixo.org/kananeko/ npx playwright test   # test the deployed site
```

The browser tests (`site-tests/`) use Playwright; install its browsers once with `npx playwright install chromium webkit`. Every push to `main` rebuilds, tests, and publishes the site (`.github/workflows/pages.yml`).

## 📁 Project layout

```
src/             the ROM, built in pure TypeScript (no Node or DOM APIs)
  asm/           assembler, opcodes, macros, RAM allocator, hardware defs
  game/          engines (dialogue, kana, HUD), fonts, screen helpers, RAM map (ram.ts)
    scenes/      station, street, shrine, restaurant, conbini, park
test/            unit, integration, and emulator-driven tests
scripts/         Node scripts: the ROM build (build.ts), screenshots, the site build
site/            the web player: page, styles, player source, vendored binjgb
site-tests/      browser tests for the site (Playwright)
build/           ROM and site output
```

Each top-level directory has its own `tsconfig.json` (sharing `tsconfig.base.json`) with only the globals it runs with; `npm run typecheck` checks them all incrementally.

## ✍️ Writing game code

Game code is TypeScript that returns lists of instructions. A routine reads like the assembly it becomes:

```ts
import { ifThen } from '../asm/flow';
import { storeByte } from '../asm/macros';
import { cp, dec, label, ld, ret } from '../asm/sm83';
import { type Op, routine } from '../asm/types';
import { MEM } from './ram';
import { KanaState } from './state';

// A routine says which registers it changes; the assembler checks the code and its callers
export const LOSE_LIFE = routine('lose_life', { clobbers: ['a'] });

function buildLoseLife(): Op[] {
  return [
    label(LOSE_LIFE),
    ld('a', [MEM.KANA_LIVES]), // brackets are memory, as in LD A,(nn)
    cp(0),
    ret('z'),
    dec('a'),
    ld([MEM.KANA_LIVES], 'a'),
    ...ifThen('z', [...storeByte(MEM.KANA_STATE, KanaState.IDLE)]),
    ret(),
  ];
}
```

- **Instructions** (`src/asm/sm83.ts`): one function per mnemonic. Forms the CPU doesn't have, like `ld('b', [MEM.X])`, are type errors, and immediates are range-checked.
- **Variables** (`src/game/ram.ts`): declared as `byte()`, `byteOf(SomeEnum)`, `word()` or `buffer(n)`, and laid out by the allocator. A `byteOf` byte only takes that enum's values. A word has `.lo` and `.hi`, and a buffer has `.address` and a bounds-checked `.at(i)`.
- **Labels** are objects, so a misspelt one is a compile error. `new Label()` without a name is a local label, named after the label before it in the `.sym` file. `ifThen`, `ifElse`, `repeat` and `loop` (`src/asm/flow.ts`) make their own labels.
- **Routines** are labels with a register contract: `routine('name', { out: ['a'], clobbers: ['bc'] })`. The build follows each routine through its jumps, calls and PUSH/POP pairs, and fails in these cases:
  - the routine changes a register its contract doesn't allow;
  - a caller still needs a register the routine clobbers;
  - the VBlank handler doesn't restore what it uses.

  It also works out the deepest the stack can go. `npm run contracts` suggests contracts from what the code does.

- **Modules** (`src/asm/program.ts`): each engine exports a `gameModule({ name, init, code, data })`. `main.ts` only lists the modules and says what the game does, and `link()` lays out the boot code, the inits, the main program, then every module's code and data.
- **Records** (`src/asm/struct.ts`): a layout like `struct('scene entry', { dialogue: word(), flag: byte() })` gives the field offsets the assembly reads, the encoder for the ROM data and a decoder for tests, from one declaration.
- **Jumps**: `jp` becomes a 2-byte `JR` wherever it reaches, and loads from HRAM become `LDH`.

## 🤓 Nerd notes

- The ROM is assembled entirely from TypeScript — a custom assembler in `src/asm` emits raw Game Boy machine code.
- Hiragana, katakana, and latin glyphs are all baked into the ROM as tile data.
- Gameplay tests boot the actual ROM in a headless emulator and drive it with simulated joypad input.
- The final ROM is exactly 32 KB — one bank, no mapper.
