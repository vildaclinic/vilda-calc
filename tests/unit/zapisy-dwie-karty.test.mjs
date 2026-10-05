import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-ZAPISY-DWIE-KARTY — równoległe zapisy tego samego pacjenta.
//
// `savePatient` czyta głowę rekordu, na jej podstawie decyduje (brama P14, anti-clobber,
// numer wersji = głowa + 1, licznik wersji = nagłówek + 1) i dopiero potem pisze. Dwa zapisy,
// których okna się nakładają, czytały tę samą głowę. Skutki mierzone na kodzie sprzed zmiany:
// ten sam numer wersji, licznik wersji mniejszy od liczby wersji i — najgorsze — pomiar
// zapisany przez jeden zapis znikał z bieżącej wersji bez żadnego pytania.
//
// Tu: prawdziwy vilda_vault.js, magazyn w pamięci. Dwa pierwsze bloki bez `navigator.locks` — czyli
// sama kolejka w obrębie strony (ta sama, która od K2 porządkuje notatki). Trzeci blok z atrapą
// `navigator.locks` (z `ifAvailable` i `signal`), bo tą drogą idzie blokada z limitem czasu (decyzja
// właściciela 2026-09-30: „czekaj z limitem”). Prawdziwe Web Locks między kartami sprawdza
// tests/e2e/zapisy-dwie-karty.spec.mjs.
// Dane wyłącznie FIKCYJNE.

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

/* Atrapa Web Locks: jedna blokada wyłączna na nazwę, kolejka FIFO, `ifAvailable` (callback dostaje
   null, gdy zajęta) i `signal` (przerwanie czekania odrzuca obietnicę błędem AbortError). */
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

