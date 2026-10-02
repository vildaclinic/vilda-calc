import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { funkcjaZ } from '../support/silnik-bmi.mjs';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Fikcyjne pomiary. Badanie BA pozostaje przypisane do wieku jego oznaczenia,
// a kolejne wizyty nie odnawiają okresu użycia w normie tempa.
const silnik = () => loadBrowserScript('vilda_tempo_wzrastania.js', {}).VildaTempoWzrastania;
const ba = (atAgeMonths) => ({ boneAge: { baMonths: 96, atAgeMonths } });

describe('wiek kostny w normie tempa — rzeczywisty czas badania', () => {
  it('12 miesięcy włącznie używa BA, 13 miesięcy pomija z jawnym powodem', () => {
    const T = silnik();
    const aktualny = T.ocenWartosc(4.5, 12, 144, 'M', ba(132));
    expect(aktualny.basis).toBe('boneAge');
    expect(aktualny.slow).toBe(true); // norma dla BA 8 lat: ≥5; generyczna: ≥4
    const stary = T.ocenWartosc(4.5, 12, 145, 'M', ba(132));
    expect(stary.basis).toBe('generic');
    expect(stary.slow).toBe(false);
    expect(stary.boneAgeOmittedReason).toBe('stale');
    expect(T.formatuj(stary).zdanie).toContain('13 mies.');
    expect(T.formatuj(stary).zdanie).toContain('pominięty');
  });

  it.each([
    [null, 'unknown-time', 'nieznany'],
    [undefined, 'unknown-time', 'nieznany'],
    [145, 'future-time', 'późniejszy'],
  ])('czas oznaczenia %s nie uzasadnia użycia BA w normie', (at, powod, slowo) => {
    const T = silnik();
    const v = T.ocenWartosc(4.5, 12, 144, 'M', ba(at));
    expect(v.basis).toBe('generic');
    expect(v.slow).toBe(false);
    expect(v.boneAgeOmittedReason).toBe(powod);
    expect(T.formatuj(v).zdanie).toContain(slowo);
  });

  it('kolejne wizyty nie przesuwają wieku oznaczenia', () => {
    const T = silnik();
    const ctx = ba(123); // badanie w wieku 10 lat 3 mies.
    expect(T.ocenWartosc(4.5, 12, 125, 'M', ctx).basis).toBe('boneAge');
    expect(T.ocenWartosc(4.5, 12, 135, 'M', ctx).basis).toBe('boneAge');
    expect(T.ocenWartosc(4.5, 12, 136, 'M', ctx).basis).toBe('generic');
    expect(ctx).toEqual(ba(123));
  });

  it.each([1, 2, 3, 4, 5])('Tanner %s rozstrzyga niezależnie od starego, nieznanego lub przyszłego BA', (tannerStage) => {
    const T = silnik();
    const samTanner = T.ocenWartosc(3, 12, 144, 'M', { tannerStage });
    for (const at of [100, null, 145]) {
      expect(T.ocenWartosc(3, 12, 144, 'M', { ...ba(at), tannerStage })).toEqual(samTanner);
    }
  });
});

describe('opis pacjenta nie przypisuje dawnego BA do dzisiejszego wieku', () => {
  it('dane badania mają pierwszeństwo nad skalarem, zachowują wiek oznaczenia przy kilku wizytach', () => {
    const g = { document: null, navigator: {} };
    loadBrowserScript('vilda_bone_age.js', g);
    loadBrowserScript('vilda_patient_narrative_ui.js', g);
    const dane = { boneAgeMonths: 96, boneAgeContext: {
      version: 1, current: null, last: { years: 8, atAgeMonths: 123, source: 'measured' },
    } };
    for (const ageMonths of [125, 135, 136]) {
      const model = { metrics: [{ metric: 'height', last: { ageMonths, value: 140 } }] };
      const we = g.VildaPatientNarrativeUI.buildInput(dane, model);
      expect(we.boneAgeYears).toBe(8);
      expect(we.boneAgeAtAgeMonths).toBe(123);
      expect(we.boneAgeMonthsAgo).toBe(ageMonths - 123);
    }
  });
});

