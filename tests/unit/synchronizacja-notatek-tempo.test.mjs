import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Zgłoszenie właściciela 2026-09-04: „synchronizacja notatek działa, ale bardzo wolno" —
// stałe 60–70 sekund od zapisu szablonu na jednym urządzeniu do pojawienia się na drugim.
//
// Przyczyna zmierzona w kodzie: biblioteka szablonów jako JEDYNA nie miała szybkiego toru wysyłki.
// Pacjenci i notatki pacjenta obok planowania pełnej wysyłki lecą natychmiastową deltą przez
// sendBeacon (gt, At, Bt, Ut); onNoteChanged wołał wyłącznie m({delay}). A m() w trybie
// przyrostowym (domyślnym, `_t()` zwraca prawdę) IGNORUJE delay i immediate i wpada w Pt(),
// czyli I(6e4) — 60 sekund, z czego I() zaczyna od clearTimeout, więc każda kolejna zmiana
// odliczała minutę od nowa. Deklarowane w kodzie 300 ms było martwe.
//
// Test ładuje PRAWDZIWY vilda_sync_integration.js do sztucznego okna z zegarem wirtualnym
// i mierzy, po ilu milisekundach od zdarzenia leci syncPush(). Kontrola negatywna pilnuje,
// żeby poprawka nie przyspieszyła WSZYSTKIEGO — pozostałe zdarzenia mają zostać na leniwym
// liczniku, bo one mają własny szybki tor i pełny blob jest dla nich tylko uzgodnieniem.

const TOR_SZYBKI_MS = 3000;
const SUFIT_MS = 10000;
const TOR_LENIWY_MS = 60000;

function makeStorage(seed) {
  const m = Object.assign(Object.create(null), seed || {});
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function zaladujIntegracje() {
  const handlery = {};
  const syncPush = vi.fn(() => Promise.resolve());
  const rejestrator = (nazwa) => (fn) => { handlery[nazwa] = fn; };

  const vault = {
    isUnlocked: () => false,
    isCloudOnlyMode: () => false,
    onUnlock: rejestrator('unlock'),
    onLock: rejestrator('lock'),
    onNoteChanged: rejestrator('note'),
    onPatientSaved: rejestrator('patient'),
    onPatientDeleted: rejestrator('patientDeleted'),
    onPreferenceChanged: rejestrator('pref'),
    onPasskeyChanged: rejestrator('passkey'),
    onPatientNoteChanged: rejestrator('patientNote'),
    onPatientListChanged: rejestrator('patientList'),
  };

  const win = {
    localStorage: makeStorage({ 'vilda-sync-enabled-v1': 'true' }),
    sessionStorage: makeStorage(),
    navigator: {},
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    setInterval: (...a) => setInterval(...a),
    clearInterval: (...a) => clearInterval(...a),
    addEventListener() {},
    removeEventListener() {},
    document: {
      addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, hidden: false,
    },
    VildaVault: vault,
    VildaSync: { syncPush },
  };
  win.window = win;
  win.self = win;
  win.top = win;
  loadBrowserScript('vilda_sync_integration.js', win);

  if (typeof handlery.note !== 'function') {
    throw new Error('vilda_sync_integration.js nie zarejestrował onNoteChanged');
  }
  return { handlery, syncPush };
}

describe('tempo wysyłki po zmianie szablonu w bibliotece Notatek', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('zapis szablonu wychodzi z urządzenia w sekundach, nie po minucie', async () => {
    const { handlery, syncPush } = zaladujIntegracje();

    handlery.note({ action: 'save', id: 'n1' });

    await vi.advanceTimersByTimeAsync(TOR_SZYBKI_MS - 100);
    expect(syncPush, 'dławik ma zdążyć skleić serię zapisów').not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(syncPush, `zapis szablonu leci po ~${TOR_SZYBKI_MS} ms, nie po ${TOR_LENIWY_MS} ms`)
      .toHaveBeenCalledTimes(1);
  });

  it('skasowanie szablonu idzie tym samym szybkim torem', async () => {
    const { handlery, syncPush } = zaladujIntegracje();

    handlery.note({ action: 'delete', id: 'n1' });
    await vi.advanceTimersByTimeAsync(TOR_SZYBKI_MS + 100);
    expect(syncPush).toHaveBeenCalledTimes(1);
  });

  it('seria zapisów nie odsuwa wysyłki w nieskończoność — sufit od pierwszej zmiany', async () => {
    // I() zaczyna od clearTimeout, więc bez sufitu wystarczyłoby zapisywać częściej niż co
    // 3 sekundy, żeby wysyłka nie wyszła nigdy. Sufit liczy się od PIERWSZEJ niewysłanej zmiany.
    const { handlery, syncPush } = zaladujIntegracje();

    for (let i = 0; i < 9; i += 1) {
      handlery.note({ action: 'save', id: `n${i}` });
      await vi.advanceTimersByTimeAsync(1000);
      if (i < 8) {
        expect(syncPush, `po ${(i + 1) * 1000} ms serii wysyłka jeszcze czeka`).not.toHaveBeenCalled();
      }
    }
    await vi.advanceTimersByTimeAsync(1200);
    expect(syncPush, `sufit ${SUFIT_MS} ms domyka serię`).toHaveBeenCalled();
  });

  it('KONTROLA NEGATYWNA: pozostałe zdarzenia zostają na leniwym liczniku', async () => {
    // Pacjenci i notatki pacjenta mają własną natychmiastową deltę, więc pełny blob jest dla
    // nich tylko okresowym uzgodnieniem. Gdyby poprawka przyspieszyła i je, każda zmiana
    // pacjenta wysyłałaby cały sejf co kilka sekund — prosta droga do limitu 429.
    const { handlery, syncPush } = zaladujIntegracje();

    handlery.pref();
    await vi.advanceTimersByTimeAsync(TOR_SZYBKI_MS + 2000);
    expect(syncPush, 'zmiana preferencji NIE ma jechać szybkim torem').not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(TOR_LENIWY_MS);
    expect(syncPush, 'ale po leniwym terminie ma w końcu wyjść').toHaveBeenCalled();
  });
});
