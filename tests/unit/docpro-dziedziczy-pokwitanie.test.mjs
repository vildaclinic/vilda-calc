import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-DOCPRO-POKWITANIE (zgłoszenie właściciela 2026-09-14) — DocPro ma kartę „Zaawansowane
// obliczenia wzrostowe", ale nie ma ANI JEDNEGO pola pokwitaniowego. Temu samemu pacjentowi
// dawała więc uboższy wynik niż strona główna: bez etapu Tannera i bez objętości jąder
// nie powstaje profil pokwitania, a wejście oceny KOWD jest puste.
//
// Kierunek właściciela: nie mnożyć pól ani obliczeń — strona, która czegoś potrzebuje,
// ma to WZIĄĆ z tego samego miejsca, co strona główna. Tym miejscem jest rekord pacjenta,
// a jedne drzwi do niego to `VildaPubertySource.zPolaLubRekordu`.
//
// REGUŁA, którą mierzy ten plik: rozstrzyga OBECNOŚĆ pola, nie jego wypełnienie.
//   pole jest (formularz główny)  → liczy się to, co widać, także gdy jest puste
//                                   („dziś nie oceniono" to odpowiedź, nie brak odpowiedzi);
//   pola nie ma (DocPro)          → wchodzi rekord, ale przez regułę świeżości.
// Z tego wynika druga własność, równie ważna: na stronie głównej ta zmiana nie przestawia
// NICZEGO. Ten sam wzorzec zastosowano wcześniej w kolektorze (Bk_POLA) dla ZAPISU —
// tutaj ten sam podział obowiązuje przy LICZENIU.

function dokument(pola) {
  const mapa = new Map(Object.entries(pola || {}));
  return {
    readyState: 'complete',
    addEventListener() {},
    getElementById: (id) => (mapa.has(id) ? { value: mapa.get(id) } : null),
  };
}

/* Okno z podanymi polami. `pola: null` znaczy „strona bez DOM-u pól" — tak wygląda DocPro
 * dla pól pokwitaniowych. */
function zbuduj(pola) {
  const okno = { document: dokument(pola), addEventListener() {} };
  for (const plik of ['vilda_puberty_source.js', 'vilda_pubertal_status.js']) {
    new Function('window', fs.readFileSync(path.join(korzen, plik), 'utf8'))(okno);
  }
  return okno;
}

// Rekord pacjenta w kształcie, w jakim trzyma go sejf: „stan na dziś" leży w `user` i
// `advanced`, nie w sekcji `puberty`. Dane jednoznacznie fikcyjne.
const REKORD = {
  user: { sex: 'M', age: 12, ageMonths: 0, tannerStage: '3' },
  advanced: { testicularVolume: '4to6', familyDelayedPuberty: 'yes', growthExclusion: 'no' },
};

const POLA_GLOWNE = {
  tannerStage: '', advTesticularVolume: '', advFamilyDelayedPuberty: '', advGrowthExclusion: '',
  age: '12', ageMonths: '0',
};

