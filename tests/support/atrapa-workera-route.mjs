// E2-PR4b (P-SYNC-ZDARZENIA) — adapter route Playwright atrapy workera (tests/support/atrapa-workera-sync.mjs) dla
// testów e2e. Każde żądanie strony do adresu serwera synchronizacji, także preflight OPTIONS, idzie przez rdzeń obsluz()
// atrapy, a odpowiedź wraca przez route.fulfill z pełnym zestawem nagłówków atrapy. CORS liczy atrapa jak worker: origin
// strony e2e (http://127.0.0.1:<port>) musi być na liście dodatkowych originów atrapy (opcja originy, jak
// ALLOWED_ORIGIN_PROD jako lista), inaczej przeglądarka odrzuci odpowiedź tak samo jak przy prawdziwym workerze.
// Usterka sieci albo zgubienia odpowiedzi (atrapa rzuca) → route.abort('failed'), jak zerwane połączenie. Gniazdo na
// żywo jest zamykane od razu (WebSocket poza modelem atrapy). Dane wyłącznie FIKCYJNE.
export const ADRES_WORKERA = 'https://vilda-sync.maciej-4b9.workers.dev';

/**
 * @param {import('@playwright/test').BrowserContext | import('@playwright/test').Page} kontekst
 * @param {ReturnType<typeof import('./atrapa-workera-sync.mjs').utworzAtrapeWorkera>} atrapa
 * @param {{ adres?: string, urzadzenie?: string }} [opcje]
 */
export async function podlaczAtrapeDoKontekstu(kontekst, atrapa, { adres = ADRES_WORKERA, urzadzenie = 'strona' } = {}) {
  const host = new URL(adres).host;
  await kontekst.route(`${adres}/**`, async (route) => {
    const r = route.request();
    let odp;
    try {
      const cialo = r.postDataBuffer();
      odp = await atrapa.obsluz({
        url: r.url(), metoda: r.method(), naglowki: await r.allHeaders(),
        cialo: cialo ? new Uint8Array(cialo) : null, urzadzenie, transport: 'route',
      });
    } catch (_) {
      await route.abort('failed').catch(() => {});
      return;
    }
    if (!odp || !odp.status) {
      await route.abort('failed').catch(() => {});
      return;
    }
    const body = odp.cialo == null ? '' : typeof odp.cialo === 'string' ? odp.cialo : Buffer.from(odp.cialo);
    await route.fulfill({ status: odp.status, headers: odp.naglowki, body }).catch(() => {});
  });
  await kontekst.routeWebSocket(new RegExp(host.replace(/\./g, '\\.')), (ws) => { ws.close(); });
}
