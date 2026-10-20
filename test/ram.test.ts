/** The game's RAM map agrees with the engines that use it. */

import { storeByte } from '@asm/macros';
import type { ByteVar, ValuesOf } from '@asm/ram';
import { CHART_BYTES } from '@game/chart';
import { buildKanaData } from '@game/kana';
import { SCORE_DIGIT_COUNT } from '@game/kana-hud';
import { PASSWORD_LENGTH } from '@game/password';
import { PRACTICE_ROUND, practiceQuestions } from '@game/practice';
import {
  BUFFERS,
  DMA_REGION,
  MEM,
  PRACTICE_REGION,
  RAM_REGIONS,
  ramSymbols,
  STACK_TOP,
  VARIABLES,
} from '@game/ram';
import { SPEED_ROUND } from '@game/scene';
import { SOUND_VOICES, VOICE_SIZE } from '@game/sound';
import { DMA_ROUTINE_BYTES } from '@game/sprites';
import { DialogueState, type KanaMode, type KanaState } from '@game/state';
import { TEXT_STACK_SIZE } from '@game/text-codec';
import { describe, expect, expectTypeOf, it } from 'vitest';

function sizeOf(name: string): number | undefined {
  return RAM_REGIONS.flatMap((r) => r.variables).find((v) => v.name === name)?.size;
}

describe('the RAM map', () => {
  it('sizes each buffer for the engine that fills it', () => {
    expect(sizeOf('TEXT_STACK')).toBe(TEXT_STACK_SIZE);
    expect(sizeOf('SND_VOICES')).toBe(SOUND_VOICES * VOICE_SIZE);
    expect(sizeOf('PASS_CHARS')).toBe(PASSWORD_LENGTH);
    expect(sizeOf('SCORE_DIGITS')).toBe(SCORE_DIGIT_COUNT);
    expect(sizeOf('KANA_SEEN')).toBe(CHART_BYTES);
    expect(sizeOf('KANA_MISSED')).toBe(CHART_BYTES);
  });

  it('fits the longest practice or speed round, and its end marker', () => {
    const questionBytes = [...practiceQuestions(), ...SPEED_ROUND].map(
      (q) => buildKanaData([q]).length - 1,
    );
    const longest = Math.max(...questionBytes) * Math.max(PRACTICE_ROUND, SPEED_ROUND.length) + 1;
    expect(longest).toBeLessThanOrEqual(PRACTICE_REGION.limit - PRACTICE_REGION.start);
  });

  it('keeps the variables in HRAM, after the DMA routine and before IE', () => {
    expect(DMA_REGION.limit - DMA_REGION.start).toBe(DMA_ROUTINE_BYTES.length);
    expect(VARIABLES.start).toBe(DMA_REGION.limit);
    expect(VARIABLES.limit).toBe(MEM.IE);
  });

  it('keeps the buffers in WRAM page $C0, which boot zeroes', () => {
    expect(BUFFERS.start).toBe(0xc000);
    expect(BUFFERS.limit).toBe(0xc100);
  });

  it('starts the stack in WRAM, clear of HRAM', () => {
    expect(STACK_TOP).toBeLessThan(0xd000);
  });

  it('shares bytes only between the dialogue and kana engines', () => {
    const shared = VARIABLES.variables.filter((v) => v.sharesWith !== undefined);
    expect(shared.map((v) => `${v.name}=${v.sharesWith ?? ''}`)).toEqual([
      'KANA_DATA=DLG_STR',
      'KANA_FEEDBACK_TIMER=DLG_DELAY',
    ]);
    expect(MEM.KANA_DATA.lo).toBe(MEM.DLG_STR.lo);
  });

  it('types each engine state byte with its own values', () => {
    expectTypeOf(MEM.DLG_STATE).toEqualTypeOf<ByteVar<ValuesOf<typeof DialogueState>>>();
    expectTypeOf(MEM.KANA_STATE).toEqualTypeOf<ByteVar<ValuesOf<typeof KanaState>>>();
    expectTypeOf(MEM.KANA_MODE).toEqualTypeOf<ByteVar<ValuesOf<typeof KanaMode>>>();
    // @ts-expect-error a dialogue state isn't a kana state
    storeByte(MEM.KANA_STATE, DialogueState.PRINTING);
  });

  it('lists every variable for the .sym file', () => {
    expect(ramSymbols().get('SHADOW_OAM')).toBe(0xc100);
    expect(ramSymbols().get('JOYPAD_CUR')).toBe(VARIABLES.start);
    expect(ramSymbols().get('TEXT_STACK')).toBe(0xc000);
  });
});
