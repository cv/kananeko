import { defineConfig, devices } from '@playwright/test';

/** Browser tests for the GitHub Pages site (npm run test:site builds it first) */
export default defineConfig({
  testDir: 'site-tests',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  reporter: process.env['CI'] !== undefined ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx tsx scripts/serve-site.ts',
    url: 'http://localhost:4173',
    reuseExistingServer: process.env['CI'] === undefined,
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'] } },
    // iOS Safari's engine, on an iPhone-sized touch screen
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
});
