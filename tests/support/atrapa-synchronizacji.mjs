// Atrapa serwera synchronizacji dla testów e2e okna „Pobierz dane z serwera” i pierwszego pobrania
// (P-NOWE-URZADZENIE, etapy 1 i 2).
//
// Serwera nie ma w repozytorium. Trasy HTTP przechwytuje Playwright, WebSocket (vilda_realtime.js łączy się,
// gdy synchronizacja jest włączona) jest zamykany — żaden test nie dotyka produkcyjnego workera. Slot, ETag
// i daty są fikcyjne; ciało PUT/POST nie jest czytane.
//
// Opcje są czytane przy każdym żądaniu, więc test może je zmieniać w trakcie (np. najpierw błąd bloba, potem
// prawdziwy blob).

export const ADRES_SERWERA = 'https://vilda-sync.maciej-4b9.workers.dev';
export const DATA_W_CHMURZE = '2026-10-11T08:00:00.000Z';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'ETag',
};

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{
 *   slotNaSerwerze?: boolean,
 *   blob?: Buffer | null,
 *   statusBloba?: number | null,
 *   wstrzymajBlob?: () => Promise<void>,
 *   wstrzymajStatus?: () => Promise<void>,
 * }} [opcje] blob — zaszyfrowane dane konta (GET /blob 200); bez niego 404 („no-remote-blob”);
 *   statusBloba — wymuszony kod odpowiedzi GET /blob (np. 503), ma pierwszeństwo przed blobem.
 * @returns {Promise<string[]>} lista obsłużonych żądań „METODA /ścieżka” (slot zastąpiony <slot>)
 */
export async function atrapaSynchronizacji(context, opcje = {}) {
  const zadania = [];
  await context.route(`${ADRES_SERWERA}/**`, async (route) => {
    const zadanie = route.request();
    const metoda = zadanie.method();
    if (metoda === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS }).catch(() => {});
    const sciezka = new URL(zadanie.url()).pathname.replace(/slots\/[^/]+/, 'slots/<slot>');
    zadania.push(`${metoda} ${sciezka}`);
    const json = (status, cialo) => route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(cialo),
    }).catch(() => {});
    const blob = opcje.blob || null;
    if (sciezka.endsWith('/status')) {
      if (typeof opcje.wstrzymajStatus === 'function') await opcje.wstrzymajStatus();
      return opcje.slotNaSerwerze !== false
        ? json(200, { etag: 'E1', size: blob ? blob.length : 2048, lastModified: DATA_W_CHMURZE })
        : json(404, {});
    }
    if (sciezka.endsWith('/entitlement')) return json(200, { plan: 'free' });
    if (sciezka.endsWith('/blob') && metoda === 'GET') {
      if (typeof opcje.wstrzymajBlob === 'function') await opcje.wstrzymajBlob();
      if (typeof opcje.statusBloba === 'number') return json(opcje.statusBloba, {});
      if (!blob) return json(404, {});
      return route.fulfill({
        status: 200,
        headers: { ...CORS, etag: '"E1"', 'content-type': 'application/octet-stream' },
        body: blob,
      }).catch(() => {});
    }
    if (sciezka.endsWith('/blob') && metoda === 'PUT') return json(200, { etag: 'E2' });
    if (sciezka.endsWith('/register') && metoda === 'POST') return json(409, {});
    if (sciezka.endsWith('/delta')) return json(204, {});
    if (/\/changes$/.test(sciezka)) return json(200, { deltas: [], headSeq: 0 });
    return json(404, {});
  });
  await context.routeWebSocket(/vilda-sync\.maciej-4b9\.workers\.dev/, (ws) => { ws.close(); });
  return zadania;
}

/**
 * Baner zgody na analitykę (pierwsza wizyta, dół ekranu, z-index nad przypomnieniem po „Pobierz później”, pod
 * oknem pobierania) — odrzucenie, jeśli jest widoczny (wzór: chip-kopia-zapasowa.spec.mjs).
 */
