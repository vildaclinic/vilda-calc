import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-META-KONTA (zlecenie właściciela 2026-10-07: przegląd „co dalej po #518”, punkt A12).
//
// Metadane konta (userMeta) to jeden rekord: koperta hasła, klucz odzyskiwania, tożsamość synchronizacji (SIS), klucze
// biometrii, preferencje (w tym listy oczekujących), znacznik ostatniego scalenia oraz kosz zapisów z nagrobkami wersji.
// Adapter zapisuje go w całości. Siedemnaście miejsc robiło „odczytaj → (długa operacja: PBKDF2, WebAuthn, IDB) →
// zapisz kopię z odczytu”, a pod blokadą był tylko zapis kosza. Mierzone na `audyt` 74c5803 (każdy przypadek niżej
// wtedy nie przechodził):
//   - zmiana hasła w trakcie „Usuń do kosza” w drugiej karcie: wpis kosza i nagrobek wersji znikały (E1);
//   - „Usuń do kosza” w trakcie zmiany hasła: zmiana hasła zgłaszała sukces, a działało stare hasło (E5);
//     tak samo nowy klucz odzyskiwania (E6);
//   - dwie zmiany hasła naraz: obie zgłaszały sukces, działało jedno hasło (E7); tak samo zmiana hasła i reset hasła
//     po kluczu odzyskiwania oraz dwa nowe klucze odzyskiwania (pierwszy wyświetlony klucz nie działał);
//   - termin listy oczekujących ustawiony w drugiej karcie znikał (E9); preferencja, scalanie synchronizacji
//     (preferencje, klucze biometrii, hasło z innego urządzenia, znacznik scalenia), nowa tożsamość synchronizacji,
//     rejestracja i usunięcie klucza biometrii oraz odblokowanie konta bez tożsamości synchronizacji kasowały kosz;
//   - aktywacja biometrii w trakcie jej usuwania w drugiej karcie przywracała usunięty klucz.
//
// Prawdziwy vilda_vault.js na magazynie w pamięci z „pułapkami” (wybrane wywołanie magazynu czeka, aż test je zwolni).
// Dwa tryby: dwie karty (dwa okna na wspólnym magazynie i wspólnej atrapie Web Locks) oraz jedna karta bez Web Locks
// (sama kolejka strony). Dane wyłącznie FIKCYJNE.

function magazyn() {
  const m = Object.create(null);
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
    wynik.then(zwolnij, zwolnij);
    function zwolnij() {
      s.zajeta = false;
      const nast = s.kolejka.shift();
      if (nast) nast.start();
    }
    return wynik;
  }
  return {
    czekajacych: (n) => nazwa(n).kolejka.length,
    request(n, opcje, cb) {
      if (typeof opcje === 'function') { cb = opcje; opcje = {}; }
      const s = nazwa(n);
      if (opcje.ifAvailable) return s.zajeta ? Promise.resolve().then(() => cb(null)) : uruchom(n, cb);
      if (!s.zajeta) return uruchom(n, cb);
      return new Promise((resolve, reject) => {
        const wpis = { start: () => uruchom(n, cb).then(resolve, reject) };
        s.kolejka.push(wpis);
        if (opcje.signal) {
          opcje.signal.addEventListener('abort', () => {
            const i = s.kolejka.indexOf(wpis);
            if (i >= 0) { s.kolejka.splice(i, 1); reject(Object.assign(new Error('przerwano'), { name: 'AbortError' })); }
          });
        }
      });
    },
  };
}

function odroczone() {
  let rozwiaz;
  const obietnica = new Promise((r) => { rozwiaz = r; });
  return { obietnica, rozwiaz };
}
const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });

function zPulapkami(adapter) {
  const pulapki = [];
  const owiniety = new Proxy(adapter, {
    get(cel, klucz) {
      const f = cel[klucz];
      if (typeof f !== 'function') return f;
      return async function (...args) {
        for (const p of pulapki) {
          if (p.zuzyta || p.metoda !== klucz || !p.warunek(...args)) continue;
          p.zuzyta = true;
          p.osiagnieta.rozwiaz();
          await p.zwolnienie.obietnica;
        }
        return f.apply(cel, args);
      };
    },
  });
  function pulapka(metoda, warunek = () => true) {
    const p = { metoda, warunek, zuzyta: false, osiagnieta: odroczone(), zwolnienie: odroczone() };
    pulapki.push(p);
    return { osiagnieta: p.osiagnieta.obietnica, zwolnij: () => p.zwolnienie.rozwiaz() };
  }
  return { owiniety, pulapka };
}

