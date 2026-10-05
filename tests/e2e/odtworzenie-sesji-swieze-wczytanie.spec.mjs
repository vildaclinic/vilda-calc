import { expect, test } from '@playwright/test';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// P-SWIEZE-WCZYTANIE (2026-10-05) — pacjent wczytany po starcie strony nie dostaje na wierzch
// migawki sesji poprzedniego pacjenta.
//
// Startowe odtworzenie sesji karty (restoreMainSessionIfAny) rusza dwie klatki animacji po
// DOMContentLoaded. Pacjent wczytany wcześniej — zamiarem z innej strony (vilda:pendingPatientLoad)
// albo w karcie, której przeglądarka nie rysuje — dostawał potem na wierzch migawkę poprzedniego
// pacjenta. Test 1 wstrzymuje klatki animacji tak, jak robi to przeglądarka z kartą w tle; test 2
// opóźnia app.js, jak przy pierwszym pobraniu po wdrożeniu; test 3 pilnuje, że odświeżenie strony
// (P-ODSWIEZENIE) nadal przywraca niezapisaną zmianę.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SwiezeWcz!26';

const X = {
  name: 'Fikcyjny Pierwszy',
  user: { firstName: 'Pierwszy', lastName: 'Fikcyjny', sex: 'M', age: 12, ageMonths: 0, height: 151, weight: 41 },
  advanced: { name: 'Fikcyjny Pierwszy', motherHeight: 158, fatherHeight: 171, data: { measurements: [] } },
};
const Y = {
  name: 'Fikcyjna Druga',
  user: { firstName: 'Druga', lastName: 'Fikcyjna', sex: 'F', age: 8, ageMonths: 3, height: 131, weight: 29 },
  advanced: { name: 'Fikcyjna Druga', motherHeight: 165, fatherHeight: 182, data: { measurements: [] } },
};

/* Klatki animacji wstrzymane do __e2ePuscKlatki() — jak w karcie w tle (timery idą, klatki nie). */
function wstrzymywanieKlatek(page) {
  return page.addInitScript(() => {
    let wstrzymane = false;
    try { wstrzymane = window.sessionStorage.getItem('__e2eWstrzymajKlatki') === '1'; } catch (_) { /* pomiń */ }
    if (!wstrzymane) return;
    const natywny = window.requestAnimationFrame.bind(window);
    const kolejka = [];
    window.requestAnimationFrame = (cb) => { kolejka.push(cb); return kolejka.length; };
    window.__e2ePuscKlatki = () => {
      try { window.sessionStorage.removeItem('__e2eWstrzymajKlatki'); } catch (_) { /* pomiń */ }
      window.requestAnimationFrame = natywny;
      kolejka.splice(0).forEach((cb) => natywny(cb));
    };
  });
}

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await wstrzymywanieKlatek(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => typeof window.applyLoadedData === 'function'
    && typeof window.saveUserData === 'function');
  await czekajNaOdtworzenieSesji(page);
}

/* Pacjenci X i Y w sejfie, X wczytany tak, jak robi to lista pacjentów; migawka sesji = X. */
async function przygotujXwczytanegoIY(page) {
  const ids = await page.evaluate(async ([x, y]) => {
    const a = await window.VildaVault.savePatient(JSON.parse(JSON.stringify(x)), { dedup: false });
    const b = await window.VildaVault.savePatient(JSON.parse(JSON.stringify(y)), { dedup: false });
    return { x: a.patientId, y: b.patientId };
  }, [X, Y]);
  await page.evaluate(async (pid) => {
    const p = await window.VildaVault.getPatient(pid);
    window.applyLoadedData(p.snapshots[0].payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded',
      { detail: { patientId: pid, source: 'pick' } }));
  }, ids.x);
  await expect.poll(() => page.evaluate(() => {
    const m = window.VildaPersistence && window.VildaPersistence.readMainSession();
    return m && m.name;
  })).toBe(X.name);
  return ids;
}

const stan = (page) => page.evaluate(() => {
  const m = window.VildaPersistence && window.VildaPersistence.readMainSession();
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
  return {
    pole: g('name'), wzrost: g('height'), plec: g('sex'),
    id: window._vildaCurrentPatientId || null,
    wczytany: window.lastLoadedData ? window.lastLoadedData.name : null,
    migawka: m ? m.name : null,
  };
});

async function liczbyWersji(page, ids) {
  return page.evaluate(async ({ x, y }) => ({
    x: (await window.VildaVault.getPatient(x)).snapshotCount,
    y: (await window.VildaVault.getPatient(y)).snapshotCount,
  }), ids);
}

async function dwieKlatki(page) {
  await page.evaluate(() => new Promise((gotowe) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => gotowe()));
  }));
}