describe('Stan na dzień pomiaru wyjęty z rekordu', () => {
  it('czyta etap z user.tannerStage, a trzy pozostałe z advanced', () => {
    const okno = zbuduj(null);
    const s = okno.VildaPubertySource.stanZPayloadu(REKORD);
    expect(s).toEqual({
      etap: '3',
      jadra: '4to6',
      wywiadOpoznienie: 'yes',
      wykluczenie: 'no',
      wiekWpisuMies: 144,
    });
  });

  it('rekord bez żadnej z czterech wartości to null, a nie obiekt z pustkami', () => {
    const okno = zbuduj(null);
    const P = okno.VildaPubertySource;
    expect(P.stanZPayloadu({ user: { age: 12, ageMonths: 0 } })).toBeNull();
    expect(P.stanZPayloadu({})).toBeNull();
    expect(P.stanZPayloadu(null)).toBeNull();
  });

  it('brak wieku w rekordzie to null, a nie zerowy miesiąc życia', () => {
    const okno = zbuduj(null);
    const s = okno.VildaPubertySource.stanZPayloadu({ user: { tannerStage: '2' } });
    expect(s.etap).toBe('2');
    expect(s.wiekWpisuMies, 'bez wieku nie da się ocenić świeżości').toBeNull();
  });

  it('sam wiek w miesiącach też jest liczony, gdy rekord nie ma pełnych lat', () => {
    const okno = zbuduj(null);
    expect(okno.VildaPubertySource.stanZPayloadu({
      user: { tannerStage: '1', ageMonths: 30 },
    }).wiekWpisuMies).toBe(30);
  });

  it('obie pamięci żyją niezależnie: fakt trwały bez stanu i stan bez faktu trwałego', () => {
    const okno = zbuduj(null);
    const P = okno.VildaPubertySource;

    P.zapamietaj({ puberty: { onsetAgeYears: 11 } });
    expect(P.zKartyPacjenta().wiekStartuPokwitaniaLat).toBe(11);
    expect(P.stanBiezacy(), 'sam fakt trwały nie wymyśla stanu na dziś').toBeNull();

    P.zapamietaj(REKORD);
    expect(P.zKartyPacjenta(), 'sam stan nie wymyśla sekcji puberty').toBeNull();
    expect(P.stanBiezacy().etap).toBe('3');
  });

  it('wylogowanie kasuje obie pamięci', () => {
    const okno = zbuduj(null);
    const P = okno.VildaPubertySource;
    P.zapamietaj(REKORD);
    P.zapomnij();
    expect(P.stanBiezacy()).toBeNull();
    expect(P.zKartyPacjenta()).toBeNull();
  });
});

describe('Jedne drzwi: pole albo rekord', () => {
  it('strona z polem czyta pole — nawet gdy pole jest puste', () => {
    const okno = zbuduj(POLA_GLOWNE);
    okno.VildaPubertySource.zapamietaj(REKORD);
    expect(okno.VildaPubertySource.zPolaLubRekordu('advTesticularVolume')).toBe('');
  });

  it('strona z wypełnionym polem czyta to, co widzi lekarz', () => {
    const okno = zbuduj({ ...POLA_GLOWNE, advTesticularVolume: 'lt4' });
    okno.VildaPubertySource.zapamietaj(REKORD);
    expect(okno.VildaPubertySource.zPolaLubRekordu('advTesticularVolume')).toBe('lt4');
  });

  it('strona bez pola bierze wartość z rekordu', () => {
    const okno = zbuduj(null);
    okno.VildaPubertySource.zapamietaj(REKORD);
    const P = okno.VildaPubertySource;
    expect(P.zPolaLubRekordu('advTesticularVolume')).toBe('4to6');
    expect(P.zPolaLubRekordu('advFamilyDelayedPuberty')).toBe('yes');
    expect(P.zPolaLubRekordu('advGrowthExclusion')).toBe('no');
    expect(P.zPolaLubRekordu('tannerStage')).toBe('3');
  });

  it('pole spoza listy stanu nie dostaje zastępstwa z rekordu', () => {
    const okno = zbuduj(null);
    okno.VildaPubertySource.zapamietaj(REKORD);
    expect(okno.VildaPubertySource.zPolaLubRekordu('advMotherHeight')).toBe('');
  });

  it('bez wczytanego pacjenta strona bez pola dostaje pustkę, a nie wyjątek', () => {
    const okno = zbuduj(null);
    expect(okno.VildaPubertySource.zPolaLubRekordu('tannerStage')).toBe('');
    expect(okno.VildaPubertySource.wiekStanuMies()).toBeNull();
  });
});

