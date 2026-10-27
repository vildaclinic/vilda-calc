import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('clcr_tmp_gfr_reference_data.js', browser);
loadBrowserScript('clcr_tmp_gfr.js', browser);
loadBrowserScript('clcr_tmp_gfr_ui.js', browser);
const policy = browser.VildaClcrTmpGfrReferenceData.DEFAULT_POLICY;
const base = {
  ageYears: 10, sex: 'M', patientId: 'synthetic-ui-patient', clinicalDate: '2026-10-26',
  urinePhosphate: '20', urinePhosphateUnit: 'mmol/L', urineCreatinine: '5', urineCreatinineUnit: 'mmol/L',
  serumPhosphate: '1.10', serumPhosphateUnit: 'mmol/L', serumCreatinine: '50', serumCreatinineUnit: 'µmol/L',
  burosumab: false, daysSinceDose: '',
};
const evaluate = (patch = {}, previous = null) => browser.VildaClcrTmpGfr.evaluate({ ...base, ...patch }, policy, { previous });
const render = (patch = {}, previous = null) => browser.ClcrTmpGfrUi.renderResult(evaluate(patch, previous));
const visible = html => html.replace(/data-clcr-tmp-gfr-snapshot="[^"]*"/g, '');
const card = html => visible(html).split('<details')[0];
const prior = patch => evaluate({ serumPhosphate: '0.80', burosumab: true, daysSinceDose: 14, clinicalDate: '2026-09-28', ...patch });

