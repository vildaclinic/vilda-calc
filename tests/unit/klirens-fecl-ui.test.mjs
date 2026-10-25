import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('clcr_fecl.js', browser);
loadBrowserScript('clcr_fecl_ui.js', browser);
const base = { urineChloride: '20', serumChloride: '100', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL', serumCreatinine: '1', serumCreatinineUnit: 'mg/dL', ageYears: 8 };
const evaluate = patch => browser.VildaClcrFecl.evaluate({ ...base, ...patch }, null);
const render = patch => browser.ClcrFeclUi.renderResult(evaluate(patch));

describe('FECl — produkcyjna karta łączy rzeczywisty wynik z ograniczeniami', () => {
  it.each([['20', '0,2'], ['0.1', '0,001'], ['50.01', '0,5001'], ['0', '0'], ['20000', '200']])('zachowuje dodatnią, zerową i dużą wartość UCl=%s bez wymyślonej normy', (urineChloride, shown) => {
    const html = render({ urineChloride });
    expect(html).toContain(`data-clcr-display-value="${shown}"`);
    expect(html).toContain(`>${shown}</strong>`);
    expect(html).toContain('data-clcr-tone="neutral"');
    expect(html).toContain('data-clcr-reference-comparison="false"');
    expect(html).toContain('data-clcr-reference-kind="none"');
    expect(html).toContain('Norma dla wieku');
    expect(html).toContain('Brak normy do porównania');
    expect(html).not.toContain(' out-of-range');
    expect((html.match(/class="clcr-result-value"/g) || []).length).toBe(1);
    expect(html).toContain('data-clcr-fecl-snapshot="');
  });
  it('wyjaśnia różnicę między progiem KDIGO a normą i nie używa go do klasyfikacji', () => {
    const html = render({ urineChloride: '100' });
    expect(html).toContain('FECl &gt;0,5%');
    expect(html).toContain('hipokaliemicznej zasadowicy metabolicznej');
    expect(html).toContain('nie klasyfikuje wyniku według tego progu');
    expect(html).toContain('Sam wynik nie rozstrzyga o nerkowej utracie chlorków.');
  });
  it('znana sprzeczność nie generuje karty z liczbą do zapisu', () => {
    const html = render({ sameUrineSpecimen: false });
    expect(html).toContain('fecl-result-error');
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-fecl-snapshot=');
  });
  it('brak stężenia pokazuje jednoznaczne miejsce przyszłego wyniku', () => {
    const html = render({ urineChloride: '' });
    expect(html).toContain('Tutaj pojawi się wynik FECl');
    expect(html).toContain('fecl-result-empty');
    expect(html).not.toContain('data-clcr-value=');
  });
  it('ucieka tekst danych oraz snapshotu przed użyciem w HTML', () => {
    const snapshot = evaluate({});
    const html = browser.ClcrFeclUi.renderResult({ ...snapshot, interpretation: '<script>alert(1)</script>', cautions: ['" onclick="attack'] });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot; onclick=&quot;attack');
  });
});
