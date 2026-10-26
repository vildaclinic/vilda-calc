import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-CHMURA-OPIS (decyzja właściciela 2026-10-26, B): delta, której scalenie przerwała zmiana sesji, nie przesuwa kursora
// dziennika zmian. applyEncryptedDelta zgłasza wtedy SESSION_CHANGED z vildaMergeBusy, a pętla delt w vilda_sync.js (wt)
// kończy partię bez przesunięcia kursora; następne pobranie stosuje deltę od nowa w nowej sesji.
//
// Prawdziwe vilda_crypto.js, vilda_vault.js i vilda_sync.js; serwer synchronizacji to atrapa (status z ETagiem równym
// lokalnemu, pełny stan bez zmian, /changes z dwiema deltami), Web Locks — atrapa. Dane wyłącznie FIKCYJNE.

const SLOT = 'd'.repeat(64);
const KLUCZ_KURSORA = `vilda-sync-cursor-v1:${SLOT}`;

function magazyn(seed) {
  const m = Object.assign(Object.create(null), seed || {});
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function atrapaLocks() {
  const stan = new Map();
  const nazwa = (n) => { if (!stan.has(n)) stan.set(n, { zajeta: false, kolejka: [] }); return stan.get(n); };
  function uruchom(n, cb) {
    const s = nazwa(n);
    s.zajeta = true;
    const wynik = Promise.resolve().then(() => cb({ name: n }));
    const zwolnij = () => { s.zajeta = false; const nast = s.kolejka.shift(); if (nast) nast.start(); };
    wynik.then(zwolnij, zwolnij);
    return wynik;
  }
  return {
    czekajacych: (n) => nazwa(n).kolejka.length,
    request(n, opcje, cb) {
      if (typeof opcje === 'function') { cb = opcje; opcje = {}; }
      const s = nazwa(n);
      if (opcje.ifAvailable) return s.zajeta ? Promise.resolve().then(() => cb(null)) : uruchom(n, cb);
      if (!s.zajeta) return uruchom(n, cb);
      return new Promise((resolve, reject) => { s.kolejka.push({ start: () => uruchom(n, cb).then(resolve, reject) }); });
    },
  };
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });

function okno(locks) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn({ [`vilda-sync-state-v1:${SLOT}`]: JSON.stringify({ registered: true, localEtag: 'E1', lastSyncAt: null }) }),
    sessionStorage: magazyn({ 'vilda-sync-pulled-v1': '1' }),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    setInterval: () => 0, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, hidden: false },
    location: { hostname: 'localhost' },
    AbortController,
  };
  if (locks) win.navigator = { locks };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  return win;
}

const HASLO = 'Chmura#Delta!2026aa';
const naglowek = (i) => ({ name: `Testowy Jan${i}`, user: { lastName: 'Testowy', firstName: `Jan${i}`, dobISO: '2016-03-12', sex: 'M', height: 120 + i, weight: 22 } });
const odp = (status, cialo) => ({ status, ok: status >= 200 && status < 300, json: async () => cialo, headers: { get: () => null } });

/* Konto (tryb zwykły, magazyn w pamięci) z prawdziwym vilda_sync.js; dziennik zmian: d1 = karta A, d2 = karta B
   (z innego urządzenia), zaszyfrowane kluczem konta. */
async function urzadzenie() {
  const locks = atrapaLocks();
  const win = okno(locks);
  const sejf = win.VildaVault;
  sejf.setStorageAdapter(sejf.createInMemoryAdapter());
  const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000 });
  const zrodlo = okno(null).VildaVault;
  zrodlo.setStorageAdapter(zrodlo.createInMemoryAdapter());
  await zrodlo.createUser('Inne#Urzadzenie!2026aa', { label: 'Inne urządzenie', iterations: 1000 });
  const A = await zrodlo.savePatient(naglowek(1), { dedup: false });
  const pA = await zrodlo.exportSyncPayload();
  const B = await zrodlo.savePatient(naglowek(2), { dedup: false });
  const pB = await zrodlo.exportSyncPayload();
  pB.patients = pB.patients.filter((p) => p.patientId === B.patientId);
  for (const p of [pA, pB]) { delete p.credential; delete p.passkeys; }
  const delty = [{ seq: 1, payload: await sejf.encryptPayloadForCurrentUser(pA) }, { seq: 2, payload: await sejf.encryptPayloadForCurrentUser(pB) }];
  const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  sejf.getSyncMaterial = async () => ({ slotId: SLOT, authToken: 'TOKEN', authTokenHash: 'HASH', syncEncKey: klucz });
  const zapytania = [];
  vi.stubGlobal('fetch', async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/status')) return odp(200, { etag: 'E1', size: 10 });
    if (u.pathname.endsWith('/changes')) {
      const od = Number(u.searchParams.get('since')) || 0;
      zapytania.push(od);
      return odp(200, { deltas: delty.filter((d) => d.seq > od), headSeq: 2 });
    }
    if (u.pathname.endsWith('/blob')) return odp(304, {}); // pełny stan bez zmian — tylko delty
    return odp(404, {});
  });
  // Dziennik wyników applyEncryptedDelta (vilda_sync.js woła ją na obiekcie sejfu) i liczba wywołań w toku.
  const wyniki = [];
  let wToku = 0;
  const stosuj = sejf.applyEncryptedDelta;
  sejf.applyEncryptedDelta = async (payload) => {
    wToku += 1;
    try {
      const w = await stosuj(payload);
      wyniki.push(w ? 'ok' : 'null');
      return w;
    } catch (e) {
      wyniki.push(`${e && e.code}${e && e.vildaMergeBusy ? ' (vildaMergeBusy)' : ''}`);
      throw e;
    } finally { wToku -= 1; }
  };
  loadBrowserScript('vilda_sync.js', win);
  return { win, sejf, konto, locks, A, B, zapytania, wyniki, wToku: () => wToku, kursor: () => win.localStorage.getItem(KLUCZ_KURSORA) };
}

