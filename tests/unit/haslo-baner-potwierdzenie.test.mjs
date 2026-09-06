import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// U2b: zmiana hasła jest zdarzeniem bezpieczeństwa, a sygnalizowaliśmy ją etykietą w karcie
// Ustawień — na urządzeniu zmieniającym łatwą do przeoczenia, a na urządzeniach odbierających
// widoczną dopiero wtedy, gdy ktoś sam wejdzie w sekcję konta. Teraz obie strony dostają
// modal z wymaganym potwierdzeniem.
//
// Warstwy, które muszą się zgadzać, żeby modal w ogóle miał szansę się pokazać:
//  1. sejf po scaleniu cudzej koperty MUSI wystawić zdarzenie (bez tego warstwa UI nie wie nic
//     poza tym, co sama odczyta przy starcie),
//  2. urządzenie źródłowe NIE MOŻE zobaczyć własnej koperty jako cudzej zmiany,
//  3. zdalna zmiana nie może udawać lokalnej i wyzwalać wysyłki z powrotem na serwer.
//
// Punkt 1 to dokładnie ta klasa błędu, na którą wpadliśmy przy U2: ładunek i scalanie działały,
// a nikt nie mierzył ogniwa, które to uruchamia.

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function loadDevice() {
  const win = {
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  const adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  vault.__adapter = adapter;
  vault.__win = win;
  return vault;
}

const ITER = 10000;
let licznik = 0;

async function paraUrzadzen(haslo) {
  licznik += 1;
  const A = loadDevice();
  const utworzone = await A.createUser(haslo, { label: `A${licznik}`, iterations: ITER });
  const B = loadDevice();
  await B.createUser(haslo, {
    label: `B${licznik}`, iterations: ITER, recoveryKey: utworzone.recoveryKey,
  });
  return { A, B, recoveryKey: utworzone.recoveryKey };
}

// Nasłuch zbiera zdarzenia zamiast je zliczać — asercja ma pokazać, CO przyszło, a nie tylko ile.
function nasluch(vault) {
  const zebrane = [];
  vault.onCredentialChanged((zdarzenie) => { zebrane.push(zdarzenie); });
  return zebrane;
}

const meta = async (v) => v.__adapter.getUserMeta(v.getCurrentUser().userId);

describe('sejf sygnalizuje zmianę hasła obu stronom', () => {
  it('urządzenie zmieniające dostaje zdarzenie o własnej zmianie', async () => {
    // Kontrola dodatnia: ta ścieżka działała już wcześniej (to na niej stoi wyzwalacz wysyłki).
    const STARE = 'Stare#Haslo!2026ba';
    const NOWE = 'Nowe#Haslo!2026bb1';
    const A = loadDevice();
    await A.createUser(STARE, { label: 'A', iterations: ITER });
    const zdarzenia = nasluch(A);

    await A.changePassword(STARE, NOWE);

    expect(zdarzenia.map((z) => z.action)).toEqual(['password-changed']);
    expect(zdarzenia[0].updatedAtISO, 'zdarzenie niesie znacznik zmiany')
      .toBe((await meta(A)).passwordUpdatedAtISO);
  });

  it('urządzenie odbierające dostaje zdarzenie po scaleniu cudzej koperty', async () => {
    // To jest ogniwo, którego brak sprawiał, że urządzenie B mogło przyjąć nowe hasło
    // i nic o tym nie powiedzieć aż do chwili, gdy ktoś sam otworzy sekcję konta.
    const STARE = 'Stare#Haslo!2026bc';
    const NOWE = 'Nowe#Haslo!2026bd2';
    const { A, B } = await paraUrzadzen(STARE);
    const zdarzenia = nasluch(B);

    await A.changePassword(STARE, NOWE);
    await B.mergeSyncPayload(await A.exportSyncPayload());

    expect(zdarzenia.map((z) => z.action)).toEqual(['password-changed-remotely']);
    expect(zdarzenia[0].updatedAtISO, 'modal pokazuje datę zmiany, więc musi ją dostać')
      .toBe((await meta(A)).passwordUpdatedAtISO);
  });

  it('urządzenie źródłowe nie bije na alarm własną kopertą', async () => {
    // Kontrola negatywna. A wysyła swoją kopertę i dostaje ją z powrotem przy następnym
    // scaleniu — gdyby to liczyło się jako cudza zmiana, lekarz dostawałby ostrzeżenie
    // o włamaniu za każdym razem, kiedy sam zmieni hasło.
    const STARE = 'Stare#Haslo!2026be';
    const NOWE = 'Nowe#Haslo!2026bf3';
    const A = loadDevice();
    await A.createUser(STARE, { label: 'A', iterations: ITER });
    await A.changePassword(STARE, NOWE);

    const zdarzenia = nasluch(A);
    await A.mergeSyncPayload(await A.exportSyncPayload());

    expect(zdarzenia, 'własna koperta wraca bez sygnału').toEqual([]);
  });

  it('starsza koperta z zapóźnionego urządzenia też nie budzi alarmu', async () => {
    // Druga kontrola negatywna: B ma nowsze hasło, A przysyła stan sprzed zmiany.
    const STARE = 'Stare#Haslo!2026bg';
    const NOWE = 'Nowe#Haslo!2026bh4';
    const { A, B } = await paraUrzadzen(STARE);
    const stary = await A.exportSyncPayload();

    await B.changePassword(STARE, NOWE);
    const zdarzenia = nasluch(B);
    await B.mergeSyncPayload(stary);

    expect(zdarzenia, 'przeterminowana koperta jest odrzucana po cichu').toEqual([]);
  });

  it('odzyskanie hasła kluczem zapasowym też jest sygnalizowane', async () => {
    const STARE = 'Stare#Haslo!2026bi';
    const NOWE = 'Nowe#Haslo!2026bj5';
    const v = loadDevice();
    const utworzone = await v.createUser(STARE, { label: 'A', iterations: ITER });
    await v.unlockUserWithRecoveryKey(v.getCurrentUser().userId, utworzone.recoveryKey);
    const zdarzenia = nasluch(v);

    await v.resetPasswordWhileUnlocked(NOWE);

    expect(zdarzenia.map((z) => z.action)).toEqual(['password-reset']);
  });
});

const zrodlo = (n) => readFileSync(path.join(repoRoot, n), 'utf8')
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

describe('modal potwierdzenia jest wpięty w warstwę logowania', () => {
  // `vilda_auth_ui.js` ładuje się na wszystkich ośmiu stronach aplikacji, więc modal ma
  // jedno miejsce zamieszkania i nie trzeba go powielać per strona.
  const s = () => zrodlo('vilda_auth_ui.js');

  it('nasłuchuje zdarzeń o poświadczeniach', () => {
    expect(s(), 'bez rejestracji nasłuchu modal nigdy nie zobaczy zdalnej zmiany')
      .toContain('onCredentialChanged');
  });

  it('ma osobny komunikat dla urządzenia zmieniającego i odbierającego', () => {
    const t = s();
    expect(t).toContain('Hasło zmienione dla całego konta');
    expect(t).toContain('Hasło do konta zostało zmienione');
    expect(t, 'urządzenie zmieniające musi wiedzieć, czego zmiana hasła NIE robi')
      .toContain('logowaniem biometrycznym wchodzi do konta bez hasła');
    expect(t, 'urządzenie odbierające dostaje sygnał bezpieczeństwa')
      .toContain('Jeśli to nie była Twoja zmiana:');
  });

  it('daje przycisk „Wyloguj wszystkie urządzenia" wprost w modalu', () => {
    const t = s();
    expect(t).toContain('Wyloguj wszystkie urządzenia');
    expect(t, 'przycisk prowadzi do sekcji konta, gdzie stoi pełna procedura z nowym kluczem')
      .toContain('settings-section-account');
    expect(t, 'i od razu ustawia kursor w polu potwierdzenia hasłem')
      .toContain('revokeDevicesPwInput');
  });

  it('potwierdzenie gasi sygnał, więc modal nie wraca po przeładowaniu', () => {
    const t = s();
    expect(t).toContain('PASSWORD_CHANGED_REMOTELY_AT');
    expect(t, 'sygnał kasuje wyłącznie potwierdzenie').toContain('"PASSWORD_CHANGED_REMOTELY_AT",""');
  });

  it('sprawdza zaległy sygnał także wtedy, gdy zmiana przyszła przy zamkniętej aplikacji', () => {
    expect(s(), 'po odblokowaniu sejfu czytamy ślad zapisany przy poprzedniej sesji')
      .toContain('qi(),je(),Grb()');
  });
});

describe('modal nie wchodzi w konflikt z nawigacją mobilną', () => {
  const css = () => readFileSync(path.join(repoRoot, 'vilda_auth_ui.css'), 'utf8');

  it('chowa dock i strzałkę nawigacyjną na czas modala', () => {
    const t = css();
    expect(t, 'dock stoi na dole ekranu dokładnie tam, gdzie przyciski modala')
      .toMatch(/body\.vilda-password-alert-open #mobileBottomDock/);
    expect(t, 'strzałka „do góry" siedzi nad dockiem i też by nachodziła')
      .toMatch(/body\.vilda-password-alert-open #scrollTopBtn/);
  });

  it('zostawia miejsce na pasek gestów iPhone’a', () => {
    expect(css(), 'bez tego przycisk „Rozumiem" ląduje pod wskaźnikiem home')
      .toContain('padding-bottom:calc(28px + env(safe-area-inset-bottom,0px))');
  });

  it('długa treść przewija się w środku, a nie rozpycha ekranu', () => {
    expect(css()).toMatch(/\.vilda-auth-sheet-password\{[^}]*overflow-y:auto/);
  });
});