function okno(locks) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    location: { hostname: 'localhost' },
    AbortController,
    // Zapis preferencji z VildaPersistence trafia do sejfu przez ten haczyk (Ps w vilda_vault.js).
    VildaPersistence: { onPreferenceWrite(cb) { win.__zapiszPreferencje = cb; } },
  };
  if (locks) win.navigator = { locks };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  win.VildaVault.__win = win;
  return win.VildaVault;
}

let licznik = 0;
/* Konto i dwie karty. Tryb „dwie karty”: dwa okna na wspólnym magazynie i wspólnych Web Locks, każde z własnymi
   pułapkami. Tryb „kolejka strony”: jedno okno bez Web Locks (B to A). */
async function urzadzenie(dwieKarty, { bezSis = false } = {}) {
  licznik += 1;
  const locks = dwieKarty ? atrapaLocks() : null;
  const haslo = `Meta#Konta!2026${licznik}aa`;
  const A = okno(locks);
  const baza = A.createInMemoryAdapter();
  const wA = zPulapkami(baza);
  A.setStorageAdapter(wA.owiniety);
  await A.createUser(haslo, { label: `dev${licznik}`, iterations: 10000 });
  const [u] = await A.listUsers();
  if (bezSis) {
    const meta = await baza.getUserMeta(u.userId);
    delete meta.encryptedSisByMaster;
    await baza.putUserMeta(u.userId, meta);
  }
  let B = A, pB = wA.pulapka;
  if (dwieKarty) {
    B = okno(locks);
    const wB = zPulapkami(baza);
    B.setStorageAdapter(wB.owiniety);
    pB = wB.pulapka;
    if (!bezSis) await B.unlockUser(u.userId, haslo);
  }
  return { A, B, pA: wA.pulapka, pB, baza, uid: u.userId, haslo, locks };
}

/* Świeże okno na tym samym magazynie: czy hasło / klucz odzyskiwania otwiera sejf. */
async function otwiera(d, sposob, sekret) {
  const C = okno(null);
  C.setStorageAdapter(d.baza);
  try {
    if (sposob === 'haslo') await C.unlockUser(d.uid, sekret);
    else await C.unlockUserWithRecoveryKey(d.uid, sekret);
    return true;
  } catch {
    return false;
  }
}

const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
const payload = (wieki) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wieki.map(pomiar) } },
});

/* Karta z trzema wersjami; zwraca id środkowej (do kosza). */
async function karta(v) {
  const a = await v.savePatient(payload([60]), { dedup: false });
  for (const w of [[60, 66], [60, 66, 72]]) {
    await chwila(5);
    await v.savePatient(payload(w), { patientId: a.patientId, dedup: false });
  }
  const r = await v.getPatient(a.patientId);
  return { pid: a.patientId, S: r.snapshots[1].snapshotId };
}

function obserwuj(p) {
  const o = { koniec: false, wynik: undefined, blad: undefined };
  o.obietnica = p.then((w) => { o.koniec = true; o.wynik = w; return w; }, (e) => { o.koniec = true; o.blad = e; return null; });
  return o;
}

const wKoszu = async (d, S) => ((await d.baza.getUserMeta(d.uid)).snapshotTombstones || []).some((e) => e.snapshotId === S && e.payloadCipher);
const nowaSol = (d, sol) => (meta) => !!(meta && meta.passwordSalt && meta.passwordSalt !== sol);
const zKoszem = (S) => (_u, meta) => !!(meta && Array.isArray(meta.snapshotTombstones) && meta.snapshotTombstones.some((e) => e.snapshotId === S));

