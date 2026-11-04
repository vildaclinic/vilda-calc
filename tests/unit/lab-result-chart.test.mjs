import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

// The renderer receives already frozen history data, not a clinical evaluator.
// All values and identities here are explicitly fictional.
const range = (low = 1, high = 4, extra = {}) => ({ text: `${low}–${high} mIU/L`, low, high, unit: 'mIU/L', label: '', conditional: false, eligible: true, tone: 'within', ...extra });
const entry = (id, date, value, extra = {}) => ({ noteId: `fictional-${id}`, dateISO: date, dateSource: 'badanie', kind: 'numeric', exactValue: value, value, display: `${value} mIU/L`, unit: 'mIU/L', ...extra });

function fixture(entries, options = {}) {
  const doc = atrapaDokumentu(), win = {}, openNote = vi.fn();
  loadBrowserScript('vilda_lab_result_chart.js', win);
  const view = {
    key: 'fictional-tsh', label: 'Fikcyjne TSH', unit: 'mIU/L', entries,
    chart: {
      unit: 'mIU/L', points: entries.filter((row) => row.exactValue != null && row.kind === 'numeric')
        .map((row) => ({ noteId: row.noteId, dateISO: row.dateISO, v: row.exactValue })), gaps: [],
      ...options.chart,
    },
  };
  const descriptions = options.descriptions || {};
  const describeEntry = vi.fn((row) => descriptions[row.noteId] || { value: row.exactValue, unit: row.unit, tone: 'within', normText: '1–4 mIU/L', norms: [range()], ...options.description });
  const before = JSON.stringify(view);
  const host = win.VildaLabResultChart.render(doc, view, { describe: describeEntry, openNote });
  expect(JSON.stringify(view)).toBe(before);
  return { host, view, openNote, describeEntry, doc, win };
}

