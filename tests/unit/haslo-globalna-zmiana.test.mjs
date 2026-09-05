import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// U2 z audytu sekcji „Ustawienia": zmiana hasła obowiązywała TYLKO na urządzeniu, które ją
// wykonało. `changePassword` przepakowuje klucz główny pod nowym hasłem i zapisuje wynik do
// lokalnego `userMeta`; `passwordSalt` i `encryptedMasterByPassword` nigdy nie wchodziły do
// `exportSyncPayload` ani nie były scalane. Na drugim urządzeniu dalej działało STARE hasło —
// przy zmianie motywowanej podejrzeniem wycieku to jest fałszywe poczucie zamknięcia sprawy.
//
// Teraz koperta hasła (sól + iteracje + zaszyfrowany klucz główny) jedzie w ładunku
// synchronizacji. Ładunek jest szyfrowany kluczem głównym, więc serwer nadal widzi wyłącznie
// szyfrogram, a urządzenie, które potrafi go odczytać, i tak ma już klucz główny.
//
// Rzeczy, których te testy pilnują szczególnie, bo błąd oznacza sejf nie do otwarcia:
//  - trójka jest niepodzielna (sól z jednej wersji + szyfrogram z innej = klucz nie do odzyskania);
//  - `kdfIterations` klucza ODZYSKIWANIA nie może zostać nadpisane iteracjami hasła;
//  - ścieżki odtworzenia konta (QR, kod zapasowy, passkey, plik .wiw) NIE rozsyłają swojej
//    koperty — inaczej narzuciłyby całemu kontu hasło tymczasowe z jednego urządzenia.

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

// Dwa urządzenia tego samego konta: B odtwarza konto z ładunku A, jak przy pierwszym
// logowaniu na nowym sprzęcie.
async function paraUrzadzen(haslo) {
  licznik += 1;
  const A = loadDevice();
  const utworzone = await A.createUser(haslo, { label: `A${licznik}`, iterations: ITER });
  const B = loadDevice();
  await B.createUser(haslo, {
    label: `B${licznik}`,
    iterations: ITER,
    recoveryKey: utworzone.recoveryKey,
  });
  return { A, B, recoveryKey: utworzone.recoveryKey };
}

const meta = async (v) => v.__adapter.getUserMeta(v.getCurrentUser().userId);

async function otworzPonownie(v, haslo) {
  const userId = v.getCurrentUser().userId;
  v.lock();
  await v.unlockUser(userId, haslo);
  return true;
}