/* Operacja X w karcie A stoi tuż przed zapisem metadanych; w tym czasie karta B robi Y. */
async function wTrakcie(d, { pulapka, x, y }) {
  const p = pulapka();
  const ox = obserwuj(x());
  await p.osiagnieta;
  const oy = obserwuj(y());
  await chwila(40);
  const yCzekalo = !oy.koniec;
  p.zwolnij();
  await Promise.all([ox.obietnica, oy.obietnica]);
  return { ox, oy, yCzekalo };
}

for (const [tryb, dwieKarty] of [['dwie karty, Web Locks', true], ['jedna karta, kolejka strony', false]]) {
  describe(`Metadane konta: zapisy po kolei, na świeżym odczycie — ${tryb}`, () => {
    it('zmiana hasła w trakcie „Usuń do kosza” w drugiej karcie: kosz zostaje, nowe hasło działa (E1)', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      const sol = (await d.baza.getUserMeta(d.uid)).passwordSalt;
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => nowaSol(d, sol)(meta)),
        x: () => d.A.changePassword(d.haslo, 'Nowe#Haslo!2026bb'),
        y: () => d.B.moveSnapshotToTrash(pid, S),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad).toBeUndefined();
      expect(r.yCzekalo, 'kosz czeka na koniec zapisu metadanych').toBe(true);
      expect(await wKoszu(d, S), 'wpis kosza zostaje').toBe(true);
      expect(await otwiera(d, 'haslo', 'Nowe#Haslo!2026bb'), 'nowe hasło otwiera sejf').toBe(true);
      expect(await otwiera(d, 'haslo', d.haslo), 'stare hasło już nie').toBe(false);
    });

    it('„Usuń do kosza” w trakcie zmiany hasła: hasło zmienione naprawdę, kosz zostaje (E5)', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', zKoszem(S)),
        x: () => d.A.moveSnapshotToTrash(pid, S),
        y: () => d.B.changePassword(d.haslo, 'Nowe#Haslo!2026bb'),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad).toBeUndefined();
      expect(r.yCzekalo, 'zmiana hasła czeka na koniec zapisu kosza').toBe(true);
      expect(await wKoszu(d, S)).toBe(true);
      expect(await otwiera(d, 'haslo', 'Nowe#Haslo!2026bb'), 'nowe hasło otwiera sejf').toBe(true);
      expect(await otwiera(d, 'haslo', d.haslo), 'stare hasło już nie').toBe(false);
    });

    it('nowy klucz odzyskiwania w trakcie „Usuń do kosza”: klucz działa, kosz zostaje (E6)', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', zKoszem(S)),
        x: () => d.A.moveSnapshotToTrash(pid, S),
        y: () => d.B.regenerateRecoveryKey(),
      });
      expect(r.oy.blad).toBeUndefined();
      expect(r.yCzekalo).toBe(true);
      expect(await wKoszu(d, S)).toBe(true);
      expect(await otwiera(d, 'klucz', r.oy.wynik.recoveryKey), 'nowy klucz odzyskiwania otwiera sejf').toBe(true);
    });

    it('dwie zmiany hasła naraz: druga odmawia z kodem PASSWORD_CHANGED_ELSEWHERE, obowiązuje pierwsza (E7)', async () => {
      const d = await urzadzenie(dwieKarty);
      const sol = (await d.baza.getUserMeta(d.uid)).passwordSalt;
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => nowaSol(d, sol)(meta)),
        x: () => d.A.changePassword(d.haslo, 'Pierwsze#Haslo!26'),
        y: () => d.B.changePassword(d.haslo, 'Drugie#Haslo!2026'),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad && r.oy.blad.code, 'druga zmiana odmawia').toBe('PASSWORD_CHANGED_ELSEWHERE');
      expect(await otwiera(d, 'haslo', 'Pierwsze#Haslo!26')).toBe(true);
      expect(await otwiera(d, 'haslo', 'Drugie#Haslo!2026')).toBe(false);
    });

    it('terminy list oczekujących ustawiane w dwóch kartach naraz: oba zostają (E9)', async () => {
      const d = await urzadzenie(dwieKarty);
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => !!(meta && meta.userPreferences && meta.userPreferences.wlsched)),
        x: () => d.A.setWaitlistSchedule('Biopsja jelita', { dateISO: '2026-11-03', time: '09:00' }),
        y: () => d.B.setWaitlistSchedule('Test Synacthen', { dateISO: '2026-11-04', time: '10:00' }),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad).toBeUndefined();
      const terminy = await d.A.getWaitlistSchedules();
      expect(Object.values(terminy).map((t) => t.label).sort()).toEqual(['Biopsja jelita', 'Test Synacthen']);
    });

    it('zapis preferencji w trakcie „Usuń do kosza”: kosz i preferencja zostają', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      const winA = d.A.__win;
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => !!(meta && meta.userPreferences && meta.userPreferences.motyw)),
        x: () => winA.__zapiszPreferencje({ key: 'motyw', value: 'ciemny' }),
        y: () => d.B.moveSnapshotToTrash(pid, S),
      });
      expect(r.oy.blad).toBeUndefined();
      expect(await wKoszu(d, S)).toBe(true);
      expect((await d.baza.getUserMeta(d.uid)).userPreferences.motyw.value).toBe('ciemny');
    });

    it('scalanie synchronizacji (preferencje z chmury) w trakcie „Usuń do kosza”: kosz i preferencja zostają', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      const ladunek = { schemaVersion: 2, patients: [], tombstones: [], userPreferences: { jezyk: { value: 'pl', updatedAtISO: new Date(Date.now() + 1000).toISOString() } } };
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => !!(meta && meta.userPreferences && meta.userPreferences.jezyk)),
        x: () => d.A.mergeSyncPayload(ladunek),
        y: () => d.B.moveSnapshotToTrash(pid, S),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad).toBeUndefined();
      expect(await wKoszu(d, S)).toBe(true);
      expect((await d.baza.getUserMeta(d.uid)).userPreferences.jezyk.value).toBe('pl');
    });

    it('usunięcie klucza biometrii w trakcie „Usuń do kosza”: klucz usunięty, kosz zostaje', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      const meta0 = await d.baza.getUserMeta(d.uid);
      await d.baza.putUserMeta(d.uid, Object.assign({}, meta0, { passkeys: [{ credentialId: 'cred-test-1', deviceLabel: 'Telefon testowy', createdAtISO: new Date().toISOString() }] }));
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => !!(meta && Array.isArray(meta.passkeys) && meta.passkeys.length === 0)),
        x: () => d.A.removePasskey(d.uid, 'cred-test-1'),
        y: () => d.B.moveSnapshotToTrash(pid, S),
      });
      expect(r.oy.blad).toBeUndefined();
      expect(await wKoszu(d, S)).toBe(true);
      const meta = await d.baza.getUserMeta(d.uid);
      expect(meta.passkeys).toEqual([]);
      expect(meta.passkeyTombstones.map((t) => t.credentialId)).toEqual(['cred-test-1']);
    });

    it('rejestracja biometrii w trakcie „Usuń do kosza”: klucz zapisany, kosz zostaje', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      const c = d.A.__win.VildaCrypto;
      c.createPasskeyAndGetPrfSecret = async () => ({ credentialId: 'cred-test-2', prfSecretBytes: new Uint8Array(32).fill(7) });
      c.getPasskeyPrfSecret = async () => ({ credentialId: 'cred-test-2', prfSecretBytes: new Uint8Array(32).fill(7) });
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => !!(meta && Array.isArray(meta.passkeys) && meta.passkeys.length === 1)),
        x: () => d.A.registerPasskey('Telefon testowy'),
        y: () => d.B.moveSnapshotToTrash(pid, S),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad).toBeUndefined();
      expect(await wKoszu(d, S)).toBe(true);
      expect((await d.baza.getUserMeta(d.uid)).passkeys.map((p) => p.credentialId)).toEqual(['cred-test-2']);
    });

    it('zmiana hasła i reset hasła po kluczu odzyskiwania naraz: reset odmawia, obowiązuje zmienione hasło', async () => {
      const d = await urzadzenie(dwieKarty);
      const sol = (await d.baza.getUserMeta(d.uid)).passwordSalt;
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => nowaSol(d, sol)(meta)),
        x: () => d.A.changePassword(d.haslo, 'Pierwsze#Haslo!26'),
        y: () => d.B.resetPasswordWhileUnlocked('Reset#Hasla!2026cc'),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad && r.oy.blad.code).toBe('PASSWORD_CHANGED_ELSEWHERE');
      expect(await otwiera(d, 'haslo', 'Pierwsze#Haslo!26')).toBe(true);
      expect(await otwiera(d, 'haslo', 'Reset#Hasla!2026cc')).toBe(false);
    });

    it('dwa nowe klucze odzyskiwania naraz: drugi odmawia (RECOVERY_CHANGED_ELSEWHERE), wyświetlony pierwszy działa', async () => {
      const d = await urzadzenie(dwieKarty);
      const sol = (await d.baza.getUserMeta(d.uid)).recoverySalt;
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => !!(meta && meta.recoverySalt && meta.recoverySalt !== sol)),
        x: () => d.A.regenerateRecoveryKey(),
        y: () => d.B.regenerateRecoveryKey(),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad && r.oy.blad.code).toBe('RECOVERY_CHANGED_ELSEWHERE');
      expect(await otwiera(d, 'klucz', r.ox.wynik.recoveryKey), 'pierwszy wyświetlony klucz otwiera sejf').toBe(true);
    });

    it('nowa tożsamość synchronizacji („Wyloguj wszystkie urządzenia”) w trakcie „Usuń do kosza”: kosz zostaje', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      const przed = (await d.B.getSyncMaterial()).slotId;
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', zKoszem(S)),
        x: () => d.A.moveSnapshotToTrash(pid, S),
        y: () => d.B.rotateSyncIdentity(d.haslo),
      });
      expect(r.oy.blad).toBeUndefined();
      expect(r.yCzekalo).toBe(true);
      expect(await wKoszu(d, S)).toBe(true);
      expect((await d.B.getSyncMaterial()).slotId, 'nowa tożsamość').not.toBe(przed);
      expect(await otwiera(d, 'klucz', r.oy.wynik.recoveryKey), 'nowy klucz odzyskiwania działa').toBe(true);
    });

    it('scalanie: hasło zmienione na innym urządzeniu w trakcie „Usuń do kosza”: kosz zostaje, obowiązuje hasło z chmury', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      // „Inne urządzenie”: zmiana hasła, z której bierzemy poświadczenie z ładunku; potem ten magazyn wraca do starego hasła.
      const stara = await d.baza.getUserMeta(d.uid);
      await d.A.changePassword(d.haslo, 'Haslo#Z!Chmury2026');
      const { credential } = await d.A.exportSyncPayload();
      await d.baza.putUserMeta(d.uid, stara);
      expect(await otwiera(d, 'haslo', d.haslo), 'kontrola: tu znowu stare hasło').toBe(true);
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => !!(meta && meta.passwordSalt === credential.passwordSalt)),
        x: () => d.A.mergeSyncPayload({ schemaVersion: 2, patients: [], tombstones: [], credential }),
        y: () => d.B.moveSnapshotToTrash(pid, S),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad).toBeUndefined();
      expect(await wKoszu(d, S)).toBe(true);
      expect(await otwiera(d, 'haslo', 'Haslo#Z!Chmury2026'), 'hasło z chmury otwiera sejf').toBe(true);
    });

    it('scalanie: klucz biometrii z chmury w trakcie „Usuń do kosza”: kosz i klucz zostają', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      const ladunek = {
        schemaVersion: 2, patients: [], tombstones: [],
        passkeys: [{ credentialId: 'cred-chmura-1', deviceLabel: 'Tablet testowy', createdAtISO: new Date().toISOString() }],
      };
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => !!(meta && Array.isArray(meta.passkeys) && meta.passkeys.length === 1)),
        x: () => d.A.mergeSyncPayload(ladunek),
        y: () => d.B.moveSnapshotToTrash(pid, S),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad).toBeUndefined();
      expect(await wKoszu(d, S)).toBe(true);
      expect((await d.baza.getUserMeta(d.uid)).passkeys.map((p) => p.credentialId)).toEqual(['cred-chmura-1']);
    });

    it('scalanie: znacznik ostatniego scalenia w trakcie „Usuń do kosza”: kosz zostaje', async () => {
      const d = await urzadzenie(dwieKarty);
      const { pid, S } = await karta(d.A);
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => !!(meta && meta.lastSyncMergeAtISO)),
        x: () => d.A.mergeSyncPayload({ schemaVersion: 2, patients: [], tombstones: [], exportedAtISO: new Date().toISOString() }),
        y: () => d.B.moveSnapshotToTrash(pid, S),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad).toBeUndefined();
      expect(await wKoszu(d, S)).toBe(true);
      expect((await d.baza.getUserMeta(d.uid)).lastSyncMergeAtISO).toBeTruthy();
    });

    it('aktywacja biometrii w trakcie jej usuwania w drugiej karcie: odmowa PASSKEY_NOT_FOUND, klucz zostaje usunięty', async () => {
      const d = await urzadzenie(dwieKarty);
      const meta0 = await d.baza.getUserMeta(d.uid);
      await d.baza.putUserMeta(d.uid, Object.assign({}, meta0, {
        passkeys: [{ credentialId: 'cred-sync-1', deviceLabel: 'Telefon testowy', createdAtISO: new Date().toISOString() }],
      }));
      d.B.__win.VildaCrypto.getPasskeyPrfSecret = async () => ({ credentialId: 'cred-sync-1', prfSecretBytes: new Uint8Array(32).fill(9) });
      const r = await wTrakcie(d, {
        pulapka: () => d.pA('putUserMeta', (_u, meta) => !!(meta && Array.isArray(meta.passkeys) && meta.passkeys.length === 0)),
        x: () => d.A.removePasskey(d.uid, 'cred-sync-1'),
        y: () => d.B.adoptSyncedPasskey('cred-sync-1'),
      });
      expect(r.ox.blad).toBeUndefined();
      expect(r.oy.blad && r.oy.blad.code).toBe('PASSKEY_NOT_FOUND');
      const meta = await d.baza.getUserMeta(d.uid);
      expect(meta.passkeys, 'usunięty klucz nie wraca').toEqual([]);
      expect(meta.passkeyTombstones.map((t) => t.credentialId)).toEqual(['cred-sync-1']);
    });
  });
}

