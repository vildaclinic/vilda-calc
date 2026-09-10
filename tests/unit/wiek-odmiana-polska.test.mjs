import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// LANG-WIEK — odmiana rzeczownika „rok" po liczebniku, w miejscach, gdzie aplikacja skleja
// wiek z liczby policzonej w locie (zgłoszenie właściciela 2026-09-10, po „ostatnich 1 lat").
//
// Reguła, której pilnujemy:
//   mianownik  — 1 rok, 2–4 lata, 5+ lat; końcówki 12–14 biorą „lat" (12 lat, ale 22 lata);
//   dopełniacz — 1 roku, każda inna liczba lat;
//   ułamek     — zawsze „roku" (2,5 roku), w obu przypadkach.
//
// Funkcje są WYCINANE Z PLIKÓW PRODUKCYJNYCH i uruchamiane wprost — mierzymy zachowanie
// aplikacji, nie kopię reguły. Tam, gdzie napis powstaje w wyrażeniu, a nie w funkcji,
// stoi obok strażnik strukturalny: wyrażenie ma iść przez pomocnika.

function zrodlo(plik) {
  return fs.readFileSync(path.join(korzen, plik), 'utf8');
}

// Wycina ciało funkcji po nazwie, licząc klamry. Zwraca null, gdy funkcji nie ma — dzięki
// temu pomiar „czerwone przed poprawką" mówi „brak pomocnika", a nie wywraca całego pliku.
function wytnij(src, nazwa) {
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

function pomocnik(plik, nazwa) {
  const cialo = wytnij(zrodlo(plik), nazwa);
  expect(cialo, `${plik} ma pomocnika ${nazwa}()`).toBeTruthy();
  return new Function(`${cialo}\nreturn ${nazwa};`)();
}

// Miejsca, w których ta sama reguła mianownika żyje w osobnej kopii. Kopie są świadome:
// moduły ładują się niezależnie i nie mają wspólnego globalu, więc każda niesie regułę
// u siebie — ale wszystkie muszą mówić to samo, i tego pilnuje ostatni test w tym pliku.
const KOPIE_MIANOWNIKA = [
  ['app.js', 'wiekLataMianownik'],
  ['vilda_auth_ui.js', 'wiekLataMianownik'],
  ['hypertension_therapy.js', 'wiekLataMianownik'],
  ['clcr_clinical_safety.js', 'wiekLataMianownik'],
  ['vilda_diet_recommendations.js', 'wiekLataMianownik'],
];

describe('Reguła odmiany — mianownik', () => {
  it.each(KOPIE_MIANOWNIKA)('%s: %s() odmienia zgodnie z regułą', (plik, nazwa) => {
    const f = pomocnik(plik, nazwa);
    expect(f(1)).toBe('rok');
    expect(f(2)).toBe('lata');
    expect(f(4)).toBe('lata');
    expect(f(5)).toBe('lat');
    expect(f(11)).toBe('lat');
    // Wyjątek końcówek 12–14 — to on odróżnia pełną regułę od uproszczonej.
    expect(f(12)).toBe('lat');
    expect(f(13)).toBe('lat');
    expect(f(14)).toBe('lat');
    expect(f(22)).toBe('lata');
    expect(f(113)).toBe('lat');
    // Ułamek: „2,5 roku", nie „2,5 lat".
    expect(f(2.5)).toBe('roku');
    // Brak danych nie może dać „undefined" w zdaniu.
    expect(f(Number.NaN)).toBe('lat');
  });
});

describe('Reguła odmiany — dopełniacz', () => {
  it('vilda_diet_recommendations.js: wiekLataDopelniacz()', () => {
    const f = pomocnik('vilda_diet_recommendations.js', 'wiekLataDopelniacz');
    expect(f(1)).toBe('roku');
    expect(f(2)).toBe('lat');
    expect(f(5)).toBe('lat');
    expect(f(22)).toBe('lat');
    expect(f(2.5)).toBe('roku');
  });
});

describe('Etykieta wieku w kalkulatorze klirensu', () => {
  const safety = (() => {
    const g = {};
    new Function('window', 'globalThis', zrodlo('clcr_clinical_safety.js'))(g, g);
    return g.ClcrClinicalSafety;
  })();
  const wiek = (years, months) => safety.formatAge({
    valid: true, years, months, daysOfLife: null,
  });

  it('mianownik po liczebniku, także z miesiącami', () => {
    expect(wiek(1, 0)).toBe('1 rok');
    expect(wiek(1, 3)).toBe('1 rok 3 mies.');
    expect(wiek(2, 0)).toBe('2 lata');
    expect(wiek(3, 6)).toBe('3 lata 6 mies.');
    expect(wiek(5, 0)).toBe('5 lat');
    expect(wiek(12, 2)).toBe('12 lat 2 mies.');
  });

  it('gałęzie sprzed roku życia zostają nietknięte', () => {
    expect(wiek(0, 7)).toBe('7 mies.');
    expect(safety.formatAge({ valid: true, years: 0, months: 0, daysOfLife: 3 }))
      .toBe('3. dzień życia');
    expect(safety.formatAge(null)).toBe('wiek nieokreślony');
  });
});

describe('Etykieta wieku w module nadciśnienia', () => {
  it('mianownik po liczebniku', () => {
    const src = zrodlo('hypertension_therapy.js');
    const f = new Function(
      `${wytnij(src, 'wiekLataMianownik') || ''}${wytnij(src, 'He')}\nreturn He;`,
    )();
    expect(f({ ageYearsBase: 1 })).toBe('1 rok');
    expect(f({ ageYearsBase: 2, ageMonthsExtra: 3 })).toBe('2 lata 3 mies.');
    expect(f({ ageYearsBase: 7 })).toBe('7 lat');
    expect(f({ ageYearsBase: null })).toBe('brak danych');
  });
});

describe('Etykieta wieku w Karcie pacjenta', () => {
  it('Le() — wiek z miesięcy, mianownik i wyjątek 12–14', () => {
    const src = zrodlo('vilda_auth_ui.js');
    const f = new Function(
      `${wytnij(src, 'wiekLataMianownik') || ''}${wytnij(src, 'Le')}\nreturn Le;`,
    )();
    expect(f(0)).toBe('noworodek');
    expect(f(7)).toBe('7 mies.');
    expect(f(12)).toBe('1 rok');
    expect(f(15)).toBe('1 rok 3 mies.');
    expect(f(24)).toBe('2 lata');
    expect(f(144)).toBe('12 lat');
    expect(f(264)).toBe('22 lata');
  });

  it('wiek podany w latach nie skleja się już z gołym „lat”', () => {
    const src = zrodlo('vilda_auth_ui.js');
    expect(src, 'żadnego `age + " lat"` w Karcie pacjenta')
      .not.toMatch(/\.age\s*\+\s*" lat"/);
    expect(src).toContain('wiekLataMianownik(et.age)');
    expect(src).toContain('wiekLataMianownik(f.age)');
  });
});

describe('Opis zapisu w podsumowaniu — „wiek ok.”', () => {
  // Pomocnik pobierany W TESCIE, nie przy zbieraniu pliku: gdy go zabraknie, ma paść ten
  // jeden test, a nie cały plik — inaczej pomiar „czerwone przed poprawką” nic nie mierzy.
  const f = (...a) => pomocnik('vilda_summary_cards.js', 'wiekOkolo')(...a);

  it('dopełniacz po „około”, bo tego wymaga przyimek', () => {
    expect(f(1)).toBe('wiek ok. 1 roku');
    expect(f(2)).toBe('wiek ok. 2 lat');
    expect(f(12)).toBe('wiek ok. 12 lat');
  });

  it('ułamek zapisany po polsku, przecinkiem, i z „roku”', () => {
    expect(f('10.5')).toBe('wiek ok. 10,5 roku');
    expect(f('1.5')).toBe('wiek ok. 1,5 roku');
    // toFixed(1) na pełnym roku daje „10.0" — zero po przecinku nie ma tu czego wnosić.
    expect(f('10.0')).toBe('wiek ok. 10 lat');
  });

  it('bez liczby nie ma napisu', () => {
    expect(f(null)).toBe('wiek ok. 0 lat');
    expect(f('brak')).toBe('');
  });
});

describe('Zalecenia żywieniowe — „w wieku …”', () => {
  it('zdanie o normach idzie przez dopełniacz', () => {
    const src = zrodlo('vilda_diet_recommendations.js');
    expect(src, 'żadnego gołego „w wieku N lat”')
      .not.toMatch(/w wieku \$\{Math\.floor\(e\)\} lat/);
    expect((src.match(/wiekLataDopelniacz\(Math\.floor\(e\)\)/g) || []).length)
      .toBe(2);
  });

  it('zapasowa etykieta wieku odmienia się razem z wyświetlaną liczbą', () => {
    const src = zrodlo('vilda_diet_recommendations.js');
    const f = new Function(
      `${wytnij(src, 'wiekLataMianownik')}${wytnij(src, 'wt')}\nreturn wt;`,
    )();
    expect(f(1)).toBe('1 rok');
    expect(f(2)).toBe('2 lata');
    expect(f(2.5)).toBe('2,5 roku');
    expect(f(7)).toBe('7 lat');
    expect(f('brak')).toBe('');
  });
});

describe('Etykieta wieku w normach żywienia', () => {
  // Normy PL 2024 obejmują także dorosłych („1,4–2,0 u dorosłych"), więc 22 lata to tu
  // wiek osiągalny, a nie przypadek teoretyczny.
  it('Et() — mianownik, z wyjątkiem końcówek 12–14', () => {
    const src = zrodlo('nutrition_norms.js');
    const f = new Function(`${wytnij(src, 'Et')}\nreturn Et;`)();
    expect(f(1, 0)).toBe('1 rok');
    expect(f(2, 0)).toBe('2 lata');
    expect(f(5, 0)).toBe('5 lat');
    expect(f(12, 0)).toBe('12 lat');
    expect(f(22, 0)).toBe('22 lata');
    // Poniżej roku życia moduł mówi miesiącami — ta gałąź zostaje nietknięta.
    expect(f(0.5, 6)).toBe('6 miesięcy');
    expect(f(0.08, 1)).toBe('1 miesiąc');
  });
});

describe('Nagłówek „Wiek:” w PDF-ie „Raport BMI & Metabolizmu”', () => {
  it('idzie przez pomocnika, a nie przez gołe „lat”', () => {
    const src = zrodlo('app.js');
    expect(src).toContain('let m=`${r} ${wiekLataMianownik(r)}`');
    expect(src, 'stara postać zniknęła').not.toContain('let m=`${r} lat`');
  });
});

describe('Kopie reguły nie rozjeżdżają się między modułami', () => {
  it('mianownik: wszystkie kopie dają ten sam wynik dla 0–130 lat', () => {
    const f = KOPIE_MIANOWNIKA.map(([plik, nazwa]) => [plik, pomocnik(plik, nazwa)]);
    for (let n = 0; n <= 130; n += 1) {
      const wzorzec = f[0][1](n);
      for (const [plik, g] of f) {
        expect(g(n), `${plik} przy ${n}`).toBe(wzorzec);
      }
    }
  });

  it('pomocnicy z modułów wzrostowych trzymają tę samą regułę', () => {
    const wzor = pomocnik('app.js', 'wiekLataMianownik');
    // vilda_patient_narrative.js — lataMian(); vilda_trajectory_analysis.js — fmtAgeM().
    const lataMian = pomocnik('vilda_patient_narrative.js', 'lataMian');
    const fmtAgeM = pomocnik('vilda_trajectory_analysis.js', 'fmtAgeM');
    for (let n = 1; n <= 130; n += 1) {
      expect(lataMian(n), `lataMian przy ${n}`).toBe(wzor(n));
      expect(fmtAgeM(n * 12), `fmtAgeM przy ${n}`).toBe(`${n} ${wzor(n)}`);
    }
  });
});