describe('TmP/GFR — zaakceptowany układ B z niezależnymi stanami parametrów', () => {
  it.each([
    ['1.10', '0,90', 'warning', 'below'],
    ['1.17', '0,97', 'success', 'within'],
    ['1.80', '1,60', 'success', 'within'],
    ['1.90', '1,70', 'warning', 'above'],
  ])('surowica %s daje TmP/GFR %s i własną ocenę %s', (serumPhosphate, shown, tone, status) => {
    const html = render({ serumPhosphate, burosumab: true });
    expect(html).toContain(`data-clcr-display-value="${shown}"`);
    expect(html).toContain(`data-clcr-tone="${tone}"`);
    expect(html).toContain(`data-clcr-assessment="${status}"`);
    expect(card(html)).toContain('>0,97–1,64</strong>');
    expect(card(html)).toContain('<span class="tmp-gfr-reference-unit">mmol/L</span>');
    expect((card(html).match(/class="clcr-result-value"/g) || [])).toHaveLength(1);
    expect(html).toContain('data-clcr-tmp-gfr-snapshot="');
  });

  it('wysokie fosforany mają lokalny alarm bez zmiany prawidłowego TmP/GFR', () => {
    const html = card(render({ serumPhosphate: '1.80', burosumab: true }));
    expect(html).toContain('data-clcr-tone="success"');
    expect(html).toContain('data-serum-tone="danger"');
    expect(html).toContain('data-treatment-tone="danger"');
    expect(html).toContain('>88,9%</strong>');
    expect(html).toContain('>85–95%</strong>');
    expect(html).toContain('wyższy TmP/GFR nie oznacza większej skuteczności');
  });

  it('TRP jest w głównej karcie, a w szczegółach pozostaje FEPO₄ bez drugiego TRP', () => {
    const html = visible(render({ serumPhosphate: '1.80' }));
    const [main, details] = html.split('<details');
    expect(main).toContain('TRP — reabsorpcja fosforanów');
    expect(main).toContain('Nawet TRP w tym zakresie nie wyklucza nerkowej utraty fosforanów.');
    expect(details).toContain('FEPO₄ — frakcja wydalania fosforanów');
    expect(details).not.toContain('class="tmp-gfr-trp-value"');
    expect((html.match(/class="tmp-gfr-trp-value"/g) || [])).toHaveLength(1);
  });

  it('wyłączenie monitorowania usuwa tylko opis terapii i zachowuje alarm serum', () => {
    const html = card(render({ serumPhosphate: '1.80', burosumab: false }));
    expect(html).toContain('data-serum-tone="danger"');
    expect(html).toContain('data-clcr-tone="success"');
    expect(html).not.toContain('class="tmp-gfr-therapy-summary"');
    expect(html).not.toContain('class="tmp-gfr-trend-row"');
  });

  it('porównanie pokazuje daty i liczby bez automatycznego werdyktu o skuteczności', () => {
    const html = card(render({ burosumab: true, daysSinceDose: 14 }, prior()));
    expect(html).toContain('class="tmp-gfr-trend-row"');
    expect(html).toContain('28.09.2026');
    expect(html).toContain('26.10.2026');
    expect(html).toContain('>0,60</strong>');
    expect(html).toContain('Sama zmiana liczby nie rozstrzyga o skuteczności leczenia.');
    expect(html).not.toContain('Może wskazywać na poprawę');
  });

  it.each([
    [{ daysSinceDose: '' }, {}, 'czas'],
    [{ daysSinceDose: 7 }, {}, 'czas'],
    [{ daysSinceDose: 14 }, { ageYears: 20 }, 'metod'],
  ])('alarm wysokiego P zachowuje powód braku porównania: %o %o', (current, previous, reasonFragment) => {
    const model = evaluate({ burosumab: true, serumPhosphate: '1.80', ...current }, prior(previous));
    const html = card(browser.ClcrTmpGfrUi.renderResult(model));
    expect(model.treatment.comparisonAllowed).toBe(false);
    expect(model.treatment.trendMessage.toLowerCase()).toContain(reasonFragment);
    expect(html).toContain(model.treatment.trendMessage);
    expect(html).toContain('data-treatment-tone="danger"');
    expect(html).toContain('Poprzedni zapis:');
    expect(html).not.toContain('class="tmp-gfr-trend-row"');
    expect(html).not.toContain('Poprzedni zapis → bieżący wynik');
  });

  it('pierwszy zapis nie udaje wcześniejszego wyniku lub trendu', () => {
    const model = evaluate({ burosumab: true, daysSinceDose: 14 });
    const html = card(browser.ClcrTmpGfrUi.renderResult(model));
    expect(html).toContain(model.treatment.trendMessage);
    expect(html).not.toContain('class="tmp-gfr-trend-row"');
    expect(html).not.toContain('Poprzedni zapis:');
  });

  it('niemowlę bez profilu serum otrzymuje czytelne ograniczenie przy liczbie', () => {
    const html = card(render({ ageYears: 0.25, burosumab: true, daysSinceDose: 14 }));
    expect(html).toContain('Mayo nie podaje zakresu dla dzieci poniżej 1. roku życia.');
    expect(html).toContain('Brak dopasowanej normy fosforanów we krwi');
    expect(html).not.toContain('data-serum-tone="danger"');
  });

  it('nakładające się zakresy na granicy wieku są oddzielne i bez wspólnej oceny', () => {
    const html = card(render({ ageYears: 1 }));
    expect(html).toContain('data-clcr-assessment="unassessed"');
    expect(html).toContain('class="tmp-gfr-reference-alternatives"');
    expect(html).toContain('6–12 miesięcy');
    expect(html).toContain('1–5 lat');
  });

  it('zakres dorosłych Waltona ma oddzielną tabelę od norm metody Brodehla', () => {
    const html = visible(render({ ageYears: 20 }));
    const [main, details] = html.split('<details');
    expect(main).toContain('>0,70–1,35</strong>');
    expect(main).not.toContain('>0,84–1,23</strong>');
    expect(details).toContain('<caption>Brodehl</caption>');
    expect(details).toContain('<caption>Walton–Bijvoet/Payne</caption>');
    expect(details).toContain('0,84–1,23 mmol/L');
    expect(details).toContain('0,70–1,35 mmol/L');
    expect((details.match(/aria-current="true"/g) || [])).toHaveLength(1);
  });

  it.each([{ ageYears: null }, { serumPhosphate: '' }])('brak danych ma stałe miejsce wyniku bez rekordu do zapisu %o', patch => {
    const html = render(patch);
    expect(html).toContain('tmp-gfr-result-empty');
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-tmp-gfr-snapshot=');
  });

  it.each([{ pairedSameTime: false }, { urinePhosphate: '-1' }, { serumPhosphate: '0' }])('niezgodne dane mają błąd i nie tworzą wyniku do zapisu %o', patch => {
    const html = render(patch);
    expect(html).toContain('tmp-gfr-result-error');
    expect(html).not.toContain('data-clcr-series=');
  });

  it('renderuje teksty i tabelę przekazanego modelu, bez własnych norm klinicznych', () => {
    const model = evaluate();
    const html = visible(browser.ClcrTmpGfrUi.renderResult({
      ...model,
      notes: { ...model.notes, reference: 'Opis zakresu z wybranej polityki' },
      referenceRows: [{ label: 'Grupa źródłowa', low: 1.23, high: 2.34, unit: 'mmol/L', selected: true }],
      trpResult: { ...model.trpResult, referenceText: 'Odniesienie z modelu' },
    }));
    expect(html).toContain('Opis zakresu z wybranej polityki');
    expect(html).toContain('Grupa źródłowa');
    expect(html).toContain('1,23–2,34 mmol/L');
    expect(html).toContain('Odniesienie z modelu');
  });

  it('ucieka tekst, jednostki i linki, także w kontekście terapii', () => {
    const model = evaluate({ burosumab: true });
    const html = browser.ClcrTmpGfrUi.renderResult({
      ...model, interpretation: '<script>attack()</script>',
      treatment: { ...model.treatment, message: '<img src=x onerror=attack()>' },
      sources: [{ label: '<b>źródło</b>', url: 'javascript:attack()' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;script&gt;attack()&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=attack()&gt;');
  });
});
