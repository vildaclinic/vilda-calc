import { expect, test } from '../support/test-czas.mjs';

// P-POKWITANIE-W-TLE (decyzja właściciela 2026-10-12, wariant A). vilda_puberty_source.js czytał bieżącego
// pacjenta z sejfu od nowa na każde zdarzenie w tle (vilda:sync-status-changed, vilda:session-changed,
// vilda:auth-hidden, storage) i ogłaszał najpierw „loading” bez danych, potem „ready”. vilda_zrodla_pacjenta.js
// zamawiał wtedy dwa pełne update(), choć rekord się nie zmienił; pierwsze liczyło stronę bez danych pokwitania.
//
// Prawdziwe vilda_sync.js i vilda_sync_integration.js. Serwer synchronizacji to atrapa w stanie ustalonym: slot
// zarejestrowany, ETag bez zmian, w chmurze nic nowego — każde pobranie kończy się „up-to-date”, jak u lekarza
// bez zmian na innych urządzeniach. Żaden test nie łączy się z produkcyjnym workerem.
//
// Zmierzone na audyt b38803b (przed zmianą), fikcyjna pacjentka z danymi pokwitania w rekordzie (start 9,5 r.,
// Tanner 3), 3 wymiany synchronizacji: index.html — 12 ogłoszeń źródła i 6 pełnych update(), w każdej wymianie
// pierwsze update() w stanie „loading”; docpro.html — 10 update(). Po zmianie: 0 ogłoszeń i 0 update(), a rekord
// nadal jest czytany po każdym zdarzeniu. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const SERWER = 'https://vilda-sync.maciej-4b9.workers.dev';
const HASLO = 'E2e#PokwitanieWTle!26';
const ANNA = {
  name: 'Probna Anna',
  user: { lastName: 'Probna', firstName: 'Anna', sex: 'F', age: 11, ageMonths: 6, height: 146, weight: 38, tannerStage: '3' },
  puberty: { onsetAgeYears: 9.5, gnrhaStatus: 'brak' },
};
const JAN = { name: 'Probny Jan', user: { lastName: 'Probny', firstName: 'Jan', sex: 'M', age: 9, ageMonths: 0, height: 135, weight: 40 } };

async function atrapaSynchronizacji(context) {
  await context.route(`${SERWER}/**`, async (route) => {
    const zadanie = route.request();
    const sciezka = new URL(zadanie.url()).pathname;
    const metoda = zadanie.method();
    const json = (status, cialo) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cialo) }).catch(() => {});
    if (sciezka.endsWith('/register') && metoda === 'POST') return json(201, { etag: 'E1' });
    if (sciezka.endsWith('/status')) return json(200, { etag: 'E1', size: 2048, lastModified: '2026-10-11T08:00:00.000Z' });
    if (sciezka.endsWith('/entitlement')) return json(200, { plan: 'free' });
    if (sciezka.endsWith('/blob') && metoda === 'GET') {
      const etag = zadanie.headers()['if-none-match'] || '';
      return etag.includes('E1') ? route.fulfill({ status: 304, body: '' }).catch(() => {}) : json(404, {});
    }
    if (sciezka.endsWith('/blob') && metoda === 'PUT') return json(200, { etag: 'E1' });
    if (sciezka.endsWith('/changes')) return json(200, { deltas: [], headSeq: 0 });
    if (sciezka.endsWith('/deltas')) return json(200, { deltas: [] });
    if (sciezka.endsWith('/delta')) return json(204, {});
    return json(404, {});
  });
  await context.routeWebSocket(/vilda-sync\.maciej-4b9\.workers\.dev/, (ws) => { ws.close(); });
}

