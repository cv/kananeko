/**
 * The in-browser player: runs the ROM in binjgb (WebAssembly), draws it on a
 * canvas, plays its sound, and takes input from the keyboard, the on-screen
 * buttons (touch or mouse, via Pointer Events), and gamepads.
 *
 * Works in desktop Chrome and iOS Safari: audio starts inside the first tap
 * (iOS only allows that), the screen is a 2D canvas scaled with crisp pixels
 * (iOS doesn't upscale WebGL canvases that way), and the controls don't scroll
 * or zoom the page.
 */

import { type Button, DIRECTIONS, GAMEPAD, Joypad, KEYS, dpadDirections } from './input';

const SCREEN_WIDTH = 160;
const SCREEN_HEIGHT = 144;
const CPU_TICKS_PER_SECOND = 4194304;
const EVENT_NEW_FRAME = 1;
const EVENT_AUDIO_BUFFER_FULL = 2;
const EVENT_UNTIL_TICKS = 4;
/** Run at most this much emulated time per animation frame (after a hiccup) */
const MAX_STEP_SECONDS = 5 / 60;
const AUDIO_FRAMES = 4096;
const AUDIO_LATENCY_SECONDS = 0.1;
/** Gambatte-style color correction for the GBC screen */
const CGB_COLOR_CURVE = 2;
const ROM_URL = 'kananeko.gb';
const MUTED_KEY = 'kananeko:muted';

const SETTERS: Record<Button, (m: BinjgbModule, e: number, down: boolean) => void> = {
  up: (m, e, d) => {
    m._set_joyp_up(e, d);
  },
  down: (m, e, d) => {
    m._set_joyp_down(e, d);
  },
  left: (m, e, d) => {
    m._set_joyp_left(e, d);
  },
  right: (m, e, d) => {
    m._set_joyp_right(e, d);
  },
  a: (m, e, d) => {
    m._set_joyp_A(e, d);
  },
  b: (m, e, d) => {
    m._set_joyp_B(e, d);
  },
  start: (m, e, d) => {
    m._set_joyp_start(e, d);
  },
  select: (m, e, d) => {
    m._set_joyp_select(e, d);
  },
};

class Emulator {
  private readonly e: number;
  private readonly romPtr: number;
  private readonly frame: Uint8ClampedArray;
  private readonly audioBuffer: Uint8Array;
  private readonly image: ImageData;
  private raf = 0;
  private lastSeconds = 0;
  private leftoverTicks = 0;
  private audioStart = 0;
  private newFrame = false;
  volume = 1;
  readonly joypad: Joypad;

  constructor(
    private readonly module: BinjgbModule,
    rom: ArrayBuffer,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly audio: AudioContext,
  ) {
    // binjgb wants the ROM padded to a multiple of 32 KB
    const size = (rom.byteLength + 0x7fff) & ~0x7fff;
    this.romPtr = module._malloc(size);
    new Uint8Array(module.HEAP8.buffer, this.romPtr, size).fill(0).set(new Uint8Array(rom));
    this.e = module._emulator_new_simple(
      this.romPtr,
      size,
      audio.sampleRate,
      AUDIO_FRAMES,
      CGB_COLOR_CURVE,
    );
    if (this.e === 0) throw new Error('binjgb could not load the ROM');
    // The joypad setters only update binjgb's button state; this hooks it up to the emulator
    module._emulator_set_default_joypad_callback(this.e, module._joypad_new());
    this.frame = new Uint8ClampedArray(
      module.HEAP8.buffer,
      module._get_frame_buffer_ptr(this.e),
      module._get_frame_buffer_size(this.e),
    );
    this.audioBuffer = new Uint8Array(
      module.HEAP8.buffer,
      module._get_audio_buffer_ptr(this.e),
      module._get_audio_buffer_capacity(this.e),
    );
    this.image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    this.joypad = new Joypad((button, down) => {
      SETTERS[button](this.module, this.e, down);
    });
  }

  get running(): boolean {
    return this.raf !== 0;
  }

