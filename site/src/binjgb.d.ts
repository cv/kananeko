/** The parts of binjgb's Emscripten module (vendor/binjgb.js) the player uses */
interface BinjgbModule {
  readonly HEAP8: Int8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _emulator_new_simple(
    romPtr: number,
    romSize: number,
    sampleRate: number,
    audioFrames: number,
    cgbColorCurve: number,
  ): number;
  _emulator_delete(e: number): void;
  _joypad_new(): number;
  _emulator_set_default_joypad_callback(e: number, joypadBuffer: number): void;
  _emulator_get_ticks_f64(e: number): number;
  _emulator_run_until_f64(e: number, ticks: number): number;
  _get_frame_buffer_ptr(e: number): number;
  _get_frame_buffer_size(e: number): number;
  _get_audio_buffer_ptr(e: number): number;
  _get_audio_buffer_capacity(e: number): number;
  _set_joyp_up(e: number, down: boolean): void;
  _set_joyp_down(e: number, down: boolean): void;
  _set_joyp_left(e: number, down: boolean): void;
  _set_joyp_right(e: number, down: boolean): void;
  _set_joyp_A(e: number, down: boolean): void;
  _set_joyp_B(e: number, down: boolean): void;
  _set_joyp_start(e: number, down: boolean): void;
  _set_joyp_select(e: number, down: boolean): void;
}

/** Set at build time (scripts/build-site.ts) */
declare const __ROM_URL__: string;

/** Defined by vendor/binjgb.js */
declare function Binjgb(): Promise<BinjgbModule>;
