import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// GROWTH-PUB-REC — sekcja `puberty` rekordu nie ma odpowiednika w formularzu kalkulatora,
// więc bez przeniesienia ginęłaby przy pierwszym zapisie („Zapisz" buduje snapshot
// wyłącznie z kolektora). Poniżej wycięte z pliku produkcyjnego pomocniki, nie ich kopie.

function pomocniki(okno) {
  const src = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');
  const start = src.indexOf('/* GROWTH-PUB-REC');
  const end = src.indexOf('function Bk2(', start);
  expect(start, 'znaleziono blok pomocnikow pokwitania').toBeGreaterThan(-1);
  expect(end, 'znaleziono koniec bloku').toBeGreaterThan(start);
  return new Function('r', 'l', `${src.slice(start, end)}\nreturn { Bq_pola, Bq0, Bq1 };`)(
    okno, () => {},
  );
}

const REKORD = { puberty: { onsetAgeYears: 11.5, menarcheAgeYears: 13 } };

describe('Które pola są przenoszone', () => {
  it('dokładnie dwa: wiek startu pokwitania i wiek menarche', () => {
    const { Bq_pola } = pomocniki({});
    expect(Bq_pola().sort()).toEqual(['menarcheAgeYears', 'onsetAgeYears']);
  });
});

describe('Zapamiętanie przy wczytaniu rekordu', () => {
  it('zapamiętuje obie liczby', () => {
    const okno = {};
    const { Bq0 } = pomocniki(okno);
    Bq0(REKORD);
    expect(okno.vildaPubertyData).toEqual({ onsetAgeYears: 11.5, menarcheAgeYears: 13 });
  });

  it('zapamiętuje samą menarche, gdy startu pokwitania nikt nie wpisał', () => {
    const okno = {};
    const { Bq0 } = pomocniki(okno);
    Bq0({ puberty: { menarcheAgeYears: 12.25 } });
    expect(okno.vildaPubertyData).toEqual({ menarcheAgeYears: 12.25 });
  });

  it('rekord bez sekcji kasuje pamięć — inaczej zostałby poprzedni pacjent', () => {
    const okno = { vildaPubertyData: { onsetAgeYears: 9 } };
    const { Bq0 } = pomocniki(okno);
    Bq0({ user: { sex: 'K' } });
    expect(okno.vildaPubertyData).toBeNull();
  });

  it('wartości nieliczbowe nie wchodzą do pamięci', () => {
    const okno = {};
    const { Bq0 } = pomocniki(okno);
    Bq0({ puberty: { onsetAgeYears: '11,5', menarcheAgeYears: NaN } });
    expect(okno.vildaPubertyData).toBeNull();
  });
});

describe('Odczyt przy zapisie', () => {
  it('oddaje zapamiętaną sekcję', () => {
    const okno = {};
    const { Bq0, Bq1 } = pomocniki(okno);
    Bq0(REKORD);
    expect(Bq1()).toEqual({ onsetAgeYears: 11.5, menarcheAgeYears: 13 });
  });

  it('bez pamięci oddaje null, a nie pusty obiekt', () => {
    const { Bq1 } = pomocniki({});
    expect(Bq1()).toBeNull();
  });

  it('pamięć wyczyszczona (nowy pacjent) to null', () => {
    const { Bq1 } = pomocniki({ vildaPubertyData: null });
    expect(Bq1()).toBeNull();
  });

  it('nie przepuszcza śmieci, które trafiły do pamięci obok modułu', () => {
    const { Bq1 } = pomocniki({ vildaPubertyData: { onsetAgeYears: 'jedenaście', obce: 5 } });
    expect(Bq1()).toBeNull();
  });
});

describe('Wpięcie w plik produkcyjny', () => {
  const src = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');

  it('kolektor niesie sekcję puberty', () => {
    expect(src).toContain('puberty:Bq1()');
  });

  it('zapamiętanie stoi w ścieżce wczytania rekordu', () => {
    expect(src).toContain('Bk1(e),Bq0(e)');
  });

  it('pamięć jest kasowana przy czyszczeniu danych i przy zmianie użytkownika', () => {
    const kasowania = src.match(/r\.vildaPubertyData=null/g) || [];
    expect(kasowania.length).toBe(2);
    expect(src).toContain('clearAllData:puberty-carry');
    expect(src).toContain('identityReset:puberty-carry');
  });
});