describe('karta podstawowa używa tego samego badania co norma tempa', () => {
  const src = fs.readFileSync(new URL('../../growth-basic-module.js', import.meta.url), 'utf8');
  const kontekst = new Function('window', 'l', `${funkcjaZ(src, 'Bba')}; return Bba;`);

  it('wynik przeniesiony do kolejnej wizyty nie dostaje nowego wieku oznaczenia', () => {
    const g = { document: null };
    loadBrowserScript('vilda_bone_age.js', g);
    g.VildaBoneAge.restoreContext({ version: 1, current: null,
      last: { years: 8, atAgeMonths: 123, source: 'measured' } });
    const ctx = kontekst(g, () => null)([{ ageMonths: 125, height: 140 }]);
    expect(ctx.boneAge).toEqual({ baMonths: 96, atAgeMonths: 123 });
    expect(silnik().ocenWartosc(4.5, 12, 136, 'M', ctx).boneAgeOmittedReason).toBe('stale');
  });

  it('bez wyniku w formularzu jawne badanie z wiersza historii zachowuje wiek tamtej wizyty', () => {
    const ctx = kontekst({}, () => null)([
      { ageMonths: 120, height: 132, boneAgeYears: 7.5 },
      { ageMonths: 123, height: 134, boneAgeYears: 8 },
      { ageMonths: 125, height: 136 },
    ]);
    expect(ctx.boneAge).toEqual({ baMonths: 96, atAgeMonths: 123 });
    expect(silnik().ocenWartosc(4.5, 12, 135, 'M', ctx).basis).toBe('boneAge');
  });
});

describe('gotowa epikryza zachowuje powód pominięcia BA obok normy tempa', () => {
  const generator = createRequire(import.meta.url)('../../vilda_epicrisis.js');
  it.each([
    [131, 'stale'], [null, 'unknown-time'], [145, 'future-time'],
  ])('powód %s/%s pozostaje jawny przy tempie poniżej normy i w normie', (at, powod) => {
    const T = silnik();
    for (const wartosc of [3, 4.5]) {
      const tempo = T.ocenWartosc(wartosc, 12, 144, 'M', ba(at));
      expect(tempo.boneAgeOmittedReason).toBe(powod);
      const tekst = generator.generate({
        sex: 'M', ageYears: 12, ageMonths: 0,
        growthVelocity: wartosc, growthVelocityMonths: 12,
        growthVelocityLow: tempo.slow, growthVelocityNorm: tempo.normLabel,
        growthVelocityNote: tempo.note, growthVelocityInWindow: true,
      }, {}).text;
      expect(tekst).toContain(wartosc === 3 ? 'poniżej normy dla wieku' : 'w normie dla wieku');
      expect(tekst).toContain('norma ≥4 cm/rok');
      expect(tekst).toContain(tempo.note);
      expect(tekst.split('Wiek kostny pominięty').length).toBe(2);
      expect(tekst).not.toContain('..');
    }
  });
});

describe('gotowy opis pacjenta rozróżnia nieznany i potwierdzony czas badania BA', () => {
  const opis = (dane, wiek) => {
    const g = { document: null, navigator: {} };
    loadBrowserScript('vilda_bone_age.js', g);
    loadBrowserScript('vilda_patient_narrative_ui.js', g);
    loadBrowserScript('vilda_patient_narrative.js', g);
    const model = { sex: 'M', metrics: [{ metric: 'height', last: { ageMonths: wiek, value: 140 } }] };
    return g.VildaPatientNarrative.compose(model, g.VildaPatientNarrativeUI.buildInput(dane, model)).sentences
      .find((zdanie) => zdanie.id === 'wiekKostny').text;
  };

  it('legacy wynik pozostaje jawny, bez fikcyjnego opóźnienia rosnącego przy kolejnych wizytach', () => {
    const dane = { boneAgeMonths: 96, boneAgeContext: {
      version: 1, current: null, last: { years: 8, atAgeMonths: 123, source: 'legacy' },
    } };
    for (const wiek of [125, 136, 144]) {
      expect(opis(dane, wiek)).toBe('Wiek kostny oceniono na 8 lat; czas oznaczenia nieznany.');
    }
  });

  it('potwierdzone badanie nadal porównuje BA z wiekiem oznaczenia', () => {
    const dane = { boneAgeMonths: 96, boneAgeContext: {
      version: 1, current: null, last: { years: 8, atAgeMonths: 123, source: 'measured' },
    } };
    for (const wiek of [125, 136, 144]) {
      expect(opis(dane, wiek)).toBe('Wiek kostny oceniono na 8 lat przy wieku metrykalnym 10 lat i 3 miesięcy; był on opóźniony o 2 lata i 3 miesiące.');
    }
  });
});
