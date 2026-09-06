import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Rata A z audytu sekcji „Pacjenci" — dwa znaleziska o jednym skutku: rekord pacjenta
// traci pomiary.
//
// P13. Ekran „Edytuj pacjenta" klonuje payload w chwili otwarcia i zapisuje ten klon
//      w całości. Dwa oddzielne uszkodzenia w jednym miejscu:
//      (a) pola wieku (niewidoczne, nierenderowane do DOM) były przed zapisem
//          przeliczane z daty urodzenia NA DZIŚ — samo otwarcie i zapisanie edycji
//          przestawiało wiek starego pomiaru na dzisiejszy;
//      (b) klon z chwili otwarcia nadpisywał wszystko, co w międzyczasie zapisało inne
//          urządzenie albo synchronizacja.
// P14. Sejf miał zabezpieczenie przed takim nadpisaniem (`no()`), ale odpalało się ono
//      wyłącznie wtedy, gdy w payloadzie był choć jeden wiersz z `ghSync:true`.
//      Pomiary bez tej flagi nie były chronione wcale, `growthBasic` — nigdy.
//
// Testy sejfu poniżej są zachowaniowe (prawdziwy `vilda_vault.js`, prawdziwy zapis
// i odczyt). Testy ekranu edycji są strukturalne, bo `fi()` to UI — pomiar na żywym
// ekranie robi tests/e2e/karta-pacjenta-zapis.spec.mjs.

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
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return vault;
}

const ITER = 10000;
let licznik = 0;

async function sejf() {
  licznik += 1;
  const v = loadDevice();
  await v.createUser(`Sejf#Rata!2026${licznik}aa`, { label: `dev${licznik}`, iterations: ITER });
  return v;
}

// Pomiar zapisany w rekordzie: wiek w miesiącach + wzrost + masa.
const pomiar = (ageMonths) => ({
  ageMonths,
  ageYears: ageMonths / 12,
  height: 90 + ageMonths / 2,
  weight: 12 + ageMonths / 6,
});