describe('globalna zmiana hasła', () => {
  it('nowe hasło działa na drugim urządzeniu, stare przestaje', async () => {
    const STARE = 'Stare#Haslo!2026aa';
    const NOWE = 'Nowe#Haslo!2026bb';
    const { A, B } = await paraUrzadzen(STARE);

    await A.changePassword(STARE, NOWE);
    const ladunek = await A.exportSyncPayload();
    const wynik = await B.mergeSyncPayload(ladunek);

    // Najpierw zachowanie, dopiero potem kształt ładunku: to zachowanie było zepsute
    // i to na nim ma padać pomiar na kodzie sprzed poprawki.
    await expect(otworzPonownie(B, NOWE), 'B otwiera się NOWYM hasłem').resolves.toBe(true);
    await expect(otworzPonownie(B, STARE), 'B NIE otwiera się starym').rejects.toThrow();

    expect(ladunek.credential, 'koperta jedzie w ładunku').toBeTruthy();
    expect(wynik.credentialUpdated, 'scalanie zgłasza przyjęcie koperty').toBe(true);
  });

  it('klucz odzyskiwania działa po przyjęciu cudzej koperty', async () => {
    // Iteracje KDF są wspólne dla koperty hasła i koperty klucza odzyskiwania. Gdyby przyjęcie
    // koperty hasła nadpisało `kdfIterations`, zabrałoby użytkownikowi ostatnią drogę wejścia.
    const STARE = 'Stare#Haslo!2026cc';
    const NOWE = 'Nowe#Haslo!2026dd';
    const { A, B, recoveryKey } = await paraUrzadzen(STARE);

    await A.changePassword(STARE, NOWE);
    await B.mergeSyncPayload(await A.exportSyncPayload());

    const userId = B.getCurrentUser().userId;
    B.lock();
    await expect(B.unlockUserWithRecoveryKey(userId, recoveryKey),
      'klucz odzyskiwania nietknięty').resolves.toBeTruthy();
  });

  it('spóźniona koperta nie cofa nowszej zmiany hasła', async () => {
    const P1 = 'Pierwsze#Haslo!26ee';
    const P2 = 'Drugie#Haslo!26fff';
    const P3 = 'Trzecie#Haslo!26gg';
    const { A, B } = await paraUrzadzen(P1);

    await A.changePassword(P1, P2);
    const stary = await A.exportSyncPayload();

    await new Promise((r) => { setTimeout(r, 5); });
    await B.mergeSyncPayload(stary);
    await B.changePassword(P2, P3);

    const wynik = await B.mergeSyncPayload(stary);
    expect(wynik.credentialUpdated, 'starsza koperta odrzucona').toBe(false);
    await expect(otworzPonownie(B, P3), 'nowsze hasło zostaje').resolves.toBe(true);
  });

  it('znacznik zmiany nie może być starszy niż poprzedni mimo cofniętego zegara', async () => {
    // Ta sama pułapka co przy nagrobkach notatek w 1.0.832: dwie sekundy różnicy zegarów
    // wystarczyły, żeby świeża zmiana przegrała ze starszą. Tutaj cofnęłaby hasło.
    const P1 = 'Pierwsze#Haslo!26hh';
    const P2 = 'Drugie#Haslo!26iii';
    const A = loadDevice();
    await A.createUser(P1, { label: 'zegar', iterations: ITER });

    const przed = await meta(A);
    const PrawdziweDate = Date;
    const przesuniecie = -120000; // urządzenie spóźnione o 2 minuty
    class CofnietyDate extends PrawdziweDate {
      constructor(...args) {
        if (args.length === 0) super(PrawdziweDate.now() + przesuniecie);
        else super(...args);
      }
      static now() { return PrawdziweDate.now() + przesuniecie; }
    }
    A.__win.Date = CofnietyDate;
    globalThis.Date = CofnietyDate;
    try {
      await A.changePassword(P1, P2);
    } finally {
      globalThis.Date = PrawdziweDate;
      A.__win.Date = PrawdziweDate;
    }
    const po = await meta(A);
    expect(po.passwordUpdatedAtISO > przed.passwordUpdatedAtISO,
      'znacznik idzie do przodu mimo cofniętego zegara').toBe(true);
  });

  it('ładunek bez koperty niczego nie nadpisuje', async () => {
    // Starszy klient (z cache) wyśle ładunek bez pola `credential`. Nie wolno wtedy tknąć
    // lokalnej koperty — inaczej jedno stare urządzenie zamykałoby konto reszcie floty.
    const STARE = 'Stare#Haslo!2026jj';
    const NOWE = 'Nowe#Haslo!2026kkk';
    const { A, B } = await paraUrzadzen(STARE);

    await B.changePassword(STARE, NOWE);
    const przed = await meta(B);

    const ladunek = await A.exportSyncPayload();
    delete ladunek.credential;
    const wynik = await B.mergeSyncPayload(ladunek);

    expect(wynik.credentialUpdated).toBe(false);
    const po = await meta(B);
    expect(po.passwordSalt).toBe(przed.passwordSalt);
    expect(po.encryptedMasterByPassword.data).toBe(przed.encryptedMasterByPassword.data);
    await expect(otworzPonownie(B, NOWE), 'nowe hasło B nadal działa').resolves.toBe(true);
  });

  it('uszkodzona koperta nie jest przyjmowana', async () => {
    const STARE = 'Stare#Haslo!2026ll';
    const NOWE = 'Nowe#Haslo!2026mmm';
    const { A, B } = await paraUrzadzen(STARE);
    await A.changePassword(STARE, NOWE);

    const przed = await meta(B);
    for (const psuj of [
      (l) => { l.credential.passwordSalt = null; },
      (l) => { l.credential.encryptedMasterByPassword = { iv: 'x' }; },
      (l) => { l.credential.kdfIterations = 0; },
      (l) => { l.credential.updatedAtISO = ''; },
    ]) {
      const ladunek = await A.exportSyncPayload();
      psuj(ladunek);
      const wynik = await B.mergeSyncPayload(ladunek);
      expect(wynik.credentialUpdated, 'niekompletna koperta odrzucona').toBe(false);
    }
    const po = await meta(B);
    expect(po.passwordSalt, 'sól nietknięta').toBe(przed.passwordSalt);
    await expect(otworzPonownie(B, STARE), 'B nadal otwiera się swoim hasłem').resolves.toBe(true);
  });

  it('trójka jest niepodzielna: sól i szyfrogram zawsze z tej samej wersji', async () => {
    const STARE = 'Stare#Haslo!2026nn';
    const NOWE = 'Nowe#Haslo!2026ooo';
    const { A, B } = await paraUrzadzen(STARE);
    await A.changePassword(STARE, NOWE);

    const ladunek = await A.exportSyncPayload();
    await B.mergeSyncPayload(ladunek);

    const metaA = await meta(A);
    const metaB = await meta(B);
    expect(metaB.passwordSalt).toBe(metaA.passwordSalt);
    expect(metaB.encryptedMasterByPassword.iv).toBe(metaA.encryptedMasterByPassword.iv);
    expect(metaB.encryptedMasterByPassword.data).toBe(metaA.encryptedMasterByPassword.data);
    expect(metaB.passwordKdfIterations).toBe(metaA.passwordKdfIterations);
    expect(metaB.passwordUpdatedAtISO).toBe(metaA.passwordUpdatedAtISO);
  });

  it('przyjęcie cudzej zmiany zostawia ślad dla komunikatu na przegranym urządzeniu', async () => {
    const STARE = 'Stare#Haslo!2026pp';
    const NOWE = 'Nowe#Haslo!2026qqq';
    const { A, B } = await paraUrzadzen(STARE);

    const zapisane = [];
    B.__win.VildaPersistence = {
      writePreferenceRaw: (k, v) => { zapisane.push([k, v]); return true; },
    };
    await A.changePassword(STARE, NOWE);
    await B.mergeSyncPayload(await A.exportSyncPayload());

    const wpis = zapisane.find((x) => x[0] === 'PASSWORD_CHANGED_REMOTELY_AT');
    expect(wpis, 'ślad zapisany').toBeTruthy();
    expect(wpis[1], 'ślad niesie znacznik zmiany').toBe((await meta(A)).passwordUpdatedAtISO);
  });

  it('świeże konto ma znacznik, więc od razu bierze udział w rozstrzyganiu', async () => {
    const v = loadDevice();
    await v.createUser('Swieze#Haslo!2026rr', { label: 'nowe', iterations: ITER });
    const m = await meta(v);
    expect(typeof m.passwordUpdatedAtISO).toBe('string');
    expect(m.passwordUpdatedAtISO).toBe(m.createdAtISO);
    expect(m.passwordKdfIterations).toBe(ITER);
    const ladunek = await v.exportSyncPayload();
    expect(ladunek.credential).toBeTruthy();
    expect(ladunek.credential.kdfIterations).toBe(ITER);
  });
});

