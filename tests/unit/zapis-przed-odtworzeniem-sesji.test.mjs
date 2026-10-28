import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// P-ZAPIS-PRZED-ODTWORZENIEM (zlecenie właściciela 2026-10-28) — udany zapis pacjenta zamyka startowe odtworzenie
// sesji strony, tak jak wczytanie pacjenta (P-SWIEZE-WCZYTANIE).
//
// Startowe odtworzenie (restoreMainSessionIfAny) rusza dwie klatki animacji po DOMContentLoaded. Gdy przyszło
// dopiero po pierwszym zapisie nowego pacjenta (obciążony komputer, karta w tle, zegar testu e2e), warunek
// „formularz wypełniony, a nikt nie jest wczytany” już go nie zatrzymywał — zapis ustawia bieżącego pacjenta —
// i migawka sesji sprzed zapisu (38 kg / 133 cm) nadpisywała wpisany już drugi pomiar (40 kg / 135 cm). Tak padały
// na CI testy e2e porownanie-data-urodzenia i porownanie-synchronizacja-w-tle (BMI 21,5 zamiast 21,9).
//
// Prawdziwy vilda_data_import_export.js; atrapy tylko dla zdarzeń, magazynu, klatek animacji, timerów i sejfu.
// Dane wyłącznie FIKCYJNE.

const KOD = fs.readFileSync('vilda_data_import_export.js', 'utf8');

