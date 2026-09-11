import { expect, test } from '../support/test-czas.mjs';

// Karta „Przypomnienia” obok głównego formularza (index.html, vilda_auth_ui.js) — życzenie
// właściciela 2026-09-11: pozycja karty była tylko napisem („Obserwacja — Umówić densytometr…”),
// bez podglądu pełnej treści i bez akcji; akcje (Otwórz kartę pacjenta / Zrobione / Przełóż… /
// Nie zgłosił się) istniały wyłącznie w widoku pełnoekranowym, pod długim naciśnięciem albo „⋮”.
// Teraz (wariant A, wybór właściciela 2026-09-12): klik w pozycję ORAZ przycisk „⋮” przy pozycji
// otwierają to samo okno na środku ekranu — pełna treść zdarzenia i przyciski akcji z tego samego
// silnika co widok pełnoekranowy (remAkcje). Pierwsze wydanie wpisało style do bloku
// @media (max-width:699px), więc na komputerze okno lądowało nieostylowane na dole strony —
// stąd asercje geometrii (rozmiar „⋮”, position:fixed, wyśrodkowanie) przy szerokości 1440 px.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#RemKarta!26aa';
const DLUGA_TRESC =
  'Umówić densytometrię w Pracowni Densytometrii (budynek C, II piętro), skierowanie w teczce. ' +
  'Przed badaniem odstawić wapń na 24 h. Wynik omówić z rodzicami na następnej wizycie, ' +
  'porównać z poprzednim badaniem z marca.';

// Daty liczy PRZEGLĄDARKA (test-czas.mjs może trzymać jej zegar w innym dniu niż Node).
const dataWPrzegladarce = (page, przesuniecieDni) => page.evaluate((n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}, przesuniecieDni);

