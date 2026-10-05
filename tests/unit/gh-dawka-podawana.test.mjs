import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-GH-DAWKA-PODAWANA (2026-10-05): dawka podawana preparatów GH — krok wstrzykiwacza, limit jednego
// wstrzyknięcia, podział dawki Ngenla na równe części w krokach, podpowiedź większego wstrzykiwacza i teksty
// komunikatów. Test ładuje PRAWDZIWE pliki danych i silnik (bez kopii wzorów). Przypadki liczbowe policzone
// ręcznie ze źródeł: Genotropin GoQuick 5,3 mg 0,1–1,5 mg co 0,05 mg, 12 mg 0,3–4,5 mg co 0,15 mg (ulotka 11/2025);
// Ngenla 24 mg 0,2–12 mg co 0,2 mg, 60 mg 0,5–30 mg co 0,5 mg (SmPC 4.2, EMA 16.01.2026); Omnitrope 0,05 / 0,1 mg
// jak dotąd w karcie (bez źródła w ChPL — decyzja właściciela 2026-10-05). Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function okno() {
  const w = {};
  for (const f of ['vilda_gh_opakowania_dane.js', 'vilda_gh_dawka_dane.js', 'vilda_gh_dawka.js']) {
    new Function('window', 'globalThis', fs.readFileSync(path.join(korzen, f), 'utf8'))(w, w);
  }
  return w;
}
const w = okno();
const E = w.VildaGhDawka;
const D = w.VildaGhDawkaDane;
// Silnik stawia twardą spację między liczbą a jednostką; porównujemy treść po zamianie jej na zwykłą spację,
// a samo jej miejsce sprawdza osobny przypadek.
const NB = '\u00a0';
const bez = (x) => (typeof x === 'string' ? x.replace(/\u00a0/g, ' ')
  : Array.isArray(x) ? x.map(bez)
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, bez(v)])) : x);

describe('Plik danych wstrzykiwaczy GH', () => {
  it('obejmuje preparaty z listy karty (z Increlex od P-GH-INCRELEX-PODANIE, bez Omnitrope 15 mg), z krokami jak w karcie', () => {
    expect(Object.keys(D.PREPARATY).sort()).toEqual([
      'Genotropin 12 mg', 'Genotropin 5,3 mg', 'Increlex 40 mg', 'Ngenla 24 mg', 'Ngenla 60 mg', 'Omnitrope 10 mg',
      'Omnitrope 5 mg',
    ]);
    // Karta zaokrągla w T() tym samym krokiem (switch preparatu) — gdyby się rozjechały, pole i wynik różniłyby się.
    const karta = fs.readFileSync(path.join(korzen, 'gh_igf_therapy.js'), 'utf8');
    // Increlex nie ma kroku w switch (r=null): dawkę na podanie zaokrągla silnik (Gdinc → dawkaNaPodanie), a zapasowa
    // ścieżka bez silnika — ten sam krok 0,1 mg na podanie.
    expect(karta).toContain('case"Increlex 40 mg":r=null');
    expect(karta).toContain('u==="IGF-1"&&(C=Gdinc(l,C,p),M=C*7)');
    expect(karta).toContain('Math.round(C/2*10)/10*2');
    expect(D.PREPARATY['Increlex 40 mg'].krokMg).toBe(0.1);
    for (const [lek, p] of Object.entries(D.PREPARATY)) {
      if (p.schemat === 'naPodanie') continue;
      const m = karta.match(new RegExp(`case"${lek.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}":r=([\\d.]+)`));
      expect(m, lek).not.toBeNull();
      expect(parseFloat(m[1]), lek).toBe(p.krokMg);
    }
  });

  it('limity jednego wstrzyknięcia i źródła', () => {
    const limity = Object.fromEntries(Object.entries(D.PREPARATY).map(([k, p]) => [k, [p.minMg, p.maksMg, p.zrodlo]]));
    expect(limity).toEqual({
      'Omnitrope 5 mg': [null, null, 'OMNITROPE_KOD'],
      'Omnitrope 10 mg': [null, null, 'OMNITROPE_KOD'],
      'Genotropin 5,3 mg': [0.1, 1.5, 'GENOTROPIN_GOQUICK'],
      'Genotropin 12 mg': [0.3, 4.5, 'GENOTROPIN_GOQUICK'],
      'Ngenla 24 mg': [0.2, 12, 'NGENLA'],
      'Ngenla 60 mg': [0.5, 30, 'NGENLA'],
      'Increlex 40 mg': [null, null, 'INCRELEX'],
    });
    // Increlex: dawka na podanie 2× na dobę, start 0,04 i maksimum 0,12 mg/kg na podanie (ChPL 4.2), krok = 1 j. U-100.
    expect(D.PREPARATY['Increlex 40 mg']).toMatchObject({
      grupa: 'Increlex', schemat: 'naPodanie', podaniaNaDobe: 2, startMgKgNaPodanie: 0.04, maksMgKgNaPodanie: 0.12,
      krokJednostka: '1 j. strzykawki U-100', zrodloKroku: 'INCRELEX_U100',
    });
    expect(D.ZRODLA.INCRELEX.punkt).toMatch(/^4\.2 /);
    for (const z of Object.values(D.ZRODLA)) {
      expect(z.nazwa && z.punkt && z.wersja && z.krotko, z.id).toBeTruthy();
    }
    expect(Object.isFrozen(D.PREPARATY['Ngenla 60 mg'])).toBe(true);
  });
});

