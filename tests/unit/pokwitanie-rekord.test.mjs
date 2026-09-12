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
  it('dokładnie cztery: wiek startu pokwitania, wiek menarche, wzrost i wiek kostny przy menarche (GROWTH-PRED-TW2B/C)', () => {
    const { Bq_pola } = pomocniki({});
    expect(Bq_pola().sort()).toEqual(['boneAgeAtMenarcheYears', 'heightAtMenarcheCm', 'menarcheAgeYears', 'onsetAgeYears']);
  });

  it('wiek kostny przy menarche jest zapamiętywany z rekordu i oddawany kolektorowi (GROWTH-PRED-TW2C)', () => {
    const okno = {};
    const { Bq0, Bq1 } = pomocniki(okno);
    Bq0({ puberty: { menarcheAgeYears: 12.5, boneAgeAtMenarcheYears: 13 } });
    expect(okno.vildaPubertyData).toEqual({ menarcheAgeYears: 12.5, boneAgeAtMenarcheYears: 13 });
    expect(Bq1()).toEqual({ menarcheAgeYears: 12.5, boneAgeAtMenarcheYears: 13 });
  });

  it('wzrost przy menarche jest zapamiętywany z rekordu i oddawany kolektorowi', () => {
    const okno = {};
    const { Bq0, Bq1 } = pomocniki(okno);
    Bq0({ puberty: { menarcheAgeYears: 12.5, heightAtMenarcheCm: 152.5 } });
    expect(okno.vildaPubertyData).toEqual({ menarcheAgeYears: 12.5, heightAtMenarcheCm: 152.5 });
    expect(Bq1()).toEqual({ menarcheAgeYears: 12.5, heightAtMenarcheCm: 152.5 });
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

describe('Panel formularza ma pierwszeństwo nad pamięcią rekordu', () => {
  const zPolami = (pola) => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');
    const start = src.indexOf('/* GROWTH-PUB-REC');
    const end = src.indexOf('function Bk2(', start);
    const f = (id) => (Object.prototype.hasOwnProperty.call(pola, id) ? { value: pola[id] } : null);
    return new Function('r', 'l', 'f', `${src.slice(start, end)}\nreturn { Bq0, Bq1 };`)(
      { vildaPubertyData: { onsetAgeYears: 11.5, cdgpDeclared: 'nie' } }, () => {}, f,
    );
  };

  it('wartość z panelu wygrywa z zapamiętaną', () => {
    const { Bq1 } = zPolami({ pubertyOnsetAge: '9,8', pubertyCdgp: 'tak' });
    expect(Bq1()).toEqual({ onsetAgeYears: 9.8, cdgpDeclared: 'tak' });
  });

  it('puste pole panelu kasuje wartość — lekarz ją usunął', () => {
    const { Bq1 } = zPolami({ pubertyOnsetAge: '', pubertyCdgp: '' });
    expect(Bq1()).toBeNull();
  });

  it('bez panelu (DocPro, import) zostaje to, co w pamięci', () => {
    const { Bq1 } = zPolami({});
    expect(Bq1()).toEqual({ onsetAgeYears: 11.5, cdgpDeclared: 'nie' });
  });

  it('deklaracja KOWD przyjmuje wyłącznie „tak” albo „nie”', () => {
    expect(zPolami({ pubertyCdgp: 'byc moze' }).Bq1()).toEqual({ onsetAgeYears: 11.5 });
    expect(zPolami({ pubertyCdgp: 'nie' }).Bq1()).toEqual({ onsetAgeYears: 11.5, cdgpDeclared: 'nie' });
  });

  it('zapamiętanie z rekordu niesie deklarację KOWD', () => {
    const okno = {};
    const { Bq0 } = pomocniki(okno);
    Bq0({ puberty: { onsetAgeYears: 10, cdgpDeclared: 'tak' } });
    expect(okno.vildaPubertyData).toEqual({ onsetAgeYears: 10, cdgpDeclared: 'tak' });
  });

  it('deklaracja spoza słownika nie wchodzi do pamięci', () => {
    const okno = {};
    const { Bq0 } = pomocniki(okno);
    Bq0({ puberty: { cdgpDeclared: 'moze' } });
    expect(okno.vildaPubertyData).toBeNull();
  });
});
