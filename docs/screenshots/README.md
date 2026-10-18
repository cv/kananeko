# Screenshots

Captured from the real ROM in the test emulator by `npm run screenshots`.

> **Emulator caveat:** gaps in text that is still being revealed (すみません! showing as `すみ ん!`) come from
> serverboy, not the ROM. Its HALT emulation does not wake reliably on VBlank, so the test
> harness disables the VBlank interrupt and the per-character VRAM writes land outside VBlank.
> Text drawn with the LCD off (choices, kana rounds) is unaffected.

|                                                    |                                                |                                                                     |
| -------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| ![Title screen](title.png)                         | ![Title, prompt blinked off](title-blink.png)  | ![えき: text revealing](scene0-intro.png)                           |
| Title screen                                       | Title, prompt blinked off                      | えき: text revealing                                                |
| ![えき: choices](scene0-choices.png)               | ![えき: kana round](scene0-kana.png)           | ![みち: text revealing](scene1-intro.png)                           |
| えき: choices                                      | えき: kana round                               | みち: text revealing                                                |
| ![みち: choices](scene1-choices.png)               | ![みち: kana round](scene1-kana.png)           | ![レストラン: text revealing](scene2-intro.png)                     |
| みち: choices                                      | みち: kana round                               | レストラン: text revealing                                          |
| ![レストラン: choices](scene2-choices.png)         | ![レストラン: kana round](scene2-kana.png)     | ![コンビニ: text revealing](scene3-intro.png)                       |
| レストラン: choices                                | レストラン: kana round                         | コンビニ: text revealing                                            |
| ![コンビニ: choices](scene3-choices.png)           | ![コンビニ: kana round](scene3-kana.png)       | ![こうえん: text revealing](scene4-intro.png)                       |
| コンビニ: choices                                  | コンビニ: kana round                           | こうえん: text revealing                                            |
| ![こうえん: choices](scene4-choices.png)           | ![こうえん: kana round](scene4-kana.png)       | ![After a bad choice: -5 and a lost heart](dialogue-bad-choice.png) |
| こうえん: choices                                  | こうえん: kana round                           | After a bad choice: -5 and a lost heart                             |
| ![Kana: correct answer feedback](kana-correct.png) | ![Kana: wrong answer feedback](kana-wrong.png) | ![Game over](game-over.png)                                         |
| Kana: correct answer feedback                      | Kana: wrong answer feedback                    | Game over                                                           |
