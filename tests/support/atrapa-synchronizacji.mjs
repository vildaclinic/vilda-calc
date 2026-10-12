// Atrapa serwera synchronizacji dla testów e2e okna „Pobierz dane z serwera” (P-NOWE-URZADZENIE).
//
// Serwera nie ma w repozytorium. Trasy HTTP przechwytuje Playwright, WebSocket (vilda_realtime.js łączy się,
// gdy synchronizacja jest włączona) jest zamykany — żaden test nie dotyka produkcyjnego workera. Slot, ETag
// i daty są fikcyjne; ciało PUT/POST nie jest czytane.

export const ADRES_SERWERA = 'https://vilda-sync.maciej-4b9.workers.dev';
export const DATA_W_CHMURZE = '2026-10-11T08:00:00.000Z';

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ slotNaSerwerze?: boolean, wstrzymajBlob?: () => Promise<void>, wstrzymajStatus?: () => Promise<void> }} [opcje]
 * @returns {Promise<string[]>} lista obsłużonych żądań „METODA /ścieżka” (slot zastąpiony <slot>)
 */
export async function atrapaSynchronizacji(context, opcje = {}) {
  const slotNaSerwerze = opcje.slotNaSerwerze !== false;
  const zadania = [];
  await context.route(`${ADRES_SERWERA}/**`, async (route) => {
    const zadanie = route.request();
    const sciezka = new URL(zadanie.url()).pathname.replace(/slots\/[^/]+/, 'slots/<slot>');
    const metoda = zadanie.method();
    zadania.push(`${metoda} ${sciezka}`);
    const json = (status, cialo) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cialo) }).catch(() => {});
    if (sciezka.endsWith('/status')) {
      if (typeof opcje.wstrzymajStatus === 'function') await opcje.wstrzymajStatus();
      return slotNaSerwerze ? json(200, { etag: 'E1', size: 2048, lastModified: DATA_W_CHMURZE }) : json(404, {});
    }
    if (sciezka.endsWith('/entitlement')) return json(200, { plan: 'free' });
    if (sciezka.endsWith('/blob') && metoda === 'GET') {
      if (typeof opcje.wstrzymajBlob === 'function') await opcje.wstrzymajBlob();
      return json(404, {});
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
