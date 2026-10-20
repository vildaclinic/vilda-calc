import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-JEDNORAZOWE-BEZ-PRZYWRACANIA (polecenie właściciela 2026-10-19): „Zaloguj jednorazowo” — „Po zakończeniu pracy
// nic nie zostanie”. Przeglądarka, która po ponownym uruchomieniu przywraca karty, odtwarzała sessionStorage, a z nim
// klucz sesji, kopię sejfu i stan formularzy (veph:*), więc sejf otwierał się bez hasła. Teraz sesja jednorazowa
// ma znacznik karty w sessionStorage i w window.name okna najwyższego poziomu; window.name nie wraca po restarcie
// (Chromium, --restore-last-session). Prawdziwy restart przeglądarki: tests/e2e/jednorazowe-bez-przywracania.spec.mjs.
//
// Tu: prawdziwy vilda_persistence_adapter.js na atrapie okna — decyzja przy ładowaniu strony i zapis znacznika.

const FLAGA = 'vilda-ephemeral-session-v1';
const ZNACZNIK = 'vilda-eph-tab-v1';
const ZYCIE = 'vilda-eph-alive-v1';

function magazyn(poczatek = {}) {
  const m = Object.assign(Object.create(null), poczatek);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    clear: () => { for (const k of Object.keys(m)) delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    klucze: () => Object.keys(m),
  };
}

