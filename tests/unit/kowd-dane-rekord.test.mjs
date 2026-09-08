import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// GROWTH-KOWD-REC — wejście oceny KOWD (wiek kostny, objętość jąder, wywiad rodzinny,
// wykluczenia) ginęło z rekordu pacjenta na dwa sposoby: applyLoadedData czyściło te pola
// PO odtworzeniu ich z rekordu, a na docpro.html w ogóle ich nie ma, więc kolektor
// wpisywał null. Poniżej wycięte z pliku produkcyjnego pomocniki, nie ich kopie.

function pomocniki(okno, dom) {
  const src = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');
  const start = src.indexOf('/* GROWTH-KOWD-REC');
  const end = src.indexOf('function Oe(', start);
  expect(start, 'znaleziono blok pomocnikow KOWD').toBeGreaterThan(-1);
  expect(end, 'znaleziono koniec bloku').toBeGreaterThan(start);
  const f = (id) => (dom && Object.prototype.hasOwnProperty.call(dom, id) ? dom[id] : null);
  return new Function('r', 'f', 'l', `${src.slice(start, end)}\nreturn { Bk_POLA, Bk0, Bk1, Bk2 };`)(
    okno, f, () => {},
  );
}

const REKORD = {
  advanced: {
    boneAgeYears: 10.5,
    testicularVolume: '4to6',
    familyDelayedPuberty: 'yes',
    growthExclusion: 'no',
  },
};

describe('Które pola są chronione', () => {
  it('mapa obejmuje dokładnie komplet wejścia KOWD', () => {
    const { Bk_POLA } = pomocniki({});
    expect(Object.keys(Bk_POLA).sort()).toEqual([
      'advBoneAge', 'advFamilyDelayedPuberty', 'advGrowthExclusion', 'advTesticularVolume',
    ]);
    expect(Bk_POLA.advBoneAge).toBe('boneAgeYears');
    expect(Bk_POLA.advTesticularVolume).toBe('testicularVolume');
  });
});

describe('Czyszczenie pól przy wczytywaniu rekordu', () => {
  it('nie czyści pola, dla którego rekord niesie wartość', () => {
    const { Bk0 } = pomocniki({});
    expect(Bk0('advBoneAge', REKORD)).toBe(false);
    expect(Bk0('advTesticularVolume', REKORD)).toBe(false);
    expect(Bk0('advFamilyDelayedPuberty', REKORD)).toBe(false);
    expect(Bk0('advGrowthExclusion', REKORD)).toBe(false);
  });

  it('czyści pole, dla którego rekord nic nie niesie — inaczej zostałby poprzedni pacjent', () => {
    const { Bk0 } = pomocniki({});
    expect(Bk0('advBoneAge', { advanced: {} })).toBe(true);
    expect(Bk0('advTesticularVolume', { advanced: { testicularVolume: '' } })).toBe(true);
    expect(Bk0('advGrowthExclusion', {})).toBe(true);
    expect(Bk0('advBoneAge', null)).toBe(true);
  });

  it('pozostałych pól nie dotyka — wiek, masa i wzrost czyszczą się jak dotąd', () => {
    const { Bk0 } = pomocniki({});
    // Te są po czyszczeniu odtwarzane przez userData.js, więc reguła ich nie obejmuje.
    expect(Bk0('age', REKORD)).toBe(true);
    expect(Bk0('weight', REKORD)).toBe(true);
    expect(Bk0('height', REKORD)).toBe(true);
    expect(Bk0('advMotherHeight', REKORD)).toBe(true);
  });
});

describe('Przeniesienie wartości z wczytanego rekordu', () => {
  it('zapamiętuje tylko wartości, które rekord naprawdę ma', () => {
    const okno = {};
    const { Bk1 } = pomocniki(okno);
    Bk1(REKORD);
    expect(okno.vildaKowdData).toEqual({
      boneAgeYears: 10.5,
      testicularVolume: '4to6',
      familyDelayedPuberty: 'yes',
      growthExclusion: 'no',
    });
  });

  it('pomija pola puste, zamiast zapisywać pustki', () => {
    const okno = {};
    const { Bk1 } = pomocniki(okno);
    Bk1({ advanced: { testicularVolume: '4to6', familyDelayedPuberty: '', growthExclusion: null } });
    expect(okno.vildaKowdData).toEqual({ testicularVolume: '4to6' });
  });

  it('rekord bez danych KOWD kasuje pamięć po poprzednim pacjencie', () => {
    const okno = {};
    const { Bk1 } = pomocniki(okno);
    Bk1(REKORD);
    Bk1({ advanced: { motherHeight: 163 } });
    expect(okno.vildaKowdData).toBeNull();
  });

  it('rekord bez sekcji zaawansowanej też kasuje pamięć', () => {
    const okno = {};
    const { Bk1 } = pomocniki(okno);
    Bk1(REKORD);
    Bk1({ user: { age: 9 } });
    expect(okno.vildaKowdData).toBeNull();
  });

  it('okno broniące zapisu nie wywraca wczytywania rekordu', () => {
    const okno = {};
    Object.defineProperty(okno, 'vildaKowdData', {
      get() { return null; },
      set() { throw new Error('tylko do odczytu'); },
      configurable: true,
    });
    const { Bk1 } = pomocniki(okno);
    expect(() => Bk1(REKORD)).not.toThrow();
  });
});

describe('Wartość pola przy zapisie', () => {
  it('formularz ma pierwszeństwo przed wartością przeniesioną', () => {
    const okno = { vildaKowdData: { testicularVolume: '4to6' } };
    const { Bk2 } = pomocniki(okno, { advTesticularVolume: { value: 'gt6' } });
    expect(Bk2('advTesticularVolume')).toBe('gt6');
  });

  it('gdy strony nie mają tego pola, bierze wartość przeniesioną z rekordu', () => {
    // To jest ścieżka docpro.html: element nie istnieje, więc `f` zwraca null.
    const okno = { vildaKowdData: { testicularVolume: '4to6', boneAgeYears: 10.5 } };
    const { Bk2 } = pomocniki(okno, {});
    expect(Bk2('advTesticularVolume')).toBe('4to6');
    expect(Bk2('advBoneAge')).toBe('10.5');
  });

  it('pole ISTNIEJĄCE i opróżnione przez lekarza daje null, a nie wskrzeszenie', () => {
    // Kluczowa różnica: brak elementu ≠ pole wyczyszczone świadomie.
    const okno = { vildaKowdData: { testicularVolume: '4to6' } };
    const { Bk2 } = pomocniki(okno, { advTesticularVolume: { value: '' } });
    expect(Bk2('advTesticularVolume')).toBeNull();
  });

  it('kontrola negatywna: bez formularza i bez pamięci wychodzi null', () => {
    const { Bk2 } = pomocniki({}, {});
    expect(Bk2('advTesticularVolume')).toBeNull();
    expect(Bk2('advBoneAge')).toBeNull();
  });

  it('okno broniące odczytu nie wywraca zapisu', () => {
    const okno = {};
    Object.defineProperty(okno, 'vildaKowdData', {
      get() { throw new Error('brak dostępu'); },
      configurable: true,
    });
    const { Bk2 } = pomocniki(okno, {});
    expect(Bk2('advTesticularVolume')).toBeNull();
  });
});
