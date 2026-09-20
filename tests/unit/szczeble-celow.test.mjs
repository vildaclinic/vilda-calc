import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { korzen, oknoZSilnikiem } from '../support/silnik-bmi.mjs';

// P-SZCZEBLE — szczeble pośrednie w drodze do normy BMI.
//
// Decyzje właściciela 2026-09-20: pełny zestaw (granica kategorii + próg Reinehra),
// BMI 35 u dorosłego, akceptacja kliniczna progu −0,25 BMI-SDS (Reinehr 2016),
// wdrożenie najpierw w karcie „Droga do normy BMI".
//
// Testy wołają PRAWDZIWY silnik na PRAWDZIWYCH tablicach oraz funkcje WYCIĘTE z karty.
// Żadnej kopii progu w teście — progi czytamy z `VildaBmi.PROGI`, żeby test nie zzieleniał
// na własnej liczbie, gdy produkcja zmieni próg.

const B = oknoZSilnikiem().VildaBmi;
const P = B.PROGI.DOROSLY;
const D = B.PROGI.DZIECKO;
const masaPrzy = (bmi, hCm) => bmi * (hCm / 100) ** 2;
const klucze = (d) => d.szczeble.map((s) => s.klucz);
const poKluczu = (d, k) => d.szczeble.find((s) => s.klucz === k) || null;