describe('Metadane konta — dwie karty, Web Locks', () => {
  it('odblokowanie konta bez tożsamości synchronizacji w trakcie „Usuń do kosza” w drugiej karcie: kosz zostaje', async () => {
    const d = await urzadzenie(true, { bezSis: true });
    const { pid, S } = await karta(d.A);
    // Karta B odblokowuje konto (pierwsze odblokowanie zapisuje tożsamość synchronizacji) i stoi tuż przed zapisem.
    const r = await wTrakcie(d, {
      pulapka: () => d.pB('putUserMeta', (_u, meta) => !!(meta && meta.encryptedSisByMaster)),
      x: () => d.B.unlockUser(d.uid, d.haslo),
      y: () => d.A.moveSnapshotToTrash(pid, S),
    });
    expect(r.ox.blad).toBeUndefined();
    expect(r.oy.blad).toBeUndefined();
    expect(r.yCzekalo, 'kosz czeka na zapis tożsamości').toBe(true);
    expect(await wKoszu(d, S), 'wpis kosza zostaje').toBe(true);
    expect((await d.baza.getUserMeta(d.uid)).encryptedSisByMaster, 'tożsamość zapisana').toBeTruthy();
    const [ma, mb] = await Promise.all([d.A.getSyncMaterial(), d.B.getSyncMaterial()]);
    expect(mb.slotId, 'ta sama tożsamość synchronizacji w obu kartach').toBe(ma.slotId);
  });

  it('odblokowanie przyjmuje tożsamość synchronizacji zapisaną w tym czasie gdzie indziej — nie nadpisuje jej', async () => {
    const d = await urzadzenie(true);
    await d.A.rotateSyncIdentity(d.haslo); // losowa tożsamość (jak po „Wyloguj wszystkie urządzenia”)
    const zA = (await d.A.getSyncMaterial()).slotId;
    const meta = await d.baza.getUserMeta(d.uid);
    const sis = meta.encryptedSisByMaster;
    delete meta.encryptedSisByMaster;
    await d.baza.putUserMeta(d.uid, meta);
    // B odblokowuje konto bez tożsamości i czeka na blokadę metadanych; w tym czasie tożsamość wraca do rekordu.
    const zwolnij = odroczone();
    d.locks.request('vilda-note-kosz-zapisow', () => zwolnij.obietnica);
    const o = obserwuj(d.B.unlockUser(d.uid, d.haslo));
    for (let i = 0; i < 200 && d.locks.czekajacych('vilda-note-kosz-zapisow') === 0; i += 1) await chwila(10);
    expect(d.locks.czekajacych('vilda-note-kosz-zapisow'), 'kontrola: B czeka na blokadę').toBe(1);
    await d.baza.putUserMeta(d.uid, Object.assign({}, await d.baza.getUserMeta(d.uid), { encryptedSisByMaster: sis }));
    zwolnij.rozwiaz();
    await o.obietnica;
    expect(o.blad).toBeUndefined();
    expect((await d.baza.getUserMeta(d.uid)).encryptedSisByMaster, 'tożsamość nienadpisana').toEqual(sis);
    expect((await d.B.getSyncMaterial()).slotId, 'B synchronizuje do tego samego miejsca co A').toBe(zA);
  });

  it('karta zablokowana w trakcie czekania na zmianę hasła: SESSION_CHANGED, hasło bez zmian', async () => {
    const d = await urzadzenie(true);
    const { pid, S } = await karta(d.A);
    const p = d.pA('putUserMeta', zKoszem(S));
    const ox = obserwuj(d.A.moveSnapshotToTrash(pid, S));
    await p.osiagnieta;
    const czeka = odroczone();
    const oy = obserwuj(d.B.changePassword(d.haslo, 'Nowe#Haslo!2026bb', { onLockWait: () => czeka.rozwiaz() }));
    await Promise.race([czeka.obietnica, oy.obietnica]);
    expect(oy.koniec, 'zmiana hasła czeka na blokadę metadanych').toBe(false);
    d.B.lock();
    p.zwolnij();
    await Promise.all([ox.obietnica, oy.obietnica]);
    expect(ox.blad).toBeUndefined();
    expect(oy.blad && oy.blad.code).toBe('SESSION_CHANGED');
    expect(await wKoszu(d, S)).toBe(true);
    expect(await otwiera(d, 'haslo', d.haslo), 'stare hasło nadal działa').toBe(true);
  });

  it('zmiana hasła przy zajętej blokadzie metadanych: po limicie błąd META_BUSY, hasło bez zmian', async () => {
    const d = await urzadzenie(true);
    const zwolnij = odroczone();
    d.locks.request('vilda-note-kosz-zapisow', () => zwolnij.obietnica);
    let czekal = 0;
    const o = obserwuj(d.B.changePassword(d.haslo, 'Nowe#Haslo!2026bb', { onLockWait: () => { czekal += 1; }, lockTimeoutMs: 60 }));
    await o.obietnica;
    zwolnij.rozwiaz();
    expect(czekal).toBe(1);
    expect(o.blad && o.blad.code).toBe('META_BUSY');
    expect(await otwiera(d, 'haslo', d.haslo), 'stare hasło nadal działa').toBe(true);
  });
});

describe('strażnik źródła', () => {
  it('metadane istniejącego konta zapisuje tylko Bmk_zmien; bezpośredni zapis zostaje przy zakładaniu nowego konta', () => {
    const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
    const wlasciciele = [];
    for (let i = src.indexOf('.putUserMeta('); i >= 0; i = src.indexOf('.putUserMeta(', i + 1)) {
      wlasciciele.push([...src.slice(0, i).matchAll(/function (\w+)\(/g)].pop()[1]);
    }
    // ba — przelotka adaptera; Ca createUser, as restoreVaultBackup, Ds unlockWithPasskeyAndPersist, Ks importSyncCode,
    // Zs completeQRLogin — każda zapisuje rekord NOWEGO konta (nowy identyfikator), którego nikt jeszcze nie pisze.
    expect(wlasciciele.sort()).toEqual(['Bmk_zmien', 'Ca', 'Ds', 'Ks', 'Zs', 'as', 'ba']);
    expect(src).not.toContain("Ac('kosz-zapisow'");
    expect(src).toContain("const BMK_KLUCZ = 'kosz-zapisow';");
  });
});