async function otworz(page, context, strona) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('vilda-sync-enabled-v1', 'true');
      // Bez sondy nowego urządzenia: po odblokowaniu od razu pełna synchronizacja (syncFull).
      window.sessionStorage.setItem('vilda-probe-done-v1', '1');
    } catch (_) { /* brak storage — pomiń */ }
    window.__dziennikSync = [];
    document.addEventListener('vilda:sync-status-changed', (e) => {
      const d = e.detail || {};
      window.__dziennikSync.push({ state: d.state, op: d.result ? d.result.operation : null });
    });
  });
  await atrapaSynchronizacji(context);
  await page.goto(`/${strona}`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaSyncIntegration), null, { timeout: 30000 });
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.update === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'), null, { timeout: 30000 });
  // Chwila ostatniego update() — pomiar rusza dopiero po ucichnięciu przeliczeń po wczytaniu (patrz ciszaPrzeliczen).
  await page.evaluate(() => {
    const update = window.update;
    window.__ostatnieUpdate = performance.now();
    window.update = function () { window.__ostatnieUpdate = performance.now(); return update.apply(this, arguments); };
  });
  // Stan ustalony: zakończona pełna synchronizacja po odblokowaniu.
  await expect.poll(() => page.evaluate(() => window.__dziennikSync.some((s) => s.state === 'ok' && s.op === 'full')),
    { timeout: 20000, message: 'pełna synchronizacja po odblokowaniu' }).toBe(true);
}

const statusZrodla = (page, id) => page.evaluate((pid) => window.VildaPubertySource.kontekstPacjenta(pid).status, id);

async function zapisz(page, pacjent) {
  return page.evaluate(async (p) => (await window.VildaVault.savePatient(p, { dedup: false })).patientId, pacjent);
}

// Wczytanie jak z listy pacjentów (source: 'pick'); okno „Co chcesz zrobić?” → „Nowy pomiar”.
async function wczytaj(page, pid) {
  await page.evaluate(async (id) => {
    const rec = await window.VildaVault.getPatient(id);
    const snap = rec.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: rec.snapshotCount || 1, source: 'pick' },
    }));
  }, pid);
  await zamknijWyborWczytania(page);
  await expect.poll(() => statusZrodla(page, pid), { timeout: 15000 }).toBe('ready');
}

async function zamknijWyborWczytania(page) {
  const nowy = page.locator('#vildaLcmNew');
  await nowy.waitFor({ state: 'visible', timeout: 5000 }).then(() => nowy.click()).catch(() => { /* okno się nie pokazało */ });
}

// Wczytanie daje jeszcze kaskadę przeliczeń niezależną od synchronizacji: custom-fixes.js po vilda:patient-loaded
// rozgłasza stan i po 3,2 s wysyła `change` na polach formularza (#sex → debouncedUpdate()). Rejestrator rusza
// dopiero, gdy przez 4 s nie było żadnego update(), żeby liczyć wyłącznie skutki zdarzeń synchronizacji.
async function ciszaPrzeliczen(page) {
  await expect.poll(() => page.evaluate(() => performance.now() - window.__ostatnieUpdate >= 4000),
    { timeout: 30000, intervals: [250], message: 'strona przestała się przeliczać po wczytaniu' }).toBe(true);
}

// Rejestrator: update() ze stanem źródła w chwili przeliczenia, ogłoszenia źródła pokwitania i stan źródła przy
// każdym zdarzeniu synchronizacji. Słuchacz zdarzeń jest dopisany po źródle, więc widzi stan po jego obsłudze.
const wlaczRejestrator = (page) => page.evaluate(() => {
  const R = { update: [], ogloszenia: [], zdarzenia: [], odczyty: 0, wToku: 0 };
  const zrodlo = () => {
    let id = null;
    try { id = window.sessionStorage.getItem('vildaCurrentPatientId'); } catch (_) { /* brak */ }
    const k = window.VildaPubertySource.kontekstPacjenta(id);
    return { id, status: k.status, start: k.puberty ? k.puberty.wiekStartuPokwitaniaLat : null };
  };
  const update = window.update;
  window.update = function () { R.update.push(zrodlo()); return update.apply(this, arguments); };
  document.addEventListener('vilda:zrodlo-pacjenta-zmienione', (e) => {
    if (e.detail && e.detail.zrodlo === 'puberty') R.ogloszenia.push(zrodlo());
  });
  document.addEventListener('vilda:sync-status-changed', (e) => R.zdarzenia.push({ state: e.detail && e.detail.state, ...zrodlo() }));
  const V = window.VildaVault;
  const getPatient = V.getPatient;
  V.getPatient = function () {
    R.odczyty += 1; R.wToku += 1;
    return Promise.resolve(getPatient.apply(this, arguments)).finally(() => { R.wToku -= 1; });
  };
  window.__rej = R;
});