/** Wycięcie funkcji karty po pełnej sygnaturze (plik nie jest zminifikowany). */
function karta() {
  const src = fs.readFileSync(path.join(korzen, 'vilda_bmi_journey.js'), 'utf8');
  const wytnij = (sygnatura) => {
    const i = src.indexOf(sygnatura);
    if (i < 0) throw new Error(`vilda_bmi_journey.js nie ma ${sygnatura}`);
    let d = 0;
    for (let k = i + sygnatura.length - 1; k < src.length; k += 1) {
      if (src[k] === '{') d += 1;
      else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('niezbalansowane nawiasy');
  };
  const okno = { VildaBmi: B, bmiSource: 'OLAF' };
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const fmt = (v, dec) => Number(v).toFixed(dec).replace('.', ',');
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return new Function('w', 'fin', 'fmt', 'esc', 'SZCZEBLE_MAX',
    `${wytnij('function drabinka(ctx) {')}\n${wytnij('function szczebleHtml(ctx, model) {')}\nreturn { drabinka, szczebleHtml };`,
  )(okno, fin, fmt, esc, 2);
}

describe('P-SZCZEBLE — dorosły', () => {
  it('przy otyłości III stopnia daje dwa szczeble, najbliżej BMI 35', () => {
    const d = B.drabinkaCelow({ wzrostCm: 167, masaKg: 112.4, wiekMies: 564, plec: 'M' });
    expect(klucze(d)).toEqual(['otylosc-2', 'otylosc-1']);
    expect(d.najblizszy.klucz).toBe('otylosc-2');
    expect(d.najblizszy.bmi, 'próg z silnika, nie z widoku').toBe(P.OTYLOSC_2);
    expect(d.najblizszy.masa).toBeCloseTo(masaPrzy(P.OTYLOSC_2, 167), 9);
    expect(Math.abs(d.najblizszy.roznica), 'szczebel jest BLIŻEJ niż cel')
      .toBeLessThan(Math.abs(d.cel.roznica));
    expect(poKluczu(d, 'otylosc-1').bmi).toBe(P.OTYLOSC_1);
  });

  it('przy otyłości I stopnia zostaje sam BMI 30', () => {
    const d = B.drabinkaCelow({ wzrostCm: 186, masaKg: 115, wiekMies: 528, plec: 'M' });
    expect(klucze(d)).toEqual(['otylosc-1']);
  });

  it('przy nadwadze nie ma żadnego szczebla', () => {
    // Inaczej pacjent z BMI 26 czytałby „do BMI 30", czyli w stronę, z której wyszedł.
    const d = B.drabinkaCelow({ wzrostCm: 160, masaKg: 68, wiekMies: 480, plec: 'F' });
    expect(d.kierunek).toBe('redukcja');
    expect(d.szczeble).toEqual([]);
    expect(d.najblizszy).toBeNull();
  });

  it('w normie nie ma ani celu, ani szczebli — jest zakres', () => {
    const d = B.drabinkaCelow({ wzrostCm: 175, masaKg: 72, wiekMies: 480, plec: 'M' });
    expect(d.kierunek).toBe('w-normie');
    expect(d.cel).toBeNull();
    expect(d.szczeble).toEqual([]);
    expect(d.zakresNormy.odMasa).toBeCloseTo(masaPrzy(P.NIEDOWAGA, 175), 9);
  });
});

describe('P-SZCZEBLE — dziecko', () => {
  const dziecko = (o) => B.drabinkaCelow(Object.assign({ plec: 'M', zrodlo: 'OLAF' }, o));

  it('przy otyłości daje próg Reinehra i granicę 97. centyla, od najbliższego', () => {
    const d = dziecko({ wzrostCm: 150, masaKg: 75, wiekMies: 144 });
    expect(klucze(d)).toEqual(['reinehr', 'otylosc']);
    const r = poKluczu(d, 'reinehr');
    expect(r.deltaSds).toBe(B.SZCZEBEL_SDS_REINEHR);
    expect(r.sdsDocelowy, 'dokładnie o 0,25 SDS niżej niż dziś')
      .toBeCloseTo(d.sds - B.SZCZEBEL_SDS_REINEHR, 9);
    expect(r.zrodlo).toContain('Reinehr 2016');
    expect(Math.abs(r.roznica), 'próg Reinehra jest bliżej niż granica otyłości')
      .toBeLessThan(Math.abs(poKluczu(d, 'otylosc').roznica));
    expect(Math.abs(poKluczu(d, 'otylosc').roznica)).toBeLessThan(Math.abs(d.cel.roznica));
  });

  it('próg Reinehra wraca na siatkę: BMI szczebla ma dokładnie SDS o 0,25 niższy', () => {
    // Kontrola, że nie liczymy „0,25 SDS" na oko ani liniowo po BMI.
    const d = dziecko({ wzrostCm: 150, masaKg: 75, wiekMies: 144 });
    const r = poKluczu(d, 'reinehr');
    const sprawdz = B.policz({ bmi: r.bmi, plec: 'M', wiekMies: 144, zrodlo: 'OLAF' });
    expect(sprawdz.sds).toBeCloseTo(d.sds - B.SZCZEBEL_SDS_REINEHR, 6);
  });

  it('przy otyłości olbrzymiej pierwszym szczeblem jest wyjście z niej', () => {
    const d = dziecko({ wzrostCm: 165, masaKg: 120, wiekMies: 168 });
    expect(d.kategoria.klucz).toBe('olbrzymia');
    expect(d.najblizszy.klucz).toBe('olbrzymia');
    expect(d.najblizszy.bmi, 'próg SDS z silnika')
      .toBeCloseTo(B.wartoscDlaSds({ sds: D.OLBRZYMIA_SDS, plec: 'M', wiekMies: 168, zrodlo: 'OLAF' }).bmi, 9);
    expect(klucze(d)).toEqual(['olbrzymia', 'reinehr', 'otylosc']);
  });

  it('poniżej wieku granicznego szczebla „otyłość olbrzymia" nie ma', () => {
    // Ta sama bramka, co w kategorii pediatrycznej (OLBRZYMIA_MIN_M) — inaczej karta
    // nazwałaby stanem klinicznym coś, czego silnik u tego dziecka nie rozpoznaje.
    const d = dziecko({ wzrostCm: 105, masaKg: 30, wiekMies: 48 });
    expect(d.sds).toBeGreaterThan(D.OLBRZYMIA_SDS);
    expect(klucze(d)).not.toContain('olbrzymia');
  });

  it('dziecko w normie nie dostaje celu ani zalecenia tycia do 85. centyla', () => {
    // Do poprawki z tej raty `cel` powstawał zawsze i przy BMI w normie dawał
    // kierunek „przyrost" — czyli zalecenie przytycia do górnej granicy normy.
    const d = dziecko({ wzrostCm: 140, masaKg: 32, wiekMies: 120 });
    expect(d.kategoria.klucz).toBe('prawidlowe');
    expect(d.kierunek).toBe('w-normie');
    expect(d.cel).toBeNull();
    expect(d.szczeble).toEqual([]);
  });

  it('przy niedowadze cel to dolna granica normy, bez szczebli', () => {
    const d = dziecko({ wzrostCm: 140, masaKg: 22, wiekMies: 120 });
    expect(d.kierunek).toBe('przyrost');
    expect(d.cel.granica).toBe('dolna');
    expect(d.cel.roznica).toBeGreaterThan(0);
    expect(d.szczeble).toEqual([]);
  });

  it('flaga kompresji SDS zapala się na progu z pracy Freedmana, nie na otyłości olbrzymiej', () => {
    expect(B.SDS_KOMPRESJA).toBe(1.88);
    const ciezki = dziecko({ wzrostCm: 150, masaKg: 100, wiekMies: 144 });
    expect(ciezki.sds, 'kompresja z-score: BMI 44 to wciąż SDS poniżej 3')
      .toBeLessThan(D.OLBRZYMIA_SDS);
    expect(poKluczu(ciezki, 'reinehr').sdsPrzyEkstremum, 'a flaga i tak musi się zapalić').toBe(true);
    const lekki = dziecko({ wzrostCm: 150, masaKg: 55, wiekMies: 144 });
    expect(poKluczu(lekki, 'reinehr').sdsPrzyEkstremum).toBe(false);
  });
});

describe('P-SZCZEBLE — jedno źródło obliczeń', () => {
  it('kafelek Statusu i drabinka podają tę samą masę progu BMI 30', () => {
    // Sedno zlecenia właściciela: progi liczą się RAZ. `celMasyDorosly` jest widokiem
    // drabinki, nie drugą implementacją.
    const cel = B.celMasyDorosly({ wzrostCm: 167, masaKg: 112.4 });
    const d = B.drabinkaCelow({ wzrostCm: 167, masaKg: 112.4, wiekMies: 564, plec: 'M' });
    expect(cel.posredni.masa).toBeCloseTo(poKluczu(d, 'otylosc-1').masa, 9);
    expect(cel.cel.masa).toBeCloseTo(d.cel.masa, 9);
    expect(cel.najblizszy.klucz, 'Status dostaje też pełną drabinkę').toBe('otylosc-2');
  });
});

describe('P-SZCZEBLE — karta „Droga do normy BMI"', () => {
  const K = karta();
  const ctxDorosly = { weightKg: 112.4, heightCm: 167, ageYears: 47, sex: 'M', isChild: false };
  const ctxDziecko = { weightKg: 75, heightCm: 150, ageYears: 12, sex: 'M', isChild: true };

  it('karta nie liczy progów — czyta drabinkę z silnika', () => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_bmi_journey.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(src).toContain('w.VildaBmi.drabinkaCelow');
    expect(src, 'żadnego progu wpisanego w widok').not.toMatch(/=\s*30\b.*oty/i);
  });

  it('dorosły dostaje wiersz z kilogramami i nazwą progu', () => {
    const html = K.szczebleHtml(ctxDorosly, { stabMode: false });
    expect(html).toContain('Po drodze:');
    expect(html).toContain('14,8');
    expect(html).toContain('BMI 35');
    expect(html).toContain('wyjście z otyłości II stopnia');
  });

  it('dziecko dostaje próg Reinehra z podanym źródłem', () => {
    const html = K.szczebleHtml(ctxDziecko, { stabMode: false });
    expect(html).toContain('BMI-SDS');
    expect(html).toContain('próg poprawy');
    expect(html, 'źródło przy progu, bo to jedyny nowy próg w aplikacji').toContain('Reinehr 2016');
  });

  it('nie pokazuje więcej niż dwóch szczebli', () => {
    const html = K.szczebleHtml({ weightKg: 120, heightCm: 165, ageYears: 14, sex: 'M', isChild: true },
      { stabMode: false });
    expect((html.match(/bmi-journey-g4/g) || []).length).toBe(2);
  });

  it('w trybie stabilizacji nie obiecuje kilogramów', () => {
    // Przy stabilizacji masa się nie zmienia — próg przekracza się wzrastaniem,
    // więc „−7,8 kg" byłoby nieprawdą.
    const html = K.szczebleHtml(ctxDziecko, { stabMode: true });
    expect(html).toContain('Po drodze:');
    expect(html).not.toContain('kg');
  });

  it('bez szczebli nie zostawia pustego wiersza', () => {
    const html = K.szczebleHtml({ weightKg: 68, heightCm: 160, ageYears: 40, sex: 'F', isChild: false },
      { stabMode: false });
    expect(html).toBe('');
  });
});