describe('Zaokrąglenie do najbliższego kroku', () => {
  it.each([
    ['Omnitrope 10 mg', 0.033 * 35, 1.2, true],
    ['Omnitrope 10 mg', 1.13, 1.1, true],
    ['Omnitrope 10 mg', 0.025 * 35, 0.9, true],
    ['Omnitrope 5 mg', 1.49, 1.5, true],
    ['Genotropin 12 mg', 1.6, 1.65, true],
    ['Genotropin 5,3 mg', 1.6, 1.6, false],
    ['Ngenla 24 mg', 0.66 * 40, 26.4, false],
    ['Ngenla 60 mg', 0.66 * 40, 26.5, true],
    ['Ngenla 60 mg', 0.66 * 43, 28.5, true],
  ])('%s: %d mg → %d mg', (lek, wartosc, mg, zaokraglono) => {
    const z = E.zaokraglij(lek, wartosc);
    expect(z.mg).toBe(mg);
    expect(z.zaokraglono).toBe(zaokraglono);
  });

  it('nieznany preparat (Omnitrope 15 mg — poza listą karty) i brak dawki', () => {
    expect(E.zaokraglij('Omnitrope 15 mg', 1.6)).toMatchObject({ znany: false, mg: null });
    expect(E.zaokraglij('Ngenla 60 mg', 0).mg).toBeNull();
    expect(E.naKroku('Omnitrope 10 mg', 1.1)).toBe(true);
    expect(E.naKroku('Omnitrope 10 mg', 1.13)).toBe(false);
    expect(E.naKroku('Genotropin 12 mg', 1.65)).toBe(true);
  });
});

describe('Podział na wstrzyknięcia: równe części w krokach wstrzykiwacza', () => {
  it.each([
    ['Ngenla 60 mg', 33, [16.5, 16.5]],
    ['Ngenla 60 mg', 33.5, [17, 16.5]],
    ['Ngenla 60 mg', 26.5, [26.5]],
    ['Ngenla 60 mg', 30, [30]],
    ['Ngenla 24 mg', 26.4, [8.8, 8.8, 8.8]],
    ['Ngenla 24 mg', 13, [6.6, 6.4]],
    ['Ngenla 24 mg', 40, [10, 10, 10, 10]],
    ['Genotropin 12 mg', 4.65, [2.4, 2.25]],
    ['Omnitrope 10 mg', 5, [5]],
  ])('%s: %d mg → %j', (lek, mg, czesci) => {
    const p = E.podzial(lek, mg);
    expect(p.czesci).toEqual(czesci);
    expect(p.wstrzykniec).toBe(czesci.length);
    expect(Math.round(czesci.reduce((a, b) => a + b, 0) * 1000) / 1000).toBe(mg);
  });
});

