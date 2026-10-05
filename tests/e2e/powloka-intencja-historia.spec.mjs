import { expect, test } from '../support/test-czas.mjs';

// P-POWLOKA-INTENCJA: zimny Start nie może realizować anulowanej intencji karty/listy.
// Rzeczywiste dokumenty, sejf i renderer; opóźniamy jedynie odpowiedź dokumentu
// oraz jeden prawdziwy callback retry, aby A→B nie zależało od losowego czasu sieci.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#IntencjaHistoriiPowloki!26';
const PACJENCI = [
  { name: 'Fikcyjny Intencja A', user: { lastName: 'Fikcyjny', firstName: 'Intencja A', sex: 'M', age: 10, ageMonths: 3, height: 141, weight: 34 } },
  { name: 'Fikcyjna Intencja B', user: { lastName: 'Fikcyjna', firstName: 'Intencja B', sex: 'F', age: 12, ageMonths: 1, height: 153, weight: 42 } },
];

async function konto(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => localStorage.setItem('vilda-terms-accepted-v1',
    JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })));
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  return page.evaluate(async ({ haslo, pacjenci }) => {
    await window.VildaVault.createUser(haslo,
      { label: 'Fikcyjne konto E2E intencji powłoki', iterations: 10000 });
    const ids = [];
    for (const p of pacjenci) ids.push((await window.VildaVault.savePatient(p, { dedup: false })).patientId);
    sessionStorage.setItem('vildaCurrentPatientId', ids[0]);
    sessionStorage.setItem('vildaCurrentPatientName', pacjenci[0].name);
    return ids;
  }, { haslo: HASLO, pacjenci: PACJENCI });
}

async function start(page, gotowy = true) {
  const el = page.locator('iframe.app-pane[title="Start"]');
  await el.waitFor({ state: 'attached' });
  const f = await (await el.elementHandle()).contentFrame();
  if (gotowy) await f.waitForFunction(() => window.VildaVault?.isUnlocked()
    && Boolean(window.VildaAuthUI) && typeof window.applyLoadedData === 'function');
  return f;
}

async function zimnyStart(page) {
  let zwolnij;
  const bramka = new Promise((r) => { zwolnij = r; });
  await page.route('**/index.html?embedded=1', async (route) => {
    await bramka;
    await route.continue();
  });
  await page.goto('/app.html#/docpro', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.VildaShell));
  await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
  const baner = page.locator('#consent-decline');
  if (await baner.isVisible()) await baner.click();
  return zwolnij;
}

const stan = (page) => page.evaluate(() => {
  const el = document.querySelector('iframe.app-pane[title="Start"]');
  const d = el?.contentDocument;
  return {
    hash: location.hash,
    visible: [...document.querySelectorAll('iframe.app-pane')].filter((f) => !f.hidden).map((f) => f.title),
    auth: Boolean(d?.body.classList.contains('vilda-auth-embedded-open')),
    hostAuth: document.documentElement.classList.contains('vilda-pane-auth-open'),
    name: d?.querySelector('.vilda-patient-hero-name')?.textContent.trim() || null,
  };
});

async function trasa(page, nazwa, plik) {
  const boczny = page.locator(`.sidebar-nav a[href="${plik}"]`).first();
  if (await boczny.isVisible()) await boczny.click();
  else await page.locator(`#mobileBottomDock a[href="app.html#/${nazwa}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/${nazwa}$`));
}

async function chip(page) {
  await page.locator('#vildaPatientChip').click();
  await page.locator('[data-vilda-open-card]').click();
}

async function bezNakladki(page, trasaNazwa, tytul) {
  await expect.poll(() => stan(page)).toMatchObject({
    hash: `#/${trasaNazwa}`, visible: [tytul], auth: false, hostAuth: false,
  });
}

async function szerokosc(page) {
  const pomiar = await page.evaluate(() => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((e) => !e.hidden);
    return {
      host: document.documentElement.scrollWidth, ekran: innerWidth,
      ramka: f?.contentDocument?.documentElement.scrollWidth, ekranRamki: f?.contentWindow?.innerWidth,
    };
  });
  expect(pomiar.host, 'powłoka mieści się bez poziomego przewijania').toBeLessThanOrEqual(pomiar.ekran + 1);
  expect(pomiar.ramka, 'aktywny panel mieści się bez poziomego przewijania').toBeLessThanOrEqual(pomiar.ekranRamki + 1);
}

test('chip → zimny Start → DocPro: anulowana karta nie powstaje w tle i późniejszy Start działa', async ({ page }) => {
  await konto(page);
  const zwolnij = await zimnyStart(page);
  try {
    await chip(page);
    await trasa(page, 'docpro', 'docpro.html');
  } finally { zwolnij(); }
  const f = await start(page);
  await page.waitForTimeout(750); // przynajmniej dwa retry oraz zakończenie odczytu rzeczywistego sejfu
  await bezNakladki(page, 'docpro', 'DocPro');
  await expect(f.locator('.vilda-auth-patient-card'), 'anulowane żądanie nie zbudowało karty w ukrytym Start').toHaveCount(0);
  await trasa(page, 'start', 'index.html');
  await bezNakladki(page, 'start', 'Start');
  await szerokosc(page);
});