async function otworzZDanymi(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
      // Dzienny modal przypomnień nie ma przechwytywać kliknięć.
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      window.localStorage.setItem('vilda-reminders-shown-v1', `${t}|${Date.now()}`);
      window.localStorage.setItem('vilda-reminders-closed-v1', `${t}|${Date.now()}`);
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  const zalegla = await dataWPrzegladarce(page, -3);
  const dzis = await dataWPrzegladarce(page, 0);
  const ids = await page.evaluate(
    async (a) => {
      await window.VildaVault.createUser(a.pw, { label: 'e2e', iterations: 10000 });
      const pid = (await window.VildaVault.savePatient({ name: 'Densyta Dorota', user: { age: 9, sex: 'F' } })).patientId;
      const obs = (await window.VildaVault.savePatientNote({
        patientId: pid, title: 'Umówić densytometr', body: a.tresc, category: 'observation', dueDateISO: a.zalegla, dueTime: null,
      })).id;
      const kontrola = (await window.VildaVault.savePatientNote({
        patientId: pid, title: 'Wizyta kontrolna', body: '', category: 'followup', dueDateISO: a.dzis, dueTime: '11:30',
      })).id;
      return { pid, obs, kontrola };
    },
    { pw: HASLO, tresc: DLUGA_TRESC, zalegla, dzis },
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.evaluate(() => {
    // Karta jest za bramką PRO (podpisany token, którego w teście nie podrabiamy) — podmieniamy
    // wyłącznie tę bramkę, jak w przypomnienia-zwijanie.spec.mjs; reszta ścieżki jest prawdziwa.
    window.VildaProAccess.hasAccess = () => true;
    window.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForSelector('#remindersInline .vild-rem-row', { state: 'attached', timeout: 20_000 });
  // Baner cookies (fixed, u dołu) przykrywa dolne wiersze karty i menu — odrzucamy jak w innych
  // specyfikacjach (klirens-ui-*.spec.mjs).
  const consentDecline = page.locator('#consent-decline');
  if (await consentDecline.isVisible().catch(() => false)) {
    await consentDecline.click();
  }
  return ids;
}

const notatka = (page, id) => page.evaluate(async (i) => {
  const n = await window.VildaVault.getPatientNote(i);
  return { completedAtISO: n.completedAtISO || null, dueDateISO: String(n.dueDateISO || '').slice(0, 10) };
}, id);

const wierszObs = (page) => page.locator('#remindersInline .vild-rem-row', { hasText: 'Umówić densytometr' });

test('klik w pozycję karty otwiera okno z pełną treścią zdarzenia', async ({ page }) => {
  await otworzZDanymi(page);
  const w = wierszObs(page);
  await expect(w).toHaveCount(1);
  // W karcie treść jest skrócona (nazwisko + „Obserwacja — tytuł”), pełnej treści nie ma.
  await expect(w).not.toContainText('odstawić wapń');
  await w.click();
  const dlg = page.locator('.vild-rem-dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Densyta Dorota');
  await expect(dlg).toContainText('Obserwacja');
  await expect(dlg).toContainText('Umówić densytometr');
  await expect(dlg).toContainText(DLUGA_TRESC);
  await expect(dlg).toContainText('Termin');
  // Geometria: okno jest nakładką fixed, wyśrodkowaną w oknie przeglądarki — nie blokiem na dole.
  const geo = await page.evaluate(() => {
    const ov = document.querySelector('.vild-rem-dlg-ov');
    const d = document.querySelector('.vild-rem-dlg');
    const r = d.getBoundingClientRect();
    return {
      position: getComputedStyle(ov).position,
      cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height,
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  expect(geo.position, 'nakładka okna jest fixed').toBe('fixed');
  expect(Math.abs(geo.cx - geo.vw / 2), 'okno wyśrodkowane w poziomie').toBeLessThan(40);
  expect(Math.abs(geo.cy - geo.vh / 2), 'okno wyśrodkowane w pionie').toBeLessThan(60);
  expect(geo.w, 'szerokość okna (max 460 px)').toBeLessThanOrEqual(461);
  const akcje = await dlg.locator('.vild-rem-dlg-acts button').allTextContents();
  expect(akcje.join(' | ')).toMatch(/Otwórz kartę pacjenta/);
  expect(akcje.join(' | ')).toMatch(/Zrobione/);
  expect(akcje.join(' | ')).toMatch(/Przełóż/);
  expect(akcje.join(' | ')).toMatch(/Nie zgłosił się/);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
});

test('„⋮” przy pozycji ma rozmiar jak w widoku pełnoekranowym i otwiera to samo okno z akcjami', async ({
  page,
}) => {
  const ids = await otworzZDanymi(page);
  const w = wierszObs(page);
  const box = await w.locator('.vild-rem-more').boundingBox();
  expect(box, 'przycisk „⋮” istnieje').toBeTruthy();
  expect(Math.round(box.width), 'szerokość 34 px jak kebab widoku pełnoekranowego').toBe(34);
  expect(Math.round(box.height), 'wysokość 32 px jak kebab widoku pełnoekranowego').toBe(32);

  await w.locator('.vild-rem-more').click();
  const dlg = page.locator('.vild-rem-dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText(DLUGA_TRESC);
  const akcje = (await dlg.locator('.vild-rem-dlg-acts button').allTextContents()).map((t) => t.trim());
  expect(akcje).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Otwórz kartę pacjenta'),
      expect.stringContaining('Zrobione'),
      expect.stringContaining('Przełóż'),
      expect.stringContaining('Nie zgłosił się'),
    ]),
  );
  // „Zrobione” → wpis wykonany w sejfie, okno zamknięte, pozycja znika z karty.
  await dlg.locator('.vild-rem-dlg-acts button', { hasText: 'Zrobione' }).click();
  await expect.poll(async () => (await notatka(page, ids.obs)).completedAtISO).toBeTruthy();
  await expect(dlg).toHaveCount(0);
  await expect(w).toHaveCount(0);

  // „Przełóż…” w oknie dzisiejszej kontroli → „Jutro” przesuwa termin o dzień.
  const k = page.locator('#remindersInline .vild-rem-row', { hasText: 'Wizyta kontrolna' });
  await expect(k).toHaveCount(1);
  await k.locator('.vild-rem-more').click();
  await page.locator('.vild-rem-dlg .vild-rem-dlg-acts button', { hasText: 'Przełóż' }).click();
  await page.locator('.vilda-reminders-snooze-menu button', { hasText: 'Jutro' }).click();
  const jutro = await dataWPrzegladarce(page, 1);
  await expect.poll(async () => (await notatka(page, ids.kontrola)).dueDateISO).toBe(jutro);
  await expect(page.locator('.vild-rem-dlg')).toHaveCount(0);
  await expect(k).toHaveCount(0);
});