describe('karta „Zmień hasło" mówi prawdę o zasięgu', () => {
  // Plik trzyma polskie znaki jako sekwencje \\uXXXX, więc przed porównaniem odkodowujemy
  // źródło — inaczej asercja szukałaby „ę", a w pliku stoi „\\u0119".
  const zrodlo = () => readFileSync(path.join(repoRoot, 'inline_ustawienia_04.js'), 'utf8')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

  it('komunikat po zmianie nie obiecuje natychmiastowości ani odcięcia dostępu', () => {
    const s = zrodlo();
    expect(s, 'stara obietnica „przy następnym logowaniu" zniknęła')
      .not.toContain('Przy następnym logowaniu użyj nowego hasła');
    expect(s, 'mówi, że zmiana dotyczy całego konta')
      .toContain('Hasło zmienione dla całego konta');
    expect(s, 'mówi, kiedy zadziała na pozostałych urządzeniach')
      .toContain('po ich najbliższej synchronizacji');
    expect(s, 'ostrzega, że urządzenie bez sieci nadal otworzy się starym hasłem')
      .toContain('otworzy się starym hasłem');
    expect(s, 'kieruje do właściwego narzędzia, gdy chodzi o odcięcie dostępu')
      .toContain('Wyloguj wszystkie urządzenia');
  });

  it('karta czyta ślad po przyjęciu cudzej zmiany i czyści go dopiero, gdy sekcja jest otwarta', () => {
    const s = zrodlo();
    expect(s).toContain('PASSWORD_CHANGED_REMOTELY_AT');
    expect(s, 'komunikat na przegranym urządzeniu')
      .toContain('zostało zmienione na innym urządzeniu');
    expect(s, 'ślad kasowany tylko przy otwartej sekcji konta')
      .toContain('d&&d.open&&typeof t.writePreferenceRaw');
  });
});
