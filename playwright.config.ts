import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  workers: 1,
  expect: {
    timeout: 5_000,
  },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop-human',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'narrow-laptop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 900, height: 700 },
      },
    },
    {
      name: 'compact-hud',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 540, height: 700 },
      },
    },
  ],
});