function uprzaz({ wlasciciel = null, sesja = null, zapis = 'ok', odpowiedz = null, czekaNaLogowanie = false } = {}) {
  const zdarzenia = () => {
    const L = new Map();
    return {
      addEventListener(t, cb) { if (!L.has(t)) L.set(t, new Set()); L.get(t).add(cb); },
      removeEventListener(t, cb) { L.get(t)?.delete(cb); },
      dispatchEvent(e) { [...(L.get(e.type) || [])].forEach((cb) => cb(e)); return true; },
    };
  };
  const document = { ...zdarzenia(), readyState: 'complete',
    getElementById: (id) => (id === 'intakePal' ? { value: '' } : null),
    querySelector: () => null, querySelectorAll: () => [] };
  const klatki = new Map(), timery = new Map(), gotowe = [], nalozone = [], zapisySesji = [], naOdblok = [];
  let klatkaId = 0, timerId = 0, owner = wlasciciel, migawka = sesja, formularz = null;
  let odblokowany = !czekaNaLogowanie, gotowy = !czekaNaLogowanie;
  const ss = new Map();
  const sejf = { isUnlocked: () => odblokowany, onUnlock: (cb) => naOdblok.push(cb), onLock() {},
    savePatient: async (p) => {
      if (zapis !== 'ok') throw new Error('atrapa: zapis nie powiódł się');
      if (odpowiedz) return odpowiedz(p);
      return { patientId: owner || 'fikcyjny-nowy', snapshotId: 'fikcyjna-wersja-1', isNew: !owner,
        savedAtISO: '2026-06-17T13:00:00.000Z', snapshotCount: owner ? 2 : 1, header: { name: p.name } };
    } };
  const win = { ...zdarzenia(), document, VildaVault: sejf, VildaAuthUI: { isBootReady: () => gotowy },
    updateProfessionalSummaryCard() {},
    sessionStorage: { getItem: (k) => (k === 'vildaCurrentPatientId' ? owner : (ss.get(k) ?? null)),
      setItem: (k, v) => ss.set(k, v), removeItem: (k) => ss.delete(k) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: (cb) => { klatki.set(++klatkaId, cb); return klatkaId; },
    cancelAnimationFrame: (id) => klatki.delete(id),
    setTimeout: (cb) => { timery.set(++timerId, cb); return timerId; }, clearTimeout: (id) => timery.delete(id),
    location: { pathname: '/index.html' },
    Event: class { constructor(t) { this.type = t; } },
    CustomEvent: class { constructor(t, o = {}) { this.type = t; this.detail = o.detail; } },
    VildaPersistence: { getStorage: () => ({}), getTabId: () => 'fikcyjna-karta', readMainSession: () => migawka,
      writeMainSession: (v) => { zapisySesji.push(JSON.parse(JSON.stringify(v))); migawka = v; return true; },
      clearMainSession: () => { migawka = null; } },
  };
  new Function('window', 'globalThis', 'setTimeout', 'clearTimeout', KOD)(win, win, win.setTimeout, win.clearTimeout);
  const api = win.VildaDataImportExport;
  api.initMainSessionPersistence({
    // Wywołanie z DOMContentLoaded wstrzymane: startowe odtworzenie rusza dopiero w start().
    vildaAppOnReady: (_n, cb) => gotowe.push(cb),
    anyDataEntered: () => !!formularz,
    collectUserData: () => JSON.parse(JSON.stringify(formularz)),
    applyLoadedData: (p, o) => nalozone.push({ w: p.user.weight, h: p.user.height, sesja: !!(o && o.isSessionRestore) }),
  });
  // custom-fixes.js: vilda:patient-loaded (także source 'save') ustawia bieżącego pacjenta karty.
  document.addEventListener('vilda:patient-loaded', (e) => { owner = e.detail.patientId; });
  const timeryDoKonca = () => {
    for (let i = 0; i < 6 && timery.size; i += 1) { const c = [...timery.values()]; timery.clear(); c.forEach((f) => f()); }
  };
  const klatka = () => { const c = [...klatki.values()]; klatki.clear(); c.forEach((f) => f()); };
  const wpisz = (w, h) => {
    formularz = { version: 1, name: 'Testowy Jan', user: { sex: 'M', age: 9, ageMonths: 1, weight: w, height: h, dobISO: '2017-05-05' } };
    win.vildaSession.schedule({ target: { matches: () => true } }); // zwykły autozapis sesji po wpisie (300 ms)
    timeryDoKonca();
  };
  return {
    api, win, nalozone, zapisySesji, wpisz, timeryDoKonca, klatka, klatki,
    zapisz: async () => { const w = await api.saveUserData({ collectUserData: () => JSON.parse(JSON.stringify(formularz)) }); timeryDoKonca(); return w; },
    start: () => { gotowe.splice(0).forEach((cb) => cb()); klatka(); klatka(); },
    // Logowanie się kończy, sejf odblokowany; odtworzenie czekające na logowanie planuje klatkę (nie puszczamy jej).
    odblokuj: () => { odblokowany = true; gotowy = true; naOdblok.forEach((cb) => cb()); },
    migawka: () => (migawka && migawka.user ? `${migawka.user.weight}/${migawka.user.height}` : null),
    owner: () => owner,
  };
}

const sesjaX = (w, h) => ({ version: 1, name: 'Testowy Jan', user: { sex: 'M', age: 9, ageMonths: 1, weight: w, height: h, dobISO: '2017-05-05' } });

describe('P-ZAPIS-PRZED-ODTWORZENIEM — zapis pacjenta przed startowym odtworzeniem sesji', () => {
  it('Z1 [czerwony na audyt 3d6e989b]: nowy pacjent — 38/133, „Zapisz”, 40/135, potem spóźnione odtworzenie: formularz zostaje 40/135, migawka idzie za formularzem', async () => {
    const u = uprzaz();
    u.wpisz(38, 133);
    expect(u.migawka()).toBe('38/133');
    expect(await u.zapisz()).toBeTruthy();
    expect(u.owner()).toBe('fikcyjny-nowy');
    u.wpisz(40, 135);
    u.start();
    expect(u.nalozone).toEqual([]);
    expect(u.migawka()).toBe('40/135');
  });

  it('Z2 [czerwony na audyt 3d6e989b]: karta po F5 z bieżącym pacjentem — nowy pomiar zapisany przed spóźnionym odtworzeniem nie wraca do starszej migawki', async () => {
    const u = uprzaz({ wlasciciel: 'fikcyjny-x', sesja: sesjaX(38, 133) });
    u.wpisz(40, 135);
    expect(await u.zapisz()).toBeTruthy();
    u.start();
    expect(u.nalozone).toEqual([]);
    u.wpisz(40, 135);
    expect(u.migawka()).toBe('40/135');
  });

  it('Z3 (kontrola, jak dotąd): nieudany zapis nie zamyka odtworzenia — spóźnione odtworzenie zachowuje się jak przed zmianą', async () => {
    const u = uprzaz({ wlasciciel: 'fikcyjny-x', sesja: sesjaX(38, 133), zapis: 'blad' });
    u.wpisz(40, 135);
    await u.zapisz();
    u.start();
    expect(u.nalozone).toEqual([{ w: 38, h: 133, sesja: true }]);
  });

  it('Z4 (kontrola, P-ODSWIEZENIE): F5 bez zapisu — startowe odtworzenie przywraca niezapisaną migawkę jak dotąd', () => {
    const u = uprzaz({ wlasciciel: 'fikcyjny-x', sesja: sesjaX(39, 134) });
    u.start();
    expect(u.nalozone).toEqual([{ w: 39, h: 134, sesja: true }]);
  });

  it('Z5 (kontrola): jawne vildaSession.restore() z powłoki po zapisie nadal odtwarza sesję', async () => {
    const u = uprzaz();
    u.wpisz(38, 133);
    expect(await u.zapisz()).toBeTruthy();
    u.start();
    const przed = u.nalozone.length;
    u.win.vildaSession.restore();
    expect(u.nalozone.length).toBe(przed + 1);
    expect(u.nalozone.at(-1)).toEqual({ w: 38, h: 133, sesja: true });
  });

  it('Z6 (kontrola): nowy pacjent bez zapisu — formularz wypełniony, nikt nie wczytany: spóźnione odtworzenie niczego nie nakłada, jak dotąd', () => {
    const u = uprzaz({ sesja: sesjaX(38, 133) });
    u.wpisz(40, 135);
    u.start();
    expect(u.nalozone).toEqual([]);
  });

  // Zapis zamyka odtworzenie tylko wtedy, gdy sejf zwrócił identyfikator pacjenta — tę samą odpowiedź saveUserData
  // traktuje jako udany zapis (success: true). Odpowiedź bez identyfikatora nie zamyka odtworzenia ani nie zdejmuje
  // blokady zapisu sesji sprzed pierwszego odtworzenia (Gp_k).
  for (const [opis, odpowiedz] of [
    ['odpowiedź bez patientId', (p) => ({ snapshotCount: 1, header: { name: p.name } })],
    ['odpowiedź pusta', () => undefined],
  ]) {
    it(`Z7 (kontrola, jak dotąd; ${opis}): odtworzenie i blokada zapisu sesji zostają jak przed zapisem`, async () => {
      const u = uprzaz({ wlasciciel: 'fikcyjny-x', sesja: sesjaX(38, 133), odpowiedz });
      u.wpisz(40, 135);
      expect(u.migawka(), 'przed pierwszym odtworzeniem blokada chroni pełną migawkę').toBe('38/133');
      await u.zapisz();
      expect(u.owner()).toBe('fikcyjny-x');
      u.wpisz(40, 135);
      expect(u.migawka(), 'odpowiedź bez identyfikatora nie zdejmuje blokady').toBe('38/133');
      u.start();
      expect(u.nalozone).toEqual([{ w: 38, h: 133, sesja: true }]);
    });
  }

  it('Z8 [czerwony na audyt 3d6e989b]: odtworzenie czekające na logowanie, zapis przed jego klatką — nic nie wraca, migawka idzie za formularzem', async () => {
    const u = uprzaz({ wlasciciel: 'fikcyjny-x', sesja: sesjaX(38, 133), czekaNaLogowanie: true });
    u.start();
    expect(u.api.isMainSessionRestorePending()).toBe(true);
    u.odblokuj();
    expect(u.klatki.size, 'odtworzenie zaplanowane na klatkę, klatka wstrzymana').toBe(1);
    u.wpisz(40, 135);
    expect(await u.zapisz()).toBeTruthy();
    expect(u.api.isMainSessionRestorePending()).toBe(false);
    u.klatka(); u.timeryDoKonca();
    expect(u.nalozone).toEqual([]);
    u.wpisz(40, 135);
    expect(u.migawka(), 'po zapisie blokada Gp_k nie zatrzymuje już zapisu sesji').toBe('40/135');
  });
});