function payload(gdzie, wieki) {
  const p = {
    name: 'Kowalski Jan',
    user: { lastName: 'Kowalski', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  };
  p[gdzie] = { data: { measurements: wieki.map(pomiar) } };
  return p;
}

const wieki = (kontener) => (
  kontener && kontener.data && Array.isArray(kontener.data.measurements)
    ? kontener.data.measurements.map((r) => r.ageMonths).sort((a, b) => a - b)
    : []
);

// Sejf porządkuje snapshoty po `savedAtISO`; dwa zapisy w tej samej milisekundzie
// dają porządek zależny od losowego identyfikatora. Czekamy na warunek — przesunięcie
// zegara — a nie na odmierzony czas, i tak czy owak czytamy zapis po jego id.
const tik = () => new Promise((gotowe) => {
  const start = Date.now();
  const sprawdz = () => (Date.now() > start ? gotowe() : setTimeout(sprawdz, 1));
  sprawdz();
});

const zapisany = async (v, patientId, snapshotId) => {
  const rekord = await v.getPatient(patientId);
  const znaleziony = rekord.snapshots.filter((s) => s.snapshotId === snapshotId)[0];
  expect(znaleziony, 'zapis jest w rekordzie').toBeTruthy();
  return znaleziony.payload;
};

describe('P14 — zapis na nieaktualnej kopii rekordu nie kasuje pomiarów', () => {
  for (const gdzie of ['advanced', 'growthBasic']) {
    it(`${gdzie}: pomiary dopisane w międzyczasie wracają do zapisu`, async () => {
      const v = await sejf();
      const pierwszy = await v.savePatient(payload(gdzie, [60, 66]), { dedup: false });
      await tik();
      // Drugie urządzenie dokłada pomiar — głowa rekordu przesuwa się.
      await v.savePatient(payload(gdzie, [60, 66, 80]), { patientId: pierwszy.patientId, dedup: false });
      await tik();

      // Urządzenie z kopią sprzed tamtego zapisu odsyła swój stary stan.
      const stary = await v.savePatient(payload(gdzie, [60]), {
        patientId: pierwszy.patientId,
        dedup: false,
        baseSnapshotId: pierwszy.snapshotId,
      });

      const po = await zapisany(v, pierwszy.patientId, stary.snapshotId);
      expect(wieki(po[gdzie]), 'żaden pomiar nie znika przez zapis ze starej kopii')
        .toEqual([60, 66, 80]);
    });

    it(`${gdzie}: kasowanie pomiaru na AKTUALNEJ kopii dalej działa`, async () => {
      // Kontrola negatywna. Ochrona ma łapać pisanie po nieaktualnych danych, a nie
      // świadome usunięcie błędnego wiersza przez lekarza.
      const v = await sejf();
      const pierwszy = await v.savePatient(payload(gdzie, [60, 66]), { dedup: false });
      await tik();
      const skasowany = await v.savePatient(payload(gdzie, [60]), {
        patientId: pierwszy.patientId,
        dedup: false,
        baseSnapshotId: pierwszy.snapshotId,
      });

      const po = await zapisany(v, pierwszy.patientId, skasowany.snapshotId);
      expect(wieki(po[gdzie]), 'usunięcie wiersza zostaje').toEqual([60]);
    });
  }

  it('zapis bez zadeklarowanej bazy zachowuje się jak dotąd', async () => {
    // Druga kontrola negatywna: kalkulator nie przekazuje baseSnapshotId i nie wolno mu
    // przy okazji odebrać możliwości kasowania wiersza w module wzrastania.
    const v = await sejf();
    const pierwszy = await v.savePatient(payload('advanced', [60, 66]), { dedup: false });
    await tik();
    await v.savePatient(payload('advanced', [60, 66, 80]), { patientId: pierwszy.patientId, dedup: false });
    await tik();
    const bezBazy = await v.savePatient(payload('advanced', [60]), { patientId: pierwszy.patientId, dedup: false });

    const po = await zapisany(v, pierwszy.patientId, bezBazy.snapshotId);
    expect(wieki(po.advanced)).toEqual([60]);
  });

  it('nieaktualna baza nie wskrzesza pacjenta z pustego payloadu', async () => {
    // Kontrola dodatnia dla gałęzi „total-wipe": payload bez pomiarów na starej bazie
    // dostaje z powrotem całą historię, a nie tylko część.
    const v = await sejf();
    const pierwszy = await v.savePatient(payload('growthBasic', [60, 66]), { dedup: false });
    await tik();
    await v.savePatient(payload('growthBasic', [60, 66, 80]), { patientId: pierwszy.patientId, dedup: false });
    await tik();

    const bezHistorii = payload('growthBasic', []);
    delete bezHistorii.growthBasic;
    const pusty = await v.savePatient(bezHistorii, {
      patientId: pierwszy.patientId,
      dedup: false,
      baseSnapshotId: pierwszy.snapshotId,
    });

    const po = await zapisany(v, pierwszy.patientId, pusty.snapshotId);
    expect(wieki(po.growthBasic)).toEqual([60, 66, 80]);
  });
});

// Źródło bez komentarzy: opisy naprawy cytują usunięty kod, więc surowy plik
// „zawiera" wzorce, których szukamy jako nieobecnych.
const zrodlo = (nazwa) => readFileSync(path.join(repoRoot, nazwa), 'utf8')
  .split('\n')
  // Tylko linie będące w całości komentarzem. Naiwne ucinanie od pierwszego „//" w linii
  // kaleczy plik zminifikowany — w łańcuchach znakowych siedzą adresy https://.
  .filter((w) => !/^\s*\/\//.test(w))
  .join('\n');

describe('P13 — ekran edycji pacjenta', () => {
  const kod = zrodlo('vilda_auth_ui.js');

  it('nie przelicza zapisanego wieku na dzisiejszy', () => {
    expect(kod.includes('N.value=String(Ft.years),Z.value=String(Ft.ageMonths),N.readOnly=!0'),
      'bezwarunkowe nadpisanie wieku dzisiejszym wiekiem z daty urodzenia').toBe(false);
    expect(kod, 'data urodzenia dopełnia wiek tylko wtedy, gdy rekord go nie ma')
      .toContain('var Nt=(N.value||"").trim()===""&&(Z.value||"").trim()==="";Nt&&(N.value=String(Ft.years),Z.value=String(Ft.ageMonths))');
  });

  it('czyta rekord ponownie tuż przed zapisem', () => {
    expect(kod, 'kontrola głowy rekordu przed zapisem')
      .toContain('showPatientEditScreen getPatient(kontrola przed zapisem)');
    expect(kod, 'zapis deklaruje sejfowi, na jakiej wersji powstał')
      .toContain('await o.savePatient(At,{patientId:t,dedup:!1,baseSnapshotId:Ga5})');
  });

  it('przy rozjeździe pyta, zamiast scalać po cichu', () => {
    expect(kod).toContain('Dane pacjenta zmieni\\u0142y si\\u0119 od otwarcia edycji');
    for (const przycisk of [
      'Zapisz moje zmiany na aktualnych danych',
      'Porzu\\u0107 moje zmiany i wczytaj aktualne',
      'Wr\\u00F3\\u0107 do formularza',
    ]) {
      expect(kod, `przycisk „${przycisk}"`).toContain(przycisk);
    }
  });

  it('modal nie wchodzi w dock ani w strzałkę nawigacyjną na telefonie', () => {
    const css = readFileSync(path.join(repoRoot, 'vilda_auth_ui.css'), 'utf8');
    expect(css).toContain('body.vilda-modal-alert-open #mobileBottomDock');
    expect(css).toContain('body.vilda-modal-alert-open #scrollTopBtn');
    expect(kod, 'ekran edycji zakłada tę klasę na body').toContain('vilda-modal-alert-open');
  });
});
