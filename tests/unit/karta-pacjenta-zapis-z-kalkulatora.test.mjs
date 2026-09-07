import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P14, druga połowa. Rata A dała ekranowi „Edytuj pacjenta" deklarację bazy
// (`baseSnapshotId`). Główny „Zapisz dane" w kalkulatorze takiej deklaracji nie ma i mieć
// jej nie może: formularz żyje przez całą wizytę, wersja rekordu przesuwa się pod nim w tle
// (WebSocket, odpytywanie co 10 s, powrót do karty), a `updateSnapshotPayload` potrafi
// zmienić treść zachowując ten sam `snapshotId`. Identyfikator wersji jest więc dla tej
// ścieżki bezużyteczny — albo kłamie w jedną stronę (edycja w miejscu: baza „aktualna",
// choć treść inna), albo w drugą (przypięcie starej wersji: baza „nieaktualna", choć nic
// nie doszło).
//
// Dlatego porównujemy TREŚĆ. Sejf dostaje w opcjach `baselinePayload` — kopię danych, jaką
// aplikacja wczytała do formularza (`window.lastLoadedData`). Pomiar, który jest w głowie
// rekordu, a nie było go ani w tej kopii, ani w zapisie, przyszedł już po wczytaniu →
// zapis by go skasował → pytamy lekarza. Wiersz, który był w kopii i którego nie ma
// w zapisie, lekarz usunął świadomie → nie wraca i nie ma o co pytać.
//
// Rezolwer (modal) siedzi w vilda_auth_ui.js; sejf zna tylko jego kontrakt.

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
  // Każdy odczyt historii to odszyfrowanie WSZYSTKICH wersji rekordu. Liczymy je,
  // bo brama zapisu łatwo podwaja ten koszt na każdym zapisie.
  vault.__odczytyHistorii = 0;
  const orig = adapter.listSnapshotsForUser.bind(adapter);
  adapter.listSnapshotsForUser = (...a) => { vault.__odczytyHistorii += 1; return orig(...a); };
  vault.setStorageAdapter(adapter);
  return vault;
}

const ITER = 10000;
let licznik = 0;

async function sejf() {
  licznik += 1;
  const v = loadDevice();
  await v.createUser(`Sejf#P14b!2026${licznik}aa`, { label: `dev${licznik}`, iterations: ITER });
  return v;
}

const pomiar = (ageMonths, extra) => Object.assign({
  ageMonths,
  ageYears: ageMonths / 12,
  height: 90 + ageMonths / 2,
  weight: 12 + ageMonths / 6,
}, extra || {});

