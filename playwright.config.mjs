import { defineConfig, devices } from '@playwright/test';

const mobileDevice = devices['iPhone 15 Pro'] || devices['iPhone 14 Pro'] || devices['iPhone 13'];
const localChromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    launchOptions: localChromiumPath
      ? {
          executablePath: localChromiumPath,
          args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none']
        }
      : undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/support/static-server.mjs',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: /mobile\.spec\.mjs/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 }
      }
    },
    {
      name: 'mobile-chromium',
      testMatch: /mobile\.spec\.mjs/,
      use: {
        ...mobileDevice,
        browserName: 'chromium',
        serviceWorkers: 'block'
      }
    }
  ]
});