  start(): void {
    if (this.running) return;
    this.lastSeconds = 0;
    this.leftoverTicks = 0;
    this.audioStart = 0;
    this.raf = requestAnimationFrame((ms) => {
      this.tick(ms);
    });
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick(ms: number): void {
    this.raf = requestAnimationFrame((next) => {
      this.tick(next);
    });
    const seconds = ms / 1000;
    const delta = Math.min(Math.max(seconds - (this.lastSeconds || seconds), 0), MAX_STEP_SECONDS);
    this.lastSeconds = seconds;
    pollGamepads(this.joypad);
    const target =
      this.module._emulator_get_ticks_f64(this.e) +
      delta * CPU_TICKS_PER_SECOND -
      this.leftoverTicks;
    this.runUntil(target);
    this.leftoverTicks = this.module._emulator_get_ticks_f64(this.e) - target;
    if (this.newFrame) {
      this.image.data.set(this.frame);
      this.ctx.putImageData(this.image, 0, 0);
      this.newFrame = false;
    }
  }

  private runUntil(ticks: number): void {
    for (;;) {
      const event = this.module._emulator_run_until_f64(this.e, ticks);
      if ((event & EVENT_NEW_FRAME) !== 0) this.newFrame = true;
      if ((event & EVENT_AUDIO_BUFFER_FULL) !== 0) this.pushAudio();
      if ((event & EVENT_UNTIL_TICKS) !== 0) return;
    }
  }

  private pushAudio(): void {
    const now = this.audio.currentTime;
    this.audioStart = Math.max(this.audioStart, now + AUDIO_LATENCY_SECONDS);
    if (this.volume === 0 || this.audio.state !== 'running') return;
    const buffer = this.audio.createBuffer(2, AUDIO_FRAMES, this.audio.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < AUDIO_FRAMES; i++) {
      left[i] = ((this.audioBuffer[2 * i] ?? 0) * this.volume) / 255;
      right[i] = ((this.audioBuffer[2 * i + 1] ?? 0) * this.volume) / 255;
    }
    const source = this.audio.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audio.destination);
    source.start(this.audioStart);
    this.audioStart += AUDIO_FRAMES / this.audio.sampleRate;
  }
}

let gamepadSeen = false;

/** Mirror the first connected gamepad onto the joypad */
function pollGamepads(joypad: Joypad): void {
  // The Gamepad API only exists in secure contexts (and some browsers lack it)
  if (typeof navigator.getGamepads !== 'function') return;
  const pad = Array.from(navigator.getGamepads()).find((p) => p !== null);
  if (pad === undefined) {
    if (gamepadSeen) joypad.releaseAll('gamepad');
    gamepadSeen = false;
    return;
  }
  gamepadSeen = true;
  pad.buttons.forEach((state, index) => {
    const button = GAMEPAD[index];
    if (button === undefined) return;
    if (state.pressed) joypad.press(button, 'gamepad');
    else joypad.release(button, 'gamepad');
  });
}

function bindControls(root: HTMLElement, joypad: Joypad): void {
  // Buttons: each finger (pointer) holds the button it went down on
  for (const el of root.querySelectorAll<HTMLElement>('[data-button]')) {
    const button = el.dataset['button'] as Button;
    const down = (event: PointerEvent): void => {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      el.classList.add('pressed');
      joypad.press(button, `pointer${String(event.pointerId)}`);
    };
    const up = (event: PointerEvent): void => {
      el.classList.remove('pressed');
      joypad.release(button, `pointer${String(event.pointerId)}`);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // D-pad: the direction follows the finger as it slides
  const dpad = root.querySelector<HTMLElement>('[data-dpad]');
  if (dpad !== null) {
    const active = new Set<number>();
    const follow = (event: PointerEvent): void => {
      if (!active.has(event.pointerId)) return;
      const rect = dpad.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      const held = dpadDirections(x, y);
      const source = `dpad${String(event.pointerId)}`;
      for (const dir of DIRECTIONS) {
        if (held.includes(dir)) joypad.press(dir, source);
        else joypad.release(dir, source);
      }
      dpad.dataset['held'] = held.join(' ');
    };
    dpad.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      dpad.setPointerCapture(event.pointerId);
      active.add(event.pointerId);
      follow(event);
    });
    dpad.addEventListener('pointermove', follow);
    const end = (event: PointerEvent): void => {
      active.delete(event.pointerId);
      joypad.releaseAll(`dpad${String(event.pointerId)}`);
      dpad.dataset['held'] = '';
    };
    dpad.addEventListener('pointerup', end);
    dpad.addEventListener('pointercancel', end);
  }

  // No long-press menus, magnifier, text selection, or zooming on the controls
  root.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
  root.addEventListener(
    'touchstart',
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );
}