/* Blokada karty A trzymana przez test (np. zapis tej karty w innej ramce): drenaż czeka w kroku scalania delty d1. */
async function drenazCzekaNaKarteA(d) {
  const nazwa = 'vilda-save-pat:' + d.A.patientId;
  let zwolnij;
  const trzymana = new Promise((r) => { zwolnij = r; });
  d.locks.request(nazwa, () => trzymana);
  await chwila(0);
  expect((await d.win.VildaSync.syncPull()).action).toBe('up-to-date');
  for (let i = 0; i < 500 && d.locks.czekajacych(nazwa) === 0; i += 1) await chwila(2);
  expect(d.locks.czekajacych(nazwa), 'scalanie delty d1 czeka na blokadę karty A').toBe(1);
  return zwolnij;
}

/* Koniec drenażu w tle: zapytanie o zmiany wysłane, co najmniej `wynikow` delt skończonych i żadna w toku przez 100 ms. */
async function poczekajNaKoniecPartii(d, zapytan, wynikow) {
  for (let i = 0; i < 400 && d.zapytania.length < zapytan; i += 1) await chwila(5);
  for (let spokoj = 0, i = 0; spokoj < 20 && i < 1000; i += 1) {
    await chwila(5);
    spokoj = d.wToku() === 0 && d.wyniki.length >= wynikow ? spokoj + 1 : 0;
  }
}

const ids = async (sejf) => (await sejf.listPatients()).map((p) => p.patientId);

afterEach(() => { vi.unstubAllGlobals(); });

describe('P-CHMURA-OPIS: delta przerwana zmianą sesji a kursor dziennika zmian', () => {
  it('ponowne zalogowanie tego samego konta w trakcie partii: kursor stoi, przerwana delta trafia do nowej sesji przy następnym pobraniu', async () => {
    const d = await urzadzenie();
    const zwolnij = await drenazCzekaNaKarteA(d);
    d.sejf.lock('manual');
    await d.sejf.unlockUser(d.konto.userId, HASLO);
    zwolnij();
    await poczekajNaKoniecPartii(d, 1, 1);
    expect(d.wyniki, 'd1 przerwana zmianą sesji kończy partię (d2 nie idzie w nowej sesji)').toEqual(['SESSION_CHANGED (vildaMergeBusy)']);
    expect(d.kursor(), 'partia przerwana zmianą sesji — kursor nie przeskakuje delty d1').toBeNull();
    expect(await ids(d.sejf), 'd1 nie jest zastosowana w starej sesji').not.toContain(d.A.patientId);

    expect((await d.win.VildaSync.syncPull()).action).toBe('up-to-date');
    await poczekajNaKoniecPartii(d, 2, 3);
    expect(d.wyniki.slice(1), 'następne pobranie: obie delty w nowej sesji').toEqual(['ok', 'ok']);
    expect(d.zapytania, 'drugie pobranie pyta znów od początku dziennika').toEqual([0, 0]);
    expect(d.kursor()).toBe('2');
    const po = await ids(d.sejf);
    expect(po, 'karta A z przerwanej delty — w nowej sesji').toContain(d.A.patientId);
    expect(po).toContain(d.B.patientId);
  }, 30000);

  it('samo wylogowanie w trakcie partii: kursor stoi, po zalogowaniu następne pobranie stosuje obie delty', async () => {
    const d = await urzadzenie();
    const zwolnij = await drenazCzekaNaKarteA(d);
    d.sejf.lock('idle');
    zwolnij();
    await poczekajNaKoniecPartii(d, 1, 1);
    expect(d.kursor()).toBeNull();
    await d.sejf.unlockUser(d.konto.userId, HASLO);
    await d.win.VildaSync.syncPull();
    await poczekajNaKoniecPartii(d, 2, 3);
    expect(d.kursor()).toBe('2');
    expect((await ids(d.sejf)).sort()).toEqual([d.A.patientId, d.B.patientId].sort());
  }, 30000);

  it('bez zmiany sesji: partia jak dotąd (obie delty, kursor 2)', async () => {
    const d = await urzadzenie();
    const zwolnij = await drenazCzekaNaKarteA(d);
    zwolnij();
    await poczekajNaKoniecPartii(d, 1, 2);
    for (let i = 0; i < 200 && d.kursor() == null; i += 1) await chwila(5);
    expect(d.wyniki).toEqual(['ok', 'ok']);
    expect(d.kursor()).toBe('2');
    expect((await ids(d.sejf)).sort()).toEqual([d.A.patientId, d.B.patientId].sort());
  }, 30000);
});
