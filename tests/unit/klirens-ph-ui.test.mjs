import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('clcr_ph_reference_data.js', browser);
loadBrowserScript('clcr_ph.js', browser);
loadBrowserScript('clcr_ph_ui.js', browser);
const evaluate = (urinePh, patch = {}, policy = browser.VildaClcrPhReferenceData.DEFAULT_POLICY) => browser.VildaClcrPh.evaluate({ urinePh, ...patch }, policy);
const render = (urinePh, patch) => browser.ClcrPhUi.renderResult(evaluate(urinePh, patch));
const visible = html => html.replace(/data-clcr-ph-snapshot="[^"]*"/g, '');
const card = html => visible(html).split('<details')[0];

describe('pH moczu — jeden wynik z normą ogólną, bez utraty dokładności', () => {
  it.each([
    ['0', '0', 'warning', 'outside'],
    ['4.4999', '4,4999', 'warning', 'outside'],
    ['4.5', '4,5', 'normal', 'within'],
    ['5.0', '5,0', 'normal', 'within'],
    ['7.5', '7,5', 'normal', 'within'],
    ['8', '8', 'normal', 'within'],
    ['8.0001', '8,0001', 'warning', 'outside'],
    ['14', '14', 'warning', 'outside'],
  ])('pokazuje dokładne pH %s i właściwą ocenę', (input, shown, tone, assessment) => {
    const html = render(input);
    const main = card(html);
    expect(main).toContain(`data-clcr-display-value="${shown}"`);
    expect(main).toContain(`>${shown}</strong>`);
    expect(main).toContain(`data-clcr-tone="${tone}"`);
    expect(main).toContain(`data-clcr-assessment="${assessment}"`);
    expect(main).toContain('>4,5–8,0</strong>');
    expect(main).toContain('>Norma ogólna</p>');
    expect(main).not.toContain('Norma dla wieku');
    expect((main.match(/class="clcr-result-value"/g) || [])).toHaveLength(1);
    expect(main).toContain('class="ph-range-normal"');
    expect(main).toContain('>4,5</text>');
    expect(main).toContain('>8,0</text>');
    expect(html).toContain('data-clcr-ph-snapshot="');
    expect(main.includes(' out-of-range')).toBe(assessment === 'outside');
  });

  it.each(['', ' '])('pusty formularz %s nie tworzy wyniku ani snapshotu', input => {
    const html = render(input);
    expect(html).toContain('ph-result-empty');
    expect(html).toContain('Wpisz pH moczu');
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-ph-snapshot=');
  });

  it.each(['-1', '14.0001', '65', 'abc', 'Infinity'])('niepoprawne pH %s nie jest obcinane ani zapisywane', input => {
    const html = render(input);
    expect(html).toContain('ph-result-error');
    expect(html).toContain('Sprawdź pH');
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-ph-snapshot=');
  });

  it('znany kontekst noworodka dodaje jawną uwagę bez podmiany profilu Mayo', () => {
    const main = card(render('7.5', { newbornContext: true }));
    expect(main).toContain('class="ph-result-caution"');
    expect(main).toContain('Noworodek');
    expect(main).toContain('Labcorp');
    expect(main).toContain('>4,5–8,0</strong>');
    expect(main).toContain('data-clcr-tone="normal"');
  });

  it('cele leczenia znajdują się wyłącznie w Szczegółach, bez aktywnej kategorii', () => {
    const [main, details] = visible(render('7.5')).split('<details');
    expect(main).not.toContain('7,0–7,2');
    expect(main).not.toContain('&gt;7,5');
    expect(details).toContain('id="clcr-ph-details"');
    expect(details).toContain('7,0–7,2');
    expect(details).toContain('&gt;7,5');
    expect(details).toContain('Cele leczenia różnią się od normy');
    expect(details).toContain('Skala 0–14 służy walidacji technicznej wpisu');
    expect(details).toContain('https://uroweb.org/guidelines/urolithiasis/chapter/guidelines');
    expect(details).toContain('EAU 2026 — chemoliza złogów');
    expect(details).not.toContain('aria-current=');
  });

  it('brak profilu zachowuje neutralną liczbę bez fałszywego zakresu i wykresu', () => {
    const model = evaluate('6.5', {}, null);
    const main = card(browser.ClcrPhUi.renderResult(model));
    expect(main).toContain('>6,5</strong>');
    expect(main).toContain('data-clcr-assessment="unassessed"');
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-reference-kind="none"');
    expect(main).not.toContain('ph-range-visual');
    expect(main).not.toContain(' out-of-range');
  });

  it('przyjmuje dane odniesienia i treść z modelu zamiast własnej tabeli klinicznej', () => {
    const model = evaluate('6.5');
    const html = visible(browser.ClcrPhUi.renderResult({
      ...model,
      reference: { ...model.reference, lower: 5, upper: 7 },
      referenceText: '5,0–7,0',
      notes: { ...model.notes, scope: 'Opis wybranego źródła', therapy: 'Źródłowy opis leczenia' },
      educationalReferences: [{ label: 'Opis sytuacji z modelu', text: 'Cel z danych' }],
    }));
    expect(card(html)).toContain('>5,0–7,0</strong>');
    expect(card(html)).toContain('>5,0</text>');
    expect(card(html)).toContain('>7,0</text>');
    expect(card(html)).not.toContain('>4,5–8,0</strong>');
    expect(html).toContain('Opis wybranego źródła');
    expect(html).toContain('Opis sytuacji z modelu');
    expect(html).toContain('Cel z danych');
  });

  it('ucieka tekst modelu i nie dopuszcza wykonywalnych odsyłaczy', () => {
    const html = browser.ClcrPhUi.renderResult({
      ...evaluate('6.5'),
      interpretation: '<script>attack()</script>',
      cautions: ['" onclick="attack()'],
      sources: [{ label: '<img src=x onerror=attack()>', url: 'javascript:attack()' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;script&gt;attack()&lt;/script&gt;');
    expect(html).toContain('&quot; onclick=&quot;attack()');
  });
});