function urzadzenie(opcje = {}) {
  const win = {
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    localStorage: magazyn(),
    sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  if (opcje.locks) win.navigator = { locks: opcje.locks };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return vault;
}

let licznik = 0;
async function sejf(opcje) {
  licznik += 1;
  const v = urzadzenie(opcje);
  await v.createUser(`Dwie#Karty!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return v;
}

const pomiar = (ageMonths) => ({ ageMonths, ageYears: ageMonths / 12, height: 90 + ageMonths / 2, weight: 12 + ageMonths / 6 });
const payload = (wieki, imie = 'Jan') => ({
  name: `Testowy ${imie}`,
  user: { lastName: 'Testowy', firstName: imie, sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wieki.map(pomiar) } },
});
const kopia = (x) => JSON.parse(JSON.stringify(x));
const wieki = (snap) => ((((snap || {}).payload || {}).advanced || {}).data || {}).measurements
  .map((m) => m.ageMonths).sort((a, b) => a - b);

function odroczone() {
  let rozwiaz;
  const obietnica = new Promise((r) => { rozwiaz = r; });
  return { obietnica, rozwiaz };
}
const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('Dwa zapisy tego samego pacjenta naraz', () => {
  it('dostają różne numery wersji, a licznik wersji zgadza się z ich liczbą', async () => {
    const v = await sejf();
    const a = await v.savePatient(payload([60]), { dedup: false });
    await Promise.all([
      v.savePatient(payload([60, 66]), { patientId: a.patientId, dedup: false }),
      v.savePatient(payload([60, 72]), { patientId: a.patientId, dedup: false }),
    ]);

    const rek = await v.getPatient(a.patientId);
    const numery = rek.snapshots.map((s) => s.seq);
    expect(rek.snapshots).toHaveLength(3);
    expect(new Set(numery).size, `numery wersji: ${numery.join(', ')}`).toBe(3);
    expect(rek.snapshotCount, 'licznik wersji w nagłówku').toBe(3);
  });

  it('formularze z tej samej wersji: drugi zapis widzi pierwszy i pyta, zamiast go cofnąć', async () => {
    const v = await sejf();
    const pytania = [];
    v.setSaveConflictResolver((info) => { pytania.push(info.foreign.map((f) => f.pomiar.ageMonths)); return 'scal'; });
    const wczytane = payload([60, 66]);
    const a = await v.savePatient(kopia(wczytane), { dedup: false });

    await Promise.all([
      v.savePatient(payload([60, 66, 72]), { patientId: a.patientId, dedup: false, baselinePayload: kopia(wczytane) }),
      v.savePatient(payload([60, 66, 84]), { patientId: a.patientId, dedup: false, baselinePayload: kopia(wczytane) }),
    ]);

    const rek = await v.getPatient(a.patientId);
    expect(wieki(rek.snapshots[0]), 'bieżąca wersja ma pomiary z obu formularzy').toEqual([60, 66, 72, 84]);
    expect(pytania, 'drugi zapis zapytał o pomiar z pierwszego').toEqual([[72]]);
  });
});

describe('Pytanie bramy nie otwiera okna na cudzy zapis', () => {
  it('zapis czekający na odpowiedź lekarza nie cofa zapisu wykonanego w tym czasie', async () => {
    const v = await sejf();
    const odpowiedz = odroczone();
    const pytania = [];
    let pierwsze = true;
    v.setSaveConflictResolver((info) => {
      pytania.push(info.foreign.map((f) => f.pomiar.ageMonths));
      if (pierwsze) { pierwsze = false; return odpowiedz.obietnica; }
      return 'scal';
    });

    const wczytane = payload([60, 66]);
    const a = await v.savePatient(kopia(wczytane), { dedup: false });
    // Inna karta dopisuje 80 — formularz A jeszcze o tym nie wie.
    await v.savePatient(payload([60, 66, 80]), { patientId: a.patientId, dedup: false });

    // Karta A zapisuje 74: brama pyta o 80 i czeka na lekarza.
    const zapisA = v.savePatient(payload([60, 66, 74]), {
      patientId: a.patientId, dedup: false, baselinePayload: kopia(wczytane),
    });
    // Odczyt i deszyfrowanie mogą potrwać dłużej pod obciążeniem; czekamy na
    // rzeczywiste otwarcie pytania, nie na arbitralny odstęp przed asercją.
    await expect.poll(() => pytania, { timeout: 2000, message: 'pytanie o 80 czeka na odpowiedź' }).toEqual([[80]]);

    // W tym czasie karta B (która zna 80) dopisuje 92 i zapisuje.
    let zapisBSkonczony = false;
    const zapisB = v.savePatient(payload([60, 66, 80, 92]), {
      patientId: a.patientId, dedup: false, baselinePayload: payload([60, 66, 80]),
    }).then((r) => { zapisBSkonczony = true; return r; });
    await chwila(20);
    const zapisBPrzedOdpowiedzia = zapisBSkonczony;

    odpowiedz.rozwiaz('scal');
    await Promise.all([zapisA, zapisB]);

    const rek = await v.getPatient(a.patientId);
    expect(wieki(rek.snapshots[0]), 'nic nie zginęło z bieżącej wersji').toEqual([60, 66, 74, 80, 92]);
    expect(zapisBPrzedOdpowiedzia, 'zapis tego samego pacjenta czekał, aż lekarz odpowie w karcie A').toBe(false);
    expect(pytania[1], 'zapis B zapytał o pomiar dopisany przez A').toEqual([74]);
    const numery = rek.snapshots.map((s) => s.seq);
    expect(new Set(numery).size, `numery wersji: ${numery.join(', ')}`).toBe(numery.length);
  });

  it('zapisy INNEGO pacjenta nie czekają na to pytanie', async () => {
    const v = await sejf();
    const odpowiedz = odroczone();
    let pytanieOtwarte = false;
    v.setSaveConflictResolver(() => { pytanieOtwarte = true; return odpowiedz.obietnica; });

    const wczytane = payload([60, 66]);
    const a = await v.savePatient(kopia(wczytane), { dedup: false });
    await v.savePatient(payload([60, 66, 80]), { patientId: a.patientId, dedup: false });
    const b = await v.savePatient(payload([48], 'Adam'), { dedup: false });

    const zapisA = v.savePatient(payload([60, 66, 74]), {
      patientId: a.patientId, dedup: false, baselinePayload: kopia(wczytane),
    });
    await expect.poll(() => pytanieOtwarte, { timeout: 2000 }).toBe(true);
    const zapisB = await v.savePatient(payload([48, 54], 'Adam'), { patientId: b.patientId, dedup: false });
    expect(zapisB.snapshotCount, 'inny pacjent zapisany od razu').toBe(2);

    odpowiedz.rozwiaz('scal');
    await zapisA;
  });
});

describe('Blokada zapisu z limitem czasu (Web Locks)', () => {
  it('wolna blokada: zapis rusza od razu, bez sygnału czekania', async () => {
    const v = await sejf({ locks: atrapaLocks() });
    const a = await v.savePatient(payload([60]), { dedup: false });
    let czekal = 0;
    const r = await v.savePatient(payload([60, 66]), { patientId: a.patientId, dedup: false, onLockWait: () => { czekal += 1; } });
    expect(r.snapshotCount).toBe(2);
    expect(czekal, 'brak komunikatu „Czekam”, gdy nikt nie zapisuje').toBe(0);
  });

  it('zajęta blokada: sygnał czekania, a po zwolnieniu zapis przechodzi i widzi poprzedni', async () => {
    const v = await sejf({ locks: atrapaLocks() });
    const odpowiedz = odroczone();
    let pierwsze = true;
    v.setSaveConflictResolver(() => { if (pierwsze) { pierwsze = false; return odpowiedz.obietnica; } return 'scal'; });
    const wczytane = payload([60, 66]);
    const a = await v.savePatient(kopia(wczytane), { dedup: false });
    await v.savePatient(payload([60, 66, 80]), { patientId: a.patientId, dedup: false });
    const zapisA = v.savePatient(payload([60, 66, 74]), { patientId: a.patientId, dedup: false, baselinePayload: kopia(wczytane) });
    await expect.poll(() => pierwsze, { timeout: 2000 }).toBe(false);

    let czekal = 0;
    const zapisB = v.savePatient(payload([60, 66, 80, 92]), {
      patientId: a.patientId, dedup: false, baselinePayload: payload([60, 66, 80]),
      onLockWait: () => { czekal += 1; }, lockTimeoutMs: 5000,
    });
    await expect.poll(() => czekal, { timeout: 2000, message: 'zapis B dostał sygnał czekania' }).toBe(1);

    odpowiedz.rozwiaz('scal');
    await Promise.all([zapisA, zapisB]);
    const rek = await v.getPatient(a.patientId);
    expect(wieki(rek.snapshots[0])).toEqual([60, 66, 74, 80, 92]);
    const numery = rek.snapshots.map((s) => s.seq);
    expect(new Set(numery).size, `numery wersji: ${numery.join(', ')}`).toBe(numery.length);
  });

  it('po limicie zapis kończy się błędem vildaSaveBusy i niczego nie zapisuje; później zapis działa', async () => {
    const v = await sejf({ locks: atrapaLocks() });
    const odpowiedz = odroczone();
    let pierwsze = true;
    v.setSaveConflictResolver(() => { if (pierwsze) { pierwsze = false; return odpowiedz.obietnica; } return 'scal'; });
    const wczytane = payload([60, 66]);
    const a = await v.savePatient(kopia(wczytane), { dedup: false });
    await v.savePatient(payload([60, 66, 80]), { patientId: a.patientId, dedup: false });
    const zapisA = v.savePatient(payload([60, 66, 74]), { patientId: a.patientId, dedup: false, baselinePayload: kopia(wczytane) });
    await expect.poll(() => pierwsze, { timeout: 2000 }).toBe(false);
    const przed = (await v.getPatient(a.patientId)).snapshots.length;

    let czekal = 0;
    const blad = await v.savePatient(payload([60, 66, 80, 92]), {
      patientId: a.patientId, dedup: false, baselinePayload: payload([60, 66, 80]),
      onLockWait: () => { czekal += 1; }, lockTimeoutMs: 150,
    }).then(() => null, (e) => e);
    expect(blad && blad.vildaSaveBusy, 'zapis przerwany po limicie').toBe(true);
    expect(czekal).toBe(1);
    expect((await v.getPatient(a.patientId)).snapshots.length, 'przerwany zapis niczego nie dopisał').toBe(przed);

    odpowiedz.rozwiaz('scal');
    await zapisA;
    const ponownie = await v.savePatient(payload([60, 66, 74, 80, 92]), { patientId: a.patientId, dedup: false });
    expect(ponownie.snapshotCount, 'ponowny zapis po zwolnieniu blokady').toBe(przed + 2);
  });
});