const odczytaj = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__rej)));

// Po odczytach rekordu: zamówione przeliczenie idzie przez setTimeout(0) i requestAnimationFrame.
async function spokoj(page) {
  await expect.poll(() => page.evaluate(() => window.__rej.wToku), { timeout: 10000 }).toBe(0);
  await page.evaluate(() => new Promise((ok) => {
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 50))), 0);
  }));
}

// Jedna wymiana z serwerem w kształcie z vilda_sync_integration.js: „syncing”, potem „ok”.
async function cyklSynchronizacji(page) {
  const przed = await page.evaluate(() => window.__dziennikSync.length);
  await page.evaluate(() => window.VildaSyncIntegration.pullNow());
  await expect.poll(() => page.evaluate((n) => window.__dziennikSync.slice(n).some((s) => s.state === 'ok'), przed),
    { timeout: 15000, message: 'wymiana z serwerem zakończona' }).toBe(true);
  await spokoj(page);
}

for (const strona of ['index.html', 'docpro.html']) {
  test(`${strona}: synchronizacja bez zmian w chmurze — rekord czytany ponownie, bez „loading” i bez update()`, async ({ page, context }) => {
    test.setTimeout(150_000);
    await otworz(page, context, strona);
    const anna = await zapisz(page, ANNA);
    await wczytaj(page, anna);
    await ciszaPrzeliczen(page);
    await wlaczRejestrator(page);
    for (let i = 0; i < 3; i += 1) await cyklSynchronizacji(page);
    const R = await odczytaj(page);
    expect(R.zdarzenia.filter((z) => z.state === 'ok').length, 'trzy wymiany z serwerem').toBeGreaterThanOrEqual(3);
    expect(R.odczyty, 'rekord jest czytany ponownie po zdarzeniach synchronizacji').toBeGreaterThanOrEqual(R.zdarzenia.length);
    expect(R.zdarzenia.map((z) => z.status), 'źródło nie przechodzi w „loading” przy żadnym zdarzeniu').toEqual(R.zdarzenia.map(() => 'ready'));
    expect(R.ogloszenia, 'źródło pokwitania nic nie ogłasza (przed zmianą: 4 na wymianę)').toEqual([]);
    expect(R.update, 'brak pełnych update() (przed zmianą: 2 na wymianę na index.html)').toEqual([]);
    expect(await page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id), anna)).toMatchObject({
      status: 'ready', puberty: { wiekStartuPokwitaniaLat: 9.5 }, state: { etap: '3' },
    });
  });
}

test('index.html: zmiana rekordu tego samego pacjenta dochodzi przy synchronizacji — jedno ogłoszenie, przeliczenie z nowymi danymi, bez „loading”', async ({ page, context }) => {
  test.setTimeout(150_000);
  await otworz(page, context, 'index.html');
  const anna = await zapisz(page, ANNA);
  await wczytaj(page, anna);
  await ciszaPrzeliczen(page);
  await wlaczRejestrator(page);
  // Nowa wersja rekordu zapisana poza formularzem tej strony (np. w innej ramce): start pokwitania 10,5 r.
  await page.evaluate(async ({ id, p }) => {
    const rec = await window.VildaVault.getPatient(id);
    await window.VildaVault.savePatient(p, { patientId: id, baseSnapshotId: rec.snapshots[0].snapshotId });
  }, { id: anna, p: { ...ANNA, puberty: { onsetAgeYears: 10.5, gnrhaStatus: 'brak' } } });
  await cyklSynchronizacji(page);
  const R = await odczytaj(page);
  expect([...R.zdarzenia, ...R.ogloszenia, ...R.update].map((x) => x.status), 'nigdzie „loading”').not.toContain('loading');
  expect(R.ogloszenia, 'dokładnie jedno ogłoszenie — z nowymi danymi').toEqual([{ id: anna, status: 'ready', start: 10.5 }]);
  expect(R.update.length, 'strona przeliczona po zmianie rekordu').toBeGreaterThanOrEqual(1);
  expect(R.update.at(-1), 'ostatnie przeliczenie liczy z nowym startem pokwitania').toEqual({ id: anna, status: 'ready', start: 10.5 });
});

