# 🐱 Kananeko

> A tiny Game Boy Color ROM where a cat guides you through Japan — one kana at a time.

You wander through five little locations — a train station, a street, a restaurant, a convenience store, and a park — chatting your way through short Japanese scenes and answering kana quizzes to keep going. Miss too many and it's game over. Nail them and watch your score climb.

The whole thing is hand-assembled from TypeScript. No engine, no SDK — just raw opcodes wired into a 32 KB ROM.

**▶ [Play it in your browser](https://cv.github.io/kananeko/)**, on a computer (keyboard or gamepad) or a phone (touch controls).

## 🗾 Locations

| Scene      | Name              | Vibe                   |
| ---------- | ----------------- | ---------------------- |
| えき       | Station           | Arriving somewhere new |
| みち       | Street            | Wandering around town  |
| レストラン | Restaurant        | Ordering food (poorly) |
| コンビニ   | Convenience store | Late-night snack run   |
| こうえん   | Park              | A quiet ending         |

## 🎮 How it works

1. Press START on the title screen and arrive at the station
2. Chat with the people you meet (in Japanese!): good replies earn points and hearts, rude ones cost a heart
3. After each conversation, a short kana quiz asks about phrases you just read: pick the missing kana with the d-pad
4. Some replies have a kana missing (はい みえ□す!): pick one to say it and fill in the blank
5. Gave a bad answer? Get the next kana right to win the heart back
6. Each location ends with a review round, closing with a word to write in katakana; three first tries in a row pay a streak bonus
7. Clear all five locations, then beat the clock in a speed round before the ending

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

The [GitHub Pages site](https://cv.github.io/kananeko/) runs the ROM in [binjgb](https://github.com/binji/binjgb), a Game Boy emulator compiled to WebAssembly (vendored in `site/vendor/`), with a small player of our own (`site/src/`): touch controls, keyboard and gamepad input, and sound.

```bash
npm run site          # build/site: the page, the player, binjgb, and the ROM built from source
npm run site:serve    # serve it at http://localhost:4173
npm run test:site     # build it and test it in Chrome and in WebKit on an iPhone-sized screen
```

The browser tests (`site-tests/`) use Playwright; install its browsers once with `npx playwright install chromium webkit`. Every push to `main` rebuilds, tests, and publishes the site (`.github/workflows/pages.yml`).

## 📁 Project layout

```
src/
  asm/           assembler, opcodes, macros, hardware defs
  game/          engines (dialogue, kana, HUD), fonts, screen helpers
    scenes/      station, street, restaurant, conbini, park
  build.ts       ROM entry point
test/            unit, integration, and emulator-driven tests
scripts/         utility scripts (screenshots, the site build)
site/            the web player: page, styles, player source, vendored binjgb
site-tests/      browser tests for the site (Playwright)
build/           ROM and site output
```

## 🤓 Nerd notes

- The ROM is assembled entirely from TypeScript — a custom assembler in `src/asm` emits raw Game Boy machine code.
- Hiragana, katakana, and latin glyphs are all baked into the ROM as tile data.
- Gameplay tests boot the actual ROM in a headless emulator and drive it with simulated joypad input.
- The final ROM is exactly 32 KB — one bank, no mapper.