test('pacjent wczytany przed startowym odtworzeniem sesji nie dostaje migawki poprzedniego', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page);
  const ids = await przygotujXwczytanegoIY(page);
  const przed = await liczbyWersji(page, ids);

  // Nowa strona z klatkami wstrzymanymi (karta w tle): odtworzenie czeka na pierwszą klatkę.
  await page.evaluate(() => window.sessionStorage.setItem('__e2eWstrzymajKlatki', '1'));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.applyLoadedData === 'function'
    && window.VildaInit && window.VildaInit.isInitialized('app:main-session-restore-init'),
  null, { polling: 100, timeout: 30_000 });

  // Wczytanie Y tą drogą, którą idzie skok do punktu GH: applyLoadedData, identyfikator, zdarzenie.
  await page.evaluate(async (pid) => {
    const p = await window.VildaVault.getPatient(pid);
    window.applyLoadedData(p.snapshots[0].payload);
    window._vildaCurrentPatientId = pid;
    window.sessionStorage.setItem('vildaCurrentPatientId', pid);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded',
      { detail: { patientId: pid, source: 'pick' } }));
  }, ids.y);

  // Karta wraca na wierzch: odtworzenie dostaje swoje klatki.
  await page.evaluate(() => window.__e2ePuscKlatki());
  await dwieKlatki(page);
  await page.waitForTimeout(500);

  const s = await stan(page);
  // Świeże wczytanie wypełnia nazwisko i płeć; liczby wracają dopiero po „Odtwórz zapis".
  // Wzrost nie może więc pochodzić z migawki poprzedniego pacjenta.
  expect(s.pole, 'w formularzu zostaje wczytany pacjent').toBe(Y.name);
  expect(s.wzrost, 'brak liczb poprzedniego pacjenta').not.toBe(String(X.user.height));
  expect(s.plec).toBe('F');
  expect(s.wczytany).toBe(Y.name);
  expect(s.id).toBe(ids.y);
  expect(s.migawka, 'migawka sesji należy do wczytanego pacjenta').toBe(Y.name);

  // Dalej jak użytkownik: „Odtwórz zapis", poprawka wagi, zapis — wersja trafia do Y, nie do X.
  await page.evaluate(() => {
    const przycisk = document.getElementById('restoreStateBtn');
    const potwierdz = window.confirm;
    window.confirm = () => true;
    try { przycisk.click(); } finally { window.confirm = potwierdz; }
  });
  await expect.poll(() => page.evaluate(() => document.getElementById('height').value))
    .toBe(String(Y.user.height));
  await page.evaluate(() => {
    const el = document.getElementById('weight');
    el.value = '29.5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await expect.poll(() => liczbyWersji(page, ids)).toEqual({ x: przed.x, y: przed.y + 1 });
  const najnowszyY = await page.evaluate(async (pid) => {
    const p = await window.VildaVault.getPatient(pid);
    const u = p.snapshots[0].payload.user || {};
    return { name: p.snapshots[0].payload.name, sex: u.sex, height: Number(u.height), weight: Number(u.weight) };
  }, ids.y);
  expect(najnowszyY).toEqual({ name: Y.name, sex: 'F', height: Y.user.height, weight: 29.5 });
});

test('zamiar wczytania z innej strony czeka na DOMContentLoaded i wygrywa z migawką', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page);
  const ids = await przygotujXwczytanegoIY(page);

  // Pierwsze pobranie app.js po wdrożeniu: DOMContentLoaded przychodzi później niż zwykle.
  await page.route(/\/app\.js\?v=\d+$/, async (route) => {
    await new Promise((r) => { setTimeout(r, 800); });
    await route.continue();
  });
  // Wybór pacjenta Y na stronie bez formularza (np. Notatki) zapisuje zamiar i przechodzi na Start.
  await page.evaluate((pid) => window.sessionStorage.setItem('vilda:pendingPatientLoad', pid), ids.y);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !window.sessionStorage.getItem('vilda:pendingPatientLoad'),
    null, { polling: 100, timeout: 30_000 });
  await czekajNaOdtworzenieSesji(page);
  await page.waitForTimeout(1500);

  const s = await stan(page);
  expect(s.pole, 'w formularzu jest pacjent wybrany na poprzedniej stronie').toBe(Y.name);
  expect(s.wzrost, 'brak liczb poprzedniego pacjenta').not.toBe(String(X.user.height));
  expect(s.plec).toBe('F');
  expect(s.wczytany).toBe(Y.name);
  expect(s.id).toBe(ids.y);
  expect(s.migawka).toBe(Y.name);
});

test('odświeżenie strony nadal przywraca niezapisaną zmianę wczytanego pacjenta (P-ODSWIEZENIE)', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page);
  const ids = await przygotujXwczytanegoIY(page);

  await page.evaluate(() => {
    const el = document.getElementById('weight');
    el.value = '43.7';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => {
    const m = window.VildaPersistence.readMainSession();
    return m && m.user ? String(m.user.weight) : null;
  })).toBe('43.7');

  // F5 z klatkami wstrzymanymi: nic nie wczytuje pacjenta przed odtworzeniem, więc odtworzenie idzie.
  await page.evaluate(() => window.sessionStorage.setItem('__e2eWstrzymajKlatki', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.VildaInit
    && window.VildaInit.isInitialized('app:main-session-restore-init'),
  null, { polling: 100, timeout: 30_000 });
  await page.evaluate(() => window.__e2ePuscKlatki());
  await dwieKlatki(page);
  await page.waitForTimeout(500);

  const s = await stan(page);
  expect(s.pole).toBe(X.name);
  expect(s.id).toBe(ids.x);
  expect(await page.evaluate(() => document.getElementById('weight').value)).toBe('43.7');
});
