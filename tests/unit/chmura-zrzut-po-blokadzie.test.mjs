import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-CHMURA-OPIS (decyzja właściciela 2026-10-26, B: sprzątanie danych sesji trybu chmurowego i jednorazowego przy
// wylogowaniu, blokadzie i po upływie sesji).
//
// Po blokadzie z każdego powodu (także auto-wylogowanie po bezczynności) pamięć karty jest bez danych sesji. Adapter
// w pamięci (Ze) zapisuje zrzut do sessionStorage z opóźnieniem (y()); ur() i koniec sesji jednorazowej odpinają ten
// zapis (detachPersist), zanim usuną zrzut. Bez blokady zrzut działa jak dotąd (odświeżenie strony odtwarza sesję).
//
// Prawdziwe vilda_persistence_adapter.js, vilda_crypto.js i vilda_vault.js na atrapie okna. Dane wyłącznie FIKCYJNE.

function magazyn(poczatek = {}) {
  const m = Object.assign(Object.create(null), poczatek);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    klucze: () => Object.keys(m),
    zrzut: () => Object.assign({}, m),
  };
}

function okno(sesja = magazyn(), lokalny = magazyn()) {
  const win = {
    name: '',
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: lokalny, sessionStorage: sesja,
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    setInterval: () => 0, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
    navigator: {},
    document: {
      addEventListener() {}, removeEventListener() {}, hidden: false,
      documentElement: { classList: { add() {}, remove() {}, contains() { return false; } } },
    },
    AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  return win;
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
const HASLO = 'Chmura#Zrzut!2026aa';
const pacjent = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height: 120, weight: 22 } };
const ZRZUT = 'veph:cloud-only:per-user-v1';
const KOPIA_JEDNORAZOWA = 'veph:vault:adapter-v1';

async function kontoChmurowe() {
  const win = okno();
  const sejf = win.VildaVault;
  const dysk = sejf.createInMemoryAdapter();
  sejf.setStorageAdapter(dysk);
  const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000, storageMode: 'cloud-only' });
  expect(sejf.isCloudOnlyMode()).toBe(true);
  return { win, sejf, konto, dysk };
}

describe('P-CHMURA-OPIS: po blokadzie pamięć karty bez danych sesji', () => {
  for (const powod of ['idle', 'manual', 'user']) {
    it(`tryb chmurowy, lock('${powod}'): po blokadzie pamięć karty bez danych sesji i bez znacznika trybu`, async () => {
      const { win, sejf } = await kontoChmurowe();
      await sejf.savePatient(pacjent, { dedup: false });
      sejf.lock(powod);
      await chwila(30);
      const klucze = win.sessionStorage.klucze();
      expect(klucze, 'zaszyfrowany zrzut trybu chmurowego').not.toContain(ZRZUT);
      expect(klucze.filter((k) => k.startsWith('veph:')), 'pamięć sesji trybu chmurowego').toEqual([]);
      expect(klucze).not.toContain('vilda-cloud-only-session-v1');
      expect(klucze).not.toContain('vilda-vault-session-v2');
    });

    it(`„Zaloguj jednorazowo”, lock('${powod}'): po blokadzie pamięć karty bez danych sesji`, async () => {
      const win = okno();
      const sejf = win.VildaVault;
      sejf.setEphemeralMode(true);
      await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000 });
      await sejf.savePatient(pacjent, { dedup: false });
      sejf.lock(powod);
      await chwila(30);
      const klucze = win.sessionStorage.klucze();
      expect(klucze, 'kopia sejfu sesji jednorazowej').not.toContain(KOPIA_JEDNORAZOWA);
      expect(klucze.filter((k) => k.startsWith('veph:'))).toEqual([]);
    });
  }

  it('bez blokady zrzut działa jak dotąd: odświeżenie strony w tej samej karcie odtwarza sesję z pacjentem', async () => {
    const { win, sejf, dysk } = await kontoChmurowe();
    const zapis = await sejf.savePatient(pacjent, { dedup: false });
    await chwila(30);
    expect(win.sessionStorage.klucze(), 'zrzut w pamięci karty w trakcie sesji').toContain(ZRZUT);
    // F5: nowe okno na tej samej pamięci karty (sessionStorage) i tym samym magazynie trwałym.
    const po = okno(magazyn(win.sessionStorage.zrzut()), win.localStorage);
    po.VildaVault.setStorageAdapter(dysk);
    expect(await po.VildaVault.tryRestoreSession(), 'sesja odtworzona').toBe(true);
    expect(po.VildaVault.isCloudOnlyMode()).toBe(true);
    expect((await po.VildaVault.listPatients()).map((p) => p.patientId)).toEqual([zapis.patientId]);
  });
});
