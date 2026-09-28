import { defineConfig, devices } from '@playwright/test';
import bazowa from './playwright.config.mjs';

// P-STYLE rata 1: konfiguracja SIATKI ZRZUTÓW WYGLĄDU (tests/visual), osobna od zestawu e2e.
//   npm run test:visual                        # porównanie z wzorcami (tests/visual/wzorce)
//   npm run test:visual -- --update-snapshots  # nowe wzorce — TYLKO w CI (workflow „Wygląd")
// Dziedziczy serwer testowy, adres bazowy, język i strefę z playwright.config.mjs.

const mobileDevice = devices['iPhone 15 Pro'] || devices['iPhone 14 Pro'] || devices['iPhone 13'];
const localChromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  ...bazowa,
  testDir: './tests/visual',
  // Każdy test otwiera własną stronę i nie dzieli stanu — mogą iść równolegle także wewnątrz pliku.
  fullyParallel: true,
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 90_000,
  outputDir: 'test-results-wyglad',
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report-wyglad' }]]
    : [['list']],
  // Wzorce: tests/visual/wzorce/<projekt>/<strona>--<tryb>.png, bez przyrostka platformy —
  // jedyną platformą wzorców jest ubuntu-latest z CI.
  snapshotPathTemplate: '{testDir}/wzorce/{projectName}/{arg}{ext}',
  expect: {
    // toHaveScreenshot czeka na dwa kolejne identyczne zrzuty; strona po 3000 px potrzebuje na to więcej niż domyślne 5 s
    timeout: 20_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // obraz w pikselach CSS także na telefonie (współczynnik 3 dałby trzykrotnie większe pliki)
      scale: 'css',
      // szum wygładzania na granicach szkła; realna zmiana stylu to rzędy wielkości więcej pikseli
      maxDiffPixelRatio: 0.002,
    },
  },
  use: {
    ...bazowa.use,
    launchOptions: {
      ...(localChromiumPath ? { executablePath: localChromiumPath } : {}),
      // te same flagi w CI i lokalnie: bez hintingu i subpikselowego wygładzania tekst renderuje się
      // tak samo niezależnie od ustawień maszyny; --no-sandbox tylko przy lokalnym Chromium (root)
      args: [...(localChromiumPath ? ['--no-sandbox'] : []), '--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text'],
    },
    screenshot: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...mobileDevice,
        browserName: 'chromium',
      },
    },
  ],
});
