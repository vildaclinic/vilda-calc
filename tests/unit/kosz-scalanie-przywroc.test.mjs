import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KOSZ-SCALANIE-PRZYWROC (zlecenie właściciela 2026-10-07: rekomendacja do punktu A10, krok 2 — „po punkcie 3a”).
//
// Koniec scalania synchronizacji (Bkz_scalKoniec) przegląda nagrobki karta po karcie, każdą pod jej blokadą, a listę
// nagrobków zapisuje na końcu — z mapy zebranej na STARCIE scalania. „Przywróć” kliknięte w tym oknie (karta już
// przejrzana, lista jeszcze niezapisana) zdejmowało wpis z kosza i oddawało zapis do karty, a końcowy zapis listy
// dokładał ten wpis z powrotem: zapis był jednocześnie w karcie i w koszu (mierzone na `audyt` d8da7c0 — przypadki
// niżej wtedy nie przechodziły; kontrola przechodziła).
//
// Reguła po zmianie: końcowy zapis listy nie dokłada nagrobka, który był w koszu na starcie scalania, a w chwili
// zapisu (świeży odczyt pod blokadą metadanych konta) już go nie ma — chyba że ładunek niesie PÓŹNIEJSZE usunięcie.
//
// Prawdziwy vilda_vault.js na magazynie w pamięci z „pułapką”: scalanie staje na przeglądzie drugiej karty
// (pierwsza już przejrzana, jej blokada zwolniona). Dwa tryby: dwie karty (wspólny magazyn i atrapa Web Locks)
// oraz jedna karta (kolejka strony). Dane wyłącznie FIKCYJNE.

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
  };
  if (locks) win.navigator = { locks };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  return win.VildaVault;
}

let licznik = 0;
async function urzadzenie(dwieKarty) {
  licznik += 1;
  const locks = dwieKarty ? atrapaLocks() : null;
  const haslo = `Kosz#Scalanie!2026${licznik}aa`;
  const A = okno(locks);
  const baza = A.createInMemoryAdapter();
  const wA = zPulapkami(baza);
  A.setStorageAdapter(wA.owiniety);
  await A.createUser(haslo, { label: `dev${licznik}`, iterations: 10000 });
  const [u] = await A.listUsers();
  let B = A;
  if (dwieKarty) {
    B = okno(locks);
    B.setStorageAdapter(baza);
    await B.unlockUser(u.userId, haslo);
  }
  return { A, B, pA: wA.pulapka, baza, uid: u.userId };
}

const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
const payload = (imie, wieki) => ({
  name: `Testowy ${imie}`,
  user: { lastName: 'Testowy', firstName: imie, sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wieki.map(pomiar) } },
});

/* Karta z trzema wersjami; środkowa idzie do kosza. */
async function kartaZKoszem(v, imie) {
  const a = await v.savePatient(payload(imie, [60]), { dedup: false });
  for (const w of [[60, 66], [60, 66, 72]]) {
    await chwila(5);
    await v.savePatient(payload(imie, w), { patientId: a.patientId, dedup: false });
  }
  const S = (await v.getPatient(a.patientId)).snapshots[1].snapshotId;
  await chwila(5);
  await v.moveSnapshotToTrash(a.patientId, S);
  return { pid: a.patientId, S };
}

const wKoszu = async (v, S) => (await v.listTrashedSnapshots()).some((e) => e.snapshotId === S);
const wKarcie = async (v, pid, S) => (await v.getPatient(pid)).snapshots.some((s) => s.snapshotId === S);

/* Scalanie w karcie A staje na przeglądzie drugiej karty z nagrobkiem (pierwsza już przejrzana, jej blokada wolna);
   w tym czasie karta B (albo ta sama) przywraca zapis pierwszej karty — do końca — i dopiero wtedy scalanie rusza. */
async function przywrocWTrakcieScalania(d, ladunek) {
  const jan = await kartaZKoszem(d.A, 'Jan');
  const ola = await kartaZKoszem(d.A, 'Ola');
  const lad = typeof ladunek === 'function' ? await ladunek() : ladunek;
  const p = d.pA('listSnapshotsForUser', (_u, pid) => pid === ola.pid);
  let blad = null;
  const scal = d.A.mergeSyncPayload(lad).catch((e) => { blad = e; });
  await p.osiagnieta;
  const wynik = await d.B.restoreTrashedSnapshot(jan.pid, jan.S);
  p.zwolnij();
  await scal;
  return { jan, ola, wynik, blad };
}

