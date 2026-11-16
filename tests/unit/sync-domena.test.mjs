// P-SYNC-DOMENA — adres serwera synchronizacji pod własną domeną (https://sync.vildasync.com), ten sam Worker co
// https://vilda-sync.maciej-4b9.workers.dev. Prawdziwe pliki produkcyjne; bez sieci.
//   D1 vilda_init.js ustawia window.VILDA_SYNC_WORKER_URL, gdy brak wartości; wartość ustawiona wcześniej (testy) zostaje.
//   D2 prawdziwe moduły V1 po vilda_init.js składają adresy z nowym hostem: vilda_realtime.js (wss) i
//      inline_subskrypcja_00.js czyta ustawienie zamiast stałej.
//   D3 każda strona, która ładuje vilda_sync.js, vilda_realtime.js albo vilda_vault.js, ładuje wcześniej vilda_init.js,
//      a jej CSP connect-src ma nowy host (https i wss) obok starego (starsze wersje i cache PWA).
//   D4 chroniona domena V2 (vilda_patient_identity_transport.js) zostaje przy starym, związanym adresie.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const NOWY = 'https://sync.vildasync.com';
const STARY = 'https://vilda-sync.maciej-4b9.workers.dev';

describe('P-SYNC-DOMENA', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('D1 vilda_init.js ustawia domyślny adres i nie nadpisuje wcześniejszego', () => {
    const w = {};
    loadBrowserScript('vilda_init.js', w);
    expect(w.VILDA_SYNC_WORKER_URL).toBe(NOWY);
    const t = { VILDA_SYNC_WORKER_URL: 'https://atrapa.invalid' };
    loadBrowserScript('vilda_init.js', t);
    expect(t.VILDA_SYNC_WORKER_URL).toBe('https://atrapa.invalid');
  });

  it('D2 połączenie na żywo po vilda_init.js idzie na nowy host', async () => {
    const gniazda = [];
    const w = {
      setTimeout, clearTimeout, setInterval, clearInterval, navigator: { onLine: true }, addEventListener: () => {},
      WebSocket: class { constructor(url) { this.url = url; this.readyState = 0; gniazda.push(this); } send() {} close() {} },
      VildaVault: { isUnlocked: () => true, isCloudOnlyMode: () => false, isEphemeralMode: () => false,
        getSyncMaterial: async () => ({ slotId: 'f'.repeat(64), authToken: 'FIKCYJNY-TOKEN' }), onUnlock: () => {}, onLock: () => {} },
      VildaSyncIntegration: { isSyncEnabled: () => true, pullNow: () => {} },
    };
    w.self = w; w.top = w;
    loadBrowserScript('vilda_init.js', w);
    loadBrowserScript('vilda_realtime.js', w);
    await vi.advanceTimersByTimeAsync(2000);
    expect(gniazda[0].url).toBe(`wss://sync.vildasync.com/v1/slots/${'f'.repeat(64)}/socket`);

    const sub = czytaj('inline_subskrypcja_00.js');
    expect(sub).toContain('var b=String(window.VILDA_SYNC_WORKER_URL||');
    expect(sub).not.toMatch(/var b="https:\/\/vilda-sync/);
  });

  it('D3 strony z synchronizacją: vilda_init.js przed modułami i oba hosty w CSP', () => {
    const strony = fs.readdirSync(KORZEN).filter((f) => f.endsWith('.html'));
    const zSync = strony.filter((f) => /src="(vilda_sync|vilda_realtime|vilda_vault)\.js/.test(czytaj(f)));
    expect(zSync.length).toBeGreaterThanOrEqual(8);
    for (const f of zSync) {
      const html = czytaj(f);
      const init = html.search(/src="vilda_init\.js/);
      expect(init, f).toBeGreaterThan(-1);
      for (const m of ['vilda_sync', 'vilda_realtime', 'vilda_vault']) {
        const i = html.search(new RegExp(`src="${m}\\.js`));
        if (i > -1) expect(init, `${f}: vilda_init.js przed ${m}.js`).toBeLessThan(i);
      }
      const csp = (html.match(/connect-src([^;]*);/) || [])[1] || '';
      for (const h of [NOWY, 'wss://sync.vildasync.com', STARY, 'wss://vilda-sync.maciej-4b9.workers.dev']) {
        expect(csp, `${f}: ${h}`).toContain(h);
      }
    }
  });

  it('D4 chroniona domena V2 zostaje przy związanym adresie', () => {
    expect(czytaj('vilda_patient_identity_transport.js')).toContain(`const ORIGIN = '${STARY}';`);
    expect(czytaj('vilda_vault.js')).toContain(`var PatientWorkspaceServiceOrigin = '${STARY}';`);
  });
});
