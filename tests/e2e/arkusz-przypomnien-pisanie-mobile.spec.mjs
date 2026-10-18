import { expect, test } from '../support/test-czas.mjs';

// P-ARKUSZ-PISANIE (decyzja właściciela 2026-10-18, wariant A): dzienny arkusz „Przypomnienia” nie
// przerywa pisania. Zgłoszenie: pierwsze uruchomienie aplikacji, lekarz od razu dotyka Nazwiska
// i wpisuje — otwiera się podpowiedź zapisanych pacjentów, a w trakcie wchodzi pełnoekranowy
// arkusz, przez który na iPhonie przebija lista podpowiedzi.
//
// Zmierzone przed zmianą (ta sama emulacja telefonu, powłoka app.html): Nazwisko 0,1 s, lista po
// „Fik” 0,5 s, arkusz w powłoce 2,4 s; pole zostaje z fokusem, lista otwarta pod arkuszem,
// kolejne znaki trafiają do zakrytego pola. Własne, fikcyjne konto sejfu; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 852 } });

const HASLO = 'E2e#ArkuszPisanie!26';
const ARKUSZ = '.vilda-reminders-modal-overlay';

async function ramkaStart(page) {
  await page.waitForFunction(() => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === 'Start');
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault && f.contentDocument.readyState === 'complete');
  }, null, { timeout: 30000 });
  return (await page.$('iframe.app-pane[title="Start"]')).contentFrame();
}

// Konto z dwiema fikcyjnymi pacjentkami i jedną zaległą kontrolą. `pierwszeUruchomienie` — po
// przeładowaniu dzień zaczyna się bez znaczników „pokazano/zamknięto dziś” (czyszczone na starcie
// strony, zanim ruszy jakikolwiek skrypt); inaczej oba znaczniki są ustawione i arkusz sam nie wchodzi.
async function przygotuj(page, { pierwszeUruchomienie }) {
  await page.addInitScript((pierwsze) => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      const d = new Date(); const p = (n) => String(n).padStart(2, '0');
      const dzis = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      if (window.sessionStorage.getItem('__e2eNowyDzien') === '1' && pierwsze) {
        window.sessionStorage.removeItem('__e2eNowyDzien');
        window.localStorage.removeItem('vilda-reminders-shown-v1');
        window.localStorage.removeItem('vilda-reminders-closed-v1');
      } else if (!pierwsze) {
        window.localStorage.setItem('vilda-reminders-shown-v1', `${dzis}|${Date.now()}`);
        window.localStorage.setItem('vilda-reminders-closed-v1', `${dzis}|${Date.now()}`);
      }
    } catch (_) { /* brak storage — pomiń */ }
  }, pierwszeUruchomienie);
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:')) ? route.continue() : route.abort();
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramkaStart(page);
  await start.evaluate(async (pw) => {
    await window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 });
    const p = (n) => String(n).padStart(2, '0'); const d = new Date(); d.setDate(d.getDate() - 1);
    const wczoraj = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const anna = (await window.VildaVault.savePatient({ name: 'Fikcyjna Anna', user: { age: 8, sex: 'F' } })).patientId;
    await window.VildaVault.savePatient({ name: 'Fikcyjna Beata', user: { age: 10, sex: 'F' } });
    await window.VildaVault.savePatientNote({ patientId: anna, title: 'Kontrola wyników', body: 'Fikcyjna notatka', category: 'followup', dueDateISO: wczoraj, dueTime: null });
    window.sessionStorage.setItem('__e2eNowyDzien', '1');
  }, HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramkaStart(page);
  await start.waitForFunction(() => window.VildaVault.isUnlocked() && !document.documentElement.classList.contains('vilda-auth-locked'), null, { timeout: 30000 });
  const zgoda = page.locator('#consent-decline');
  if (await zgoda.isVisible().catch(() => false)) await zgoda.click();
  return start;
}

// Arkusze w powłoce i we WSZYSTKICH ramkach, także ukrytych (Terminarz wczytuje się w tle).
const arkusze = (page) => page.evaluate((sel) => {
  const wynik = [];
  if (document.querySelector(sel)) wynik.push('powłoka');
  document.querySelectorAll('iframe').forEach((f) => {
    try { if (f.contentDocument && f.contentDocument.querySelector(sel)) wynik.push((f.title || f.src) + (f.hidden ? ' (ukryta)' : '')); } catch (_) { /* inna domena */ }
  });
  return wynik;
}, ARKUSZ);

