import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  testMatch: 'multiplication-tables-metadata.spec.ts',
  fullyParallel: true,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command:
          'PORT=4173 BASE_PATH=/ pnpm --filter @workspace/multiplication-tables run dev',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});