import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('clcr_uag_reference_data.js', browser);
loadBrowserScript('clcr_uag.js', browser);
loadBrowserScript('clcr_uag_ui.js', browser);
const policy = browser.VildaClcrUagReferenceData.DEFAULT_POLICY;
const base = { urineSodium: '40', urinePotassium: '25', urineChloride: '80' };
const evaluate = patch => browser.VildaClcrUag.evaluate({ ...base, ...patch }, policy);
const render = patch => browser.ClcrUagUi.renderResult(evaluate(patch));
const visibleCard = html => html.slice(0, html.indexOf('<details')).replace(/data-clcr-uag-snapshot="[^"]*"/g, '');

describe('UAG — jeden wynik z granicą znaku i warunkową interpretacją', () => {
  it.each([['80', '-15'], ['40', '+25'], ['65', '0'], ['64.96', '+0,04'], ['65.04', '-0,04']])('zachowuje znak i dokładność przy chlorkach %s', (urineChloride, shown) => {
    const html = render({ urineChloride });
    expect(html).toContain(`data-clcr-display-value="${shown}"`);
    expect(html).toContain(`>${shown}</strong>`);
    expect(html).toContain('data-clcr-tone="neutral"');
    expect(html).toContain('data-clcr-assessment="unassessed"');
    expect(html).toContain('data-clcr-reference-comparison="false"');
    expect(html).toContain('data-clcr-reference-kind="sign-boundary"');
    expect(html).toContain('Granica znaku');
    expect(html).toContain('Nie jest granicą normy.');
    expect(html).not.toContain(' out-of-range');
    expect((html.match(/class="clcr-result-value"/g) || []).length).toBe(1);
    expect(html).toContain('data-clcr-uag-snapshot="');
  });
  it('dokładne znoszenie dziesiętnych nie wyświetla ujemnego zera', () => {
    const html = render({ urineSodium: '0.3', urinePotassium: '0.6', urineChloride: '0.9' });
    expect(html).toContain('data-clcr-display-value="0"');
    expect(html).not.toContain('>-0</strong>');
  });
  it.each([['80', 'ujemny UAG może wskazywać'], ['40', 'dodatni UAG może sugerować']])('komentarz %s nie zakłada kwasicy', (urineChloride, fragment) => {
    const card = visibleCard(render({ urineChloride }));
    expect(card).toContain('Jeżeli potwierdzono kwasicę metaboliczną z prawidłową luką anionową krwi');
    expect(card).toContain(fragment);
    expect(card).not.toContain('ocena ograniczona');
  });
  it('PChN ma pierwszeństwo przed interpretacją znaku jako odpowiedzi amonowej', () => {
    const card = visibleCard(render({ knownCKD: true }));
    expect(card).toContain('W PChN UAG słabo odzwierciedla wydalanie amonu.');
    expect(card).toContain('bezpośrednie oznaczenie NH₄⁺');
    expect(card).not.toContain('ujemny UAG może wskazywać');
  });
  it('mały sód dodaje ograniczenie metody bez patologicznego koloru liczby', () => {
    const card = visibleCard(render({ urineSodium: '10' }));
    expect(card).toContain('uag-scope-tag');
    expect(card).toContain('Na w moczu &lt;20 mmol/L');
    expect(card).toContain('data-clcr-tone="neutral"');
    expect(card).not.toContain('out-of-range');
  });
  it('Szczegóły pokazują tabelę źródłową, ograniczenia noworodkowe i zasadowicę oddechową', () => {
    const html = render({});
    const details = html.slice(html.indexOf('<details'));
    expect(details).toContain('id="clcr-uag-details"');
    expect(details).toContain('&lt;0 mmol/L');
    expect(details).toContain('&gt;0 mmol/L');
    expect(details).toContain('pierwszych tygodniach życia');
    expect(details).toContain('zasadowicy oddechowej');
    expect(details).toContain('https://pubmed.ncbi.nlm.nih.gov/2310794/');
    expect(details).not.toContain('aria-current=');
  });
  it('renderer korzysta z opisów i tabeli przekazanego modelu', () => {
    const model = evaluate({});
    const html = browser.ClcrUagUi.renderResult({ ...model, notes: { ...model.notes, scope: 'Inny zweryfikowany opis zakresu' }, educationalReferences: [{ label: 'Przykład źródłowy', text: 'Opis znaczenia z modelu' }] });
    expect(html).toContain('Inny zweryfikowany opis zakresu');
    expect(html).toContain('Opis znaczenia z modelu');
    expect(html.replace(/data-clcr-uag-snapshot="[^"]*"/g, '')).not.toContain('&gt;0 mmol/L');
  });
  it.each([{ sameUrineSpecimen: false }, { urineSodium: '-1' }, { urineChloride: '-1' }])('blokada nie produkuje liczby ani rekordu do zapisu: %o', patch => {
    const html = render(patch);
    expect(html).toContain('uag-result-error');
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-uag-snapshot=');
  });
  it('brak stężenia ma stałe miejsce przyszłego wyniku', () => {
    const html = render({ urineSodium: ' ' });
    expect(html).toContain('Wpisz trzy stężenia z moczu');
    expect(html).toContain('uag-result-empty');
    expect(html).not.toContain('data-clcr-value=');
  });
  it('ucieka tekst modelu i nie tworzy wykonywalnych odsyłaczy', () => {
    const model = evaluate({});
    const html = browser.ClcrUagUi.renderResult({ ...model, interpretation: '<script>alert(1)</script>', cautions: ['" onclick="attack'], sources: [{ label: '<img src=x onerror=attack>', url: 'javascript:attack' }] });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot; onclick=&quot;attack');
  });
});
