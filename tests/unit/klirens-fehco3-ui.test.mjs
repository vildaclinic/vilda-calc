import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('clcr_fehco3_reference_data.js', browser);
loadBrowserScript('clcr_fehco3.js', browser);
loadBrowserScript('clcr_fehco3_ui.js', browser);
const policy = browser.VildaClcrFehco3ReferenceData.DEFAULT_POLICY;
const base = { urineBicarbonate: '12', serumBicarbonate: '24', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL', serumCreatinine: '1', serumCreatinineUnit: 'mg/dL', ageYears: 8 };
const evaluate = patch => browser.VildaClcrFehco3.evaluate({ ...base, ...patch }, policy);
const render = patch => browser.ClcrFehco3Ui.renderResult(evaluate(patch));

describe('FEHCO₃ — rzeczywista karta przedstawia liczbę z właściwym zakresem oceny', () => {
  it.each([['12', '0,5'], ['0.024', '0,001'], ['360.0024', '15,0001'], ['0', '0'], ['4800', '200']])('zachowuje małe, zerowe i duże wartości U HCO₃=%s', (urineBicarbonate, shown) => {
    const html = render({ urineBicarbonate });
    expect(html).toContain(`data-clcr-display-value="${shown}"`);
    expect(html).toContain(`>${shown}</strong>`);
    expect(html).toContain('data-clcr-tone="neutral"');
    expect(html).toContain('data-clcr-reference-comparison="false"');
    expect(html).toContain('data-clcr-reference-kind="none"');
    expect(html).toContain('Norma dla wieku');
    expect(html).toContain('Brak normy do porównania');
    expect(html).not.toContain(' out-of-range');
    expect((html.match(/class="clcr-result-value"/g) || []).length).toBe(1);
    expect(html).toContain('data-clcr-fehco3-snapshot="');
  });
  it('pokazuje źródłową tabelę wyłącznie w Szczegółach, bez nadanej kategorii pacjenta', () => {
    const html = render({ urineBicarbonate: '384' });
    const detailsIndex = html.indexOf('<details');
    const card = html.slice(0, detailsIndex).replace(/data-clcr-fehco3-snapshot="[^"]*"/g, '');
    const details = html.slice(detailsIndex);
    expect(details).toContain('Przykładowe progi według Yaxley i Pirrone (2016)');
    expect(details).toContain('&lt;5%');
    expect(details).toContain('5–15%');
    expect(details).toContain('&gt;15%');
    expect(details).toContain('U niemowląt możliwe są odmienne odpowiedzi');
    expect(details).toContain('Dotyczą udokumentowanego testu');
    expect(details).not.toContain('aria-current=');
    expect(card).not.toContain('&gt;15%');
    expect(card).toContain('Sam wynik nie potwierdza ani nie wyklucza proksymalnej kwasicy cewkowej.');
  });
  it('używa tabeli danych przekazanej w ocenie, zamiast własnych progów w rendererze', () => {
    const model = evaluate({});
    const html = browser.ClcrFehco3Ui.renderResult({ ...model, diagnosticBands: { title: 'Inny jawnie opisany profil', condition: 'Warunki innego profilu', caution: 'Ograniczenia profilu', bands: [{ label: 'przedział testowy', text: 'Opis z przekazanych danych' }] } });
    expect(html).toContain('Inny jawnie opisany profil');
    expect(html).toContain('Opis z przekazanych danych');
    expect(html.replace(/data-clcr-fehco3-snapshot="[^"]*"/g, '')).not.toContain('&gt;15%');
  });
  it('zachowuje uwagę o znanym podaniu zasad bez aktywowania progów', () => {
    const html = render({ bicarbonateLoad: true, urineBicarbonate: '384' });
    expect(html).toContain('data-clcr-reference-comparison="false"');
    expect(html).toContain('Znane podanie wodorowęglanu');
    expect(html).not.toContain('aria-current=');
    expect(html).not.toContain(' out-of-range');
  });
  it('wyjaśnia właściwy parametr z raportu i nie proponuje konwersji z pH', () => {
    const html = render({});
    expect(html).toContain('CO₂ całkowite (tCO₂) jest przybliżeniem');
    expect(html).toContain('nie przeliczamy go dodatkowo');
    expect(html).toContain('nie samego pH');
    expect(html).toContain('mały FEHCO₃ nie wyklucza zaburzenia reabsorpcji proksymalnej');
  });
  it('znana sprzeczność nie generuje liczby ani snapshotu do zapisu', () => {
    const html = render({ sameUrineSpecimen: false });
    expect(html).toContain('fehco3-result-error');
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-fehco3-snapshot=');
  });
  it('brak stężenia wskazuje jednoznaczne stałe miejsce przyszłego wyniku', () => {
    const html = render({ urineBicarbonate: '' });
    expect(html).toContain('Tutaj pojawi się wynik FEHCO₃');
    expect(html).toContain('fehco3-result-empty');
    expect(html).not.toContain('data-clcr-value=');
  });
  it('ucieka tekst danych, tabeli i snapshotu przed wstawieniem do HTML', () => {
    const model = evaluate({});
    const html = browser.ClcrFehco3Ui.renderResult({ ...model, interpretation: '<script>alert(1)</script>', cautions: ['" onclick="attack'], diagnosticBands: { title: '<script>bad</script>', bands: [{ label: '"data-x=', text: '<img onerror=attack>' }] } });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img onerror=attack>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot; onclick=&quot;attack');
  });
});