describe('saved laboratory history chart', () => {
  it('plots an exact zero, includes the saved bounds in the axis and opens its exact note', () => {
    const a = entry('zero', '2026-01-01', 0);
    const { host, openNote } = fixture([a]);
    const points = host.querySelectorAll('.vilda-lab-result-chart-point');
    expect(points).toHaveLength(1);
    expect(points[0].getAttribute('data-value')).toBe('0');
    expect(points[0].getAttribute('type')).toBe('button');
    expect(points[0].getAttribute('aria-label')).toContain('0 mIU/L');
    expect(points[0].parentNode.getAttribute('x')).toBe('50.0000%');
    expect(points[0].parentNode.getAttribute('y')).toMatch(/^\d+(?:\.\d+)?%$/);
    expect(points[0].parentNode.getAttribute('width')).toBe('44');
    expect(points[0].parentNode.getAttribute('height')).toBe('44');
    expect(points[0].parentNode.getAttribute('transform')).toBe('translate(-22 -22)');
    expect(host.querySelectorAll('[style]')).toHaveLength(0);
    points[0].click();
    expect(openNote).toHaveBeenCalledExactlyOnceWith('fictional-zero');
    const top = host.querySelectorAll('.vilda-lab-result-chart-y span')[0].textContent;
    expect(Number(top.replace(',', '.'))).toBeGreaterThan(4);
    expect(host.querySelectorAll('.vilda-lab-result-chart-band')).toHaveLength(1);
    expect(host.querySelectorAll('.vilda-lab-result-chart-bound')).toHaveLength(2);
  });

  it('supplies each saved color state to the shared CSS point palette, including a neutral fourth state', () => {
    const rows = ['within', 'below', 'above', 'neutral'].map((tone, index) => entry(tone, `2026-01-0${index + 1}`, index));
    const descriptions = Object.fromEntries(rows.map((row, index) => [row.noteId, { value: row.value, unit: row.unit, tone: ['within', 'below', 'above', 'neutral'][index], normText: '1–4 mIU/L', norms: [range()] }]));
    const { host } = fixture(rows, { descriptions });
    const dots = host.querySelectorAll('.vilda-lab-result-chart-dot');
    expect(dots.map((dot) => dot.parentNode.getAttribute('data-tone'))).toEqual(['within', 'below', 'above', 'neutral']);
    // The actual stylesheet now owns the palette. Resolve its global tokens so
    // moving geometry out of inline styles retains the original color check.
    const css = readFileSync(new URL('../../vilda_lab_history_tab.css', import.meta.url), 'utf8');
    const globals = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');
    const colors = ['within', 'below', 'above'].map((tone) => {
      const selector = `.vilda-lab-result-chart-point[data-tone="${tone}"] .vilda-lab-result-chart-dot`;
      expect(css).toContain(selector);
      const block = css.slice(css.indexOf(selector) + selector.length).match(/^\s*\{([^}]*)\}/)[1];
      const color = block.match(/border-color:\s*([^;]+);/)[1].trim();
      const variable = /^var\(--([\w-]+)\)$/.exec(color);
      return (variable ? globals.match(new RegExp(`--${variable[1]}:\\s*([^;]+);`))[1].trim() : color).toLowerCase();
    });
    expect(colors).toEqual(['#1d9e75', '#d8632a', '#b91c1c']);
    expect(dots.every((dot) => !dot.hasAttribute('style'))).toBe(true);
    expect(host.querySelectorAll('.vilda-lab-result-chart-target').map((target) => [target.getAttribute('width'), target.getAttribute('height')])).toEqual([
      ['44', '44'], ['44', '44'], ['44', '44'], ['44', '44'],
    ]);
  });

  it('never imputes an inequality limit as a point, and breaks the trend at a censored result', () => {
    const a = entry('before', '2026-01-01', 1), c = entry('after', '2026-01-03', 2);
    const b = entry('censored', '2026-01-02', null, { kind: 'censored', display: '<0,1 mIU/L' });
    const { host } = fixture([a, b, c], { chart: { gaps: [{ dateISO: b.dateISO, noteId: b.noteId, kind: 'censored' }] } });
    expect(host.querySelectorAll('.vilda-lab-result-chart-point')).toHaveLength(2);
    expect(host.querySelectorAll('.vilda-lab-result-chart-line')).toHaveLength(0);
    expect(host.querySelector('[data-note-id="fictional-censored"]')).toBeNull();
  });

  it('rejects a stale exact model point when presentation identifies the value as censored or invalidated', () => {
    const a = entry('invalidated', '2026-01-01', 18);
    const { host } = fixture([a], { description: { value: null, tone: 'neutral', norms: [] } });
    expect(host).toBeNull();
  });

  it('retains separate dated ranges instead of applying the latest bounds to the entire history', () => {
    const a = entry('old', '2026-01-01', 1), b = entry('new', '2026-03-01', 8);
    const descriptions = {
      [a.noteId]: { value: 1, unit: 'mIU/L', tone: 'within', normText: '1–4 mIU/L', norms: [range()] },
      [b.noteId]: { value: 8, unit: 'mIU/L', tone: 'above', normText: '2–6 mIU/L', norms: [range(2, 6, { tone: 'above' })] },
    };
    const { host } = fixture([a, b], { descriptions });
    const bands = host.querySelectorAll('.vilda-lab-result-chart-band');
    expect(bands.map((band) => [band.getAttribute('data-date'), band.getAttribute('data-low'), band.getAttribute('data-high')])).toEqual([
      ['2026-01-01', '1', '4'], ['2026-03-01', '2', '6'],
    ]);
    expect(Number(bands[0].getAttribute('width'))).toBe(50);
    expect(Number(bands[1].getAttribute('x'))).toBe(50);
    const point = host.querySelector('[data-note-id="fictional-old"]');
    expect(point.getAttribute('aria-label')).toContain('1–4 mIU/L');
  });

  it('upper-only conditional LH is a neutral upper boundary without an invented lower zero or green band', () => {
    const a = entry('lh', '2026-01-01', 0);
    const { host } = fixture([a], { description: { tone: 'neutral', normText: '≤0,3 mIU/L', norms: [range(null, 0.3, { text: '≤0,3 mIU/L', conditional: true, tone: 'neutral' })] } });
    expect(host.querySelectorAll('.vilda-lab-result-chart-band')).toHaveLength(0);
    const bounds = host.querySelectorAll('.vilda-lab-result-chart-bound');
    expect(bounds).toHaveLength(1);
    expect(bounds[0].getAttribute('data-low')).toBe('');
    expect(bounds[0].getAttribute('data-high')).toBe('0.3');
    expect(bounds[0].getAttribute('stroke')).toBe('#779aa2');
  });

  it('cannot draw a mismatched unit or an ineligible source as the displayed series norm', () => {
    const a = entry('unit', '2026-01-01', 2);
    const { host } = fixture([a], { description: { tone: 'neutral', norms: [range(1, 4, { unit: 'ng/dL' }), range(1, 4, { eligible: false })] } });
    expect(host.querySelectorAll('.vilda-lab-result-chart-bound')).toHaveLength(0);
    expect(host.querySelectorAll('.vilda-lab-result-chart-band')).toHaveLength(0);
    expect(host.querySelectorAll('.vilda-lab-result-chart-point')).toHaveLength(1);
  });

  it('draws alternative saved references separately without a combined interval or common green band', () => {
    const a = entry('alternatives', '2026-01-01', 2);
    const { host } = fixture([a], { description: { tone: 'neutral', norms: [range(1, 4, { label: 'Dla wieku', tone: 'neutral' }), range(2, 6, { label: 'Dla stadium', tone: 'neutral' })] } });
    expect(host.querySelectorAll('.vilda-lab-result-chart-band')).toHaveLength(0);
    expect(host.querySelectorAll('.vilda-lab-result-chart-bound')).toHaveLength(4);
    expect(host.querySelectorAll('.vilda-lab-result-chart-bound title').map((label) => label.textContent)).toEqual([
      '01.01.2026: Dla wieku · 1–4 mIU/L', '01.01.2026: Dla wieku · 1–4 mIU/L',
      '01.01.2026: Dla stadium · 2–6 mIU/L', '01.01.2026: Dla stadium · 2–6 mIU/L',
    ]);
  });

  it('does not connect multiple results from the same date or combine their conflicting references', () => {
    const a = entry('a', '2026-01-01', 2), b = entry('b', '2026-01-01', 3), c = entry('c', '2026-02-01', 4);
    const descriptions = {
      [a.noteId]: { value: 2, unit: 'mIU/L', tone: 'within', norms: [range()] },
      [b.noteId]: { value: 3, unit: 'mIU/L', tone: 'within', norms: [range(2, 6)] },
    };
    const { host } = fixture([a, b, c], { descriptions });
    expect(host.querySelectorAll('.vilda-lab-result-chart-point')).toHaveLength(3);
    expect(host.querySelectorAll('.vilda-lab-result-chart-line')).toHaveLength(0);
    expect(host.querySelectorAll('.vilda-lab-result-chart-band[data-date="2026-01-01"]')).toHaveLength(0);
    expect(host.querySelectorAll('.vilda-lab-result-chart-band[data-date="2026-02-01"]')).toHaveLength(1);
  });

  it('keeps coincident results at their true coordinate and opens either record through the shared point chooser', () => {
    const a = entry('coincident-a', '2026-01-01', 2), b = entry('coincident-b', '2026-01-01', 2);
    const descriptions = {
      [a.noteId]: { value: 2, unit: 'mIU/L', tone: 'within', normText: '1–4 mIU/L', norms: [range()] },
      [b.noteId]: { value: 2, unit: 'mIU/L', tone: 'below', normText: '3–6 mIU/L', norms: [range(3, 6, { tone: 'below' })] },
    };
    const { host, openNote, doc } = fixture([a, b], { descriptions });
    const points = host.querySelectorAll('.vilda-lab-result-chart-point');
    expect(points).toHaveLength(1);
    const control = points[0], chooser = host.querySelector('.vilda-lab-result-chart-chooser');
    expect(control.getAttribute('data-value')).toBe('2');
    expect(control.getAttribute('data-count')).toBe('2');
    expect(control.parentNode.getAttribute('x')).toBe('50.0000%');
    expect(control.parentNode.getAttribute('transform')).toBe('translate(-22 -22)');
    expect(control.getAttribute('data-tone')).toBe('neutral');
    expect(control.getAttribute('aria-controls')).toBe(chooser.id);
    expect(control.getAttribute('aria-expanded')).toBe('false');
    expect(control.querySelector('.vilda-lab-result-chart-count').textContent).toBe('2');
    expect(chooser.hidden).toBe(true);
    const choices = chooser.querySelectorAll('button');
    expect(choices).toHaveLength(2);
    expect(choices.map((choice) => choice.getAttribute('data-note-id'))).toEqual([a.noteId, b.noteId]);
    expect(choices.map((choice) => choice.textContent)).toEqual([
      '2 mIU/L01.01.2026Norma: 1–4 mIU/L', '2 mIU/L01.01.2026Norma: 3–6 mIU/L',
    ]);
    control.click();
    expect(chooser.hidden).toBe(false);
    expect(control.getAttribute('aria-expanded')).toBe('true');
    expect(doc.activeElement).toBe(choices[0]);
    expect(openNote).not.toHaveBeenCalled();
    choices[0].click();
    expect(openNote).toHaveBeenLastCalledWith(a.noteId);
    expect(chooser.hidden).toBe(true);
    control.click();
    choices[1].click();
    expect(openNote.mock.calls.map(([noteId]) => noteId)).toEqual([a.noteId, b.noteId]);
    expect(chooser.hidden).toBe(true);
    expect(control.getAttribute('aria-expanded')).toBe('false');
  });

  it('plots negative saved results at their actual height and includes negative bounds', () => {
    const a = entry('negative', '2026-01-01', -15), b = entry('positive', '2026-02-01', 2);
    const { host } = fixture([a, b], { description: { norms: [range(-20, 5)] } });
    const zero = host.querySelector('[data-note-id="fictional-negative"]');
    expect(zero.getAttribute('data-value')).toBe('-15');
    const labels = host.querySelectorAll('.vilda-lab-result-chart-y span').map((label) => Number(label.textContent.replace(',', '.')));
    expect(labels[2]).toBeLessThan(-20);
    expect(host.querySelectorAll('.vilda-lab-result-chart-line')).toHaveLength(1);
  });

  it('uses safe text nodes for imported labels and ignores invalid calendar dates', () => {
    const a = entry('safe', '2026-01-01', 2), b = entry('bad-date', '2026-02-30', 4);
    const { host } = fixture([a, b], { description: { normText: '<img src=x onerror=bad()>', norms: [] } });
    expect(host.querySelectorAll('.vilda-lab-result-chart-point')).toHaveLength(1);
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('.vilda-lab-result-chart-point').getAttribute('aria-label')).toContain('<img src=x onerror=bad()>');
  });
});
