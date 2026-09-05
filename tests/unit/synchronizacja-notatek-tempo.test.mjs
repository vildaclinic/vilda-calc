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
  const syncPull = vi.fn(() => Promise.resolve());
  const stan = { odblokowany: false };
  const rejestrator = (nazwa) => (fn) => { handlery[nazwa] = fn; };

  const vault = {
    isUnlocked: () => stan.odblokowany,
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
    VildaSync: {
      syncPush,
      syncPull,
      onSyncStart: rejestrator('syncStart'),
      onSyncComplete: rejestrator('syncComplete'),
      onSyncError: rejestrator('syncError'),
    },
  };
  win.window = win;
  win.self = win;
  win.top = win;
  loadBrowserScript('vilda_sync_integration.js', win);

  if (typeof handlery.note !== 'function') {
    throw new Error('vilda_sync_integration.js nie zarejestrował onNoteChanged');
  }
  return { handlery, syncPush, syncPull, stan, win };
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

  it('seria zapisów nie odsuwa wysyłki w nieskończoność, ale też nie zalewa workera', async () => {
    // Semantyka dławika: I() trzyma BEZWZGLĘDNY termin i nigdy nie odsuwa go w przyszłość, więc
    // pierwszy zapis z serii wychodzi po 3 s, a kolejne dołączają się do już zaplanowanej wysyłki
    // albo otwierają następne okno. Efekt jest dwustronny: nie ma zagłodzenia (dawniej pilnował
    // tego osobny sufit 10 s, dziś jest to własność samego terminu) i nie ma zalewania — z tego
    // toru nie wychodzi więcej niż jedna wysyłka na okno dławika.
    const { handlery, syncPush } = zaladujIntegracje();

    for (let i = 0; i < 9; i += 1) {
      handlery.note({ action: 'save', id: `n${i}` });
      await vi.advanceTimersByTimeAsync(1000);
      if (i === 2) {
        expect(syncPush, 'pierwszy zapis serii wychodzi po ~3 s, nie czeka na koniec serii')
          .toHaveBeenCalled();
      }
    }
    await vi.advanceTimersByTimeAsync(1200);
    const okien = Math.ceil(10200 / TOR_SZYBKI_MS);
    expect(syncPush.mock.calls.length, `nie więcej niż jedna wysyłka na okno ${TOR_SZYBKI_MS} ms`)
      .toBeLessThanOrEqual(okien);
  });

  it('inne zdarzenie synchronizacji nie odsuwa wysyłki szablonu na minutę', async () => {
    // Znalezisko z 2026-09-05: pierwsza wersja szybkiego toru dzieliła uchwyt timera `d` z torem
    // leniwym, a I() zaczyna od clearTimeout. Wystarczyło, że w ciągu tych 3 sekund padło
    // JAKIEKOLWIEK inne zdarzenie (preferencje, pacjent, lista pacjentów), żeby Pt() skasował
    // termin szablonu i ustawił 60 s. Zmierzone na scalonym kodzie: 61 s zamiast 3 s.
    // Poprawka: I() trzyma bezwzględny termin i nigdy nie odsuwa go w przyszłość.
    const { handlery, syncPush } = zaladujIntegracje();

    handlery.note({ action: 'save', id: 'n1' });
    await vi.advanceTimersByTimeAsync(1000);
    handlery.pref();

    await vi.advanceTimersByTimeAsync(TOR_SZYBKI_MS - 1100);
    expect(syncPush, 'termin szablonu nadal obowiązuje').not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncPush, 'zapis szablonu wychodzi mimo innego zdarzenia w międzyczasie')
      .toHaveBeenCalledTimes(1);
  });

  it('seria innych zdarzeń nie zagłodzi wysyłki szablonu', async () => {
    // Wariant złośliwy tego samego: bez poprawki każda kolejna zmiana pacjenta przestawiała
    // termin na 60 s od siebie. Zmierzone: 80 s przy zdarzeniach co 2 s przez 20 s.
    const { handlery, syncPush } = zaladujIntegracje();

    handlery.note({ action: 'save', id: 'n1' });
    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(2000);
      handlery.patient({ patientId: `p${i}` });
    }
    expect(syncPush, 'wysyłka szablonu poszła w pierwszych sekundach, nie po serii')
      .toHaveBeenCalled();
  });

  it('powiadomienie o zmianie nie przepada, gdy trafi w dławik pobierania', async () => {
    // Znalezisko 2026-09-05: S() (pullNow) przy dławiku 1,5 s albo przy trwającym pobraniu po
    // prostu wychodziło. Powiadomienie z gniazda, które trafiło w to okno, znikało bez śladu,
    // a najbliższe pobranie z zegara jest do 20 s później. Teraz jest odkładane, nie gubione.
    const { syncPull, stan, win } = zaladujIntegracje();
    stan.odblokowany = true;

    win.VildaSyncIntegration.pullNow();
    await vi.advanceTimersByTimeAsync(10);
    expect(syncPull, 'pierwsze powiadomienie pobiera od razu').toHaveBeenCalledTimes(1);

    win.VildaSyncIntegration.pullNow();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncPull, 'drugie trafia w dławik i jeszcze nie pobiera').toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1600);
    expect(syncPull, 'ale zostaje odłożone i wykonane po oknie dławika').toHaveBeenCalledTimes(2);
  });

  it('nieudana wysyłka jest ponawiana, a nie połykana', async () => {
    // Znalezisko 2026-09-05 po zgłoszeniu regresu kasowania: znacznik „mam coś do wysłania"
    // był zerowany PRZED wywołaniem syncPush, a wynik szedł w pusty catch. Jedno nieudane
    // żądanie — polityka workera, zerwana sieć, bramka STALE_DEVICE_GUARD po starcie sesji —
    // i zmiana nie wychodziła NIGDY, bo nic o niej nie pamiętało. Skasowanie szablonu to
    // zwykle pojedyncza, odosobniona czynność, więc trafia w to najdotkliwiej: nie ma
    // kolejnej zmiany, która przypadkiem zabrałaby ją ze sobą.
    const { handlery, syncPush } = zaladujIntegracje();
    syncPush.mockImplementation(() => Promise.reject(new Error('sieć padła')));

    handlery.note({ action: 'delete', id: 'n1' });
    await vi.advanceTimersByTimeAsync(TOR_SZYBKI_MS + 100);
    expect(syncPush, 'pierwsza próba').toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2100);
    expect(syncPush, 'ponowienie po ~2 s').toHaveBeenCalledTimes(2);

    syncPush.mockImplementation(() => Promise.resolve());
    await vi.advanceTimersByTimeAsync(4100);
    expect(syncPush, 'trzecia próba dochodzi do skutku').toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(60000);
    expect(syncPush, 'po sukcesie nic się już nie ponawia').toHaveBeenCalledTimes(3);
  });

  it('ponawianie ma koniec — nie kręci się w nieskończoność', async () => {
    const { handlery, syncPush } = zaladujIntegracje();
    syncPush.mockImplementation(() => Promise.reject(new Error('worker niedostępny')));

    handlery.note({ action: 'save', id: 'n1' });
    await vi.advanceTimersByTimeAsync(300000);
    expect(syncPush.mock.calls.length, 'skończona liczba prób').toBeLessThanOrEqual(6);
    expect(syncPush.mock.calls.length, 'ale więcej niż jedna').toBeGreaterThan(1);
  });

  it('STALE_DEVICE_GUARD natychmiast pobiera, zamiast czekać na ślepy traf', async () => {
    // Sejf wstrzymuje KAŻDĄ wysyłkę, dopóki w tej sesji przeglądarki nie zakończyło się ani
    // jedno pobranie (STALE_DEVICE_GUARD w syncPush). Przy dawnym terminie 60 s pierwsze
    // pobranie zawsze zdążyło. Po przyspieszeniu do 3 s wysyłka potrafi je wyprzedzić —
    // i wtedy jedyną nadzieją jest to, że pobranie z zegara trafi się przed wyczerpaniem
    // ponowień. Kod obsługuje teraz ten przypadek wprost: pobiera natychmiast.
    const { handlery, syncPull, stan } = zaladujIntegracje();
    stan.odblokowany = true;

    expect(typeof handlery.syncError, 'integracja rejestruje onSyncError').toBe('function');
    handlery.syncError({ code: 'STALE_DEVICE_GUARD', message: 'wstrzymano wysyłkę' });
    await vi.advanceTimersByTimeAsync(50);

    expect(syncPull, 'odpowiedzią na tę bramkę jest pobranie, nie cisza').toHaveBeenCalled();
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
