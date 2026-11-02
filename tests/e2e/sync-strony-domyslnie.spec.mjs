import { expect, test } from '@playwright/test';

// E2-PR1b (P-SYNC-STRONY-DOMYSLNIE) — pobieranie dziennika zmian stronami domyślnie, na prawdziwej przeglądarce:
// prawdziwy sejf i prawdziwe vilda_sync.js na „Komputerze prywatnym”; serwer synchronizacji to atrapa (route) w
// kształcie workera v37a (GET /v1/health z changes-paged, /changes stronami z limit=200 i legacy bez limit=), bo w
// repozytorium go nie ma. Zaległość to 250 zaślepek {seq, gap:true} (numery bez treści), więc nic nie jest scalane:
// test sprawdza tylko żądania, kursor i getDrainStatus. Bez klucza vilda-sync-paged-v1: health (bez tokenu), dwie strony
// w jednym pobraniu, kursor 251. Z kluczem '0': jedno żądanie legacy jak przed E2-PR1, bez health.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SyncStrony!26bb';
const WORKER = 'https://vilda-sync.maciej-4b9.workers.dev';
const HEAD = 251;

async function przygotuj(page, flaga) {
  await page.addInitScript((f) => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      // Synchronizacja wyłączona celowo (jak w sync-kompresja-most.spec.mjs): bez automatycznych pobrań integracji,
      // bez gniazda i bez okna nowego urządzenia; test woła VildaSync wprost.
      window.localStorage.setItem('vilda-sync-enabled-v1', 'false');
      if (f !== null) window.localStorage.setItem('vilda-sync-paged-v1', f);
    } catch (_) { /* brak storage — pomiń */ }
  }, flaga);
}

function atrapaSerwera() {
  const srv = { zadania: [] };
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-expose-headers': 'ETag, Retry-After',
  };
  const zaslepki = (od, doSeq) => Array.from({ length: Math.max(0, doSeq - od + 1) }, (_, i) => ({ seq: od + i, gap: true }));
  srv.obsluz = async (route) => {
    const req = route.request();
    const metoda = req.method();
    if (metoda === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    const sciezka = u.pathname.replace(/^\/v1\/slots\/[^/]+\/?/, 'slot/');
    srv.zadania.push({ metoda, sciezka, zapytanie: u.search, autoryzacja: req.headers().authorization ? 'Bearer' : 'brak' });
    const json = (status, cialo) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(cialo) });
    if (u.pathname === '/v1/health') return json(200, { status: 'ok', version: '0.37.0', api: 37, sqlite: true, features: ['changes-paged', 'aad'], ts: 1 });
    if (sciezka === 'slot/status') return json(200, { etag: 'E1', size: 2048 });
    // Blob bez zmian względem urządzenia (If-None-Match z ETagiem chmury): 304, nic do scalenia.
    if (sciezka === 'slot/blob' && metoda === 'GET') return route.fulfill({ status: 304, headers: { ...cors, etag: '"E1"' } });
    if (sciezka === 'slot/changes') {
      const since = Number(u.searchParams.get('since')) || 0;
      if (!u.searchParams.has('limit')) {
        // legacy (bez limit=): prefiks do 200 wierszy, headSeq rzeczywisty
        return json(200, { deltas: zaslepki(since + 1, Math.min(HEAD, since + 200)), headSeq: HEAD });
      }
      const limit = Number(u.searchParams.get('limit'));
      const wiersze = zaslepki(since + 1, Math.min(HEAD, since + limit));
      const ostatni = wiersze.length ? wiersze.at(-1).seq : since;
      return json(200, {
        deltas: wiersze, count: wiersze.length, headSeq: HEAD, nextSince: ostatni, truncated: ostatni < HEAD,
        snapshotSeq: 0, oldestSeq: 1, requiresBase: false, cursorAhead: false, blobSeq: 0, format: 'sql', checkpoint: null,
      });
    }
    return json(404, { error: { code: 'not_found' } });
  };
  return srv;
}

