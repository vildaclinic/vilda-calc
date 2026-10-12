import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-NOWE-URZADZENIE (decyzja właściciela 2026-10-12, etap 1). Zgłoszenie: koleżanka właściciela logowała się
// pierwszy raz na komputerze w pracy (konto PRO, dane z telefonu w chmurze). Na pytaniu „Pobierz dane z serwera”
// kliknęła baner aktualizacji; karta się przeładowała, pytanie zniknęło, a baza pacjentów się nie pobrała.
//
// Przyczyna w vilda_sync_integration.js: znaczniki w sessionStorage szły PRZED odpowiedzią — vilda-probe-done-v1
// przed sondowaniem serwera, vilda-new-device-restore-shown-v1 w chwili pokazania pytania. sessionStorage
// przeżywa przeładowanie, sesja sejfu też (wraca zalogowana), więc po przeładowaniu znaczniki blokowały i pytanie,
// i pobranie, a synchronizacja zostawała wyłączona. Zmierzone na kodzie sprzed zmiany: drugi przypadek niżej
// („pytanie wraca po przeładowaniu”) nie przechodził — po przeładowaniu sonda nie szła wcale.
//
// Prawdziwy vilda_sync_integration.js z wirtualnym zegarem (wzór: synchronizacja-straznik). Sejf i VildaSync to
// atrapy; serwera synchronizacji nie ma w repozytorium. Dane wyłącznie fikcyjne.

const ZDARZENIE = 'vilda:new-device-restore-available';
const ODPOWIEDZ = 'vilda-new-device-restore-shown-v1';
const SONDA = 'vilda-probe-done-v1';

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

/* Obietnica do rozstrzygnięcia z testu — „trwające” pobranie albo sonda. */
function odroczona() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * Jedno „załadowanie strony”: świeży dokument, te same magazyny (localStorage i sessionStorage przeżywają
 * przeładowanie karty). Sejf odblokowuje się jak po odtworzeniu sesji — wołamy zarejestrowany onUnlock.
 */
function zaladujStrone({ localStorage, sessionStorage, sonda, syncFull, chmurowy = false, osadzona = false, syncPull } = {}) {
  const handlery = {};
  const zdarzenia = [];
  const rejestrator = (nazwa) => (fn) => { handlery[nazwa] = fn; };
  let odblokowany = false;
  const vault = {
    isUnlocked: () => odblokowany,
    isCloudOnlyMode: () => chmurowy,
    canWarmStartCloudOnly: () => Promise.resolve(false),
    onUnlock: rejestrator('unlock'),
    onLock: rejestrator('lock'),
    onNoteChanged: rejestrator('note'),
    onPatientSaved: rejestrator('patient'),
    onPatientDeleted: rejestrator('patientDeleted'),
    onPreferenceChanged: rejestrator('pref'),
    onPasskeyChanged: rejestrator('passkey'),
    onCredentialChanged: rejestrator('credential'),
    onPatientNoteChanged: rejestrator('patientNote'),
    onPatientListChanged: rejestrator('patientList'),
    getSyncMaterial: () => Promise.resolve({ slotId: 'a'.repeat(64), authToken: 'TOKEN' }),
  };
  const sync = {
    syncPush: vi.fn(() => Promise.resolve()),
    syncPull: syncPull || vi.fn(() => Promise.resolve({ action: 'up-to-date' })),
    syncFull: syncFull || vi.fn(() => Promise.resolve({})),
    probeNewDevice: sonda || vi.fn(() => Promise.resolve({ isNewDevice: false, lastModified: null })),
    onSyncStart: rejestrator('syncStart'),
    onSyncComplete: rejestrator('syncComplete'),
    onSyncError: rejestrator('syncError'),
  };
  const win = {
    localStorage,
    sessionStorage,
    navigator: {},
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    setInterval: (...a) => setInterval(...a),
    clearInterval: (...a) => clearInterval(...a),
    addEventListener() {},
    removeEventListener() {},
    document: {
      hidden: false,
      documentElement: { classList: { contains: (k) => osadzona && k === 'vilda-embedded' } },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: (e) => { zdarzenia.push({ type: e.type, detail: e.detail }); return true; },
    },
    VildaVault: vault,
    VildaSync: sync,
  };
  if (osadzona) win.BroadcastChannel = class { addEventListener() {} postMessage() {} };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync_integration.js', win);
  if (typeof handlery.unlock !== 'function') throw new Error('integracja nie zarejestrowała onUnlock');
  const odblokuj = () => { odblokowany = true; handlery.unlock({ userId: 'u-fikcyjny', trigger: 'restore' }); };
  const pytania = () => zdarzenia.filter((e) => e.type === ZDARZENIE);
  return { win, sync, odblokuj, pytania, start: () => win.VildaSyncIntegration.isStartupSyncInProgress() };
}

