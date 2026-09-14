import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-DUP (zgłoszenie właściciela 2026-09-14) — ten sam pacjent zapisywał się jako NOWY.
//
// ZGŁOSZENIE. Lekarz wczytał pacjenta z bazy, dopisał w formularzu głównym datę urodzenia,
// dodał nowe pomiary i kliknął „Zapisz". Aplikacja zapisała go jako NOWEGO pacjenta, a
// zakładka Pacjenci pokazała duplikat („różni pacjenci — rozróżnij datą urodzenia").
// Od tej chwili KAŻDY kolejny zapis tego pacjenta tworzył następną kopię — po czterech
// zapisach w bazie były cztery kopie tego samego dziecka.
//
// MECHANIZM. Główny „Zapisz" wołał `savePatient(payload, {...})` BEZ `patientId`, więc sejf
// wyprowadzał tożsamość z pary (nazwisko, dobISO) przez `Wa()`:
//   • z datą urodzenia: szuka rekordu o tym samym nazwisku I tej samej dacie. Stary rekord
//     daty nie miał, więc dopasowanie nie zachodziło. Skoro nie wszyscy kandydaci mają datę,
//     wynik to `ambiguous` — a `savePatient` przy `ambiguous` generuje NOWE id.
//   • bez daty urodzenia: dopasowuje tylko wtedy, gdy kandydat jest DOKŁADNIE JEDEN. Po
//     powstaniu pierwszego duplikatu kandydatów jest dwóch, więc znów `ambiguous` → nowe id.
// Stąd kumulacja: pierwszy błąd tworzył warunki dla wszystkich następnych.
//
// POPRAWKA. Aplikacja zna id wczytanego pacjenta (`custom-fixes.js` ustawia
// `window._vildaCurrentPatientId` oraz `sessionStorage.vildaCurrentPatientId` ze zdarzenia
// `vilda:patient-loaded`). `BdupId()` podaje je do `savePatient`, więc rekord aktualizuje
// się w miejscu i przy okazji dostaje datę urodzenia do główki.
//
// BRAMKA jest tu najważniejsza. Id wolno nieść tylko wtedy, gdy formularz nadal opisuje TĘ
// SAMĄ osobę. Gdyby lekarz po wczytaniu pacjenta A wpisał do formularza dane dziecka B i
// zapisał, brak bramki NADPISAŁBY rekord A danymi B. Duplikat jest kłopotliwy; ciche
// nadpisanie cudzego rekordu jest groźne — dlatego przy każdej wątpliwości wracamy do
// zachowania sprzed zmiany (czyli do `null`).
//
// Funkcje są WYCINANE Z PLIKU PRODUKCYJNEGO i uruchamiane wprost. Dane wyłącznie FIKCYJNE.

const src = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');
const vault = fs.readFileSync(path.join(korzen, 'vilda_vault.js'), 'utf8');

function wytnij(zrodlo, nazwa) {
  const i = zrodlo.indexOf(`function ${nazwa}(`);
  if (i < 0) return null;
  let d = 0;
  for (let k = zrodlo.indexOf('{', i); k < zrodlo.length; k += 1) {
    if (zrodlo[k] === '{') d += 1;
    else if (zrodlo[k] === '}') {
      d -= 1;
      if (d === 0) return zrodlo.slice(i, k + 1);
    }
  }
  return null;
}

function silnik() {
  const bdupNazwa = wytnij(src, 'BdupNazwa');
  const bdupId = wytnij(src, 'BdupId');
  expect(bdupNazwa, 'vilda_data_import_export.js ma BdupNazwa()').toBeTruthy();
  expect(bdupId, 'vilda_data_import_export.js ma BdupId()').toBeTruthy();
  return new Function(`${bdupNazwa}\n${bdupId}\nreturn BdupId;`)();
}

// Normalizacja nazwiska pochodzi z sejfu — bierzemy JEGO funkcję, nie kopię reguły.
function normalizatorZSejfu() {
  const ne = wytnij(vault, 'Ne');
  expect(ne, 'vilda_vault.js ma Ne()').toBeTruthy();
  return new Function(`${ne}\nreturn Ne;`)();
}

