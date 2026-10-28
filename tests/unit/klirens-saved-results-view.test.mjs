import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

// Wyłącznie fikcyjne, już zapisane pomiary. Widok nie dobiera norm ani nie liczy wzoru.
const reference = (source = 'fictional-source') => ({ text: '<30 mg/g', kind: 'recorded-threshold', bounds: { low: null, high: 30, lowInclusive: false, highInclusive: false }, source: { id: source }, population: 'Fikcyjna populacja zapisu' });
const measurement = (id, valueNum, extra = {}) => ({
  id, noteId: id, patientId: 'fictional-patient', parameterKey: 'clcr:ACR', seriesKey: 'clcr:ACR|mg/g|native',
  label: 'Albumina/kreatynina — ACR (metoda zapisana)', method: 'Fikcyjna metoda (pełna nazwa)', dateISO: '2026-10-25',
  unit: 'mg/g', valueNum, displayValue: String(valueNum).replace('.', ','), comparator: '', reference: reference(), norm: '<30 mg/g',
  assessment: 'within', status: 'recorded', tone: 'success', ...extra,
});
function environment() {
  const doc = atrapaDokumentu(), win = { document: doc };
  loadBrowserScript('clcr_saved_results_view.js', win);
  const host = doc.body.appendChild(doc.createElement('div'));
  return { win, host, api: win.ClcrSavedResultsView };
}
const projection = (...measurements) => ({ measurements });