describe('Ocena dawki i podpowiedź wstrzykiwacza', () => {
  it('Ngenla 24 mg, 26,4 mg: ponad limit 12 mg i ponad zawartość — podpowiedź 60 mg, 26,5 mg w 1 wstrzyknięciu', () => {
    const o = E.ocen('Ngenla 24 mg', 26.4);
    expect(o).toMatchObject({ powyzejMaks: true, powyzejZawartosci: true, ponizejMin: false, wstrzykniec: 3, mgNaSztuke: 24 });
    expect(o.sugestia).toMatchObject({ lek: 'Ngenla 60 mg', mg: 26.5, wstrzykniec: 1 });
    expect(o.zrodlo.krotko).toBe('ChPL Ngenla, pkt 4.2');
  });

  it('Ngenla 24 mg, 40 mg: 60 mg też wymaga 2 wstrzyknięć, ale mniej niż 4 — podpowiedź zostaje', () => {
    expect(E.ocen('Ngenla 24 mg', 40).sugestia).toMatchObject({ lek: 'Ngenla 60 mg', mg: 40, wstrzykniec: 2 });
  });

  it('Ngenla 60 mg, 33 mg: 2 wstrzyknięcia, bez podpowiedzi (24 mg wymaga ich więcej)', () => {
    const o = E.ocen('Ngenla 60 mg', 33);
    expect(o).toMatchObject({ powyzejMaks: true, powyzejZawartosci: false, wstrzykniec: 2, sugestia: null });
  });

  it('Genotropin: 1,6 mg na 5,3 mg → 12 mg (1,65 mg); 0,15 mg na 12 mg → 5,3 mg; Omnitrope bez limitów', () => {
    expect(E.ocen('Genotropin 5,3 mg', 1.6).sugestia).toMatchObject({ lek: 'Genotropin 12 mg', mg: 1.65, wstrzykniec: 1 });
    const male = E.ocen('Genotropin 12 mg', 0.15);
    expect(male).toMatchObject({ ponizejMin: true, powyzejMaks: false });
    expect(male.sugestia).toMatchObject({ lek: 'Genotropin 5,3 mg', mg: 0.15 });
    expect(E.ocen('Ngenla 60 mg', 0.4).sugestia).toMatchObject({ lek: 'Ngenla 24 mg', mg: 0.4 });
    expect(E.ocen('Omnitrope 10 mg', 5)).toMatchObject({ powyzejMaks: false, ponizejMin: false, sugestia: null });
    expect(E.komunikat('Omnitrope 10 mg', 5)).toBeNull();
    expect(E.komunikat('Ngenla 60 mg', 26.5)).toBeNull();
  });
});

