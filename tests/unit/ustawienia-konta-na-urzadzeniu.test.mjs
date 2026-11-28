import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-USTAWIENIA-KONTA (polecenie właściciela 2026-11-13): ustawienia synchronizowane z kontem mają na urządzeniu
// osobną kopię dla każdego konta — zmiana jednego lekarza nie zmienia niczego drugiemu. Prawdziwy adapter
// (vilda_persistence_adapter.js) i prawdziwy sejf (vilda_vault.js) na jednym „urządzeniu” (wspólny localStorage)
// oraz na dwóch urządzeniach jednego konta. Dane wyłącznie FIKCYJNE.
function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; }, klucze: () => Object.keys(m).filter((k) => !k.startsWith('__')).sort(),
  };
}
function loadDevice() {
  const okno = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, CustomEvent: class {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  okno.window = okno; okno.self = okno; okno.top = okno;
  loadBrowserScript('vilda_persistence_adapter.js', okno);
  loadBrowserScript('vilda_crypto.js', okno);
  loadBrowserScript('vilda_vault.js', okno);
  const vault = okno.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return { vault, prefs: okno.VildaPersistence, ls: okno.localStorage, okno };
}
const chwila = () => new Promise((r) => { setTimeout(r, 0); });
const HASLO_A = 'Ustawienia#KontoA!2026', HASLO_B = 'Ustawienia#KontoB!2026';
const ZNACZNIK = 'vilda-pref-konta-v1::';
const naKoncie = async (U) => (await U.vault.exportSyncPayload()).userPreferences || {};
/* Przejęcie ustawień urządzenia przez zalogowane konto. Adapter nie ma do tego publicznej funkcji (końcówka pliku
 * z API jest pilnowana bajt w bajt przez header-patient-status-offline.spec.mjs): przejęcie rusza przy odblokowaniu
 * sejfu albo przy pierwszym odczycie ustawienia bez własnej kopii. Zwraca true, gdy konto ma znacznik przejęcia. */
async function przejete(U) {
  const konto = U.vault.getCurrentUser() && U.vault.getCurrentUser().userId;
  if (!konto) return false;
  U.prefs.readPreferenceRaw('PAL_PDF_LAYOUT', null);
  for (let i = 0; i < 100; i += 1) {
    if (U.ls.getItem(ZNACZNIK + konto) === '1') return true;
    await new Promise((r) => { setTimeout(r, 2); });
  }
  return false;
}

// Ustawienia widoku: gość ma kopię urządzenia, konto przejmuje jej kopię.
const WIDOK = ['palSmoothPasses', 'palPdfLayout', 'cardVisibility', 'cardCollapseState', 'publicationCharts', 'centileChartLineStyles',
  'centileShowHeightLabel', 'centileShowWeightLabel', 'centileShowBandReference', 'ghTherapyViewMode', 'remindersCollapsedCategories', 'remindersOverdueCollapsed'];
// Klucze z danymi konta: bez kopii gościa; wspólna kopia przechodzi na konto tylko na urządzeniu z jednym kontem.
const DANE_KONTA = ['dietRecommendationsRecentMythsV1', 'remindersLastShownDate', 'advHistoryCollapsed'];

describe('rejestr adaptera: każda preferencja konta ma osobną kopię na konto', () => {
  const { prefs } = loadDevice();
  const meta = prefs.MODULE_KEY_META;
  const konta = Object.keys(meta).filter((k) => meta[k].storage === 'cloud-synced').sort();

  it('wszystkie preferencje synchronizowane z kontem mają cechę perUser — także te, które dojdą później', () => {
    expect(konta).toEqual([...WIDOK, ...DANE_KONTA, 'labCustomPackages', 'icd10Favorites'].sort());
    for (const klucz of konta) expect(meta[klucz].perUser, klucz).toBe(true);
  });

  it('ustawienia widoku: kopia gościa i przejęcie kopii urządzenia; klucze z danymi konta: bez gościa, przejęcie tylko przy jednym koncie', () => {
    for (const klucz of WIDOK) expect({ guest: meta[klucz].guest, seed: meta[klucz].seed }, klucz).toEqual({ guest: true, seed: 'copy' });
    for (const klucz of DANE_KONTA) expect({ guest: meta[klucz].guest, seed: meta[klucz].seed }, klucz).toEqual({ guest: undefined, seed: 'single' });
    // Pakiety badań: bez gościa i bez przejęcia przez adapter (rozstrzyga je sejf — vilda_lab_packages.js).
    expect({ ...meta.labCustomPackages }).toEqual({ scope: 'laboratory', kind: 'preference', storage: 'cloud-synced', perUser: true });
    expect({ ...meta.icd10Favorites }).toEqual({ scope: 'diagnosis', kind: 'preference', storage: 'cloud-synced', perUser: true });
  });

  it('preferencje urządzenia (local-persistent) nie mają kopii na konto', () => {
    const urzadzenia = Object.keys(meta).filter((k) => meta[k].storage === 'local-persistent');
    expect(urzadzenia.length).toBeGreaterThan(10);
    for (const klucz of urzadzenia) expect(meta[klucz].perUser, klucz).toBeUndefined();
  });
});

describe('gość (bez zalogowanego konta)', () => {
  it('ustawienia widoku czyta i pisze w kopii urządzenia, jak dotąd', () => {
    const { prefs, ls } = loadDevice();
    expect(prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({});
    expect(prefs.writePreferenceJSON('CARD_VISIBILITY', { whrCard: false })).toBe(true);
    expect(prefs.writePreferenceRaw('PAL_SMOOTH_PASSES', '20')).toBe(true);
    expect(prefs.writeBooleanPreference('CENTILE_SHOW_BAND_REFERENCE', false)).toBe(true);
    expect(prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({ whrCard: false });
    expect(prefs.readNumberPreference('PAL_SMOOTH_PASSES', 12, { min: 0, max: 50 })).toBe(20);
    expect(prefs.readBooleanPreference('CENTILE_SHOW_BAND_REFERENCE', true)).toBe(false);
    expect(ls.klucze()).toEqual(['cardVisibility', 'centileShowBandReference', 'palSmoothPasses']);
  });

  it('kluczy z danymi konta nie czyta ani nie pisze — nawet gdy na urządzeniu została dawna wspólna kopia', () => {
    const { prefs, ls } = loadDevice();
    ls.setItem('advHistoryCollapsed', JSON.stringify({ 'fikcyjny-pacjent': { z: 1 } }));
    ls.setItem('remindersLastShownDate', '2026-06-16');
    expect(prefs.readPreferenceJSON('ADV_HISTORY_COLLAPSED', null)).toBeNull();
    expect(prefs.readModuleRaw('remindersLastShownDate', null)).toBeNull();
    expect(prefs.writePreferenceJSON('ADV_HISTORY_COLLAPSED', { x: { z: 1 } }, { force: true })).toBe(false);
    expect(prefs.writeModuleRaw('remindersLastShownDate', '2026-06-17')).toBe(false);
    expect(ls.getItem('remindersLastShownDate')).toBe('2026-06-16');
  });
});

describe('pierwsze logowanie po aktualizacji: konto przejmuje dotychczasowe ustawienia urządzenia', () => {
  // Stan sprzed poprawki: wszystkie ustawienia w jednej, wspólnej kopii urządzenia.
  function urzadzenieZeWspolnaKopia() {
    const U = loadDevice();
    U.ls.setItem('cardVisibility', JSON.stringify({ whrCard: false }));
    U.ls.setItem('palSmoothPasses', '20');
    U.ls.setItem('centileChartLineStyles', JSON.stringify({ axes: 3 }));
    U.ls.setItem('advHistoryCollapsed', JSON.stringify({ 'fikcyjny-pacjent': { z: 1, updatedAtISO: '2026-06-01T10:00:00.000Z' } }));
    U.ls.setItem('remindersLastShownDate', '2026-06-16');
    return U;
  }

  it('nic się nie zeruje: przed przejęciem konto czyta kopię urządzenia, po przejęciu — własną z tą samą treścią', async () => {
    const U = urzadzenieZeWspolnaKopia();
    const a = (await U.vault.createUser(HASLO_A, { label: 'Lekarz A', iterations: 10000 })).userId;
    // Odczyt zaraz po zalogowaniu (zanim przejęcie się skończy) daje dotychczasowe wartości.
    expect(U.prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({ whrCard: false });
    expect(U.prefs.readNumberPreference('PAL_SMOOTH_PASSES', 12, { min: 0, max: 50 })).toBe(20);
    expect(U.prefs.readPreferenceJSON('ADV_HISTORY_COLLAPSED', null)).toEqual({ 'fikcyjny-pacjent': { z: 1, updatedAtISO: '2026-06-01T10:00:00.000Z' } });
    expect(await przejete(U)).toBe(true);
    expect(U.ls.getItem(ZNACZNIK + a)).toBe('1');
    expect(U.prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({ whrCard: false });
    expect(U.prefs.readNumberPreference('PAL_SMOOTH_PASSES', 12, { min: 0, max: 50 })).toBe(20);
    expect(U.prefs.readPreferenceJSON('CENTILE_CHART_LINE_STYLES', null)).toEqual({ axes: 3 });
    expect(U.prefs.readPreferenceJSON('ADV_HISTORY_COLLAPSED', null)).toEqual({ 'fikcyjny-pacjent': { z: 1, updatedAtISO: '2026-06-01T10:00:00.000Z' } });
    expect(U.prefs.readModuleRaw('remindersLastShownDate', null)).toBe('2026-06-16');
    // Ustawienia widoku zostają też w kopii urządzenia (dla gościa); klucze z danymi konta z niej znikają.
    expect(U.ls.klucze()).toEqual([
      `advHistoryCollapsed::${a}`, 'cardVisibility', `cardVisibility::${a}`, 'centileChartLineStyles', `centileChartLineStyles::${a}`,
      'palSmoothPasses', `palSmoothPasses::${a}`, `remindersLastShownDate::${a}`, ZNACZNIK + a,
    ].sort());
    // Przejęcie jest kopią na urządzeniu — niczego nie dopisuje do konta ani do synchronizacji.
    await chwila();
    expect(Object.keys(await naKoncie(U))).toEqual([]);
    // Kolejne odczyty niczego już nie przenoszą: kopia urządzenia zmieniona później nie wraca do konta.
    U.ls.setItem('publicationCharts', 'true');
    expect(await przejete(U)).toBe(true);
    expect(U.prefs.readPreferenceRaw('PUBLICATION_CHARTS', null)).toBeNull();
    expect(U.ls.getItem(`publicationCharts::${a}`)).toBeNull();
  });

  it('sam odczyt ustawienia uruchamia przejęcie, gdy sejf jest odblokowany', async () => {
    const U = urzadzenieZeWspolnaKopia();
    const a = (await U.vault.createUser(HASLO_A, { label: 'Lekarz A', iterations: 10000 })).userId;
    expect(U.ls.getItem(ZNACZNIK + a)).toBeNull();
    U.prefs.readPreferenceRaw('PAL_SMOOTH_PASSES', null);
    await przejete(U);
    expect(U.ls.getItem(ZNACZNIK + a)).toBe('1');
    expect(U.ls.getItem(`cardVisibility::${a}`)).toBe(JSON.stringify({ whrCard: false }));
  });

  it('zapis zrobiony przed przejęciem zostaje — przejęcie nie nadpisuje własnej kopii konta', async () => {
    const U = urzadzenieZeWspolnaKopia();
    const a = (await U.vault.createUser(HASLO_A, { label: 'Lekarz A', iterations: 10000 })).userId;
    const widok = U.prefs.readPreferenceJSON('CARD_VISIBILITY', {});
    widok.bmiCard = false;
    expect(U.prefs.writePreferenceJSON('CARD_VISIBILITY', widok, { force: true })).toBe(true);
    await przejete(U);
    expect(U.prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({ whrCard: false, bmiCard: false });
    expect(JSON.parse(U.ls.getItem('cardVisibility'))).toEqual({ whrCard: false });
    expect(U.ls.getItem(ZNACZNIK + a)).toBe('1');
  });

  it('po przejęciu konto czyta już tylko swoje: późniejsza zmiana gościa go nie dotyczy', async () => {
    const U = urzadzenieZeWspolnaKopia();
    const a = (await U.vault.createUser(HASLO_A, { label: 'Lekarz A', iterations: 10000 })).userId;
    await przejete(U);
    await U.vault.lock();
    // Gość zmienia ustawienie urządzenia, którego konto A nie miało.
    expect(U.prefs.writePreferenceRaw('PUBLICATION_CHARTS', 'true')).toBe(true);
    expect(U.prefs.writePreferenceJSON('CARD_VISIBILITY', { whrCard: true, coleCard: false })).toBe(true);
    await U.vault.unlockUser(a, HASLO_A);
    expect(U.prefs.readPreferenceRaw('PUBLICATION_CHARTS', null)).toBeNull();
    expect(U.prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({ whrCard: false });
  });
});

describe('dwa konta na jednym urządzeniu', () => {
  async function dwaKonta() {
    const U = loadDevice();
    U.ls.setItem('cardVisibility', JSON.stringify({ whrCard: false }));
    U.ls.setItem('advHistoryCollapsed', JSON.stringify({ 'fikcyjny-pacjent-a': { z: 1 } }));
    U.ls.setItem('remindersLastShownDate', '2026-06-16');
    const a = (await U.vault.createUser(HASLO_A, { label: 'Lekarz A', iterations: 10000 })).userId;
    await przejete(U);
    return { U, a };
  }

  it('zmiana ustawień jednego lekarza nie zmienia ustawień drugiego ani gościa', async () => {
    const { U, a } = await dwaKonta();
    expect(U.prefs.writePreferenceJSON('CARD_VISIBILITY', { whrCard: false, bmiCard: false }, { force: true })).toBe(true);
    expect(U.prefs.writePreferenceRaw('GH_THERAPY_VIEW_MODE', 'delta_base', { force: true })).toBe(true);
    await chwila();
    expect(JSON.parse((await naKoncie(U)).cardVisibility.value)).toEqual({ whrCard: false, bmiCard: false });
    await U.vault.lock();
    // Gość: kopia urządzenia sprzed zmian konta A.
    expect(U.prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({ whrCard: false });
    expect(U.prefs.readPreferenceRaw('GH_THERAPY_VIEW_MODE', null)).toBeNull();
    // Lekarz B: zaczyna od ustawień urządzenia, zmian A nie widzi.
    const b = (await U.vault.createUser(HASLO_B, { label: 'Lekarz B', iterations: 10000 })).userId;
    await przejete(U);
    expect(U.prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({ whrCard: false });
    expect(U.prefs.readPreferenceRaw('GH_THERAPY_VIEW_MODE', null)).toBeNull();
    expect(U.prefs.writePreferenceJSON('CARD_VISIBILITY', { whrCard: true, planCard: false }, { force: true })).toBe(true);
    await chwila();
    expect(JSON.parse((await naKoncie(U)).cardVisibility.value)).toEqual({ whrCard: true, planCard: false });
    expect(Object.keys(await naKoncie(U))).toEqual(['cardVisibility']);
    // Wraca A: jego ustawienia są nietknięte, na koncie A też.
    await U.vault.lock();
    await U.vault.unlockUser(a, HASLO_A);
    expect(U.prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({ whrCard: false, bmiCard: false });
    expect(U.prefs.readPreferenceRaw('GH_THERAPY_VIEW_MODE', null)).toBe('delta_base');
    expect(JSON.parse((await naKoncie(U)).cardVisibility.value)).toEqual({ whrCard: false, bmiCard: false });
    expect(U.ls.klucze().filter((k) => k.startsWith('cardVisibility'))).toEqual(['cardVisibility', `cardVisibility::${a}`, `cardVisibility::${b}`].sort());
  });

  it('klucze z danymi konta: jedyne konto przejęło wspólną kopię; drugie konto nie dostaje niczego', async () => {
    const { U, a } = await dwaKonta();
    // A było jedynym kontem: zwinięcia historii i data przypomnień przeszły na nie i znikły z kopii urządzenia.
    expect(U.prefs.readPreferenceJSON('ADV_HISTORY_COLLAPSED', null)).toEqual({ 'fikcyjny-pacjent-a': { z: 1 } });
    expect(U.ls.getItem('advHistoryCollapsed')).toBeNull();
    expect(U.ls.getItem('remindersLastShownDate')).toBeNull();
    await U.vault.lock();
    await U.vault.createUser(HASLO_B, { label: 'Lekarz B', iterations: 10000 });
    await przejete(U);
    expect(U.prefs.readPreferenceJSON('ADV_HISTORY_COLLAPSED', null)).toBeNull();
    expect(U.prefs.readModuleRaw('remindersLastShownDate', null)).toBeNull();
    // B zapisuje własne — A ich nie widzi.
    expect(U.prefs.writeModuleRaw('remindersLastShownDate', '2026-06-17')).toBe(true);
    await chwila(); // zapis idzie jeszcze do sejfu (hak onPreferenceWrite)
    await U.vault.lock();
    await U.vault.unlockUser(a, HASLO_A);
    expect(U.prefs.readModuleRaw('remindersLastShownDate', null)).toBe('2026-06-16');
  });

  it('urządzenie, na którym są już dwa konta: wspólna kopia kluczy z danymi konta nie przechodzi na nikogo i znika', async () => {
    const U = loadDevice();
    const a = (await U.vault.createUser(HASLO_A, { label: 'Lekarz A', iterations: 10000 })).userId;
    await przejete(U);
    await U.vault.lock();
    const b = (await U.vault.createUser(HASLO_B, { label: 'Lekarz B', iterations: 10000 })).userId;
    await przejete(U);
    // Stan sprzed poprawki na urządzeniu współdzielonym: wspólna kopia, znaczników jeszcze nie ma.
    U.ls.removeItem(ZNACZNIK + a);
    U.ls.removeItem(ZNACZNIK + b);
    U.ls.setItem('advHistoryCollapsed', JSON.stringify({ 'pacjent-nie-wiadomo-czyj': { z: 1 } }));
    U.ls.setItem('cardCollapseState', JSON.stringify({ circCard: false }));
    expect(await przejete(U)).toBe(true);
    expect(U.prefs.readPreferenceJSON('ADV_HISTORY_COLLAPSED', null)).toBeNull();
    expect(U.ls.getItem('advHistoryCollapsed')).toBeNull();
    // Ustawienie widoku dostają oba konta (oba je dotąd widziały).
    expect(U.prefs.readPreferenceJSON('CARD_COLLAPSE_STATE', {})).toEqual({ circCard: false });
    await U.vault.lock();
    await U.vault.unlockUser(a, HASLO_A);
    await przejete(U);
    expect(U.prefs.readPreferenceJSON('CARD_COLLAPSE_STATE', {})).toEqual({ circCard: false });
    expect(U.prefs.readPreferenceJSON('ADV_HISTORY_COLLAPSED', null)).toBeNull();
  });

  it('konto zmienione w trakcie przejęcia: nic nie trafia do kopii innego konta', async () => {
    const U = loadDevice();
    U.ls.setItem('cardVisibility', JSON.stringify({ whrCard: false }));
    const a = (await U.vault.createUser(HASLO_A, { label: 'Lekarz A', iterations: 10000 })).userId;
    await U.vault.lock();
    const b = (await U.vault.createUser(HASLO_B, { label: 'Lekarz B', iterations: 10000 })).userId;
    // Lista kont odpowiada dopiero po przelogowaniu na A.
    const prawdziwa = U.vault.listUsers.bind(U.vault);
    U.okno.VildaVault = { ...U.vault, listUsers: async () => { const lista = await prawdziwa(); await U.vault.lock(); await U.vault.unlockUser(a, HASLO_A); return lista; } };
    // Odczyt ustawienia rusza przejęcie dla konta B; zanim lista kont odpowie, zalogowane jest już konto A.
    U.prefs.readPreferenceRaw('PAL_PDF_LAYOUT', null);
    for (let i = 0; i < 200 && (U.vault.getCurrentUser() || {}).userId !== a; i += 1) await new Promise((r) => { setTimeout(r, 2); });
    expect(U.vault.getCurrentUser().userId).toBe(a);
    for (let i = 0; i < 5; i += 1) await chwila();
    U.okno.VildaVault = U.vault;
    expect(U.ls.getItem(ZNACZNIK + b)).toBeNull();
    expect(U.ls.getItem(`cardVisibility::${b}`)).toBeNull();
    expect(U.ls.getItem(`cardVisibility::${a}`)).toBeNull();
    // Zalogowane konto A przejmuje normalnie przy następnej okazji.
    expect(await przejete(U)).toBe(true);
    expect(U.ls.getItem(`cardVisibility::${a}`)).toBe(JSON.stringify({ whrCard: false }));
  });
});

describe('logowanie jednorazowe na cudzym urządzeniu', () => {
  it('nie czyta, nie przejmuje i nie usuwa ustawień urządzenia gospodarza', async () => {
    const U = loadDevice();
    U.ls.setItem('cardVisibility', JSON.stringify({ whrCard: false }));
    U.ls.setItem('advHistoryCollapsed', JSON.stringify({ 'pacjent-gospodarza': { z: 1 } }));
    const gosc = (await U.vault.createUser(HASLO_B, { label: 'Lekarz jednorazowo', iterations: 10000 })).userId;
    U.prefs.setEphemeralMode(true);
    try {
      // Bez sięgania po kopię urządzenia: lekarz jednorazowy widzi ustawienia domyślne.
      expect(U.prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({});
      expect(U.prefs.readPreferenceJSON('ADV_HISTORY_COLLAPSED', null)).toBeNull();
      expect(await przejete(U)).toBe(true);
      expect(U.ls.getItem(ZNACZNIK + gosc)).toBe('1');
      expect(U.ls.klucze()).toEqual(['advHistoryCollapsed', 'cardVisibility', ZNACZNIK + gosc].sort());
      // Własne ustawienia zapisuje u siebie; kopia gospodarza zostaje.
      expect(U.prefs.writePreferenceJSON('CARD_VISIBILITY', { bmiCard: false }, { force: true })).toBe(true);
      await chwila();
      expect(JSON.parse(U.ls.getItem('cardVisibility'))).toEqual({ whrCard: false });
      expect(JSON.parse(U.ls.getItem(`cardVisibility::${gosc}`))).toEqual({ bmiCard: false });
    } finally {
      U.prefs.setEphemeralMode(false);
    }
    // Gospodarz po powrocie przejmuje swoje ustawienia normalnie.
    await U.vault.lock();
    const gospodarz = (await U.vault.createUser(HASLO_A, { label: 'Gospodarz', iterations: 10000 })).userId;
    await przejete(U);
    expect(U.prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({ whrCard: false });
    expect(U.ls.getItem(`cardVisibility::${gospodarz}`)).toBe(JSON.stringify({ whrCard: false }));
  });
});

describe('synchronizacja między urządzeniami jednego konta działa jak dotąd', () => {
  it('zapis na A trafia na konto, a po scaleniu — do kopii tego konta na B', async () => {
    const A = loadDevice();
    const utworzone = await A.vault.createUser(HASLO_A, { label: 'A', iterations: 10000 });
    const B = loadDevice();
    await B.vault.createUser(HASLO_A, { label: 'B', iterations: 10000, recoveryKey: utworzone.recoveryKey });
    expect(A.prefs.writePreferenceJSON('CARD_VISIBILITY', { whrCard: false }, { force: true })).toBe(true);
    expect(A.prefs.writePreferenceRaw('PAL_PDF_LAYOUT', 'landscape', { force: true })).toBe(true);
    await chwila();
    const wynik = await B.vault.mergeSyncPayload(await A.vault.exportSyncPayload());
    expect(wynik.updatedPreferenceCount).toBeGreaterThan(0);
    expect(B.prefs.readPreferenceJSON('CARD_VISIBILITY', {})).toEqual({ whrCard: false });
    expect(B.prefs.readPreferenceRaw('PAL_PDF_LAYOUT', null)).toBe('landscape');
    const idB = B.vault.getCurrentUser().userId;
    // Wpis z chmury idzie do kopii konta, nie do kopii urządzenia.
    expect(B.ls.klucze().filter((k) => /^(cardVisibility|palPdfLayout)/.test(k))).toEqual([`cardVisibility::${idB}`, `palPdfLayout::${idB}`]);
    // Po wylogowaniu wpis z chmury nie ma dokąd trafić.
    await B.vault.lock();
    expect(B.prefs.applyPreferenceFromCloud('advHistoryCollapsed', '{}')).toBe(false);
  });
});

describe('ulubione kody ICD-10 w preferencjach konta', () => {
  function loadFavorites() {
    const device = loadDevice(), documentEvents = new EventTarget();
    device.okno.document.addEventListener = documentEvents.addEventListener.bind(documentEvents);
    ['vilda_icd10_search.js', 'vilda_icd10_pl_data.js', 'vilda_icd10_favorites.js']
      .forEach(file => loadBrowserScript(file, device.okno));
    return { ...device, documentEvents, stars: device.okno.VildaICD10Favorites,
      catalogue: device.okno.VildaICD10Search.create(device.okno.VildaICD10PLData) };
  }
  const current = () => true;

  it('izoluje listę konta podczas wylogowania, zmiany konta i powrotu', async () => {
    const A = loadFavorites(), {stars, catalogue} = A;
    const defaults = {schemaVersion: 1, codes: ['J45.9']};
    A.ls.setItem('icd10Favorites', JSON.stringify(defaults));
    expect(stars.canUse()).toBe(false);
    expect(stars.getCodes(catalogue)).toEqual([]);
    expect(stars.toggle('J45.9', catalogue, current)).toBeNull();

    const a = (await A.vault.createUser(HASLO_A, {label: 'Fikcyjny lekarz A', iterations: 10000})).userId;
    expect(stars.canUse()).toBe(true);
    expect(stars.getCodes(catalogue)).toEqual([]);
    expect(stars.toggle('q909', catalogue, current)).toBeNull();
    expect(stars.toggle('Q90.90', catalogue, current)).toBeNull();
    expect(stars.toggle('Q90.9', catalogue, () => false)).toBeNull();
    let ownerChecks = 0;
    expect(stars.toggle('Q90.9', catalogue, () => ++ownerChecks === 1)).toBeNull();
    expect(stars.getCodes(catalogue)).toEqual([]);
    expect(stars.toggle('Q90.9', catalogue, current)).toEqual(['Q90.9']);
    expect(stars.toggle('E66.9', catalogue, current)).toEqual(['Q90.9', 'E66.9']);
    expect(A.prefs.readPreferenceJSON('ICD10_FAVORITES', null)).toEqual({schemaVersion: 1, codes: ['Q90.9', 'E66.9']});
    expect(JSON.parse(A.ls.getItem('icd10Favorites'))).toEqual(defaults);
    const seen = [];
    const unsubscribe = stars.subscribe(() => seen.push(stars.getCodes(catalogue)));
    await chwila();
    expect(JSON.parse((await naKoncie(A)).icd10Favorites.value).codes).toEqual(['Q90.9', 'E66.9']);
    await A.vault.lock();
    expect(stars.canUse()).toBe(false);
    // Even a stored session identifier cannot make a locked UI show favorites.
    A.okno.sessionStorage.setItem('vilda-vault-session-v2', JSON.stringify({userId: a}));
    expect(stars.getCodes(catalogue)).toEqual([]);
    expect(stars.toggle('E66.9', catalogue, current)).toBeNull();
    expect(seen.at(-1)).toEqual([]);
    A.okno.sessionStorage.removeItem('vilda-vault-session-v2');
    const b = (await A.vault.createUser(HASLO_B, {label: 'Fikcyjny lekarz B', iterations: 10000})).userId;
    expect(stars.getCodes(catalogue)).toEqual([]);
    expect(stars.toggle('J45.9', catalogue, current)).toEqual(['J45.9']);
    await chwila();
    expect(JSON.parse((await naKoncie(A)).icd10Favorites.value).codes).toEqual(['J45.9']);
    await A.vault.lock();
    await A.vault.unlockUser(a, HASLO_A);
    expect(stars.getCodes(catalogue)).toEqual(['Q90.9', 'E66.9']);
    expect(JSON.parse(A.ls.getItem(`icd10Favorites::${b}`))).toEqual(defaults);
    unsubscribe();
    const notifications = seen.length;
    expect(stars.toggle('Q90.9', catalogue, current)).toEqual(['E66.9']);
    await chwila();
    expect(seen).toHaveLength(notifications);
  });

  it('przenosi dodanie i usunięcie między dwoma urządzeniami po tym samym koncie i odświeża otwarty selektor', async () => {
    const A = loadFavorites(), B = loadFavorites();
    const account = await A.vault.createUser(HASLO_A, {label: 'Komputer lekarza', iterations: 10000});
    const other = await B.vault.createUser(HASLO_A, {label: 'Telefon lekarza', iterations: 10000, recoveryKey: account.recoveryKey});
    const seen = [];
    const unsubscribe = B.stars.subscribe(() => seen.push(B.stars.getCodes(B.catalogue)));
    expect(A.stars.toggle('Q90.9', A.catalogue, current)).toEqual(['Q90.9']);
    await chwila();
    expect((await naKoncie(A)).icd10Favorites?.value).toBe(JSON.stringify({schemaVersion: 1, codes: ['Q90.9']}));
    expect((await B.vault.mergeSyncPayload(await A.vault.exportSyncPayload())).updatedPreferenceCount).toBeGreaterThan(0);
    B.documentEvents.dispatchEvent(new Event('vilda:sync-merged'));
    await chwila();
    expect(seen.at(-1)).toEqual(['Q90.9']);
    expect(JSON.parse(B.ls.getItem(`icd10Favorites::${other.userId}`))).toEqual({schemaVersion: 1, codes: ['Q90.9']});
    expect(B.ls.getItem('icd10Favorites')).toBeNull();
    expect(B.stars.toggle('Q90.9', B.catalogue, current)).toEqual([]);
    await chwila();
    expect((await A.vault.mergeSyncPayload(await B.vault.exportSyncPayload())).updatedPreferenceCount).toBeGreaterThan(0);
    expect(A.stars.getCodes(A.catalogue)).toEqual([]);
    unsubscribe();
  });

  it('po wyczyszczeniu formularza pozwala zmienić ulubione tego konta, zachowując blokadę zwykłych zapisów', async () => {
    const A = loadFavorites();
    await A.vault.createUser(HASLO_A, {label: 'Fikcyjny lekarz', iterations: 10000});
    expect(A.stars.toggle('J45.9', A.catalogue, current)).toEqual(['J45.9']);
    await chwila();
    A.prefs.markClearInProgress(2500);
    expect(A.prefs.isClearInProgress()).toBe(true);
    expect(A.prefs.writePreferenceRaw('PAL_PDF_LAYOUT', 'landscape')).toBe(false);
    expect(A.stars.toggle('J45.9', A.catalogue, () => false)).toBeNull();
    expect(A.stars.toggle('J45.9', A.catalogue, current)).toEqual([]);
    expect(A.prefs.isClearInProgress()).toBe(true);
    await chwila();
    expect(JSON.parse((await naKoncie(A)).icd10Favorites.value).codes).toEqual([]);
  });

  it('ponawia przerwany przez blokadę zapis dopiero po ponownym wejściu na to samo konto', async () => {
    const A = loadFavorites(), B = loadFavorites();
    const account = await A.vault.createUser(HASLO_A, {label: 'Fikcyjny komputer', iterations: 10000});
    await B.vault.createUser(HASLO_A, {label: 'Fikcyjny telefon', iterations: 10000, recoveryKey: account.recoveryKey});
    const localKey = `vilda:icd10-favorites-pending::${account.userId}`;
    expect(A.stars.toggle('Q90.9', A.catalogue, current)).toEqual(['Q90.9']);
    await A.vault.lock('manual');
    expect(A.stars.getCodes(A.catalogue)).toEqual([]);
    expect(JSON.parse(A.ls.getItem(localKey)).codes).toEqual(['Q90.9']);

    await A.vault.createUser(HASLO_B, {label: 'Inne konto', iterations: 10000});
    expect(A.stars.getCodes(A.catalogue)).toEqual([]);
    expect((await naKoncie(A)).icd10Favorites).toBeUndefined();
    await A.vault.lock('manual');
    await A.vault.unlockUser(account.userId, HASLO_A);
    await chwila();
    expect(A.stars.getCodes(A.catalogue)).toEqual(['Q90.9']);
    const sync = await A.vault.exportSyncPayload();
    expect(JSON.parse(sync.userPreferences.icd10Favorites.value).codes).toEqual(['Q90.9']);
    expect(A.ls.getItem(localKey)).toBeNull();
    await B.vault.mergeSyncPayload(sync);
    expect(B.stars.getCodes(B.catalogue)).toEqual(['Q90.9']);
  });

  it('nie wznawia przerwanego zapisu, jeżeli kopię zastąpiła nowsza preferencja z chmury', async () => {
    const A = loadFavorites(), B = loadFavorites();
    const account = await A.vault.createUser(HASLO_A, {label: 'Fikcyjny komputer', iterations: 10000});
    await B.vault.createUser(HASLO_A, {label: 'Fikcyjny telefon', iterations: 10000, recoveryKey: account.recoveryKey});
    let remote = null;
    // The native merge uses this same adapter after it accepts a newer value.
    // Run its publication before the favorites unlock listener for this case.
    A.vault.onUnlock(() => { if (remote) A.prefs.applyPreferenceFromCloud('icd10Favorites', remote.value); });
    expect(A.stars.toggle('Q90.9', A.catalogue, current)).toEqual(['Q90.9']);
    await A.vault.lock('manual');
    expect(B.stars.toggle('E66.9', B.catalogue, current)).toEqual(['E66.9']);
    await chwila();
    const sync = await B.vault.exportSyncPayload();
    remote = sync.userPreferences.icd10Favorites;
    await A.vault.unlockUser(account.userId, HASLO_A);
    await chwila();
    expect(A.stars.getCodes(A.catalogue)).toEqual(['E66.9']);
    expect((await naKoncie(A)).icd10Favorites).toBeUndefined();
    expect(A.ls.getItem(`vilda:icd10-favorites-pending::${account.userId}`)).toBeNull();
    await A.vault.mergeSyncPayload(sync);
    expect((await naKoncie(A)).icd10Favorites).toEqual(remote);
  });
});

describe('pozostałe drogi adaptera', () => {
  it('usunięcie klucza i czyszczenie preferencji dotyczą kopii zalogowanego konta', async () => {
    const U = loadDevice();
    U.ls.setItem('cardCollapseState', JSON.stringify({ circCard: false }));
    const a = (await U.vault.createUser(HASLO_A, { label: 'Lekarz A', iterations: 10000 })).userId;
    await przejete(U);
    expect(U.prefs.removeModuleKey('CARD_COLLAPSE_STATE')).toBe(true);
    expect(U.ls.getItem(`cardCollapseState::${a}`)).toBeNull();
    expect(U.ls.getItem('cardCollapseState')).not.toBeNull();
    expect(U.prefs.writePreferenceRaw('PAL_SMOOTH_PASSES', '8', { force: true })).toBe(true);
    await chwila(); // zapis idzie jeszcze do sejfu (hak onPreferenceWrite)
    const wynik = U.prefs.clearModuleState({ scope: 'ui', includePreferences: true, dispatchEvent: false });
    expect(wynik.ok).toBe(true);
    expect(U.ls.getItem(`palSmoothPasses::${a}`)).toBeNull();
    // Bez konta czyszczenie kluczy z danymi konta niczego nie rusza i nie zgłasza błędu.
    await U.vault.lock();
    U.ls.setItem('remindersLastShownDate', '2026-06-16');
    expect(U.prefs.clearModuleState({ scope: 'reminders', includePreferences: true, dispatchEvent: false }).ok).toBe(true);
    expect(U.ls.getItem('remindersLastShownDate')).toBe('2026-06-16');
  });

  it('preferencje urządzenia i dane formularza czytają i piszą jak dotąd, także po zalogowaniu', async () => {
    const U = loadDevice();
    expect(U.prefs.writePreferenceRaw('DARK_BG_LEVEL', '2')).toBe(true);
    await U.vault.createUser(HASLO_A, { label: 'Lekarz A', iterations: 10000 });
    await przejete(U);
    expect(U.prefs.readPreferenceRaw('DARK_BG_LEVEL', null)).toBe('2');
    expect(U.prefs.writePreferenceRaw('GLASS_LEVEL', '3')).toBe(true);
    expect(U.ls.getItem('glassLevel')).toBe('3');
    expect(U.ls.getItem('darkBgLevel')).toBe('2');
  });
});
