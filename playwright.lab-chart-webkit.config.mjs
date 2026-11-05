import { defineConfig, devices } from '@playwright/test';
import shared from './playwright.config.mjs';

// Only the three chart-geometry regressions run in WebKit. The regular suite
// keeps its Chromium projects and shard count. A local Chromium executable
// override must not be inherited by this separate browser.
const use = { ...shared.use };
delete use.launchOptions;

export default defineConfig({
  ...shared,
  workers: 1,
  // Each case opens every saved entry after checking four rendered charts.
  // WebKit's real vault setup and rendering exceed the regular 60 s budget.
  timeout: 120_000,
  use,
  projects: [
    {
      name: 'lab-chart-webkit-desktop',
      testMatch: /lab-chart-geometry\.spec\.mjs/,
      use: { ...devices['Desktop Safari'], browserName: 'webkit', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'lab-chart-webkit-mobile',
      testMatch: /lab-chart-geometry-mobile\.spec\.mjs/,
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
  ],
});
