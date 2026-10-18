/** Minimal typings for the parts of serverboy the tests use. */
declare module 'serverboy' {
  export interface Keymap {
    readonly RIGHT: number;
    readonly LEFT: number;
    readonly UP: number;
    readonly DOWN: number;
    readonly A: number;
    readonly B: number;
    readonly SELECT: number;
    readonly START: number;
  }

  export default class Gameboy {
    static readonly KEYMAP: Keymap;
    loadRom(rom: Uint8Array): boolean;
    /** Emulate one frame; held keys are released afterwards. */
    doFrame(): number[];
    /** Hold a key (see KEYMAP) for the next frame. */
    pressKey(key: number | keyof Keymap): void;
    /** RGBA screen buffer, 160×144×4 */
    getScreen(): number[];
    /** The live 64 KB address space (not a copy) */
    getMemory(): Uint8Array;
  }
}
