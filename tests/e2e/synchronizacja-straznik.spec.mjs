import { expect, test } from '@playwright/test';

// P-SYNC-STRAZNIK (decyzja właściciela 2026-10-05) — wysyłka nie nadpisuje chmury bez scalenia, na prawdziwej
// przeglądarce: prawdziwy sejf, prawdziwe Web Locks w dwóch kartach, prawdziwe vilda_sync.js; serwer
// synchronizacji to atrapa (route), bo w repozytorium go nie ma.
//
// Karta A zapisuje pacjenta i sejf pyta „Ktoś inny zmienił ten rekord”; lekarz jeszcze nie odpowiedział, więc
// zapis A trzyma blokadę pacjenta. Karta B nie ma stanu synchronizacji (jak po „Zresetuj stan synchronizacji”),
// a w chmurze jest blob z dodatkowym pacjentem z innego urządzenia. Wysyłka z B trafia w gałąź 409 (slot istnieje):
//   - przed zmianą scalenie szło w catch{}, a PUT z ETagiem z /status nadpisywał chmurę — pacjent z innego
//     urządzenia znikał z chmury;
//   - teraz wysyłka najpierw pobiera i scala; scalenie czeka na blokadę, kończy się MERGE_BUSY i wysyłka się
//     przerywa bez PUT. Po odpowiedzi w A ta sama wysyłka scala i wysyła — pacjent z innego urządzenia zostaje.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SyncStraznik!26aa';
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
  await page.waitForFunction(() => typeof window.VildaVault.setSaveConflictResolver === 'function'
    && Boolean(window.VildaSync));
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
}

async function pierwszaKarta(page) {
  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  const { userId } = await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  return userId;
}

async function kolejnaKarta(context, userId) {
  const page = await context.newPage();
  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (a) => window.VildaVault.unlockUser(a.userId, a.pw), { userId, pw: HASLO });
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  return page;
}

/* Atrapa serwera synchronizacji: slot istnieje (rejestracja → 409), blob z ETagiem, If-Match/If-None-Match. */
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
      srv.puty.push({ ifMatch: im });
      return json(200, { etag: srv.etag });
    }
    if (sciezka.startsWith('changes')) return json(200, { deltas: [], headSeq: 0 });
    if (sciezka === 'deltas') return json(200, { deltas: [] });
    return json(200, {});
  };
  return srv;
}

const nowaKarta = (page) => page.evaluate(async () => {
  const V = window.VildaVault;
  const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
  const rekord = (wieki) => ({
    name: 'Testowy Jan',
    user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
    advanced: { data: { measurements: wieki.map(pomiar) } },
  });
  const a = await V.savePatient(rekord([60, 66]), { dedup: false });
  await new Promise((r) => { setTimeout(r, 5); });
  await V.savePatient(rekord([60, 66, 80]), { patientId: a.patientId, dedup: false });
  return a.patientId;
});

async function zapisACzekaNaPytanie(page, patientId) {
  await page.evaluate((id) => {
    const V = window.VildaVault;
    const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
    const rekord = (wieki) => ({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
      advanced: { data: { measurements: wieki.map(pomiar) } },
    });
    window.__odpowiedz = null;
    V.setSaveConflictResolver(() => new Promise((r) => { window.__odpowiedz = r; }));
    window.__zapisA = V.savePatient(rekord([60, 66, 74]), { patientId: id, dedup: false, baselinePayload: rekord([60, 66]) });
  }, patientId);
  await page.waitForFunction(() => typeof window.__odpowiedz === 'function');
}

/* Karta B: blob „w chmurze” = stan konta + pacjentka z innego urządzenia, zaszyfrowany kluczem synchronizacji. */
const blobZInnegoUrzadzenia = (page, patientId) => page.evaluate(async (id) => {
  const V = window.VildaVault;
  const p = await V.exportSyncPayload();
  const wzor = p.patients.find((x) => x.patientId === id);
  const inna = JSON.parse(JSON.stringify(wzor));
  inna.patientId = 'e2e-pacjentka-z-innego-urzadzenia';
  inna.header = Object.assign({}, inna.header, { name: 'Testowa Ewa', firstName: 'Ewa' });
  inna.snapshots.forEach((s, i) => { s.snapshotId = `e2e-inne-urzadzenie-${i}`; });
  p.patients.push(inna);
  const { syncEncKey } = await V.getSyncMaterial();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dane = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, syncEncKey, new TextEncoder().encode(JSON.stringify(p))));
  return Array.from(iv).concat(Array.from(dane));
}, patientId);

const pacjenciWChmurze = (page, bajty) => page.evaluate(async (b) => {
  const { syncEncKey } = await window.VildaVault.getSyncMaterial();
  const a = new Uint8Array(b);
  const jawne = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, syncEncKey, a.slice(12));
  return JSON.parse(new TextDecoder().decode(jawne)).patients.map((x) => x.patientId);
}, bajty);

test('P-SYNC-STRAZNIK — wysyłka bez stanu slotu nie nadpisuje chmury, gdy scalenie czeka na blokadę pacjenta', async ({ page, context }) => {
  test.setTimeout(150_000);
  const srv = atrapaSerwera();
  await context.route(`${WORKER}/**`, srv.obsluz);

  const userId = await pierwszaKarta(page);
  const b = await kolejnaKarta(context, userId);
  const patientId = await nowaKarta(page);
  srv.blob = Buffer.from(await blobZInnegoUrzadzenia(b, patientId));
  await zapisACzekaNaPytanie(page, patientId);

  // Jak po „Zresetuj stan synchronizacji” w karcie, która w tej sesji już pobierała.
  await b.evaluate(async () => {
    await window.VildaSync.clearSyncState();
    window.sessionStorage.setItem('vilda-sync-pulled-v1', '1');
  });

  const pierwsza = await b.evaluate(async () => {
    try { return { wynik: await window.VildaSync.syncPush() }; } catch (e) { return { code: e.code, message: e.message }; }
  });
  expect(pierwsza.code, 'wysyłka przerwana razem ze scaleniem').toBe('MERGE_BUSY');
  expect(srv.puty, 'chmura nienadpisana').toHaveLength(0);
  expect(await pacjenciWChmurze(b, Array.from(srv.blob)), 'pacjentka z innego urządzenia jest w chmurze')
    .toContain('e2e-pacjentka-z-innego-urzadzenia');

  await page.evaluate(async () => { window.__odpowiedz('scal'); await window.__zapisA; });

  const druga = await b.evaluate(async () => (await window.VildaSync.syncPush()).action);
  expect(druga).toBe('uploaded');
  expect(srv.puty).toHaveLength(1);
  expect(srv.puty[0].ifMatch, 'PUT z ETagiem scalonej treści').toBe('"E1"');
  const wChmurze = await pacjenciWChmurze(b, Array.from(srv.blob));
  expect(wChmurze, 'pacjentka z innego urządzenia przetrwała').toContain('e2e-pacjentka-z-innego-urzadzenia');
  expect(wChmurze, 'karta z tego konta też').toContain(patientId);
  expect(await b.evaluate(async () => (await window.VildaVault.listPatients()).length), 'scalona lokalnie').toBe(2);
});
