import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Moduł prezentacji „Wariant C” (vilda_growth_card_c.js). Testy logiki: konsensus, kolejność,
// ukrywanie braków, błąd KR wg płci, MPH na końcu. KR liczony przez STUB globalnego silnika.
// Dane w pełni fikcyjne.

function load(khamisReturn) {
  const win = {};
  // Stub silnika KR: zwraca podaną wartość dla poprawnych danych, inaczej available:false.
  win.calculateKhamisRochePrediction = (input) => {
    if (typeof khamisReturn === 'function') return khamisReturn(input);
    if (!input || input.currentHeightCm == null || input.currentWeightKg == null ||
        input.motherHeightCm == null || input.fatherHeightCm == null) {
      return { available: false, reason: 'missing-input' };
    }
    return { available: true, predictedAdultHeightCm: khamisReturn };
  };
  return loadBrowserScript('vilda_growth_card_c.js', win).VildaGrowthCardC;
}

function baseInput(over = {}) {
  return {
    sex: 'M', ageYears: 13, ageMonths: 156, boneAgeYears: 12.5,
    currentHeightCm: 155, currentWeightKg: 44, motherHeightCm: 165, fatherHeightCm: 179,
    bp: { available: true, predictedAdultHeightCm: 179.2, errorBoundHalfWidthCm: 5.2 },
    rwt: { available: true, predictedAdultHeightCm: 177.8, errorBoundHalfWidthCm: 4.6 },
    reinehr: { available: true, predictedAdultHeightCm: 176.5 },
    reliabilityModel: { entryMap: { rwt: { levelKey: 'high' }, bayleyPinneau: { levelKey: 'moderate' }, reinehr: { levelKey: 'indicative' } } },
    mphCm: 178.5, mphCentileText: '55c',
    disclaimerText: 'Metody prognozowania wzrostu ostatecznego są przeznaczone dla dzieci zdrowych i nieleczonych.',
    ...over,
  };
}

describe('Wariant C — konsensus', () => {
  const C = load(178.1);
  it('mediana, zakres i zgodność (progi 3/6 cm)', () => {
    const c = C._consensus([176.5, 177.8, 178.1, 179.2]);
    expect(c.count).toBe(4);
    expect(c.median).toBeCloseTo(177.95, 5);
    expect(c.min).toBe(176.5);
    expect(c.max).toBe(179.2);
    expect(c.spread).toBeCloseTo(2.7, 5);
    expect(c.agreementLabel).toBe('dobra');
  });
  it('progi zgodności: 3→dobra, >3..6→umiarkowana, >6→niska', () => {
    expect(C._consensus([170, 173]).agreementLabel).toBe('dobra'); // spread 3
    expect(C._consensus([170, 175]).agreementLabel).toBe('umiarkowana'); // spread 5
    expect(C._consensus([170, 178]).agreementLabel).toBe('niska'); // spread 8
    expect(C._consensus([]).count).toBe(0);
  });
  it('mediana z nieparzystej liczby', () => {
    expect(C._consensus([176, 178, 180]).median).toBe(178);
  });
});

describe('Wariant C — model i kolejność', () => {
  const C = load(178.1);
  it('kolejność STAŁA: RWT → BP → KR → Reinehr', () => {
    const m = C._buildModel(baseInput());
    expect(m.entries.map((e) => e.key)).toEqual(['rwt', 'bp', 'khamis', 'reinehr']);
  });
  it('KR: błąd wg płci (M ±5,3 / F ±4,3) i wiarygodność orientacyjna', () => {
    const mM = C._buildModel(baseInput({ sex: 'M' }));
    const kM = mM.entries.find((e) => e.key === 'khamis');
    expect(kM.pm).toBe(5.3);
    expect(kM.levelKey).toBe('indicative');
    expect(kM.isNew).toBe(true);
    const mF = C._buildModel(baseInput({ sex: 'F' }));
    expect(mF.entries.find((e) => e.key === 'khamis').pm).toBe(4.3);
  });
  it('levelKey metod z modelu wiarygodności', () => {
    const m = C._buildModel(baseInput());
    expect(m.entries.find((e) => e.key === 'rwt').levelKey).toBe('high');
    expect(m.entries.find((e) => e.key === 'bp').levelKey).toBe('moderate');
  });
});