describe('wspólny widok zapisanych obliczeń Klirensu', () => {
  it('wynik początkowy i przeliczony używają polskiego przecinka bez zmiany cyfr, granic ani tekstowych opisów', () => {
    const env = environment();
    const initial = measurement('fictional-initial', 13.6, { displayValue: '13,6' });
    const edited = measurement('fictional-edited', 13.6, { displayValue: '13.6' });
    const censored = measurement('fictional-censored', null, { displayValue: '≤1.2300e-3', comparator: '≤' });
    const interval = measurement('fictional-interval', null, { displayValue: '1.20–2.340' });
    const textual = measurement('fictional-text', null, { displayValue: 'metoda 1.2; nieoznaczalne', interpretation: 'Opis wersji 1.2 bez zmian' });
    env.api.render(env.host, { projection: projection(initial, edited, censored, interval, textual) });
    const result = (id) => env.host.querySelector('.vilda-clcr-value[data-note-id="' + id + '"]').textContent;
    expect(result(initial.noteId)).toBe('13,6 mg/g');
    expect(result(edited.noteId)).toBe(result(initial.noteId));
    expect(result(censored.noteId)).toBe('≤1,2300e-3 mg/g');
    expect(result(interval.noteId)).toBe('1,20–2,340 mg/g');
    expect(result(textual.noteId)).toBe('metoda 1.2; nieoznaczalne mg/g');
    expect(env.host.textContent).toContain('Opis wersji 1.2 bez zmian');
    expect(env.host.querySelector('.vilda-clcr-point[data-note-id="fictional-edited"] .vilda-clcr-point-label').textContent).toBe('13,6');
    expect(env.host.querySelector('.vilda-clcr-point[data-note-id="fictional-edited"]').getAttribute('data-value')).toBe('13.6');
    expect(edited.displayValue).toBe('13.6');
    expect(censored.displayValue).toBe('≤1.2300e-3');
  });
  it('pokazuje każdy ID w tabeli obu widoków, bez sklejania równych wartości i bez obcinania nazwy metody', () => {
    const env = environment(), select = vi.fn();
    const a = measurement('fictional-a', 13.6), b = measurement('fictional-b', 13.6);
    const view = env.api.render(env.host, { projection: projection(a, b, a), view: 'charts', onSelect: select });
    expect(env.host.querySelector('.vilda-clcr-group-title').textContent).toBe(a.label);
    expect(env.host.querySelector('.vilda-clcr-group-subtitle').textContent).toContain(a.method);
    expect(env.host.querySelectorAll('tr[data-note-id]').map((row) => row.getAttribute('data-note-id'))).toEqual([a.noteId, b.noteId]);
    const points = env.host.querySelectorAll('.vilda-clcr-point');
    expect(points).toHaveLength(2);
    expect(points[0].querySelector('circle').getAttribute('cx')).not.toBe(points[1].querySelector('circle').getAttribute('cx'));
    expect(env.host.textContent).toContain('Pomiary z tą samą datą nie mają podanej godziny pobrania.');
    expect(env.host.querySelector('.vilda-clcr-chart').querySelectorAll('path, polyline')).toHaveLength(0);
    points[0].click();
    expect(select).toHaveBeenLastCalledWith(a);
    const event = { key: 'Enter', preventDefault: vi.fn() };
    points[1].sluchacze.get('keydown')[0](event);
    expect(select).toHaveBeenLastCalledWith(b);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    view.update(null, 'table');
    expect(env.host.querySelectorAll('.vilda-clcr-chart')).toHaveLength(0);
    expect(env.host.querySelectorAll('tr[data-note-id]')).toHaveLength(2);
    env.host.querySelector('.vilda-clcr-details[data-note-id="fictional-b"]').click();
    expect(select).toHaveBeenLastCalledWith(b);
    view.destroy();
    expect(env.host.children).toHaveLength(0);
  });

  it('granice oznaczalności i tekst pozostają w tabeli bez punktu na granicy', () => {
    const env = environment();
    env.api.render(env.host, { projection: projection(
      measurement('fictional-exact', 45, { assessment: 'above', category: 'A2', tone: 'warning' }),
      measurement('fictional-censored', null, { rawValue: 5, comparator: '<', displayValue: '<5', assessment: 'unassessed', tone: 'neutral' }),
      measurement('fictional-text', null, { displayValue: 'nieoznaczalne', assessment: 'unassessed', tone: 'neutral' })
    ) });
    expect(env.host.querySelectorAll('tr[data-note-id]')).toHaveLength(3);
    expect(env.host.querySelectorAll('.vilda-clcr-point').map((point) => point.getAttribute('data-note-id'))).toEqual(['fictional-exact']);
    expect(env.host.querySelector('.vilda-clcr-value[data-note-id="fictional-censored"]').textContent).toContain('<5');
    expect(env.host.querySelector('.vilda-clcr-value[data-note-id="fictional-text"]').textContent).toContain('nieoznaczalne');
    expect(env.host.querySelector('.vilda-clcr-value[data-note-id="fictional-exact"]').classList.contains('tone-warning')).toBe(true);
    expect(env.host.textContent).toContain('A2Powyżej normy przy zapisie');
  });

  it('ujemny UAG ma własną oś poniżej zera, bez nadawania normy i bez różnicy między pomiarami', () => {
    const env = environment();
    const records = [-15, 20].map((value, index) => measurement('fictional-uag-' + index, value, {
      parameterKey: 'clcr:AGu', seriesKey: 'clcr:AGu|mmol/L', label: 'Luka anionowa moczu (UAG)', unit: 'mmol/L',
      reference: null, norm: '', tone: 'neutral', assessment: 'unassessed', category: null,
    }));
    env.api.render(env.host, { projection: projection(...records) });
    const geometry = env.api._internal.chartGeometry(records, null, 320);
    expect(geometry.min).toBeLessThan(-15);
    expect(geometry.y(-15)).toBeGreaterThan(geometry.y(0));
    expect(env.host.querySelector('.vilda-clcr-point[data-value="-15"]')).not.toBeNull();
    expect(env.host.querySelectorAll('.vilda-clcr-norm-band')).toHaveLength(0);
    expect(env.host.querySelectorAll('.vilda-clcr-row-reference').map((node) => node.textContent)).toEqual(['Brak zapisanej normy', 'Brak zapisanej normy']);
    expect(env.host.textContent).not.toMatch(/różnica|godz\./i);
  });

  it('trzy punkty mieszczą się na wąskim ekranie bez skalowania tekstu; większa seria ma osobne miejsce', () => {
    const env = environment(), records = [1, 2, 3].map((value) => measurement('fictional-' + value, value));
    expect(env.api._internal.chartGeometry(records, null, 226).width).toBe(226);
    const g = env.api._internal.chartGeometry(records, null, 226);
    expect(g.x(1) - g.x(0)).toBeGreaterThanOrEqual(44);
    expect(env.api._internal.chartGeometry([...records, measurement('fictional-4', 4)], null, 226).width).toBeGreaterThan(226);
  });

  it('pasmo powstaje tylko ze zgodnych pełnych zapisanych odniesień, a każdy wiersz zachowuje własną normę', () => {
    const env = environment();
    const a = measurement('fictional-a', 13.6), b = measurement('fictional-b', 45, { assessment: 'above', tone: 'warning' });
    const view = env.api.render(env.host, { projection: projection(a, b) });
    expect(env.host.querySelectorAll('.vilda-clcr-norm-band')).toHaveLength(1);
    expect(env.host.querySelectorAll('.vilda-clcr-norm-boundary')).toHaveLength(1);
    view.update(projection(a, { ...b, reference: reference('different-saved-source'), norm: '<25 mg/g' }));
    expect(env.host.querySelectorAll('.vilda-clcr-norm-band')).toHaveLength(0);
    expect(env.host.querySelectorAll('.vilda-clcr-row-reference').map((node) => node.textContent)).toEqual(['<30 mg/g', '<25 mg/g']);
    expect(env.host.querySelector('.vilda-clcr-group-reference').textContent).toBe('Normy i oceny przy poszczególnych wynikach');
    view.update(projection(a, { ...b, unit: 'mg/mmol', seriesKey: 'clcr:ACR|mg/mmol|native' }));
    expect(env.host.querySelectorAll('.vilda-clcr-measurement-group')).toHaveLength(2);
  });

  it('kryterium PHPT ma linię progu bez udawania pasma normy', () => {
    const env = environment();
    const ref = { ...reference(), text: 'Kryterium PHPT: >250 mg/24 h', kind: 'recorded-criterion', bounds: { low: null, high: 250, lowInclusive: false, highInclusive: true } };
    const records = [220, 320].map((value, index) => measurement('fictional-phpt-' + index, value, {
      parameterKey: 'clcr:Ca_mgkg', seriesKey: 'Ca|mg/24h', unit: 'mg/24 h', reference: ref, norm: ref.text,
      assessment: index ? 'above' : 'unassessed', tone: index ? 'warning' : 'neutral',
    }));
    env.api.render(env.host, { projection: projection(...records) });
    expect(env.host.querySelectorAll('.vilda-clcr-norm-band')).toHaveLength(0);
    expect(env.host.querySelectorAll('.vilda-clcr-norm-boundary')).toHaveLength(1);
    expect(env.host.querySelectorAll('.vilda-clcr-point')).toHaveLength(2);
    expect(env.host.textContent).toContain('Kryterium PHPT: >250 mg/24 h');
  });

  it('neutralny starszy zapis nie staje się prawidłowy, a treść danych jest zawsze tekstem', () => {
    const env = environment();
    env.api.render(env.host, { projection: projection(measurement('fictional-legacy', 13.6, {
      status: 'legacy', assessment: 'unassessed', tone: 'neutral', outOfRange: null, reference: null,
      label: '<img src=x onerror=alert(1)>', norm: '<30 mg/g <script>bad()</script>',
    })) });
    expect(env.host.querySelectorAll('img, script')).toHaveLength(0);
    expect(env.host.querySelector('.vilda-clcr-assessment').textContent).toBe('Brak zapisanej oceny');
    expect(env.host.querySelector('.vilda-clcr-assessment').classList.contains('tone-neutral')).toBe(true);
  });

  it('pokazuje polskie opisy zapisanej postaci chemicznej, zachowując oddzielne osie', () => {
    const env = environment();
    env.api.render(env.host, { view: 'table', projection: projection(
      measurement('fictional-cit-ion', 0.2, { sourceFormulaId: 'CitCr_spot', seriesKey: 'cit|ion', basis: 'ion' }),
      measurement('fictional-ox-acid', 0.2, { sourceFormulaId: 'OxCr_spot', seriesKey: 'ox|acid', basis: 'acid' }),
      measurement('fictional-cit-unknown', 0.2, { sourceFormulaId: 'CitCr_spot', seriesKey: 'cit|unknown', basis: 'unknown' })
    ) });
    const labels = env.host.querySelectorAll('.vilda-clcr-group-subtitle').map((node) => node.textContent);
    expect(labels[0]).toContain('Jon cytrynianowy');
    expect(labels[1]).toContain('Kwas szczawiowy bezwodny');
    expect(labels[2]).toContain('Postać masowa niepodana w zapisie');
    expect(labels.join(' ')).not.toContain('unknown');
    expect(env.host.querySelectorAll('.vilda-clcr-measurement-group')).toHaveLength(3);
  });
});