const pustyLadunek = { schemaVersion: 2, patients: [], tombstones: [] };

for (const [tryb, dwieKarty] of [['dwie karty, Web Locks', true], ['jedna karta, kolejka strony', false]]) {
  describe(`Koniec scalania nie dokłada do kosza zapisu przywróconego w trakcie — ${tryb}`, () => {
    it('„Przywróć” w trakcie scalania: zapis w karcie i nie w koszu; inny wpis kosza zostaje', async () => {
      const d = await urzadzenie(dwieKarty);
      const r = await przywrocWTrakcieScalania(d, pustyLadunek);
      expect(r.blad).toBeNull();
      expect(r.wynik.alreadyInCard, 'kontrola: zwykłe przywrócenie').toBeUndefined();
      expect(await wKarcie(d.A, r.jan.pid, r.jan.S), 'zapis wrócił do karty').toBe(true);
      expect(await wKoszu(d.A, r.jan.S), 'zapis nie wrócił do kosza').toBe(false);
      expect(await wKoszu(d.A, r.ola.S), 'nietknięty wpis kosza zostaje').toBe(true);
      expect(await wKarcie(d.A, r.ola.pid, r.ola.S), 'i jego zapis nie wraca do karty').toBe(false);
    });

    it('ładunek z chmury niesie ten sam nagrobek (inne urządzenie nie wie o przywróceniu): zapis nie wraca do kosza', async () => {
      const d = await urzadzenie(dwieKarty);
      const r = await przywrocWTrakcieScalania(d, async () => ({
        ...pustyLadunek, snapshotTombstones: (await d.A.exportSyncPayload()).snapshotTombstones,
      }));
      expect(r.blad).toBeNull();
      expect(await wKarcie(d.A, r.jan.pid, r.jan.S)).toBe(true);
      expect(await wKoszu(d.A, r.jan.S), 'zapis nie wrócił do kosza').toBe(false);
      expect(await wKoszu(d.A, r.ola.S)).toBe(true);
    });

    it('kontrola: kolejne scalanie z tym samym starym ładunkiem nie usuwa przywróconego zapisu', async () => {
      const d = await urzadzenie(dwieKarty);
      let stary = null;
      const r = await przywrocWTrakcieScalania(d, async () => {
        stary = { ...pustyLadunek, snapshotTombstones: (await d.A.exportSyncPayload()).snapshotTombstones };
        return stary;
      });
      expect(r.blad).toBeNull();
      await d.A.mergeSyncPayload(stary);
      expect(await wKarcie(d.A, r.jan.pid, r.jan.S), 'przywrócony zapis zostaje w karcie').toBe(true);
      expect(await wKoszu(d.A, r.jan.S)).toBe(false);
      expect(await wKoszu(d.A, r.ola.S)).toBe(true);
    });

    it('kontrola: nagrobek obecny na starcie i przy zapisie dostaje z ładunku treść kosza (wpis nie jest pomijany)', async () => {
      const d = await urzadzenie(dwieKarty);
      const jan = await kartaZKoszem(d.A, 'Jan');
      const ladunek = { ...pustyLadunek, snapshotTombstones: (await d.A.exportSyncPayload()).snapshotTombstones };
      // Tu nagrobek bez treści (jak z ładunku bez kosza); chmura ma tę samą wersję z treścią.
      const meta = await d.baza.getUserMeta(d.uid);
      await d.baza.putUserMeta(d.uid, Object.assign({}, meta, {
        snapshotTombstones: meta.snapshotTombstones.map((e) => { const x = { ...e }; delete x.payloadCipher; return x; }),
      }));
      expect(await wKoszu(d.A, jan.S), 'kontrola: bez treści nie ma go w koszu').toBe(false);
      await d.A.mergeSyncPayload(ladunek);
      expect(await wKoszu(d.A, jan.S), 'treść kosza z ładunku zapisana').toBe(true);
      expect(await wKarcie(d.A, jan.pid, jan.S)).toBe(false);
    });
  });
}
