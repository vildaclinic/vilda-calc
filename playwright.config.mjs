import { defineConfig, devices } from '@playwright/test';

const mobileDevice = devices['iPhone 15 Pro'] || devices['iPhone 14 Pro'] || devices['iPhone 13'];
const localChromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

// Liczba workerów. Zestaw rósł, aż jeden wątek przestał się mieścić w limicie CI, więc
// testy idą równolegle PLIKAMI: każdy worker bierze cały plik, a testy w pliku nadal
// wykonują się po kolei w tym samym workerze (fullyParallel: false niżej).
//
// PLAYWRIGHT_WORKERS pozwala zmierzyć inną wartość bez edytowania tego pliku — używam
// tego do porównań A/B. Bez tej zmiennej: 4 na CI (tyle rdzeni ma runner ubuntu-latest),
// a lokalnie połowa rdzeni, czyli domyślna heurystyka Playwrighta.
function liczbaWorkerow() {
  const zZmiennej = Number(process.env.PLAYWRIGHT_WORKERS);
  if (Number.isFinite(zZmiennej) && zZmiennej > 0) return Math.floor(zZmiennej);
  return process.env.CI ? 4 : undefined;
}

export default defineConfig({
  testDir: './tests/e2e',
  // Zrównoleglenie idzie PLIKAMI: każdy worker bierze cały plik, a testy w pliku wykonują
  // się po kolei w tym samym workerze. To jest wariant ZMIERZONY jako stabilny.
  //
  // Próbowałem iść dalej (fullyParallel: true, czyli testy z jednego pliku równolegle).
  // Stanu to nie psuje — żaden plik nie trzyma danych między testami, a Playwright daje
  // każdemu testowi świeży kontekst przeglądarki. Wywraca się na CZASIE: pliki, w których
  // pojedynczy test trwa kilkadziesiąt sekund (zakładanie sejfu, pełne ładowanie strony),
  // przekraczały budżet, gdy cztery ich testy dzieliły te same rdzenie. Zysk był przy tym
  // niewielki (lokalnie 24,3 min wobec 26,8 min), bo na czterech rdzeniach wiąże łączna
  // praca, a nie układ plików. Szczegóły w docs/clinical/ALGORITHMS.md, wpis E2E-RÓWNOLEGŁOŚĆ.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: liczbaWorkerow(),
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
