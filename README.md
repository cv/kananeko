# 🐱 Kananeko

> A tiny Game Boy Color ROM where a cat guides you through Japan — one kana at a time.

You wander through five little locations — a train station, a street, a restaurant, a convenience store, and a park — chatting your way through short Japanese scenes and answering kana quizzes to keep going. Miss too many and it's game over. Nail them and watch your score climb.

The whole thing is hand-assembled from TypeScript. No engine, no SDK — just raw opcodes wired into a 32 KB ROM.

## 🗾 Locations

| Scene | Name | Vibe |
|-------|------|------|
| えき | Station | Arriving somewhere new |
| みち | Street | Wandering around town |
| レストラン | Restaurant | Ordering food (poorly) |
| コンビニ | Convenience store | Late-night snack run |
| こうえん | Park | A quiet ending |

## 🎮 How it works

1. Title screen → pick a scene
2. Read through a short dialogue (in Japanese!)
3. Answer kana quiz questions
4. Keep your lives — gain your score
5. Advance to the next location

## 🔧 Setup

Needs **Node.js 25+** — older versions (e.g. 18) won't work with the current toolchain.

```bash
npm install
npm run build
```

Out comes `build/kananeko.gb` — load it in any Game Boy emulator and go.

A symbol file (`build/kananeko.sym`) is also produced for debugging.

## 🧪 Tests

```bash
npm test                   # run all tests
npm run test:coverage      # with coverage
npm run lint               # lint
```

Tests cover ROM structure, dialogue flow, kana gameplay, per-scene progression, and full start-to-finish playthroughs — all driven by [serverboy](https://github.com/nickthecoder/serverboy), a headless Game Boy emulator.

## 📁 Project layout

```
src/
  asm/           assembler, opcodes, hardware defs
  game/          gameplay logic, fonts, dialogue, HUD
    scenes/      station, street, restaurant, conbini, park
  build.ts       ROM entry point
test/            unit, integration, and emulator-driven tests
scripts/         utility scripts
build/           ROM output
```

## 🤓 Nerd notes

- The ROM is assembled entirely from TypeScript — a custom assembler in `src/asm` emits raw Game Boy machine code.
- Hiragana, katakana, and latin glyphs are all baked into the ROM as tile data.
- Gameplay tests boot the actual ROM in a headless emulator and drive it with simulated joypad input.
- The final ROM is exactly 32 KB — one bank, no mapper.
