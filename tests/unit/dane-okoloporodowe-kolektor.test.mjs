import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-PERINATAL (zgłoszenie właściciela 2026-09-14) — „Dane okołoporodowe" z Karty Pacjenta
// znikały przy pierwszym zapisie z formularza głównego.
//
// Kolektor buduje payload z NAZWANYCH sekcji (`user`, `advanced`, `growthBasic`, `birth`,
// `puberty`, `chartCreator`…). Sekcji `perinatal` nie było wśród nich, więc każdy zapis
// z formularza oddawał rekord bez niej, a `savePatient` zapisuje payload taki, jaki dostał.
//
// Formularz główny nie ma pól okołoporodowych, więc nie ma czego czytać z DOM — sekcję
// PRZENOSIMY z wczytanego rekordu, tym samym wzorcem co `dobISO` i `ageWeeks` (DOB-AGE-1/2).
// Sekcja `birth` takiego problemu nie miała, bo ma własny zapas (`window.vildaBirthData`);
// `perinatal` nikt nie podpiął.
//
// Funkcja jest WYCINANA Z PLIKU PRODUKCYJNEGO i uruchamiana wprost. Dane wyłącznie FIKCYJNE.

const src = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');

function wytnij(nazwa) {
  const i = src.indexOf(`function ${nazwa}(`);
  if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') {
      d -= 1;
      if (d === 0) return src.slice(i, k + 1);
    }
  }
  return null;
}

/* `r` to okno, `de` głęboki klon, `l` logger — zależności funkcji w module produkcyjnym. */
function silnik(okno) {
  const cialo = wytnij('Bper0');
  expect(cialo, 'vilda_data_import_export.js ma Bper0()').toBeTruthy();
  return new Function('r', `
    function de(x) { return JSON.parse(JSON.stringify(x)); }
    function l() { /* w teście nie logujemy */ }
    ${cialo}
    return Bper0;
  `)(okno);
}

const OKOLOPORODOWE = { gestationalAgeWeeks: 39, birthWeight: 3200, birthLength: 52, parity: '1' };

describe('Sekcja okołoporodowa jest przenoszona z wczytanego rekordu', () => {
  it('komplet danych przechodzi do payloadu', () => {
    expect(silnik({ lastLoadedData: { perinatal: OKOLOPORODOWE } })()).toEqual(OKOLOPORODOWE);
  });

  it('oddajemy KOPIĘ, nie referencję do wczytanego rekordu', () => {
    const okno = { lastLoadedData: { perinatal: OKOLOPORODOWE } };
    const wynik = silnik(okno)();
    wynik.birthWeight = 9999;
    expect(okno.lastLoadedData.perinatal.birthWeight, 'wczytany rekord nietknięty').toBe(3200);
  });

  it('pojedyncze pole też jest przenoszone', () => {
    expect(silnik({ lastLoadedData: { perinatal: { birthWeight: 2400 } } })()).toEqual({ birthWeight: 2400 });
  });
});

describe('Nie wymyślamy sekcji, której nie ma', () => {
  it('brak wczytanego rekordu → null', () => {
    expect(silnik({})()).toBeNull();
  });

  it('rekord bez sekcji okołoporodowej → null', () => {
    expect(silnik({ lastLoadedData: { user: { age: 5 } } })()).toBeNull();
  });

  it('pusty obiekt nie trafia do rekordu jako pusta sekcja', () => {
    expect(silnik({ lastLoadedData: { perinatal: {} } })()).toBeNull();
  });

  it('wartości innego typu są odrzucane', () => {
    expect(silnik({ lastLoadedData: { perinatal: 'coś' } })()).toBeNull();
    expect(silnik({ lastLoadedData: { perinatal: 42 } })()).toBeNull();
    expect(silnik({ lastLoadedData: { perinatal: null } })()).toBeNull();
    expect(silnik({ lastLoadedData: { perinatal: [1, 2] } })()).toBeNull();
  });

  it('niedostępne lastLoadedData nie wywraca zapisu', () => {
    const okno = {};
    Object.defineProperty(okno, 'lastLoadedData', { get() { throw new Error('brak dostępu'); } });
    expect(silnik(okno)()).toBeNull();
  });
});

describe('Okablowanie kolektora', () => {
  it('payload kolektora niesie sekcję okołoporodową obok urodzeniowej i pokwitaniowej', () => {
    expect(src).toContain('birth:Bf0(),perinatal:Bper0(),puberty:Bq1()');
  });
});
