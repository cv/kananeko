/** The web player's input logic (site/src/input.ts) */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Button, Joypad, KEYS, dpadDirections } from '../site/src/input';

describe('dpadDirections', () => {
  it.each([
    [0, -1, ['up']],
    [0, 1, ['down']],
    [-1, 0, ['left']],
    [1, 0, ['right']],
    [0.8, 0.8, ['right', 'down']],
    [-0.8, -0.8, ['left', 'up']],
    [0.1, 0.1, []],
  ] as const)('(%f, %f) → %j', (x, y, expected) => {
    expect(dpadDirections(x, y).sort()).toEqual([...expected].sort());
  });
});

describe('KEYS', () => {
  it('maps every button to at least one key', () => {
    const buttons: Button[] = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
    for (const button of buttons) expect(Object.values(KEYS)).toContain(button);
  });
});

describe('Joypad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a button down while any source holds it', () => {
    const apply = vi.fn();
    const joypad = new Joypad(apply, 0);
    joypad.press('a', 'key');
    joypad.press('a', 'finger');
    joypad.release('a', 'key');
    expect(joypad.isDown('a')).toBe(true);
    joypad.release('a', 'finger');
    expect(apply.mock.calls).toEqual([
      ['a', true],
      ['a', false],
    ]);
  });

  it('holds a quick tap long enough for the game to see it', () => {
    const apply = vi.fn();
    const joypad = new Joypad(apply, 50);
    joypad.press('start', 'finger');
    joypad.release('start', 'finger');
    expect(apply).toHaveBeenLastCalledWith('start', true);
    vi.advanceTimersByTime(50);
    expect(apply).toHaveBeenLastCalledWith('start', false);
  });

  it('does not release a button pressed again during the hold', () => {
    const apply = vi.fn();
    const joypad = new Joypad(apply, 50);
    joypad.press('b', 'finger');
    joypad.release('b', 'finger');
    joypad.press('b', 'key');
    vi.advanceTimersByTime(50);
    expect(apply.mock.calls).toEqual([['b', true]]);
  });

  it('ignores releases from sources that were not holding', () => {
    const apply = vi.fn();
    const joypad = new Joypad(apply, 0);
    joypad.release('up', 'nobody');
    joypad.press('up', 'pad');
    joypad.releaseAll('pad');
    expect(apply.mock.calls).toEqual([
      ['up', true],
      ['up', false],
    ]);
  });
});
