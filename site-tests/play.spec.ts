/** The player in real browsers: desktop Chrome, and WebKit on an iPhone-sized touch screen. */

import { type Page, expect, test } from '@playwright/test';

/** Average color of a band of the game screen (rows y0..y1 of 144) */
async function bandColor(
  page: Page,
  y0: number,
  y1: number,
): Promise<{ r: number; g: number; b: number }> {
  return page.evaluate(
    ([top, bottom]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#screen');
      const ctx = canvas?.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      const { data } = ctx.getImageData(0, top, 160, bottom - top);
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i] ?? 0;
        g += data[i + 1] ?? 0;
        b += data[i + 2] ?? 0;
      }
      const n = data.length / 4;
      return { r: r / n, g: g / n, b: b / n };
    },
    [y0, y1] as const,
  );
}

/** Number of distinct colors on the game screen */
async function colorCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ctx = document.querySelector<HTMLCanvasElement>('#screen')?.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    const { data } = ctx.getImageData(0, 0, 160, 144);
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      colors.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    }
    return colors.size;
  });
}

/** Load the page, start the game, and wait for the title screen */
async function play(page: Page, isMobile: boolean): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./');
  const start = page.locator('#start');
  await expect(start).toBeEnabled();
  if (isMobile) await start.tap();
  else await start.click();
  await expect(start).toBeHidden();
  // The title screen: the cat, the logo, and the prompt on cream paper
  await expect.poll(() => colorCount(page), { timeout: 15_000 }).toBeGreaterThan(5);
  return errors;
}

test('boots the game when Play is pressed, without errors', async ({ page, isMobile }) => {
  const errors = await play(page, isMobile);
  const sky = await bandColor(page, 16, 56);
  expect(sky.r).toBeGreaterThan(sky.b); // cream title screen, not the station's sky yet
  expect(errors).toEqual([]);
});

test('START takes you from the title to the station', async ({ page, isMobile }) => {
  await play(page, isMobile);
  // Let the title settle (it ignores START until every button is released)
  await page.waitForTimeout(1000);
  if (isMobile) await page.locator('[data-button="start"]').tap();
  else await page.keyboard.press('Enter');
  // The station's blue sky fades in at the top of the screen (the cream title is redder)
  await expect
    .poll(
      async () => {
        const sky = await bandColor(page, 12, 40);
        return sky.b - sky.r;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
});

test('the d-pad lights up the direction being held', async ({ page, isMobile }) => {
  await play(page, isMobile);
  const dpad = page.locator('[data-dpad]');
  await dpad.scrollIntoViewIfNeeded();
  const box = await dpad.boundingBox();
  if (box === null) throw new Error('no d-pad');
  // Hold the bottom arm, slide to the right arm, let go
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.9);
  await page.mouse.down();
  await expect(dpad).toHaveAttribute('data-held', 'down');
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  await expect(dpad).toHaveAttribute('data-held', 'right');
  await page.mouse.up();
  await expect(dpad).toHaveAttribute('data-held', '');
});

test('fits a phone screen: no sideways scrolling, controls in view', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  await play(page, isMobile);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const viewport = page.viewportSize();
  for (const selector of ['#screen', '[data-dpad]', '[data-button="a"]', '[data-button="start"]']) {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
  }
});

test('a quick second tap does not zoom the page', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch screens');
  await play(page, isMobile);
  // Record whether each tap's touchend kept its default action (the zoom gesture)
  await page.evaluate(() => {
    const w = window as unknown as { taps: boolean[]; times: number[] };
    w.taps = [];
    w.times = [];
    document.addEventListener('touchend', (event) => {
      w.taps.push(event.defaultPrevented);
      w.times.push(event.timeStamp);
    });
  });
  const box = await page.locator('#screen').boundingBox();
  if (box === null) throw new Error('no screen');
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(500);
  await page.touchscreen.tap(x, y);
  const { taps, times } = await page.evaluate(() => {
    const w = window as unknown as { taps: boolean[]; times: number[] };
    return { taps: w.taps, times: w.times };
  });
  // A tap is cancelled exactly when it follows the previous one within 350 ms (on a busy
  // machine the "quick" pair can come slower; the rule must hold either way)
  const quick = times.map((t, i) => i > 0 && t - (times[i - 1] ?? -Infinity) < 350);
  expect(taps, `touchend times: ${times.join(', ')}`).toEqual(quick);
  expect(quick.slice(1, 2), 'the first two taps came quickly').toEqual([true]);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});

test('mashing a button still presses it every time', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch screens');
  await play(page, isMobile);
  const a = page.locator('[data-button="a"]');
  await page.evaluate(() => {
    const w = window as unknown as { downs: number };
    w.downs = 0;
    document.querySelector('[data-button="a"]')?.addEventListener('pointerdown', () => {
      w.downs++;
    });
  });
  for (let i = 0; i < 4; i++) await a.tap();
  expect(await page.evaluate(() => (window as unknown as { downs: number }).downs)).toBe(4);
});

test('remembers the sound setting', async ({ page, isMobile }) => {
  await play(page, isMobile);
  const mute = page.locator('#mute');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
});