test('zimna lista pacjentów jest anulowana zmianą trasy, bez ukrytego auth i dodatkowego Wstecz', async ({ page }) => {
  await konto(page);
  const zwolnij = await zimnyStart(page);
  try {
    await page.evaluate(() => window.VildaShell.openPatientsInStart());
    await trasa(page, 'terminarz', 'terminarz.html');
  } finally { zwolnij(); }
  await start(page);
  await page.waitForTimeout(750);
  await bezNakladki(page, 'terminarz', 'Terminarz');
  await page.goBack();
  await bezNakladki(page, 'start', 'Start');
  await szerokosc(page);
});

test('A → B przy zimnym Start: nowsza intencja wygrywa nawet gdy retry A wraca po otwarciu B', async ({ page }) => {
  const [idA, idB] = await konto(page);
  const zwolnij = await zimnyStart(page);
  try {
    await page.evaluate((id) => {
      const nativeSet = window.setTimeout;
      const nativeClear = window.clearTimeout;
      const retry = [];
      window.setTimeout = function (callback, delay, ...args) {
        const token = nativeSet.call(window, () => {}, 12000);
        retry.push({ callback, args, token, canceled: false });
        return token;
      };
      window.clearTimeout = function (token) {
        const item = retry.find((r) => r.token === token);
        if (item) item.canceled = true;
        return nativeClear.call(window, token);
      };
      try { window.VildaShell.openPatientCardInStart(id); }
      finally { window.setTimeout = nativeSet; }
      window.__vildaReleaseIntentRetry = () => {
        window.clearTimeout = nativeClear;
        for (const r of retry) {
          nativeClear.call(window, r.token);
          if (!r.canceled) r.callback.apply(window, r.args);
        }
      };
      window.__vildaIntentRetryCount = retry.length;
    }, idA);
    expect(await page.evaluate(() => window.__vildaIntentRetryCount), 'realny retry A został zatrzymany').toBeGreaterThan(0);
  } finally { zwolnij(); }
  const f = await start(page);
  await page.evaluate((id) => window.VildaShell.openPatientCardInStart(id), idB);
  await expect(f.locator('.vilda-patient-hero-name')).toHaveText(PACJENCI[1].name);
  await page.evaluate(() => window.__vildaReleaseIntentRetry());
  await page.waitForTimeout(500);
  await expect(f.locator('.vilda-patient-hero-name'), 'zaległy callback A nie zastępuje nowszej karty B')
    .toHaveText(PACJENCI[1].name);
  await expect(f.locator('.vilda-patient-stat').filter({ hasText: 'Wzrost' })).toContainText('153,0 cm');
  await szerokosc(page);
});

test('gotowa karta → inna trasa → Back/Forward: zamykanie auth nie cofa wybranej trasy', async ({ page }) => {
  // Kilka pełnych przejść historii współdzielonej z iframe wymaga czasu także
  // przy równoległej walidacji repo. Budżet asercji pozostaje domyślny.
  test.setTimeout(90_000);
  await konto(page);
  await page.goto('/app.html#/docpro', { waitUntil: 'load' });
  const f = await start(page);
  await chip(page);
  await expect(f.locator('.vilda-patient-hero-name')).toHaveText(PACJENCI[0].name);
  await page.waitForTimeout(700); // sentinel historii karty jest już zainstalowany
  // Prawdziwa wspólna historia okna i ramki: pierwszy Back zamyka kartę,
  // drugi wraca do DocPro; Forward nie odtwarza starej intencji pacjenta.
  await page.goBack();
  await bezNakladki(page, 'start', 'Start');
  await expect(f.locator('.vilda-auth-patient-card')).toBeHidden();
  await page.goBack();
  await bezNakladki(page, 'docpro', 'DocPro');
  await page.goForward();
  await bezNakladki(page, 'start', 'Start');
  await expect(f.locator('.vilda-auth-patient-card')).toBeHidden();
  await page.goForward();
  await bezNakladki(page, 'start', 'Start');
  await expect(f.locator('.vilda-auth-patient-card')).toBeHidden();
  await chip(page);
  await expect(f.locator('.vilda-patient-hero-name')).toHaveText(PACJENCI[0].name);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.VildaShell.navigate('homa'));
  await bezNakladki(page, 'homa', 'HOMA-IR');
  await page.goBack();
  await bezNakladki(page, 'start', 'Start');
  await page.goForward();
  await bezNakladki(page, 'homa', 'HOMA-IR');
  // Osobny wariant tego samego kontraktu: cel = aktualny Start z otwartą kartą.
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await bezNakladki(page, 'start', 'Start');
  await chip(page);
  await expect(f.locator('.vilda-patient-hero-name')).toHaveText(PACJENCI[0].name);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await bezNakladki(page, 'start', 'Start');
  await page.goBack();
  await bezNakladki(page, 'homa', 'HOMA-IR');
  await page.goForward();
  await bezNakladki(page, 'start', 'Start');
  await szerokosc(page);
});

test('kontrole: przyciski ← DocPro i ← Terminarz wracają do właściwego panelu po otwarciu z chipu', async ({ page }) => {
  await konto(page);
  await page.goto('/app.html#/docpro', { waitUntil: 'load' });
  const f = await start(page);
  for (const [klucz, plik, tytul] of [['docpro', 'docpro.html', 'DocPro'], ['terminarz', 'terminarz.html', 'Terminarz']]) {
    await trasa(page, klucz, plik);
    await chip(page);
    await expect(f.locator('.vilda-patient-hero-name')).toHaveText(PACJENCI[0].name);
    await f.getByRole('button', { name: `← ${tytul}`, exact: true }).click();
    await bezNakladki(page, klucz, tytul);
    await szerokosc(page);
  }
});