describe('Teksty komunikatów (jak w makiecie zaakceptowanej przez właściciela)', () => {
  it('Ngenla 24 mg, 26,4 mg — ostrzeżenie z przyciskami; po „Zostaw” informacja o podziale', () => {
    expect(bez(E.komunikat('Ngenla 24 mg', 26.4))).toEqual({
      rodzaj: 'warn',
      tytul: 'Ta dawka nie zmieści się w jednym wstrzyknięciu',
      tekst: ('26,4 mg to więcej niż 12 mg — tyle najwięcej podaje jedno wstrzyknięcie wstrzykiwacza Ngenla 24 mg — '
        + 'i więcej niż cały wstrzykiwacz (24 mg). Ta dawka wymaga 3 wstrzyknięć po 8,8 mg. Ngenla 60 mg podaje '
        + '0,5–30 mg w jednym wstrzyknięciu, krok 0,5 mg (ChPL Ngenla, pkt 4.2).'),
      przyciski: [
        { akcja: 'zmien', lek: 'Ngenla 60 mg', etykieta: 'Zmień na Ngenla 60 mg' },
        { akcja: 'zostaw', lek: 'Ngenla 24 mg', etykieta: 'Zostaw 24 mg' },
      ],
    });
    expect(bez(E.komunikat('Ngenla 24 mg', 26.4, { pozostaw: true }))).toEqual({
      rodzaj: 'info',
      tytul: ('Dawka powyżej 12 mg — 3 wstrzyknięcia'),
      tekst: ('Podaj 3 wstrzyknięcia po 8,8 mg, każde w inne miejsce, aby zapobiec lipoatrofii (ChPL Ngenla, pkt 4.2).'),
      przyciski: [],
    });
  });

  it('Ngenla 60 mg — 33 i 33,5 mg', () => {
    expect(bez(E.komunikat('Ngenla 60 mg', 33).tekst))
      .toBe(('Podaj 2 wstrzyknięcia po 16,5 mg, każde w inne miejsce, aby zapobiec lipoatrofii (ChPL Ngenla, pkt 4.2).'));
    expect(bez(E.komunikat('Ngenla 60 mg', 33.5).tekst)).toContain(('Podaj 2 wstrzyknięcia: 17 mg i 16,5 mg'));
  });

  it('Genotropin 5,3 mg ponad 1,5 mg i Genotropin 12 mg ponad 4,5 mg', () => {
    expect(bez(E.komunikat('Genotropin 5,3 mg', 1.6).tekst)).toBe(('1,6 mg to więcej niż 1,5 mg — tyle najwięcej podaje '
      + 'jedno wstrzyknięcie wstrzykiwacza Genotropin 5,3 mg. Genotropin 12 mg podaje 0,3–4,5 mg w jednym wstrzyknięciu, '
      + 'krok 0,15 mg (ulotka Genotropin).'));
    expect(bez(E.komunikat('Genotropin 12 mg', 4.65))).toMatchObject({
      rodzaj: 'warn',
      tekst: ('4,65 mg to więcej niż 4,5 mg — tyle najwięcej podaje jedno wstrzyknięcie wstrzykiwacza Genotropin 12 mg '
        + '(ulotka Genotropin). Sprawdź dawkę.'),
      przyciski: [],
    });
  });

  it('linie pod polami karty: krok, zaokrąglenie z wpisu mg/kg, z wpisu mg/d i po zmianie wstrzykiwacza', () => {
    expect(E.opisKroku('Omnitrope 10 mg')).toBe(`Krok 0,1${NB}mg (Omnitrope 10 mg)`);
    expect(bez(E.opisKroku('Omnitrope 10 mg'))).toBe(('Krok 0,1 mg (Omnitrope 10 mg)'));
    expect(bez(E.opisKroku('Ngenla 24 mg'))).toBe(('Krok 0,2 mg; jedno wstrzyknięcie 0,2–12 mg'));
    expect(bez(E.opisZaokraglenia('Omnitrope 10 mg', { pole: 'kg', wartosc: 0.033 }, 35))).toBe(('Wpisano 0,033 mg/kg/d × 35 kg '
      + '= 1,155 mg/d. Zaokrąglono do najbliższego kroku 0,1 mg: 1,2 mg/d (0,034 mg/kg/d).'));
    expect(bez(E.opisZaokraglenia('Omnitrope 10 mg', { pole: 'podawana', wartosc: 1.13 }, 35))).toBe(('Wpisano 1,13 mg/d. '
      + 'Zaokrąglono do najbliższego kroku 0,1 mg: 1,1 mg/d (0,031 mg/kg/d).'));
    expect(bez(E.opisZaokraglenia('Ngenla 60 mg', { pole: 'zmiana', wartosc: 26.4 }, 40))).toBe(('Zmieniono preparat. Dawkę '
      + '26,4 mg/tydz zaokrąglono do najbliższego kroku 0,5 mg: 26,5 mg/tydz (0,662 mg/kg/tydz).'));
    expect(E.opisZaokraglenia('Omnitrope 10 mg', { pole: 'podawana', wartosc: 1.1 }, 35)).toBe('');
  });

  it('pole dawki w monitorze: przeliczenie na kg, ostrzeżenie o kroku bez zaokrąglania, zmiana schematu', () => {
    expect(bez(E.opisPola('Omnitrope 10 mg', 1.13, 38))).toEqual({
      naKg: ('= 0,03 mg/kg/d przy 38 kg'),
      ostrzezenie: ('1,13 mg nie pasuje do kroku 0,1 mg (Omnitrope 10 mg). Zapiszemy tak, jak wpisano — sprawdź wpis.'),
    });
    expect(bez(E.opisPola('Ngenla 60 mg', 28.5, 45))).toEqual({ naKg: ('= 0,633 mg/kg/tydz przy 45 kg'), ostrzezenie: '' });
    expect(bez(E.opisPola('Omnitrope 15 mg', 1.6, 20, 'dobowy'))).toEqual({ naKg: ('= 0,08 mg/kg/d przy 20 kg'), ostrzezenie: '' });
    expect(E.opisPola('Omnitrope 10 mg', 1.1, NaN).naKg).toBe('Wpisz wagę, aby przeliczyć dawkę na kg.');
    expect(bez(E.komunikatZmianySchematu('tygodniowy', 'dobowy', 28.5))).toBe(('Zmieniono preparat tygodniowy na dobowy. '
      + 'Wpisz dawkę podawaną w mg/dobę — poprzednia (28,5 mg/tydzień) się nie przenosi.'));
  });
});