const stanPola = (start) => start.evaluate(() => ({
  fokus: document.activeElement && document.activeElement.tagName === 'INPUT' ? document.activeElement.id : 'poza polem',
  lista: (document.querySelector('.vilda-ac-dd') || {}).style?.display || 'brak',
  nazwisko: document.getElementById('lastName').value
}));

async function dotknijNazwiska(page, start) {
  const p = await start.evaluate(() => {
    const r = document.getElementById('lastName').getBoundingClientRect();
    const f = window.frameElement.getBoundingClientRect();
    return { x: Math.round(f.left + r.left + r.width / 2), y: Math.round(f.top + r.top + r.height / 2) };
  });
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(() => start.evaluate(() => document.activeElement && document.activeElement.id)).toBe('lastName');
}

test('pierwsze uruchomienie: arkusz czeka, aż lekarz przestanie pisać, i wchodzi raz, pełnoekranowo, ok. 3 s po wyjściu z pola', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await przygotuj(page, { pierwszeUruchomienie: true });
  await dotknijNazwiska(page, start);
  await page.keyboard.type('Fik');
  await expect.poll(async () => (await stanPola(start)).lista).toBe('block');

  // Lekarz pisze przez 7 s — przed zmianą arkusz wchodził po ok. 2,4 s.
  for (const znak of 'cyjna') {
    await page.waitForTimeout(1400);
    expect(await arkusze(page), 'arkusz nie wchodzi w trakcie pisania').toEqual([]);
    await page.keyboard.type(znak);
  }
  expect(await stanPola(start)).toEqual({ fokus: 'lastName', lista: 'block', nazwisko: 'Fikcyjna' });

  // Wyjście z pola („Gotowe”). Czas mierzony w samej stronie: od wyjścia z pola do wejścia arkusza.
  await page.evaluate((sel) => {
    window.__e2eArkusz = null;
    new MutationObserver((_, o) => { if (document.querySelector(sel)) { window.__e2eArkusz = Date.now(); o.disconnect(); } })
      .observe(document.body, { childList: true, subtree: true });
  }, ARKUSZ);
  const wyjscie = await start.evaluate(() => { document.activeElement.blur(); return Date.now(); });
  await expect.poll(() => page.evaluate(() => window.__e2eArkusz), { timeout: 15000 }).not.toBeNull();
  const poIlu = (await page.evaluate(() => window.__e2eArkusz)) - wyjscie;
  expect(poIlu, '3 s przerwy od ostatniego wpisu albo wyjścia z pola').toBeGreaterThanOrEqual(2900);

  // Jeden arkusz, w powłoce (jak dotąd pełnoekranowy) — żaden w ukrytym panelu.
  await page.waitForTimeout(1500);
  expect(await arkusze(page)).toEqual(['powłoka']);
  await expect(page.locator(ARKUSZ)).toBeVisible();
  expect((await stanPola(start)).nazwisko, 'wpisane nazwisko zostało').toBe('Fikcyjna');
});

test('arkusz otwarty w trakcie pisania (dzwoneczek, wywołanie wymuszone) zamyka podpowiedź i zdejmuje fokus z pola', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await przygotuj(page, { pierwszeUruchomienie: false });
  await dotknijNazwiska(page, start);
  await page.keyboard.type('Fik');
  await expect.poll(async () => (await stanPola(start)).lista).toBe('block');

  // Wymuszone otwarcie omija bramkę pisania (świadome kliknięcie), ale nie może zostawić listy
  // ani fokusu pod arkuszem: przed zmianą lista zostawała otwarta, a znaki szły do zakrytego pola.
  await page.evaluate(() => window.VildaAuthUI.maybeShowReminders({ force: true }));
  await expect(page.locator(ARKUSZ)).toBeVisible();
  await expect.poll(() => stanPola(start)).toEqual({ fokus: 'poza polem', lista: 'none', nazwisko: 'Fik' });
  await page.keyboard.type('xyz');
  expect((await stanPola(start)).nazwisko, 'znaki nie trafiają do zakrytego pola').toBe('Fik');
});