/** Ładuje stronę: nowe okno z podanym sessionStorage i window.name, potem adapter persistence. */
function zaladujStrone({ sesja = {}, nazwa = '' } = {}) {
  const klasy = new Set();
  const sluchacze = {};
  const win = {
    name: nazwa,
    crypto: globalThis.crypto,
    localStorage: magazyn(), sessionStorage: magazyn(sesja),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    addEventListener: (typ, fn) => { (sluchacze[typ] ||= []).push(fn); }, removeEventListener() {},
    document: {
      documentElement: { classList: { add: (k) => klasy.add(k), remove: (k) => klasy.delete(k), contains: (k) => klasy.has(k) } },
      addEventListener() {}, removeEventListener() {},
    },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_persistence_adapter.js', win);
  return { win, klasy, wyslij: (typ) => (sluchacze[typ] || []).forEach((fn) => fn({})) };
}

/** Stan karty w trakcie sesji jednorazowej (fikcyjne treści). */
function sesjaJednorazowa({ znacznik = 'abc', zycieMsTemu = 1000 } = {}) {
  return {
    [FLAGA]: '1',
    [ZNACZNIK]: znacznik,
    [ZYCIE]: String(Date.now() - zycieMsTemu),
    'vilda-vault-session-v2': JSON.stringify({ v: 2, userId: 'u1', keyB64: 'AAAA' }),
    'veph:vault:adapter-v1': '{"users":[]}',
    'veph:s:sharedUserData': '{"name":"Anna Testowa"}',
  };
}

describe('P-JEDNORAZOWE-BEZ-PRZYWRACANIA: ładowanie strony w karcie z sesją jednorazową', () => {
  it('F5, przejście, „Wstecz”: znacznik zgodny i świeży — sesja zostaje', () => {
    const { win, klasy } = zaladujStrone({ sesja: sesjaJednorazowa(), nazwa: 'vilda-eph:abc' });
    expect(win.sessionStorage.getItem('vilda-vault-session-v2')).not.toBeNull();
    expect(win.sessionStorage.getItem('veph:s:sharedUserData')).not.toBeNull();
    expect(win.VildaPersistence.isEphemeralMode()).toBe(true);
    expect(klasy.has('vilda-auth-locked')).toBe(false);
  });

  it('przywrócona karta po restarcie przeglądarki (window.name puste): całe sessionStorage czyszczone, blokada', () => {
    const { win, klasy } = zaladujStrone({ sesja: sesjaJednorazowa(), nazwa: '' });
    expect(win.sessionStorage.klucze()).not.toContain('vilda-vault-session-v2');
    expect(win.sessionStorage.klucze().filter((k) => k.startsWith('veph:'))).toEqual([]);
    expect(win.sessionStorage.getItem(FLAGA)).toBeNull();
    expect(win.VildaPersistence.isEphemeralMode()).toBe(false);
    expect(klasy.has('vilda-auth-locked')).toBe(true);
    expect(win.__vildaEphemeralExpired).toBe(true);
  });

  it('inny znacznik w window.name (np. inna sesja w tej karcie): czyszczenie', () => {
    const { win } = zaladujStrone({ sesja: sesjaJednorazowa(), nazwa: 'vilda-eph:xyz' });
    expect(win.sessionStorage.getItem('vilda-vault-session-v2')).toBeNull();
  });

  it('druga linia: znacznik zgodny, ale ostatni znak życia sprzed ponad 2 minut — czyszczenie', () => {
    const { win } = zaladujStrone({ sesja: sesjaJednorazowa({ zycieMsTemu: 121_000 }), nazwa: 'vilda-eph:abc' });
    expect(win.sessionStorage.getItem('vilda-vault-session-v2')).toBeNull();
    const swieza = zaladujStrone({ sesja: sesjaJednorazowa({ zycieMsTemu: 119_000 }), nazwa: 'vilda-eph:abc' });
    expect(swieza.win.sessionStorage.getItem('vilda-vault-session-v2')).not.toBeNull();
  });

  it('bez sesji jednorazowej nic się nie zmienia (zwykłe konto przywraca się jak dotąd)', () => {
    const zwykla = { 'vilda-vault-session-v2': JSON.stringify({ v: 2, userId: 'u1', keyB64: 'AAAA' }), sharedUserData: '{}' };
    const { win, klasy } = zaladujStrone({ sesja: zwykla, nazwa: '' });
    expect(win.sessionStorage.getItem('vilda-vault-session-v2')).not.toBeNull();
    expect(win.sessionStorage.getItem('sharedUserData')).toBe('{}');
    expect(klasy.has('vilda-auth-locked')).toBe(false);
  });
});

describe('P-JEDNORAZOWE-BEZ-PRZYWRACANIA: znacznik karty', () => {
  it('wejście w tryb jednorazowy ustawia znacznik w sessionStorage i window.name; wyjście go zdejmuje', () => {
    const { win } = zaladujStrone();
    win.sessionStorage.setItem(FLAGA, '1'); // tak robi VildaVault przed setEphemeralMode(true)
    win.VildaPersistence.setEphemeralMode(true);
    const znacznik = win.sessionStorage.getItem(ZNACZNIK);
    expect(znacznik).toMatch(/.{8,}/);
    expect(win.name).toBe(`vilda-eph:${znacznik}`);
    expect(Number(win.sessionStorage.getItem(ZYCIE))).toBeGreaterThan(Date.now() - 5000);

    win.VildaPersistence.setEphemeralMode(false);
    expect(win.sessionStorage.getItem(ZNACZNIK)).toBeNull();
    expect(win.sessionStorage.getItem(ZYCIE)).toBeNull();
    expect(win.name).toBe('');
  });

  it('znak życia odświeża się przy pagehide tylko w sesji jednorazowej', () => {
    const { win, wyslij } = zaladujStrone({ sesja: sesjaJednorazowa({ zycieMsTemu: 60_000 }), nazwa: 'vilda-eph:abc' });
    win.sessionStorage.setItem(ZYCIE, '1');
    wyslij('pagehide');
    expect(Number(win.sessionStorage.getItem(ZYCIE))).toBeGreaterThan(Date.now() - 5000);

    const zwykla = zaladujStrone();
    zwykla.wyslij('pagehide');
    expect(zwykla.win.sessionStorage.getItem(ZYCIE)).toBeNull();
  });

  it('ponowne wejście w tryb przy zgodnym znaczniku go nie zmienia (odtworzenie sesji po F5)', () => {
    const { win } = zaladujStrone({ sesja: sesjaJednorazowa(), nazwa: 'vilda-eph:abc' });
    win.VildaPersistence.setEphemeralMode(true);
    expect(win.sessionStorage.getItem(ZNACZNIK)).toBe('abc');
    expect(win.name).toBe('vilda-eph:abc');
  });
});

describe('P-JEDNORAZOWE-BEZ-PRZYWRACANIA: teksty', () => {
  const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const tekst = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8').replace(/\s+/g, ' ');

  it('polityka prywatności wymienia wyjątek dla „Zaloguj jednorazowo”', () => {
    expect(tekst('polityka-prywatnosci.html')).toContain('Wyjątek: sesji „Zaloguj jednorazowo” aplikacja po przywróceniu karty nie przyjmuje');
  });

  it('opis opcji na ekranie logowania zostaje: „Po zakończeniu pracy nic nie zostanie.”', () => {
    expect(fs.readFileSync(path.join(korzen, 'vilda_auth_ui.js'), 'utf8')).toContain('Po zako\\u0144czeniu pracy nic nie zostanie.');
  });
});