describe('Formularz główny: nic się nie zmienia', () => {
  it('puste pole etapu NIE wpuszcza etapu z rekordu', () => {
    const okno = zbuduj(POLA_GLOWNE);
    okno.VildaPubertySource.zapamietaj(REKORD);
    const d = okno.VildaPubertalStatus.dane({ plec: 'M', wiekLat: 12 });
    expect(d.etap, 'lekarz widzi puste pole — obliczenie ma widzieć to samo').toBeNull();
    expect(d.etapZrodlo).toBeNull();
  });

  it('puste pole jąder NIE wpuszcza objętości z rekordu', () => {
    const okno = zbuduj(POLA_GLOWNE);
    okno.VildaPubertySource.zapamietaj(REKORD);
    expect(okno.VildaPubertalStatus.dane({ plec: 'M', wiekLat: 12 }).jadra).toBe('');
  });

  it('wypełnione pole wygrywa z rekordem i jest oznaczone jako formularz', () => {
    const okno = zbuduj({ ...POLA_GLOWNE, tannerStage: '1', advTesticularVolume: 'lt4' });
    okno.VildaPubertySource.zapamietaj(REKORD);
    const d = okno.VildaPubertalStatus.dane({ plec: 'M', wiekLat: 12 });
    expect(d.etap).toBe(1);
    expect(d.etapZrodlo).toBe('formularz');
    expect(d.jadra).toBe('lt4');
  });
});

describe('DocPro: karta liczy z tych samych danych', () => {
  it('etap i jądra wchodzą z rekordu, z uczciwie nazwanym źródłem', () => {
    const okno = zbuduj({ age: '12', ageMonths: '0' });
    okno.VildaPubertySource.zapamietaj(REKORD);
    const d = okno.VildaPubertalStatus.dane({ plec: 'M', wiekLat: 12 });
    expect(d.etap).toBe(3);
    expect(d.etapZrodlo).toBe('rekord');
    expect(d.etapNieaktualny).toBe(false);
    expect(d.jadra).toBe('4to6');
  });

  it('etap z rekordu przechodzi przez regułę świeżości — 12 miesięcy to granica', () => {
    const okno = zbuduj(null);
    okno.VildaPubertySource.zapamietaj(REKORD); // wpis w 144. miesiącu życia
    const S = okno.VildaPubertalStatus;
    expect(S.dane({ plec: 'M', wiekLat: 13 }).etap, 'równo 12 mies. jeszcze wchodzi').toBe(3);
    const stary = S.dane({ plec: 'M', wiekLat: 14 });
    expect(stary.etap, 'starszy niż 12 mies. jest ignorowany').toBeNull();
    expect(stary.etapNieaktualny).toBe(true);
    expect(stary.etapPominiety, 'lekarz ma wiedzieć, co pominięto').toBe(3);
  });

  it('wiek bieżący bierze z pól wieku, gdy konsument go nie podał', () => {
    const okno = zbuduj({ age: '14', ageMonths: '0' });
    okno.VildaPubertySource.zapamietaj(REKORD);
    const d = okno.VildaPubertalStatus.dane({ plec: 'M' });
    expect(d.etap, '168 - 144 = 24 mies. — za stare').toBeNull();
    expect(d.etapNieaktualny).toBe(true);
  });

  it('wartość z rekordu naprawdę wchodzi do obliczeń — wykrywa sprzeczność', () => {
    const okno = zbuduj(null);
    okno.VildaPubertySource.zapamietaj({
      user: { sex: 'M', age: 12, ageMonths: 0, tannerStage: '1' },
      advanced: { testicularVolume: 'gt6' },
    });
    const d = okno.VildaPubertalStatus.dane({ plec: 'M', wiekLat: 12 });
    expect(d.etap).toBe(1);
    expect(d.jadra).toBe('gt6');
    expect(d.sprzecznosci.some((t) => t.includes('Tanner I wyklucza'))).toBe(true);
  });

  it('konsument może nadal podać etap wprost i to on rozstrzyga', () => {
    const okno = zbuduj(null);
    okno.VildaPubertySource.zapamietaj(REKORD);
    const d = okno.VildaPubertalStatus.dane({ plec: 'M', wiekLat: 12, etapFormularz: '5' });
    expect(d.etap).toBe(5);
    expect(d.etapZrodlo).toBe('formularz');
  });

  it('bez wczytanego pacjenta DocPro nie zgaduje etapu', () => {
    const okno = zbuduj(null);
    const d = okno.VildaPubertalStatus.dane({ plec: 'M', wiekLat: 12 });
    expect(d.etap).toBeNull();
    expect(d.jadra).toBe('');
  });
});