function payload(gdzie, wieki) {
  const p = {
    name: 'Kowalski Jan',
    user: { lastName: 'Kowalski', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  };
  p[gdzie] = { data: { measurements: wieki.map((w) => (typeof w === 'number' ? pomiar(w) : w)) } };
  return p;
}

const wieki = (kontener) => (
  kontener && kontener.data && Array.isArray(kontener.data.measurements)
    ? kontener.data.measurements.map((r) => r.ageMonths).sort((a, b) => a - b)
    : []
);

// Sejf porządkuje snapshoty po `savedAtISO`. Czekamy na warunek — przesunięcie zegara —
// a nie na odmierzony czas, i tak czy owak czytamy zapis po jego identyfikatorze.
const tik = () => new Promise((gotowe) => {
  const start = Date.now();
  const sprawdz = () => (Date.now() > start ? gotowe() : setTimeout(sprawdz, 1));
  sprawdz();
});

// Rejestracja rezolwera przez bramkę „jeśli sejf go zna". Bez tego pomiar czerwieni na
// kodzie sprzed naprawy sprowadzałby się do „metody nie ma" — a chcemy zobaczyć, że stary
// kod NAPRAWDĘ gubi cudzy pomiar i NAPRAWDĘ o nic nie pyta.
const pytaj = (v, fn) => {
  if (typeof v.setSaveConflictResolver === 'function') v.setSaveConflictResolver(fn);
};

const zapisany = async (v, patientId, snapshotId) => {
  const rekord = await v.getPatient(patientId);
  const znaleziony = rekord.snapshots.filter((s) => s.snapshotId === snapshotId)[0];
  expect(znaleziony, 'zapis jest w rekordzie').toBeTruthy();
  return znaleziony.payload;
};

// Scenariusz bazowy: lekarz wczytał pacjenta z dwoma pomiarami, w międzyczasie inne
// urządzenie dopisało trzeci, lekarz zapisuje swój formularz (nadal z dwoma).
async function rozjazd(v, gdzie, opcje) {
  const wczytane = payload(gdzie, [60, 66]);
  const pierwszy = await v.savePatient(wczytane, { dedup: false });
  await tik();
  await v.savePatient(payload(gdzie, [60, 66, 80]), { patientId: pierwszy.patientId, dedup: false });
  await tik();
  const zapis = await v.savePatient(payload(gdzie, [60, 66]), Object.assign({
    patientId: pierwszy.patientId,
    dedup: false,
    baselinePayload: wczytane,
  }, opcje || {}));
  return { patientId: pierwszy.patientId, zapis };
}

describe('P14b — główny „Zapisz" porównuje treść, a nie identyfikator wersji', () => {
  for (const gdzie of ['advanced', 'growthBasic']) {
    it(`${gdzie}: obcy pomiar trafia do pytania i domyślnie zostaje dopisany`, async () => {
      const v = await sejf();
      const pytania = [];
      pytaj(v, (info) => { pytania.push(info); return 'scal'; });

      const { patientId, zapis } = await rozjazd(v, gdzie);

      expect(pytania.length, 'lekarz został zapytany dokładnie raz').toBe(1);
      expect(pytania[0].foreign.map((f) => f.pomiar.ageMonths), 'pytanie dotyczy tylko obcego pomiaru')
        .toEqual([80]);
      expect(pytania[0].foreign.map((f) => f.gdzie), 'pytanie wskazuje moduł').toEqual([gdzie]);
      expect(pytania[0].patientId, 'pytanie zna pacjenta').toBe(patientId);

      const po = await zapisany(v, patientId, zapis.snapshotId);
      expect(wieki(po[gdzie]), 'po „Dopisz je do zapisu" rekord ma komplet').toEqual([60, 66, 80]);
    });
  }

  it('bez rezolwera zapis nie gubi cudzego pomiaru', async () => {
    // Rezolwer rejestruje UI. Gdyby go zabrakło (skrypt nie zdążył się wczytać), sejf ma
    // wybrać wariant, który niczego nie kasuje.
    const v = await sejf();
    const { patientId, zapis } = await rozjazd(v, 'advanced');
    const po = await zapisany(v, patientId, zapis.snapshotId);
    expect(wieki(po.advanced)).toEqual([60, 66, 80]);
  });

  it('rezolwer, który się wywrócił, też nie kasuje cudzego pomiaru', async () => {
    const v = await sejf();
    pytaj(v, () => { throw new Error('modal padł'); });
    const { patientId, zapis } = await rozjazd(v, 'advanced');
    const po = await zapisany(v, patientId, zapis.snapshotId);
    expect(wieki(po.advanced)).toEqual([60, 66, 80]);
  });

  it('„Zapisz bez nich" respektuje decyzję lekarza', async () => {
    const v = await sejf();
    pytaj(v, () => 'nadpisz');
    const { patientId, zapis } = await rozjazd(v, 'advanced');
    const po = await zapisany(v, patientId, zapis.snapshotId);
    expect(wieki(po.advanced), 'bieżąca wersja ma tylko to, co w formularzu').toEqual([60, 66]);
  });

  it('„Anuluj zapis" nie zapisuje niczego', async () => {
    const v = await sejf();
    pytaj(v, () => 'anuluj');

    const wczytane = payload('advanced', [60, 66]);
    const pierwszy = await v.savePatient(wczytane, { dedup: false });
    await tik();
    const drugi = await v.savePatient(payload('advanced', [60, 66, 80]), {
      patientId: pierwszy.patientId, dedup: false,
    });
    await tik();

    let blad = null;
    try {
      await v.savePatient(payload('advanced', [60, 66]), {
        patientId: pierwszy.patientId, dedup: false, baselinePayload: wczytane,
      });
    } catch (e) { blad = e; }

    expect(blad, 'anulowanie kończy zapis wyjątkiem').toBeTruthy();
    expect(blad.vildaSaveAborted, 'wyjątek jest rozpoznawalny jako anulowanie').toBe(true);

    const rekord = await v.getPatient(pierwszy.patientId);
    expect(rekord.snapshots[0].snapshotId, 'głowa rekordu się nie ruszyła').toBe(drugi.snapshotId);
    expect(rekord.snapshots.length, 'nie przybyło wersji').toBe(2);
  });

  it('świadome usunięcie wiersza na aktualnej kopii nie pyta i nie wraca', async () => {
    // Kontrola negatywna — to jest różnica między porównaniem treści a scalaniem
    // „na wszelki wypadek". Lekarz skasował błędny wiersz; nikt inny nic nie dopisał.
    const v = await sejf();
    let pytano = 0;
    pytaj(v, () => { pytano += 1; return 'scal'; });

    const wczytane = payload('advanced', [60, 66]);
    const pierwszy = await v.savePatient(wczytane, { dedup: false });
    await tik();
    const zapis = await v.savePatient(payload('advanced', [60]), {
      patientId: pierwszy.patientId, dedup: false, baselinePayload: wczytane,
    });

    expect(pytano, 'nie ma o co pytać').toBe(0);
    const po = await zapisany(v, pierwszy.patientId, zapis.snapshotId);
    expect(wieki(po.advanced), 'usunięty wiersz nie wraca').toEqual([60]);
  });

  it('zapis bez zadeklarowanej kopii zachowuje się jak dotąd', async () => {
    // Kontrola negatywna dla pozostałych wywołań sejfu (terminarz, notatki, moduły
    // terapii) — one nie deklarują kopii i nie wolno im przy okazji zafundować modala.
    const v = await sejf();
    let pytano = 0;
    pytaj(v, () => { pytano += 1; return 'scal'; });

    const pierwszy = await v.savePatient(payload('advanced', [60, 66]), { dedup: false });
    await tik();
    await v.savePatient(payload('advanced', [60, 66, 80]), { patientId: pierwszy.patientId, dedup: false });
    await tik();
    const zapis = await v.savePatient(payload('advanced', [60]), {
      patientId: pierwszy.patientId, dedup: false,
    });

    expect(pytano, 'brak deklaracji kopii = brak pytania').toBe(0);
    const po = await zapisany(v, pierwszy.patientId, zapis.snapshotId);
    expect(wieki(po.advanced)).toEqual([60]);
  });

  it('nowy pacjent nie wywołuje pytania', async () => {
    const v = await sejf();
    let pytano = 0;
    pytaj(v, () => { pytano += 1; return 'scal'; });
    await v.savePatient(payload('advanced', [60]), { dedup: false, baselinePayload: {} });
    expect(pytano).toBe(0);
  });

  it('punkty synchronizowane z terapii GH nie trafiają do pytania', async () => {
    // `ghSync:true` to punkty dokładane automatycznie przez moduł terapii, a nie pomiary
    // wpisane ręcznie. Sejf odsiewa je wszędzie indziej — tu też.
    const v = await sejf();
    const pytania = [];
    pytaj(v, (info) => { pytania.push(info); return 'scal'; });

    const wczytane = payload('advanced', [60]);
    const pierwszy = await v.savePatient(wczytane, { dedup: false });
    await tik();
    await v.savePatient(payload('advanced', [60, pomiar(72, { ghSync: true })]), {
      patientId: pierwszy.patientId, dedup: false,
    });
    await tik();
    await v.savePatient(payload('advanced', [60]), {
      patientId: pierwszy.patientId, dedup: false, baselinePayload: wczytane,
    });

    expect(pytania.length, 'punkt ghSync nie jest cudzą pracą lekarza').toBe(0);
  });

  it('pytanie obejmuje oba moduły wzrastania naraz', async () => {
    const v = await sejf();
    const pytania = [];
    pytaj(v, (info) => { pytania.push(info); return 'scal'; });

    const wczytane = payload('advanced', [60]);
    wczytane.growthBasic = { data: { measurements: [pomiar(60)] } };
    const pierwszy = await v.savePatient(wczytane, { dedup: false });
    await tik();
    const nowszy = payload('advanced', [60, 80]);
    nowszy.growthBasic = { data: { measurements: [pomiar(60), pomiar(90)] } };
    await v.savePatient(nowszy, { patientId: pierwszy.patientId, dedup: false });
    await tik();

    const moj = payload('advanced', [60]);
    moj.growthBasic = { data: { measurements: [pomiar(60)] } };
    const zapis = await v.savePatient(moj, {
      patientId: pierwszy.patientId, dedup: false, baselinePayload: wczytane,
    });

    expect(pytania.length).toBe(1);
    expect(pytania[0].foreign.map((f) => `${f.gdzie}:${f.pomiar.ageMonths}`).sort())
      .toEqual(['advanced:80', 'growthBasic:90']);

    const po = await zapisany(v, pierwszy.patientId, zapis.snapshotId);
    expect(wieki(po.advanced)).toEqual([60, 80]);
    expect(wieki(po.growthBasic)).toEqual([60, 90]);
  });
});

// ── Kontrola końcowa audytu „Pacjenci" ────────────────────────────────────────
// Cztery znaleziska z przeglądu całości pięciu rat, każde zmierzone na kodzie sprzed
// tej poprawki.
describe('Kontrola końcowa — brama zapisu po przeglądzie całości', () => {
  it('K3 — poprawka SAMEJ masy na innym urządzeniu nie jest już niewidoczna', async () => {
    // Klucz porównania brzmiał `ageMonths|height`, więc zmiana samej masy przechodziła
    // przez bramę bez śladu, a zapis cicho ją cofał (masa wracała z 99 na 22).
    const v = await sejf();
    const pytania = [];
    pytaj(v, (info) => { pytania.push(info); return 'scal'; });

    const wczytane = payload('growthBasic', [60]);
    const pierwszy = await v.savePatient(JSON.parse(JSON.stringify(wczytane)), { dedup: false });
    await tik();
    const poprawiony = payload('growthBasic', [60]);
    poprawiony.growthBasic.data.measurements[0].weight = 99;
    await v.savePatient(poprawiony, { patientId: pierwszy.patientId, dedup: false });
    await tik();

    const zapis = await v.savePatient(payload('growthBasic', [60]), {
      patientId: pierwszy.patientId, dedup: false, baselinePayload: JSON.parse(JSON.stringify(wczytane)),
    });

    expect(pytania.length, 'poprawka masy jest cudzą pracą i wymaga pytania').toBe(1);
    expect(pytania[0].foreign[0].rodzaj, 'to poprawka istniejącego wiersza, nie nowy pomiar')
      .toBe('zmieniony');
    expect(pytania[0].foreign[0].wZapisie.weight, 'pytanie pokazuje też wersję z formularza').toBe(22);

    const po = await zapisany(v, pierwszy.patientId, zapis.snapshotId);
    const wiersze = po.growthBasic.data.measurements;
    expect(wiersze.length, 'poprawka zastępuje wiersz, nie dokłada duplikatu').toBe(1);
    expect(wiersze[0].weight, 'masa poprawiona na innym urządzeniu zostaje').toBe(99);
  });

  it('K3 — kontrola negatywna: wiersz zmieniony przez samego lekarza nie pyta', async () => {
    // Jeśli to lekarz przy tym formularzu zmienił masę, jego decyzja wygrywa bez pytania.
    const v = await sejf();
    let pytano = 0;
    pytaj(v, () => { pytano += 1; return 'scal'; });

    const wczytane = payload('growthBasic', [60]);
    const pierwszy = await v.savePatient(JSON.parse(JSON.stringify(wczytane)), { dedup: false });
    await tik();

    const moj = payload('growthBasic', [60]);
    moj.growthBasic.data.measurements[0].weight = 30;
    const zapis = await v.savePatient(moj, {
      patientId: pierwszy.patientId, dedup: false, baselinePayload: JSON.parse(JSON.stringify(wczytane)),
    });

    expect(pytano, 'własna zmiana lekarza to nie rozjazd').toBe(0);
    const po = await zapisany(v, pierwszy.patientId, zapis.snapshotId);
    expect(po.growthBasic.data.measurements[0].weight).toBe(30);
  });

  it('K4 — „Zapisz to, co w formularzu" nie jest cofane przez starą unię', async () => {
    // Stare zabezpieczenie `no()` dokłada pomiary z głowy rekordu, gdy payload zawiera
    // choć jeden wiersz `ghSync` (pacjent na terapii GH). Bez wyłączenia go decyzja
    // lekarza była po cichu odwracana: zapisywało się [50, 60, 80] zamiast [50, 60].
    const v = await sejf();
    pytaj(v, () => 'nadpisz');

    const gh = Object.assign(pomiar(50), { ghSync: true });
    const zGh = (wieki) => {
      const p = payload('advanced', []);
      p.advanced = { data: { measurements: [JSON.parse(JSON.stringify(gh))].concat(wieki.map(pomiar)) } };
      return p;
    };

    const wczytane = zGh([60]);
    const pierwszy = await v.savePatient(JSON.parse(JSON.stringify(wczytane)), { dedup: false });
    await tik();
    await v.savePatient(zGh([60, 80]), { patientId: pierwszy.patientId, dedup: false });
    await tik();

    const zapis = await v.savePatient(zGh([60]), {
      patientId: pierwszy.patientId, dedup: false, baselinePayload: JSON.parse(JSON.stringify(wczytane)),
    });

    const po = await zapisany(v, pierwszy.patientId, zapis.snapshotId);
    expect(wieki(po.advanced), 'wybór lekarza zostaje wyborem lekarza').toEqual([50, 60]);
  });

  it('K4 — kontrola negatywna: bez deklarowanej kopii unia ghSync działa jak dotąd', async () => {
    const v = await sejf();
    const gh = Object.assign(pomiar(50), { ghSync: true });
    const zGh = (wieki) => {
      const p = payload('advanced', []);
      p.advanced = { data: { measurements: [JSON.parse(JSON.stringify(gh))].concat(wieki.map(pomiar)) } };
      return p;
    };
    const pierwszy = await v.savePatient(zGh([60]), { dedup: false });
    await tik();
    await v.savePatient(zGh([60, 80]), { patientId: pierwszy.patientId, dedup: false });
    await tik();
    const zapis = await v.savePatient(zGh([60]), { patientId: pierwszy.patientId, dedup: false });

    const po = await zapisany(v, pierwszy.patientId, zapis.snapshotId);
    expect(wieki(po.advanced), 'stare zabezpieczenie nietknięte tam, gdzie nikt nie pytał')
      .toEqual([50, 60, 80]);
  });

  it('K2 — brama nie podwaja odczytów historii rekordu', async () => {
    // Brama czytała głowę rekordu osobno, a zaraz po niej robiło to stare zabezpieczenie:
    // dwa odszyfrowania całej historii na każdy zapis zamiast jednego.
    const v = await sejf();
    const pierwszy = await v.savePatient(payload('advanced', [60]), { dedup: false });
    for (let i = 0; i < 5; i += 1) {
      await tik();
      await v.savePatient(payload('advanced', [60, 62 + i]), { patientId: pierwszy.patientId, dedup: false });
    }
    await tik();

    v.__odczytyHistorii = 0;
    await v.savePatient(payload('advanced', [60]), { patientId: pierwszy.patientId, dedup: false });
    const bezKopii = v.__odczytyHistorii;
    await tik();

    v.__odczytyHistorii = 0;
    await v.savePatient(payload('advanced', [60]), {
      patientId: pierwszy.patientId, dedup: false, baselinePayload: payload('advanced', [60]),
    });
    const zKopia = v.__odczytyHistorii;

    expect(bezKopii, 'zapis bez deklaracji czyta historię raz').toBe(1);
    expect(zKopia, 'deklaracja kopii nie dokłada drugiego odczytu').toBe(bezKopii);
  });

  it('K1 — drugi zapis w tej samej wizycie nie pyta o przyjęty już wiersz', async () => {
    // Scalenie dokłada pomiar do rekordu, ale nie do formularza — formularz pokazuje stan
    // sprzed przyjęcia. Bez pamięci przyjętych wierszy kolejny „Zapisz" albo pytał o to
    // samo drugi raz, albo (gdyby kopię odniesienia po prostu zaktualizować) kasował
    // przyjęty wiersz jako „świadomie usunięty".
    const v = await sejf();
    let pytano = 0;
    pytaj(v, () => { pytano += 1; return 'scal'; });

    const wczytane = payload('advanced', [60, 66]);
    const pierwszy = await v.savePatient(JSON.parse(JSON.stringify(wczytane)), { dedup: false });
    await tik();
    await v.savePatient(payload('advanced', [60, 66, 80]), { patientId: pierwszy.patientId, dedup: false });
    await tik();

    let pamiec = { patientId: null, wiersze: [] };
    const pierwszyZapis = await v.savePatient(payload('advanced', [60, 66]), {
      patientId: pierwszy.patientId, dedup: false,
      baselinePayload: JSON.parse(JSON.stringify(wczytane)), przyjeteZBazy: pamiec,
    });
    expect(pierwszyZapis.scalonoZBazy, 'jeden wiersz przyjęty z bazy').toBe(1);
    expect(pierwszyZapis.przyjeteZBazy.map((w) => w.pomiar.ageMonths), 'sejf oddaje, co przyjął')
      .toEqual([80]);
    pamiec = { patientId: pierwszyZapis.patientId, wiersze: pierwszyZapis.przyjeteZBazy };
    await tik();

    // Formularz się nie zmienił — nadal [60, 66].
    const drugiZapis = await v.savePatient(payload('advanced', [60, 66]), {
      patientId: pierwszy.patientId, dedup: false,
      baselinePayload: JSON.parse(JSON.stringify(wczytane)), przyjeteZBazy: pamiec,
    });

    expect(pytano, 'pytanie pada raz, nie przy każdym zapisie').toBe(1);
    const po = await zapisany(v, pierwszy.patientId, drugiZapis.snapshotId);
    expect(wieki(po.advanced), 'przyjęty wiersz nie wypada przy kolejnym zapisie')
      .toEqual([60, 66, 80]);
  });

  it('K1 — kontrola negatywna: pamięć innego pacjenta nie działa', async () => {
    // Pamięć jest związana z pacjentem; wczytanie innego rekordu unieważnia ją samo z siebie.
    const v = await sejf();
    let pytano = 0;
    pytaj(v, () => { pytano += 1; return 'nadpisz'; });

    const wczytane = payload('advanced', [60, 66]);
    const pierwszy = await v.savePatient(JSON.parse(JSON.stringify(wczytane)), { dedup: false });
    await tik();
    await v.savePatient(payload('advanced', [60, 66, 80]), { patientId: pierwszy.patientId, dedup: false });
    await tik();

    const zapis = await v.savePatient(payload('advanced', [60, 66]), {
      patientId: pierwszy.patientId,
      dedup: false,
      baselinePayload: JSON.parse(JSON.stringify(wczytane)),
      przyjeteZBazy: { patientId: 'inny-pacjent', wiersze: [{ gdzie: 'advanced', pomiar: pomiar(80) }] },
    });

    expect(pytano, 'cudza pamięć nie ucisza pytania').toBe(1);
    const po = await zapisany(v, pierwszy.patientId, zapis.snapshotId);
    expect(wieki(po.advanced), 'decyzja lekarza z tego zapisu obowiązuje').toEqual([60, 66]);
  });
});

// Źródło bez komentarzy: opisy naprawy cytują kod, więc surowy plik „zawiera" wzorce,
// których szukamy jako nieobecnych. Ucinamy całe linie komentarza — naiwne ucinanie od
// pierwszego „//" kaleczy plik zminifikowany, bo w łańcuchach siedzą adresy https://.
const zrodlo = (nazwa) => readFileSync(path.join(repoRoot, nazwa), 'utf8')
  .split('\n')
  .filter((w) => !/^\s*\/\//.test(w))
  .join('\n');

describe('P14b — okablowanie aplikacji', () => {
  it('główny „Zapisz" deklaruje sejfowi wczytaną kopię', () => {
    const kod = zrodlo('vilda_data_import_export.js');
    expect(kod.includes('return n.savePatient(a)'), 'zapis bez żadnej deklaracji').toBe(false);
    expect(kod, 'zapis przekazuje baselinePayload').toContain('n.savePatient(a,{baselinePayload:');
    expect(kod, 'kopia bierze się z lastLoadedData').toContain('r.lastLoadedData&&typeof r.lastLoadedData=="object"');
  });

  it('anulowany zapis nie udaje awarii', () => {
    const kod = zrodlo('vilda_data_import_export.js');
    expect(kod, 'anulowanie ma własny komunikat').toContain('s.vildaSaveAborted===!0');
  });

  it('aplikacja pamięta wiersze przyjęte z bazy i podaje je sejfowi', () => {
    const kod = zrodlo('vilda_data_import_export.js');
    expect(kod, 'zapis deklaruje pamięć przyjętych wierszy')
      .toContain('przyjeteZBazy:{patientId:Bb4,wiersze:Bb5}');
    expect(kod, 'pamięć uzupełnia się z odpowiedzi sejfu').toContain('s.przyjeteZBazy');
    // Pierwsza próba przeładowywała formularz przez applyLoadedData — a ta funkcja czyści
    // pola wieku, wagi i wzrostu, więc lekarstwo było gorsze od choroby. Złapało to e2e,
    // nie test strukturalny.
    expect(kod.includes('r.applyLoadedData(JSON.parse(JSON.stringify(a)))'),
      'przeładowanie formularza po zapisie').toBe(false);
  });

  it('modal pytania jest rejestrowany w sejfie', () => {
    const kod = zrodlo('vilda_auth_ui.js');
    expect(kod, 'rezolwer trafia do sejfu').toContain('setSaveConflictResolver(Gh2)');
    expect(kod, 'rejestracja odpala się przy starcie').toContain('try{Gh3()}catch{}');
    expect(kod, 'modal ma trzy wyjścia').toContain('d("nadpisz")');
    expect(kod, 'przyciski nazywają obie ścieżki, nie tylko dopisywanie')
      .toContain('text:"Przyjmij dane z bazy"');
    expect(kod, 'przyciski nazywają obie ścieżki, nie tylko dopisywanie')
      .toContain('text:"Zapisz to, co w formularzu"');
    expect(kod, 'lista rozróżnia pomiar dopisany od poprawionego')
      .toContain('t.rodzaj==="zmieniony"');
    expect(kod, 'modal ma trzy wyjścia').toContain('d("anuluj")');
    expect(kod, 'modal ma trzy wyjścia').toContain('d("scal")');
  });

  it('sejf wystawia punkt rejestracji', () => {
    const kod = zrodlo('vilda_vault.js');
    expect(kod, 'API sejfu zna rezolwer').toContain('setSaveConflictResolver:Bb8');
    expect(kod, 'brama odpala się tylko przy zadeklarowanej kopii')
      .toContain('if(!i&&n.baselinePayload&&typeof n.baselinePayload=="object")Bc1=await Bb6(');
    expect(kod.includes('async function Bb6(t,e,n){const r=await hr(t)'),
      'brama czytająca historię drugi raz na własną rękę').toBe(false);
    expect(kod.includes('function Bb7(t){return String(t&&t.ageMonths)+"|"+String(t&&t.height)}'),
      'klucz ślepy na poprawkę samej masy').toBe(false);
    expect(kod, 'stara unia da się wyłączyć decyzją lekarza').toContain('!(Ba1&&Ba1.noUnion===!0)');
  });
});