// P-GH-INCRELEX-PODANIE (2026-10-05): Increlex — dawka na podanie 2× na dobę. ChPL Increlex (EMA, 26.03.2026), pkt 4.2:
// dawka początkowa 0,04 mg/kg 2× na dobę, zwiększanie co 0,04 mg/kg do 0,12 mg/kg 2× na dobę; tej dawki nie należy
// przekraczać. Krok 0,1 mg = 1 j. strzykawki U-100 (decyzja właściciela D5). Gdy najbliższy krok przekracza
// 0,12 mg/kg na podanie, zaokrąglamy w dół do kroku (decyzja właściciela). Przypadki policzone ręcznie.
describe('Increlex: dawka na podanie, krok 0,1 mg, nie więcej niż 0,12 mg/kg na podanie', () => {
  const L = 'Increlex 40 mg';

  it('jednostki i krok', () => {
    expect(E.jednostki(L)).toEqual({ dawka: 'mg na podanie', naKg: 'mg/kg na podanie', pole: 'mg na podanie',
      poleKg: 'mg/kg na podanie' });
    expect(E.opisKroku(L)).toBe(`Krok 0,1${NB}mg = 1${NB}j. strzykawki U-100`);
    expect(E.naKroku(L, 0.8)).toBe(true);
    expect(E.naKroku(L, 0.85)).toBe(false);
    // Bez limitu jednego wstrzyknięcia — brak komunikatu wstrzykiwacza, jedna część.
    expect(E.komunikat(L, 0.8)).toBeNull();
    expect(E.podzial(L, 0.8)).toEqual({ wstrzykniec: 1, czesci: [0.8] });
  });

  it.each([
    // masa, dawka przed zaokrągleniem (mg na podanie) → mg, najbliższy krok, zaokrąglono w dół, maksimum (0,12 × masa)
    [20, 0.04 * 20, 0.8, 0.8, false, 2.4],
    [13, 0.04 * 13, 0.5, 0.5, false, 1.56],
    [13, 0.12 * 13, 1.5, 1.6, true, 1.56],
    [14, 0.12 * 14, 1.6, 1.7, true, 1.68],
    [15, 0.12 * 15, 1.8, 1.8, false, 1.8],
    [16, 0.12 * 16, 1.9, 1.9, false, 1.92],
    [20, 0.12 * 20, 2.4, 2.4, false, 2.4],
    [13, 2.0, 1.5, 2.0, true, 1.56],
  ])('%d kg, %d mg → %d mg', (waga, wartosc, mg, zaokraglone, obnizono, maksMg) => {
    expect(E.dawkaNaPodanie(L, wartosc, waga)).toMatchObject({ znany: true, mg, zaokraglone, obnizono, maksMg });
  });

  it('bez masy ciała: tylko krok, bez limitu na kg', () => {
    expect(E.dawkaNaPodanie(L, 1.56, null)).toMatchObject({ mg: 1.6, obnizono: false, maksMg: null });
    expect(E.dawkaNaPodanie('Omnitrope 10 mg', 1.13, 35)).toMatchObject({ mg: 1.1, obnizono: false, maksMg: null });
  });

  it('komunikat „Zaokrąglono w dół”: z pola na kg, z pola mg (na kroku i spoza kroku), bez wpisu', () => {
    const z = E.dawkaNaPodanie(L, 1.56, 13);
    const reszta = 'czyli 0,123 mg/kg na podanie — więcej niż największa dawka 0,12 mg/kg na podanie (ChPL Increlex, pkt 4.2). '
      + 'Dawka na podanie: 1,5 mg (0,115 mg/kg na podanie).';
    expect(bez(E.komunikatObnizenia(L, z, 13, { pole: 'kg', wartosc: 0.12 }))).toEqual({ rodzaj: 'warn',
      tytul: 'Zaokrąglono w dół', tekst: 'Wpisano 0,12 mg/kg na podanie × 13 kg = 1,56 mg. Najbliższy krok to 1,6 mg, ' + reszta,
      przyciski: [] });
    expect(bez(E.komunikatObnizenia(L, E.dawkaNaPodanie(L, 1.6, 13), 13, { pole: 'podawana', wartosc: 1.6 }).tekst))
      .toBe('Wpisano 1,6 mg, ' + reszta);
    expect(bez(E.komunikatObnizenia(L, E.dawkaNaPodanie(L, 1.63, 13), 13, { pole: 'podawana', wartosc: 1.63 }).tekst))
      .toBe('Wpisano 1,63 mg. Najbliższy krok to 1,6 mg, ' + reszta);
    expect(bez(E.komunikatObnizenia(L, z, 13, null).tekst)).toBe('Najbliższy krok to 1,6 mg, ' + reszta);
    expect(E.komunikatObnizenia(L, E.dawkaNaPodanie(L, 0.8, 20), 20, null)).toBeNull();
  });

  it('pole monitora: ostrzeżenie o kroku i o dawce ponad 0,12 mg/kg na podanie (zapis jak wpisano)', () => {
    expect(bez(E.opisPola(L, 1.65, 13))).toEqual({ naKg: '= 0,127 mg/kg na podanie przy 13 kg',
      ostrzezenie: '1,65 mg nie pasuje do kroku 0,1 mg (Increlex 40 mg). 1,65 mg to 0,127 mg/kg na podanie — więcej niż '
        + 'największa dawka 0,12 mg/kg na podanie (ChPL Increlex, pkt 4.2). Zapiszemy tak, jak wpisano — sprawdź wpis.' });
    expect(bez(E.opisPola(L, 1.5, 13))).toEqual({ naKg: '= 0,115 mg/kg na podanie przy 13 kg', ostrzezenie: '' });
  });

  it('zaokrąglenie do kroku i zmiana schematu w edycji punktu', () => {
    expect(bez(E.opisZaokraglenia(L, { pole: 'kg', wartosc: 0.053 }, 20))).toBe('Wpisano 0,053 mg/kg na podanie × 20 kg '
      + '= 1,06 mg na podanie. Zaokrąglono do najbliższego kroku 0,1 mg: 1,1 mg na podanie (0,055 mg/kg na podanie).');
    expect(bez(E.opisZaokraglenia(L, { pole: 'podawana', wartosc: 0.83 }, 13))).toBe('Wpisano 0,83 mg na podanie. '
      + 'Zaokrąglono do najbliższego kroku 0,1 mg: 0,8 mg na podanie (0,062 mg/kg na podanie).');
    expect(bez(E.komunikatZmianySchematu('dobowy', 'naPodanie', 1.1))).toBe('Zmieniono preparat dobowy na podawany 2× na '
      + 'dobę. Wpisz dawkę podawaną w mg na podanie — poprzednia (1,1 mg/dobę) się nie przenosi.');
    expect(bez(E.komunikatZmianySchematu('naPodanie', 'tygodniowy', 0.8))).toBe('Zmieniono preparat podawany 2× na dobę na '
      + 'tygodniowy. Wpisz dawkę podawaną w mg/tydzień — poprzednia (0,8 mg na podanie) się nie przenosi.');
  });

  it('procent dawki w Karcie pacjenta: 100% = 0,12 mg/kg na podanie = 0,24 mg/kg/d (punkty trzymają mg/kg/d)', () => {
    const s = {};
    new Function('window', 'globalThis', 'module', fs.readFileSync(path.join(korzen, 'gh_therapy_segments.js'), 'utf8'))(s, s, undefined);
    const S = s.VildaGhSegments;
    expect(S.ghRecommendedDose('IGF-1', L)).toEqual({ target: 0.24, unit: 'mg/kg/d' });
    expect(S.ghDosePercent({ program: 'IGF-1', drug: L, dose: 0.24, doseUnit: 'mg/kg/d' })).toBe(100);
    expect(S.ghDosePercent({ program: 'IGF-1', drug: L, dose: 0.08, doseUnit: 'mg/kg/d' })).toBeCloseTo(33.333, 3);
    expect(S.ghDosePercent({ program: 'SNP', drug: 'Omnitrope 10 mg', dose: 0.034, doseUnit: 'mg/kg/d' })).toBeCloseTo(100, 9);
  });
});