const PACJENT = 'Kowalski Testowy Fikcyjny';

/* Atrapa okna: wczytany pacjent o id `pid` i nazwisku `wczytaneNazwisko`. */
function okno({ pid = 'pat_fikcyjny_1', sesja = null, wczytane = { name: PACJENT }, sejf = true } = {}) {
  const w = {
    lastLoadedData: wczytane,
    sessionStorage: {
      getItem: (k) => (k === 'vildaCurrentPatientId' ? sesja : null),
    },
  };
  if (pid) w._vildaCurrentPatientId = pid;
  if (sejf) w.VildaVault = { normalizePatientName: normalizatorZSejfu() };
  return w;
}

describe('Zapis trafia w ten sam rekord, gdy formularz opisuje tę samą osobę', () => {
  it('wczytany pacjent + zgodne nazwisko → niesie jego id', () => {
    expect(silnik()({ name: PACJENT }, okno())).toBe('pat_fikcyjny_1');
  });

  it('id z sessionStorage, gdy zmienna okna przepadła po odświeżeniu karty', () => {
    const w = okno({ pid: null, sesja: 'pat_fikcyjny_2' });
    expect(silnik()({ name: PACJENT }, w)).toBe('pat_fikcyjny_2');
  });

  it('różnice wielkości liter, ogonków i spacji nie rozbijają tożsamości', () => {
    const w = okno({ wczytane: { name: 'Łąka-Żółw Testowa' } });
    expect(silnik()({ name: '  łaka-zolw   TESTOWA ' }, w)).toBe('pat_fikcyjny_1');
  });
});

describe('Bramka: nigdy nie nadpisuj rekordu innej osoby', () => {
  it('inne nazwisko w formularzu → brak uściślenia', () => {
    const w = okno();
    expect(silnik()({ name: 'Nowak Inny Fikcyjny' }, w)).toBeNull();
  });

  it('brak wczytanego rekordu → brak uściślenia', () => {
    const w = okno({ wczytane: null });
    expect(silnik()({ name: PACJENT }, w)).toBeNull();
  });

  it('pusta nazwa w formularzu → brak uściślenia', () => {
    expect(silnik()({ name: '   ' }, okno())).toBeNull();
  });

  it('pusta nazwa we wczytanym rekordzie → brak uściślenia', () => {
    const w = okno({ wczytane: { name: '' } });
    expect(silnik()({ name: PACJENT }, w)).toBeNull();
  });

  it('brak id wczytanego pacjenta → brak uściślenia', () => {
    const w = okno({ pid: null });
    expect(silnik()({ name: PACJENT }, w)).toBeNull();
  });
});

describe('Awaria otoczenia nie wywraca zapisu', () => {
  it('brak sejfu → brak uściślenia zamiast wyjątku', () => {
    const w = okno({ sejf: false });
    expect(silnik()({ name: PACJENT }, w)).toBeNull();
  });

  it('sejf bez normalizePatientName → brak uściślenia', () => {
    const w = okno();
    w.VildaVault = { version: 'x' };
    expect(silnik()({ name: PACJENT }, w)).toBeNull();
  });

  it('sessionStorage rzucający wyjątkiem nie przerywa zapisu', () => {
    const w = okno({ pid: null });
    w.sessionStorage = { getItem: () => { throw new Error('brak dostępu'); } };
    expect(silnik()({ name: PACJENT }, w)).toBeNull();
  });

  it('brak okna → brak uściślenia', () => {
    expect(silnik()({ name: PACJENT }, null)).toBeNull();
  });
});

describe('Sejf udostępnia normalizację nazwiska', () => {
  it('normalizePatientName jest w publicznym API sejfu', () => {
    expect(vault).toContain('normalizePatientName:Ne');
  });

  it('główny „Zapisz" podaje patientId do savePatient', () => {
    expect(src).toContain('Be3&&(Be4.patientId=Be3)');
    expect(src).toContain('BdupId(a,r)');
  });
});