describe('Pytanie „Pobierz dane z serwera” przeżywa przeładowanie karty', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('nowe urządzenie: zdarzenie pytania idzie, ale żaden znacznik sesji nie powstaje przed odpowiedzią', async () => {
    const magazyny = { localStorage: magazyn(), sessionStorage: magazyn() };
    const sonda = vi.fn(() => Promise.resolve({ isNewDevice: true, lastModified: '2026-10-11T08:00:00.000Z' }));
    const s = zaladujStrone({ ...magazyny, sonda });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(700);

    expect(sonda).toHaveBeenCalledTimes(1);
    expect(s.pytania()).toEqual([{ type: ZDARZENIE, detail: { lastModified: '2026-10-11T08:00:00.000Z' } }]);
    expect(magazyny.sessionStorage.getItem(ODPOWIEDZ), 'odpowiedź stawia dopiero okno pytania').toBeNull();
    expect(magazyny.sessionStorage.getItem(SONDA), 'sonda bez wyniku „nie nowe” nie jest odhaczana').toBeNull();
    expect(s.sync.syncFull, 'bez odpowiedzi i bez włączonej synchronizacji nic się nie pobiera').not.toHaveBeenCalled();
  });

  it('pytanie wraca po przeładowaniu, dopóki nie ma odpowiedzi (scenariusz zgłoszenia)', async () => {
    const magazyny = { localStorage: magazyn(), sessionStorage: magazyn() };
    const sonda = vi.fn(() => Promise.resolve({ isNewDevice: true, lastModified: '2026-10-11T08:00:00.000Z' }));
    const przed = zaladujStrone({ ...magazyny, sonda });
    przed.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(przed.pytania()).toHaveLength(1);

    // „Aktualizuj” na banerze → przeładowanie: ten sam sessionStorage, sesja odtworzona.
    const po = zaladujStrone({ ...magazyny, sonda });
    po.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(sonda, 'po przeładowaniu sonda idzie ponownie').toHaveBeenCalledTimes(2);
    expect(po.pytania(), 'pytanie wraca').toHaveLength(1);
  });

  it('po odpowiedzi w tej karcie nie pyta znowu; z włączoną synchronizacją wznawia pobieranie (przeładowanie w trakcie)', async () => {
    const magazyny = {
      localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }),
      sessionStorage: magazyn({ [ODPOWIEDZ]: '1' }), // okno pytania: „Pobierz dane z serwera”
    };
    const sonda = vi.fn(() => Promise.resolve({ isNewDevice: true, lastModified: null }));
    const s = zaladujStrone({ ...magazyny, sonda });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(sonda).not.toHaveBeenCalled();
    expect(s.pytania()).toHaveLength(0);
    expect(s.sync.syncFull).toHaveBeenCalledTimes(1);
  });

  it('po „Zacznij od nowa” (odpowiedź, synchronizacja wyłączona) przeładowanie niczego nie pobiera i nie pyta', async () => {
    const magazyny = { localStorage: magazyn(), sessionStorage: magazyn({ [ODPOWIEDZ]: '1' }) };
    const sonda = vi.fn(() => Promise.resolve({ isNewDevice: true, lastModified: null }));
    const s = zaladujStrone({ ...magazyny, sonda });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(sonda).not.toHaveBeenCalled();
    expect(s.pytania()).toHaveLength(0);
    expect(s.sync.syncFull).not.toHaveBeenCalled();
  });

  it('kontrola: urządzenie zsynchronizowane — znacznik sondy po wyniku, pobranie przy włączonej synchronizacji, bez ponownej sondy', async () => {
    const magazyny = { localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }), sessionStorage: magazyn() };
    const sonda = vi.fn(() => Promise.resolve({ isNewDevice: false, lastModified: null }));
    const s = zaladujStrone({ ...magazyny, sonda });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(s.pytania()).toHaveLength(0);
    expect(magazyny.sessionStorage.getItem(SONDA)).toBe('1');
    expect(s.sync.syncFull).toHaveBeenCalledTimes(1);

    const po = zaladujStrone({ ...magazyny, sonda });
    po.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(sonda, 'jedna sonda na kartę, jak dotąd').toHaveBeenCalledTimes(1);
    expect(po.sync.syncFull).toHaveBeenCalledTimes(1);
  });

  it('kontrola: ramka panelu powłoki (?embedded=1) nie sonduje — robi to dokument najwyższego poziomu', async () => {
    const magazyny = { localStorage: magazyn(), sessionStorage: magazyn() };
    const sonda = vi.fn(() => Promise.resolve({ isNewDevice: true, lastModified: null }));
    const s = zaladujStrone({ ...magazyny, sonda, osadzona: true });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(sonda).not.toHaveBeenCalled();
    expect(s.start()).toBe(false);
  });
});

