import { expect, test } from '@playwright/test';

// P-SYNC-MOST (decyzja właściciela 2026-10-07) — gzip przed szyfrowaniem pełnej wysyłki i czytelnik gzip,
// na prawdziwej przeglądarce: prawdziwy sejf, prawdziwe vilda_sync.js, natywne CompressionStream /
// DecompressionStream / Response; serwer synchronizacji to atrapa (route), bo w repozytorium go nie ma.
//
// W chmurze leży blob skompresowany gzipem (tak jak wyśle go nowy klient) z pacjentką z innego urządzenia.
// Karta nie ma stanu slotu, więc wysyłka idzie gałęzią 409: najpierw pobiera i scala blob (czytelnik gzip),
// potem wysyła scalony stan (zapis gzip — próg obniżony do 0 B na potrzeby testu, w produkcji 4 MiB).
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SyncMost!26aa';
const WORKER = 'https://vilda-sync.maciej-4b9.workers.dev';

async function regulamin(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function gotowa(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaSync));
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
}

function atrapaSerwera() {
  const srv = { blob: null, etag: 'E1', licznik: 1, puty: [] };
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-expose-headers': 'ETag',
  };
  srv.obsluz = async (route) => {
    const req = route.request();
    const metoda = req.method();
    if (metoda === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const sciezka = new URL(req.url()).pathname.replace(/^\/v1\/slots\/[^/]+\/?/, '');
    const nagl = req.headers();
    const json = (status, cialo) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(cialo) });
    if (sciezka === 'register') return json(409, {});
    if (sciezka === 'status') return json(200, { etag: srv.etag, size: srv.blob ? srv.blob.length : 0 });
    if (sciezka === 'blob' && metoda === 'GET') {
      if (nagl['if-none-match'] === `"${srv.etag}"`) return route.fulfill({ status: 304, headers: cors });
      return route.fulfill({ status: 200, headers: { ...cors, etag: `"${srv.etag}"`, 'content-type': 'application/octet-stream' }, body: srv.blob });
    }
    if (sciezka === 'blob' && metoda === 'PUT') {
      const im = nagl['if-match'] || null;
      if (im && im !== `"${srv.etag}"`) return json(412, {});
      srv.blob = req.postDataBuffer();
      srv.licznik += 1; srv.etag = `E${srv.licznik}`;
      srv.puty.push({ ifMatch: im, bajty: srv.blob.length });
      return json(200, { etag: srv.etag });
    }
    if (sciezka.startsWith('changes')) return json(200, { deltas: [], headSeq: 0 });
    if (sciezka === 'deltas') return json(200, { deltas: [] });
    return json(200, {});
  };
  return srv;
}

test('P-SYNC-MOST — czytelnik i zapis gzip na prawdziwym sejfie: blob skompresowany scalony, wysyłka skompresowana', async ({ page, context }) => {
  test.setTimeout(150_000);
  const srv = atrapaSerwera();
  await context.route(`${WORKER}/**`, srv.obsluz);

  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);

  const patientId = await page.evaluate(async () => {
    const rekord = {
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
      advanced: { data: { measurements: [{ uid: 'm-60', ageMonths: 60, ageYears: 5, height: 120, weight: 22 }] } },
    };
    return (await window.VildaVault.savePatient(rekord, { dedup: false })).patientId;
  });

  // Blob „w chmurze”: stan konta + pacjentka z innego urządzenia, gzip, potem AES-GCM kluczem synchronizacji.
  srv.blob = Buffer.from(await page.evaluate(async (id) => {
    const V = window.VildaVault;
    const p = await V.exportSyncPayload();
    const inna = JSON.parse(JSON.stringify(p.patients.find((x) => x.patientId === id)));
    inna.patientId = 'e2e-most-pacjentka-z-innego-urzadzenia';
    inna.header = Object.assign({}, inna.header, { name: 'Testowa Ewa', firstName: 'Ewa' });
    inna.snapshots.forEach((s, i) => { s.snapshotId = `e2e-most-inne-urzadzenie-${i}`; });
    p.patients.push(inna);
    const jawne = new TextEncoder().encode(JSON.stringify(p));
    const gz = new Uint8Array(await new Response(new Blob([jawne]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const { syncEncKey } = await V.getSyncMaterial();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, syncEncKey, gz));
    return Array.from(iv).concat(Array.from(ct));
  }, patientId));

  const wynik = await page.evaluate(async () => {
    window.VILDA_SYNC_GZIP_MIN_BYTES = 0; // test: kompresja także dla małego sejfu
    await window.VildaSync.clearSyncState();
    window.sessionStorage.setItem('vilda-sync-pulled-v1', '1');
    try { return { wynik: await window.VildaSync.syncPush() }; } catch (e) { return { code: e.code, message: e.message }; }
  });
  expect(wynik.code, wynik.message).toBeUndefined();
  expect(wynik.wynik.action).toBe('uploaded');
  expect(wynik.wynik.bytes, 'rozmiar wysłanego bloba w wyniku').toBe(srv.puty[0].bajty);

  expect(await page.evaluate(async () => (await window.VildaVault.listPatients()).map((p) => p.patientId).sort()),
    'pacjentka z bloba gzip scalona lokalnie').toEqual([patientId, 'e2e-most-pacjentka-z-innego-urzadzenia'].sort());

  expect(srv.puty).toHaveLength(1);
  expect(srv.puty[0].ifMatch, 'PUT z ETagiem scalonej treści').toBe('"E1"');
  const wChmurze = await page.evaluate(async (b) => {
    const { syncEncKey } = await window.VildaVault.getSyncMaterial();
    const a = new Uint8Array(b);
    const jawne = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, syncEncKey, a.slice(12)));
    const magic = [jawne[0], jawne[1]];
    const json = await new Response(new Blob([jawne]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return { magic, pacjenci: JSON.parse(json).patients.map((x) => x.patientId).sort() };
  }, Array.from(srv.blob));
  expect(wChmurze.magic, 'wysłany blob to gzip pod szyfrowaniem').toEqual([0x1f, 0x8b]);
  expect(wChmurze.pacjenci).toEqual([patientId, 'e2e-most-pacjentka-z-innego-urzadzenia'].sort());
});
