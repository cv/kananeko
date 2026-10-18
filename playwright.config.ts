import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the GitHub Pages site. npm run test:site builds and serves it
 * locally; set SITE_URL to test a deployed copy instead.
 */
const SITE_URL = process.env['SITE_URL'];

export default defineConfig({
  testDir: 'site-tests',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  reporter: process.env['CI'] !== undefined ? 'github' : 'list',
  use: { baseURL: SITE_URL ?? 'http://localhost:4173', trace: 'retain-on-failure' },
  ...(SITE_URL === undefined && {
    webServer: {
      command: 'npx tsx scripts/serve-site.ts',
      url: 'http://localhost:4173',
      reuseExistingServer: process.env['CI'] === undefined,
    },
  }),
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'] } },
    // iOS Safari's engine, on an iPhone-sized touch screen
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
});
