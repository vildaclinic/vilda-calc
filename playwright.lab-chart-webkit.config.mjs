import { defineConfig, devices } from '@playwright/test';
import shared from './playwright.config.mjs';

// Chart geometry, M1, mobile results/dock and the opted-in home workspace run
// in WebKit. The workspace covers Safari's hidden-parent computed-style case.
// The regular suite keeps its Chromium projects and shard count. A local
// Chromium executable override must not be inherited by this separate browser.
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
      testMatch: /lab-chart-(?:geometry|m1)\.spec\.mjs/,
      use: { ...devices['Desktop Safari'], browserName: 'webkit', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'lab-chart-webkit-mobile',
      testMatch: [
        /lab-chart-(?:geometry|m1)-mobile\.spec\.mjs/,
        /mobile-lab-layout-mobile\.spec\.mjs/,
      ],
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
    {
      name: 'home-workspace-webkit',
      testMatch: /home-workspace-(?:preview|puberty|perinatal|growth|diet|tools|vitals|anthropometry|intake|custom-food|patient(?:-b1)?)\.spec\.mjs/,
      use: { ...devices['Desktop Safari'], browserName: 'webkit', viewport: { width: 1440, height: 1000 } },
    },
  ],
});