describe('isStartupSyncInProgress: start synchronizacji po odblokowaniu (bramka banera aktualizacji)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('trwa od odblokowania przez sondę i syncFull; kończy się po rozstrzygnięciu pobrania', async () => {
    const magazyny = { localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }), sessionStorage: magazyn() };
    const sondaTrwa = odroczona();
    const pobranieTrwa = odroczona();
    const s = zaladujStrone({
      ...magazyny,
      sonda: vi.fn(() => sondaTrwa.promise),
      syncFull: vi.fn(() => pobranieTrwa.promise),
    });
    expect(s.start(), 'przed odblokowaniem').toBe(false);
    s.odblokuj();
    expect(s.start(), 'odstęp 600 ms przed sondą').toBe(true);
    await vi.advanceTimersByTimeAsync(700);
    expect(s.start(), 'sonda w toku').toBe(true);
    sondaTrwa.resolve({ isNewDevice: false, lastModified: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.sync.syncFull).toHaveBeenCalledTimes(1);
    expect(s.start(), 'syncFull w toku').toBe(true);
    pobranieTrwa.reject(new Error('fikcyjny błąd sieci'));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.start(), 'po błędzie pobrania też koniec').toBe(false);
  });

  it('nowe urządzenie: kończy się po zgłoszeniu pytania — dalej baner wstrzymuje okno pytania', async () => {
    const magazyny = { localStorage: magazyn(), sessionStorage: magazyn() };
    const s = zaladujStrone({ ...magazyny, sonda: vi.fn(() => Promise.resolve({ isNewDevice: true, lastModified: null })) });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(s.pytania()).toHaveLength(1);
    expect(s.start()).toBe(false);
  });

  it('tryb chmurowy: trwa do końca pobrania z chmury', async () => {
    const magazyny = { localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }), sessionStorage: magazyn() };
    const pobranieTrwa = odroczona();
    const s = zaladujStrone({ ...magazyny, chmurowy: true, syncPull: vi.fn(() => pobranieTrwa.promise) });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.sync.syncPull).toHaveBeenCalledTimes(1);
    expect(s.start()).toBe(true);
    pobranieTrwa.resolve({ action: 'merged' });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.start()).toBe(false);
  });

  it('sufit 5 min: zawieszona obietnica nie trzyma banera w nieskończoność', async () => {
    const magazyny = { localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }), sessionStorage: magazyn() };
    const s = zaladujStrone({ ...magazyny, sonda: vi.fn(() => new Promise(() => {})) });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(s.start()).toBe(true);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(s.start()).toBe(false);
  });
});
