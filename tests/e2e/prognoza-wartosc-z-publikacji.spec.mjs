import { expect, test } from '@playwright/test';

// GROWTH-PRED-PUBLIKACJA (decyzja właściciela 2026-09-15): karty kliniczne pokazują metodę tak,
// jak podali ją autorzy. Przed zmianą „Zaawansowane obliczenia wzrostowe" pokazywały wartość PO
// naszej korekcie, a „Podsumowanie wyników" przed nią — ta sama metoda miała w dwóch kartach dwie
// różne liczby. Ten plik mierzy to, czego nie zmierzy żaden test jednostkowy: czy OBIE karty na
// prawdziwej stronie podają teraz tę samą liczbę. Dane wyłącznie FIKCYJNE.

async function policz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function'
    && Boolean(window.VildaGrowthCardC) && typeof window.generateMetabolicSummary === 'function');

  return page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    // Chłopiec 14 l, wiek kostny 11,5 → opóźnienie 30 mies. → reguła korekty BP (−2,0 cm).
    set('sex', 'M'); set('age', 14); set('ageMonths', 0);
    set('height', 148); set('weight', 38);
    set('advMotherHeight', 162); set('advFatherHeight', 178); set('advBoneAge', 11.5);
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (t && f && getComputedStyle(f).display === 'none') { t.disabled = false; t.click(); }
    window.calculateGrowthAdvanced();
    if (typeof window.updateProfessionalSummaryCard === 'function') window.updateProfessionalSummaryCard();

    const fhp = (window.advancedGrowthData || {}).finalHeightPrediction || null;
    const bpModel = fhp && Array.isArray(fhp.methods) ? fhp.methods.filter((m) => m.key === 'bp')[0] : null;

    const karta = document.querySelector('.vgcc');
    const wiersze = karta ? Array.from(karta.querySelectorAll('.vgcc-row')).map(
      (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()) : [];
    const wierszBp = wiersze.filter((t2) => t2.indexOf('Bayley') === 0)[0] || '';

    let podsumowanie;
    try { podsumowanie = window.generateMetabolicSummary() || ''; } catch (_) { podsumowanie = ''; }
    const liniaBp = podsumowanie.split('\n').map((s) => s.trim())
      .filter((s) => s.indexOf('Prognoza wzrostu ostatecznego (metoda Bayley-Pinneau)') === 0)[0] || '';

    return {
      bpKonsensus: bpModel ? bpModel.cm : null,
      bpPublikacja: bpModel ? bpModel.publikacjaCm : null,
      bpBias: bpModel ? bpModel.biasCm : null,
      wierszBp,
      liniaBp,
    };
  });
}

const przecinkiem = (v) => v.toFixed(1).replace('.', ',');

test.describe('Obie karty podają tę samą liczbę', () => {
  test('wiersz karty zaawansowanej i linia Podsumowania niosą wartość z publikacji', async ({ page }) => {
    test.setTimeout(120_000);
    const r = await policz(page);

    // Przypadek MUSI uruchamiać korektę — inaczej test nie mierzy niczego.
    expect(r.bpBias, 'reguła korekty BP ma zadziałać przy opóźnieniu ≥ 24 mies.').toBe(-2);
    expect(r.bpPublikacja).not.toBeNull();
    expect(Math.abs(r.bpPublikacja - r.bpKonsensus)).toBeCloseTo(2, 5);

    const zPublikacji = przecinkiem(r.bpPublikacja);
    const poKorekcie = przecinkiem(r.bpKonsensus);

    expect(r.wierszBp, 'wiersz karty zaawansowanej').toContain(zPublikacji + ' cm');
    expect(r.liniaBp, 'linia „Podsumowania wyników"').toContain(zPublikacji + ' cm');
    // Ta sama liczba w obu kartach — o to w tej zmianie chodzi.
    expect(r.liniaBp).toContain(zPublikacji);
    expect(r.wierszBp).toContain(zPublikacji);
    // Wartość po korekcie nie udaje już wartości metody.
    expect(r.wierszBp).not.toContain(poKorekcie + ' cm</span>');
  });

  test('wiersz nazywa korektę, żeby nagłówek konsensusu dało się pogodzić z wierszami', async ({ page }) => {
    test.setTimeout(120_000);
    const r = await policz(page);
    expect(r.wierszBp).toContain('do konsensusu wchodzi ' + przecinkiem(r.bpKonsensus) + ' cm (−2,0 cm)');
    expect(r.wierszBp).toContain('zawyża u chłopców');
  });

});