function bindKeyboard(joypad: Joypad): void {
  window.addEventListener('keydown', (event) => {
    const button = KEYS[event.code];
    if (button === undefined || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    joypad.press(button, `key${event.code}`);
  });
  window.addEventListener('keyup', (event) => {
    const button = KEYS[event.code];
    if (button === undefined) return;
    joypad.release(button, `key${event.code}`);
  });
  // Don't leave keys stuck when the window loses focus
  window.addEventListener('blur', () => {
    for (const code of Object.keys(KEYS)) {
      const button = KEYS[code];
      if (button !== undefined) joypad.release(button, `key${code}`);
    }
  });
}

/** A second tap within this many milliseconds would zoom the page on iOS */
const DOUBLE_TAP_MS = 350;

/**
 * Stop iOS Safari's double-tap-to-zoom: it ignores touch-action for quick repeated
 * taps (mashing A, or tapping between the buttons), so cancel the second tap's
 * default action. The game's buttons use pointer events, which still fire; pinch
 * zoom keeps working.
 */
function preventDoubleTapZoom(): void {
  let lastTap = -Infinity;
  document.addEventListener(
    'touchend',
    (event) => {
      if (event.timeStamp - lastTap < DOUBLE_TAP_MS) event.preventDefault();
      lastTap = event.timeStamp;
    },
    { passive: false },
  );
}

function element<T extends HTMLElement>(selector: string, type: new () => T): T {
  const el = document.querySelector(selector);
  if (!(el instanceof type)) throw new Error(`Missing ${selector}`);
  return el;
}

function main(): void {
  preventDoubleTapZoom();
  const canvas = element('#screen', HTMLCanvasElement);
  const startButton = element('#start', HTMLButtonElement);
  const muteButton = element('#mute', HTMLButtonElement);
  const status = element('#status', HTMLElement);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('No 2D canvas');

  // Load the emulator and the ROM right away, so the first tap starts the game at once
  const loading = Promise.all([
    Binjgb(),
    fetch(ROM_URL).then((response) => {
      if (!response.ok) throw new Error(`Could not load ${ROM_URL}`);
      return response.arrayBuffer();
    }),
  ]);
  loading
    .then(() => {
      startButton.disabled = false;
      status.textContent = '';
    })
    .catch((error: unknown) => {
      status.textContent = `Couldn't load the game: ${String(error)}`;
    });

  let emulator: Emulator | null = null;
  let muted = localStorage.getItem(MUTED_KEY) === '1';
  const showMuted = (): void => {
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.textContent = muted ? '🔇 Sound off' : '🔊 Sound on';
    if (emulator !== null) emulator.volume = muted ? 0 : 1;
  };
  showMuted();
  muteButton.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    showMuted();
  });

  startButton.addEventListener('click', () => {
    // iOS only lets audio start inside a tap: create and resume the context here
    const audio = new AudioContext();
    void audio.resume();
    void loading.then(([module, rom]) => {
      emulator = new Emulator(module, rom, ctx, audio);
      showMuted();
      bindControls(element('#controls', HTMLElement), emulator.joypad);
      bindKeyboard(emulator.joypad);
      document.body.classList.add('playing');
      startButton.hidden = true;
      // On a phone the header just went away: bring the console to the top
      window.scrollTo(0, 0);
      emulator.start();
      document.addEventListener('visibilitychange', () => {
        if (emulator === null) return;
        if (document.hidden) {
          emulator.stop();
          void audio.suspend();
        } else {
          void audio.resume();
          emulator.start();
        }
      });
    });
  });
}

main();
