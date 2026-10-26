import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-CHMURA-OPIS (decyzja właściciela 2026-10-26, B: sprzątanie danych sesji trybu chmurowego i jednorazowego przy
// wylogowaniu, blokadzie i po upływie sesji).
//
// Przeglądarka, która przywraca karty, odtwarza sessionStorage. Gdy klucz sesji jest nieważny (po terminie albo bez
// konta w magazynie), sejf (tryRestoreSession, _a) w trybie chmurowym sprząta dane sesji karty tak jak ur() przy
// blokadzie. Przed terminem sesja wraca jak dotąd; tryb zwykły bez zmian.
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

function okno(sesja, lokalny) {
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
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  return win;
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
const HASLO = 'Chmura#Przywrocenie!2026aa';
const pacjent = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height: 120, weight: 22 } };

/* Sesja w karcie A (tryb chmurowy albo zwykły); karta przywrócona po (albo przed) upływie czasu bezczynności — okno B
   na kopii pamięci karty. */
async function przywroconaKarta({ chmurowy, poTerminie, bezKonta = false }) {
  const lokalny = magazyn({ vildaRetention: '0' });
  const A = okno(magazyn(), lokalny);
  const dysk = A.VildaVault.createInMemoryAdapter();
  A.VildaVault.setStorageAdapter(dysk);
  await A.VildaVault.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000, storageMode: chmurowy ? 'cloud-only' : 'local' });
  expect(A.VildaVault.isCloudOnlyMode()).toBe(chmurowy);
  A.VildaPersistence.writeShared({ name: 'Testowy Jan', age: 9, weight: 22 });
  const zapis = await A.VildaVault.savePatient(pacjent, { dedup: false });
  await chwila(30);
  const kopia = A.sessionStorage.zrzut();
  const sesja = JSON.parse(kopia['vilda-vault-session-v2']);
  if (poTerminie) sesja.expiresAtISO = new Date(Date.now() - 60000).toISOString();
  kopia['vilda-vault-session-v2'] = JSON.stringify(sesja);
  const B = okno(magazyn(kopia), lokalny);
  // bezKonta: konta nie ma już w magazynie (usunięte w innej karcie, wyczyszczona IndexedDB) — pusty magazyn.
  B.VildaVault.setStorageAdapter(bezKonta ? B.VildaVault.createInMemoryAdapter() : dysk);
  const odtworzona = await B.VildaVault.tryRestoreSession();
  await chwila(30);
  return { A, B, kopia, odtworzona, zapis };
}

const jawne = (win) => win.sessionStorage.klucze().filter((k) => (win.sessionStorage.getItem(k) || '').includes('Testowy'));

describe('P-CHMURA-OPIS: przywrócona karta z nieważnym kluczem sesji', () => {
  it('tryb chmurowy po terminie: pamięć karty bez danych sesji i bez znacznika trybu', async () => {
    const { B, kopia, odtworzona } = await przywroconaKarta({ chmurowy: true, poTerminie: true });
    expect(Object.keys(kopia), 'przed zamknięciem: zrzut, znacznik i stan formularza w pamięci karty').toEqual(
      expect.arrayContaining(['veph:cloud-only:per-user-v1', 'vilda-cloud-only-session-v1', 'veph:s:sharedUserData']));
    expect(odtworzona).toBe(false);
    expect(B.VildaVault.isUnlocked()).toBe(false);
    const klucze = B.sessionStorage.klucze();
    expect(klucze).not.toContain('vilda-vault-session-v2');
    expect(klucze).not.toContain('vilda-cloud-only-session-v1');
    expect(klucze.filter((k) => k.startsWith('veph:')), 'zrzut i stan formularzy trybu chmurowego').toEqual([]);
    expect(jawne(B), 'jawne dane pacjenta w pamięci karty').toEqual([]);
    expect(JSON.stringify(B.VildaPersistence.readShared({ ensurePersist: false }) || null)).not.toContain('Testowy');
    expect(B.VildaPersistence.isCloudOnlyMode()).toBe(false);
  });

  it('tryb chmurowy przed terminem: sesja wraca jak dotąd, z pacjentem i stanem formularza', async () => {
    const { B, odtworzona, zapis } = await przywroconaKarta({ chmurowy: true, poTerminie: false });
    expect(odtworzona).toBe(true);
    expect(B.VildaVault.isCloudOnlyMode()).toBe(true);
    expect((await B.VildaVault.listPatients()).map((p) => p.patientId)).toEqual([zapis.patientId]);
    expect(B.sessionStorage.klucze()).toContain('vilda-cloud-only-session-v1');
    expect(JSON.stringify(B.VildaPersistence.readShared({ ensurePersist: false }))).toContain('Testowy');
  });

  // Klucz w terminie, ale konta nie ma w magazynie — sesji i tak nie da się odtworzyć; karta sprząta jak po terminie.
  // Nieczytelny wpis i klucz nie do zaimportowania (catch) — jak dotąd sam klucz.
  it('tryb chmurowy przed terminem, bez konta w magazynie: pamięć karty bez danych sesji i bez znacznika trybu', async () => {
    const { B, kopia, odtworzona } = await przywroconaKarta({ chmurowy: true, poTerminie: false, bezKonta: true });
    expect(Object.keys(kopia)).toEqual(expect.arrayContaining(['veph:cloud-only:per-user-v1', 'vilda-cloud-only-session-v1']));
    expect(odtworzona).toBe(false);
    const klucze = B.sessionStorage.klucze();
    expect(klucze).not.toContain('vilda-vault-session-v2');
    expect(klucze).not.toContain('vilda-cloud-only-session-v1');
    expect(klucze.filter((k) => k.startsWith('veph:'))).toEqual([]);
    expect(jawne(B)).toEqual([]);
  });

  it('tryb zwykły bez konta w magazynie: bez zmian — zdjęty tylko klucz sesji', async () => {
    const { B, kopia, odtworzona } = await przywroconaKarta({ chmurowy: false, poTerminie: false, bezKonta: true });
    expect(odtworzona).toBe(false);
    const oczekiwane = Object.keys(kopia).filter((k) => k !== 'vilda-vault-session-v2').sort();
    expect(B.sessionStorage.klucze().sort()).toEqual(oczekiwane);
  });

  it('tryb zwykły po terminie: bez zmian — zdjęty tylko klucz sesji', async () => {
    const { B, kopia, odtworzona } = await przywroconaKarta({ chmurowy: false, poTerminie: true });
    expect(odtworzona).toBe(false);
    const oczekiwane = Object.keys(kopia).filter((k) => k !== 'vilda-vault-session-v2').sort();
    expect(B.sessionStorage.klucze().sort()).toEqual(oczekiwane);
    expect(B.sessionStorage.klucze()).not.toContain('vilda-cloud-only-session-v1');
  });
});
