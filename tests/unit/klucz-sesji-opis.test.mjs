import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KLUCZ-SESJI-OPIS (polecenie właściciela 2026-10-19, przegląd ścieżki zakładania konta, punkt 4).
//
// Polityka prywatności mówiła w akapicie o trybie chmurowym, że klucz szyfrowania „nigdy nie jest zapisywany na
// urządzeniu” i „istnieje wyłącznie w pamięci podczas odblokowanej sesji”, a opis „Pozostań zalogowany” w
// Ustawieniach — że „zamknięcie przeglądarki i tak Cię wyloguje, a klucz nigdy nie jest zapisywany na dysku”.
// Sejf trzyma jednak klucz sesji w sessionStorage (vilda-vault-session-v2), żeby przejście na inną stronę i F5
// nie wymagały hasła, a przeglądarka przywracająca karty po ponownym uruchomieniu odtwarza go razem z kartą
// (sprawdzone w Chromium z --restore-last-session: sesja wraca bez hasła w limicie bezczynności).
//
// Ten plik pilnuje, żeby teksty mówiły to, co robi kod: gdzie leży klucz, kiedy znika i jakie są limity.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tekst = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8').replace(/\s+/g, ' ');

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    klucze: () => Object.keys(m),
  };
}

function urzadzenie() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  win.VildaVault.setStorageAdapter(win.VildaVault.createInMemoryAdapter());
  return win;
}

describe('P-KLUCZ-SESJI-OPIS: klucz sesji w kodzie', () => {
  it('klucz sesji leży tylko w sessionStorage, wygasa po czasie bezczynności i znika przy wylogowaniu', async () => {
    const win = urzadzenie();
    const sejf = win.VildaVault;
    expect(sejf.DEFAULT_IDLE_LOCK_MS, 'domyślna blokada: 20 minut').toBe(20 * 60 * 1000);
    expect(sejf.CLOUD_ONLY_IDLE_LOCK_MS, 'tryb chmurowy: 10 minut').toBe(10 * 60 * 1000);

    const teraz = Date.now();
    await sejf.createUser('Haslo-Testowe-123', { iterations: 1, label: 'Fikcyjna Lekarka' });
    const sesja = JSON.parse(win.sessionStorage.getItem('vilda-vault-session-v2'));
    expect(typeof sesja.keyB64, 'klucz sesji w sessionStorage').toBe('string');
    expect(Date.parse(sesja.expiresAtISO) - teraz).toBeGreaterThan(19 * 60 * 1000);
    expect(Date.parse(sesja.expiresAtISO) - teraz).toBeLessThanOrEqual(21 * 60 * 1000);
    for (const k of win.localStorage.klucze()) {
      expect(win.localStorage.getItem(k), `localStorage[${k}] bez klucza`).not.toContain(sesja.keyB64);
    }

    sejf.lock('manual');
    expect(win.sessionStorage.getItem('vilda-vault-session-v2'), 'wylogowanie usuwa klucz sesji').toBeNull();
  });

  it('„zaufane urządzenie” i najdłuższy wybór trybu chmurowego to 7 dni', () => {
    const auth = fs.readFileSync(path.join(korzen, 'vilda_auth_ui.js'), 'utf8');
    expect(auth).toMatch(/Ti=7\*24\*60\*60\*1e3/);
    expect(auth).toMatch(/TRUSTED_DEVICE_IDLE_MS:Ti/);
    expect(auth).toMatch(/Si=\[[^\]]*,7\*24\*60\*60\*1e3\]/); // ostatni element CLOUD_ONLY_IDLE_CHOICES_MS
  });
});

describe('P-KLUCZ-SESJI-OPIS: teksty dla użytkownika', () => {
  const polityka = tekst('polityka-prywatnosci.html');
  const ustawienia = tekst('ustawienia.html');

  it('bez obietnic, których kod nie spełnia', () => {
    for (const [plik, t] of [['polityka-prywatnosci.html', polityka], ['ustawienia.html', ustawienia]]) {
      expect(t, plik).not.toContain('nigdy nie jest zapisywany na urządzeniu');
      expect(t, plik).not.toContain('istnieje wyłącznie w pamięci');
      expect(t, plik).not.toContain('nigdy nie jest zapisywany na dysku');
      expect(t, plik).not.toContain('Zamknięcie przeglądarki i tak Cię wyloguje');
    }
  });

  it('polityka: klucz sesji w sessionStorage, przywracanie kart i limity jak w kodzie', () => {
    expect(polityka).toContain('nie jest zapisywany w trwałej pamięci urządzenia');
    expect(polityka).toContain('(sessionStorage, zob. tabela wyżej)');
    expect(polityka).toContain('Przeglądarka, która przywraca karty');
    expect(polityka).toContain('domyślnie 20 minut, w trybie chmurowym 10 minut; najwyżej 7 dni');
  });

  it('Ustawienia: „Pozostań zalogowany” uprzedza o przywracaniu kart przez 7 dni', () => {
    expect(ustawienia).toContain('Klucz sesji przechowujemy tylko w pamięci karty przeglądarki');
    expect(ustawienia).toContain('może jednak przywrócić sesję razem z kartą, bez hasła — do 7 dni od ostatniej aktywności');
  });
});