export async function odrzucZgodeAnalityki(page) {
  const przycisk = page.locator('#consent-decline');
  if (await przycisk.isVisible()) await przycisk.click();
}

/** Akceptacja regulaminu przed startem strony — bez niej ekran zgody zasłania aplikację. */
export async function zaakceptujRegulamin(context) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
}

/**
 * Fikcyjne konto lokalne, potem przeładowanie: sesja sejfu wraca sama (tryRestoreSession), a ekran logowania jest
 * zdjęty — jak po zalogowaniu kodem QR na „Komputerze prywatnym” (nowe konto lokalne, sejf pusty, w chmurze dane).
 * Wzór: blokada-usuwania.spec.mjs (createUser odblokowuje sejf; przeładowanie odtwarza sesję).
 */
export async function zalozKontoIZaloguj(page) {
  const userId = await zalozKonto(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await czekajNaOdtworzenieSesji(page);
  return userId;
}

/** Samo założenie fikcyjnego konta: createUser odblokowuje sejf w bieżącym dokumencie (start synchronizacji rusza). */
export async function zalozKonto(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaSyncIntegration && window.VildaNoweUrzadzenie));
  return page.evaluate(async () => {
    const konto = await window.VildaVault.createUser('Haslo-Testowe-123', { iterations: 1, label: 'Fikcyjna Lekarka' });
    return konto.userId;
  });
}

/** Po przeładowaniu: sesja sejfu wraca sama — czekamy na odblokowanie i zdjęcie ekranu logowania. */
export async function czekajNaOdtworzenieSesji(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaVault.isUnlocked && window.VildaVault.isUnlocked()), null, { timeout: 20_000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'), null, { timeout: 20_000 });
}

/**
 * Zaszyfrowany blob „z chmury” dla konta zalogowanego w `page`: `pacjenci` fikcyjnych pacjentów i `notatki`
 * fikcyjnych notatek, w formacie pełnej wysyłki (IV(12) || AES-GCM kluczem synchronizacji, bez gzip — czytelnik
 * rozpoznaje oba). Jeden pacjent i notatki powstają też lokalnie, bo eksport sejfu jest wzorem ładunku
 * (wzór: sync-kompresja-most.spec.mjs). Zwraca bajty bloba.
 */
export async function zaszyfrowanyBlob(page, { pacjenci = 3, notatki = 2 } = {}) {
  const bajty = await page.evaluate(async ({ pacjenci: ileP, notatki: ileN }) => {
    const V = window.VildaVault;
    const wzor = await V.savePatient({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
      advanced: { data: { measurements: [{ uid: 'm-60', ageMonths: 60, ageYears: 5, height: 120, weight: 22 }] } },
    }, { dedup: false });
    for (let i = 0; i < ileN; i += 1) await V.saveNote({ title: `Fikcyjna notatka ${i + 1}`, category: 'badanie', body: 'treść testowa' });
    const ladunek = await V.exportSyncPayload();
    const zrodlo = ladunek.patients.find((p) => p.patientId === wzor.patientId);
    for (let i = 2; i <= ileP; i += 1) {
      const kopia = JSON.parse(JSON.stringify(zrodlo));
      kopia.patientId = `e2e-nowe-urzadzenie-pacjent-${i}`;
      kopia.header = Object.assign({}, kopia.header, { name: `Testowy Pacjent ${i}`, firstName: `Pacjent${i}` });
      kopia.snapshots.forEach((s, j) => { s.snapshotId = `e2e-nowe-urzadzenie-${i}-${j}`; });
      ladunek.patients.push(kopia);
    }
    const jawne = new TextEncoder().encode(JSON.stringify(ladunek));
    const { syncEncKey } = await V.getSyncMaterial();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const szyfr = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, syncEncKey, jawne));
    return Array.from(iv).concat(Array.from(szyfr));
  }, { pacjenci, notatki });
  return Buffer.from(bajty);
}