async function pobierzZKursorem1(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => Boolean(window.VildaSync && window.VildaSync.getDrainStatus));
  return page.evaluate(async () => {
    // Sejf z jedną fikcyjną kartą: pusty sejf przy tym samym ETagu oznacza dla vilda_sync.js nowe urządzenie (pełne
    // pobranie od kursora 0).
    await window.VildaVault.savePatient({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
    }, { dedup: false });
    const { slotId } = await window.VildaVault.getSyncMaterial();
    // Urządzenie, które już synchronizowało ten slot: stan zarejestrowany z ETagiem chmury i kursor 1.
    window.localStorage.setItem(`vilda-sync-state-v1:${slotId}`, JSON.stringify({ registered: true, localEtag: 'E1', lastSyncAt: null }));
    window.localStorage.setItem(`vilda-sync-cursor-v1:${slotId}`, '1');
    window.sessionStorage.setItem('vilda-sync-pulled-v1', '1');
    const w = await window.VildaSync.syncPull({ czekajNaDrenaz: true });
    return {
      akcja: w.action, drain: w.drain, kursor: window.VildaSync.getChangesCursor(slotId),
      status: window.VildaSync.getDrainStatus(slotId),
      stronami: typeof window.VildaSync.isPagedActive === 'function' ? window.VildaSync.isPagedActive() : 'brak-api',
    };
  });
}

test('E2-PR1b: bez klucza vilda-sync-paged-v1 — GET /v1/health bez tokenu, dwie strony /changes w jednym pobraniu, kursor 251', async ({ page, context }) => {
  test.setTimeout(120_000);
  const srv = atrapaSerwera();
  await context.route(`${WORKER}/**`, srv.obsluz);
  await context.routeWebSocket(/vilda-sync\.maciej-4b9\.workers\.dev/, (ws) => { ws.close(); });
  await przygotuj(page, null);
  const w = await pobierzZKursorem1(page);
  expect(w.akcja).toBe('up-to-date');
  const drenaz = srv.zadania.filter((z) => z.sciezka === 'slot/changes' || z.sciezka === '/v1/health')
    .map((z) => `${z.sciezka}${z.zapytanie} ${z.autoryzacja}`);
  expect(drenaz).toEqual([
    '/v1/health brak',
    'slot/changes?since=1&limit=200 Bearer',
    'slot/changes?since=201&limit=200 Bearer',
  ]);
  expect(w.kursor).toBe(HEAD);
  expect(w.drain).toMatchObject({ tryb: 'strony', stop: 'head', od: 1, do: HEAD, stron: 2, wierszy: 250, zaslepki: 250, headSeq: HEAD });
  expect(w.status).toMatchObject({ tryb: 'strony', stop: 'head', trwa: false });
  expect(w.stronami, 'isPagedActive po health z changes-paged').toBe(true);
});

test("E2-PR1b: vilda-sync-paged-v1 = '0' — jedno żądanie legacy bez limit= i bez health, jak przed E2-PR1", async ({ page, context }) => {
  test.setTimeout(120_000);
  const srv = atrapaSerwera();
  await context.route(`${WORKER}/**`, srv.obsluz);
  await context.routeWebSocket(/vilda-sync\.maciej-4b9\.workers\.dev/, (ws) => { ws.close(); });
  await przygotuj(page, '0');
  const w = await pobierzZKursorem1(page);
  expect(w.akcja).toBe('up-to-date');
  await expect.poll(() => srv.zadania.filter((z) => z.sciezka === 'slot/changes').length).toBe(1);
  await page.waitForTimeout(500); // drenaż legacy jest w tle: bez drugiego żądania
  const drenaz = srv.zadania.filter((z) => z.sciezka === 'slot/changes' || z.sciezka === '/v1/health')
    .map((z) => `${z.sciezka}${z.zapytanie} ${z.autoryzacja}`);
  expect(drenaz).toEqual(['slot/changes?since=1 Bearer']);
  expect(w.drain, 'legacy: bez wyniku drenażu stronami').toBeNull();
  expect(w.status).toBeNull();
  expect([false, 'brak-api']).toContain(w.stronami);
  await expect.poll(() => page.evaluate(async () => {
    const { slotId } = await window.VildaVault.getSyncMaterial();
    return window.VildaSync.getChangesCursor(slotId);
  }), 'legacy: jedna strona (do 200 wierszy) na pobranie').toBe(201);
});