test('index.html: dane pokwitania nie zostają po innym pacjencie — zmiana pacjenta, synchronizacja, wyczyszczenie stanu, wylogowanie', async ({ page, context }) => {
  test.setTimeout(150_000);
  await otworz(page, context, 'index.html');
  const anna = await zapisz(page, ANNA);
  const jan = await zapisz(page, JAN);
  await wczytaj(page, anna);
  await ciszaPrzeliczen(page);
  await wlaczRejestrator(page);
  await cyklSynchronizacji(page);
  expect(await statusZrodla(page, anna), 'Anna po cichym odświeżeniu').toBe('ready');

  // Jan wczytany jak z listy. W tym samym zadaniu co zdarzenie dane Anny są już niedostępne.
  const tuzPoZmianie = await page.evaluate(async ({ id, poprzedni }) => {
    const rec = await window.VildaVault.getPatient(id);
    const snap = rec.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: rec.snapshotCount || 1, source: 'pick' },
    }));
    const S = window.VildaPubertySource;
    return { poprzedni: S.kontekstPacjenta(poprzedni).status, biezacy: S.kontekstPacjenta(id).status, dane: S.biezace(), stan: S.stanBiezacy() };
  }, { id: jan, poprzedni: anna });
  expect(tuzPoZmianie).toEqual({ poprzedni: 'unavailable', biezacy: 'loading', dane: null, stan: null });
  await zamknijWyborWczytania(page);
  await expect.poll(() => statusZrodla(page, jan), { timeout: 15000 }).toBe('ready');
  await cyklSynchronizacji(page);

  const R = await odczytaj(page);
  const poJanie = [...R.zdarzenia, ...R.ogloszenia, ...R.update].filter((x) => x.id === jan);
  expect(poJanie.length, 'zdarzenia po wczytaniu Jana zarejestrowane').toBeGreaterThan(0);
  expect(poJanie.filter((x) => x.start !== null), 'u Jana nigdy start pokwitania Anny').toEqual([]);
  expect(await page.evaluate(() => window.VildaPubertySource.biezace())).toBeNull();

  // Ścieżka wylogowania (vilda_auth_ui.js): wyczyszczenie stanu → vilda:user-state-cleared, potem blokada sejfu.
  const poWyczyszczeniu = await page.evaluate(({ a, j }) => {
    if (typeof window.clearAllData === 'function') window.clearAllData();
    else window.VildaDataImportExport.clearAllData();
    const S = window.VildaPubertySource;
    return { anna: S.kontekstPacjenta(a).status, jan: S.kontekstPacjenta(j).status, dane: S.biezace(), stan: S.stanBiezacy() };
  }, { a: anna, j: jan });
  expect(poWyczyszczeniu).toEqual({ anna: 'unavailable', jan: 'unavailable', dane: null, stan: null });
  const poBlokadzie = await page.evaluate(async ({ a, j }) => {
    await window.VildaVault.lock();
    const S = window.VildaPubertySource;
    return { anna: S.kontekstPacjenta(a).status, jan: S.kontekstPacjenta(j).status, dane: S.biezace(), stan: S.stanBiezacy() };
  }, { a: anna, j: jan });
  expect(poBlokadzie).toEqual({ anna: 'unavailable', jan: 'unavailable', dane: null, stan: null });
});