describe('Wariant C — render (HTML)', () => {
  const C = load(178.1);
  it('komplet: konsensus 4 metod, kolejność w HTML, KR ±5,3, MPH na końcu', () => {
    const html = C.render(baseInput());
    expect(html).toContain('Konsensus 4 metod');
    expect(html).toContain('≈ 178 cm'); // mediana zaokrąglona
    expect(html).toContain('176,5–179,2 cm');
    expect(html).toContain('zgodność <b>dobra</b>');
    // kolejność: RWT przed BP przed Khamis przed Reinehr przed MPH
    const iR = html.indexOf('RWT'), iB = html.indexOf('Bayley'), iK = html.indexOf('Khamis'), iRe = html.indexOf('Reinehr'), iM = html.indexOf('CEL RODZICIELSKI');
    expect(iR).toBeLessThan(iB); expect(iB).toBeLessThan(iK); expect(iK).toBeLessThan(iRe); expect(iRe).toBeLessThan(iM);
    expect(html).toContain('±5,3');
    expect(html).toContain('NOWA');
    expect(html).toContain('178,5 cm'); // MPH
    expect(html).toContain('CEL RODZICIELSKI');
    expect(html).toContain('Khamis–Roche 1994'); // przypis źródła
    // ostrzeżenie: tekst aplikacji + dopisek KR o populacji
    expect(html).toContain('Uwaga ogólna:');
    expect(html).toContain('dzieci zdrowych i nieleczonych');
    expect(html).toContain('populacja Fels');
  });

  it('podsumowanie profilu (z aplikacji) jest zachowane', () => {
    const html = C.render(baseInput({ profileSummaryHtml: '<span>Profil KOWD-like: RWT preferowana.</span>' }));
    expect(html).toContain('Profil KOWD-like');
  });

  it('brak wieku kostnego → tylko KR + MPH, „jedyna dostępna”, podpowiedź', () => {
    const html = C.render(baseInput({
      sex: 'F', boneAgeYears: null, mphCm: 164.5, mphCentileText: '48c',
      bp: { available: false, reason: 'missing-bone-age' },
      rwt: { available: false, reason: 'missing-bone-age' },
      reinehr: { available: false, reason: 'missing-bone-age' },
    }));
    expect(html).toContain('jedyna dostępna metoda');
    expect(html).not.toContain('Konsensus');
    expect(html).toContain('±4,3 cm (90%)');
    expect(html).toContain('wymagają <b>wieku kostnego</b>');
    expect(html).toContain('CEL RODZICIELSKI'); // MPH nadal
    // brak WIERSZY BP/RWT/Reinehr (nazwa może wystąpić w podpowiedzi — sprawdzamy marker wiersza)
    expect(html).not.toContain('<span class="vgcc-nm">Bayley');
    expect(html).not.toContain('<span class="vgcc-nm">RWT');
    expect(html).not.toContain('<span class="vgcc-nm">Reinehr');
  });

  it('brak wszystkich metod → komunikat o uzupełnieniu', () => {
    const C0 = load(null); // KR też niedostępny
    const html = C0.render(baseInput({
      currentWeightKg: null,
      bp: { available: false }, rwt: { available: false }, reinehr: { available: false },
    }));
    expect(html).toContain('Uzupełnij dane');
    expect(html).not.toContain('Konsensus');
  });

  it('2 metody: konsensus liczy tylko dostępne', () => {
    const html = C.render(baseInput({
      reinehr: { available: false },
      // KR stub zwróci 178.1 → razem z RWT/BP = 3 metody; wyłącz KR dopingując brak wagi? nie —
      // zamiast tego wyłącz BP, zostaną RWT + KR = 2
      bp: { available: false },
    }));
    expect(html).toContain('Konsensus 2 metod');
  });

  it('brak MPH (brak wzrostu rodziców) → wiersz MPH znika', () => {
    const html = C.render(baseInput({ mphCm: null }));
    expect(html).not.toContain('CEL RODZICIELSKI');
    expect(html).toContain('Metody szczegółowo (4)');
  });
});
