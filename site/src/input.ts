/** Input for the player: buttons, the keyboard and gamepad layouts, and the d-pad geometry */

export type Button = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';

export const DIRECTIONS: readonly Button[] = ['up', 'down', 'left', 'right'];

/** Keyboard layout: arrows/WASD, X/K = A, Z/J = B, Enter = START, Shift/Backspace = SELECT */
export const KEYS: Readonly<Record<string, Button>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyX: 'a',
  KeyK: 'a',
  KeyZ: 'b',
  KeyJ: 'b',
  Enter: 'start',
  ShiftLeft: 'select',
  ShiftRight: 'select',
  Backspace: 'select',
};

/** Standard gamepad mapping (https://w3c.github.io/gamepad/#remapping) */
export const GAMEPAD: Readonly<Partial<Record<number, Button>>> = {
  0: 'a',
  1: 'b',
  8: 'select',
  9: 'start',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

/** Several sources (keys, fingers, a gamepad) can hold a button; it's down while any does */
export class Joypad {
  private readonly holders = new Map<Button, Set<string>>();
  private readonly pressedAt = new Map<Button, number>();
  /** Buttons the emulator currently has down */
  private readonly applied = new Set<Button>();

  /**
   * @param apply sets a button on the emulated joypad
   * @param minHoldMs keep every press down at least this long, so a quick tap can't
   *   come and go between two frames without the game seeing it
   */
  constructor(
    private readonly apply: (button: Button, down: boolean) => void,
    private readonly minHoldMs = 50,
  ) {}

  press(button: Button, source: string): void {
    const set = this.holders.get(button) ?? new Set<string>();
    const wasDown = set.size > 0;
    set.add(source);
    this.holders.set(button, set);
    if (!wasDown) this.pressedAt.set(button, Date.now());
    this.set(button, true);
  }

  release(button: Button, source: string): void {
    const set = this.holders.get(button);
    if (set?.delete(source) !== true || set.size > 0) return;
    const wait = (this.pressedAt.get(button) ?? 0) + this.minHoldMs - Date.now();
    if (wait <= 0) {
      this.set(button, false);
      return;
    }
    setTimeout(() => {
      if (!this.isDown(button)) this.set(button, false);
    }, wait);
  }

  /** Tell the emulator, if that changes anything */
  private set(button: Button, down: boolean): void {
    if (this.applied.has(button) === down) return;
    if (down) this.applied.add(button);
    else this.applied.delete(button);
    this.apply(button, down);
  }

  /** Release everything one source holds */
  releaseAll(source: string): void {
    for (const button of this.holders.keys()) this.release(button, source);
  }

  isDown(button: Button): boolean {
    return (this.holders.get(button)?.size ?? 0) > 0;
  }
}

/** The d-pad direction(s) for a point relative to the pad's center (-1..1), with a dead zone */
export function dpadDirections(x: number, y: number): Button[] {
  const DEAD_ZONE = 0.25;
  if (Math.hypot(x, y) < DEAD_ZONE) return [];
  const angle = (Math.atan2(y, x) * 180) / Math.PI; // 0 = right, 90 = down
  const out: Button[] = [];
  if (angle > -67.5 && angle < 67.5) out.push('right');
  if (angle > 112.5 || angle < -112.5) out.push('left');
  if (angle > 22.5 && angle < 157.5) out.push('down');
  if (angle < -22.5 && angle > -157.5) out.push('up');
  return out;
}
