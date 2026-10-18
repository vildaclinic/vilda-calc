import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { powloka } from '../support/powloka-harness.mjs';

// LAB-HISTORIA PR4: ?badanie=<id> (zapas #badanie=) wybiera badanie w przeliczniku (decyzje 6.15, 6.23).
// Wykonujemy produkcyjny fragment skryptu strony z własnymi kotwicami (poza wycinkiem „Faza 14”, który
// wykonuje powloka-wskazanie-kliniczne.test.mjs) z prawdziwym konwerterem; atrapą są pole wyniku, komunikat
// i wybór badania z listy. Dane wyłącznie fikcyjne.
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const from = html.indexOf('    // LAB-HISTORIA PR4 — deep link badania');
const to = html.indexOf('    // Wstępne ustawienie focusu', from);
if (from < 0 || to < 0) throw new Error('Brak produkcyjnego deep linku badania w przeliczniku.');
const production = html.slice(from, to);
const wskazania = html.slice(html.indexOf('// Faza 14 — deep link:'), html.indexOf('    if (suggestBodyEl)'));
const eventName = 'vilda:shell-navigate-target';

const browser = {};
loadBrowserScript('lab_units_data.js', browser);
loadBrowserScript('lab_unit_converter.js', browser);
const Conv = browser.LabUnitConverter;

function przelicznik(search = '', opcje = {}) {
  const listeners = new Map();
  const window = {
    location: new URL(`https://vilda.test/aplikacja/przelicznik-jednostek.html${search}`),
    addEventListener: (name, fn) => listeners.set(name, fn),
  };
  const valueEl = { value: opcje.wartosc || '', focus: vi.fn() };
  const showToast = vi.fn();
  const select = vi.fn();
  new Function('window', 'URL', 'URLSearchParams', 'Conv', 'currentSubstance', 'valueEl', 'showToast', 'selectSubstanceFromDropdown',
    production)(window, URL, URLSearchParams, Conv, opcje.biezace ? Conv.find(opcje.biezace) : null, valueEl, showToast, select);
  const target = (href) => {
    const listener = listeners.get(eventName);
    expect(listener, 'przelicznik odbiera cel wejścia z powłoki także po inicjalizacji').toBeTypeOf('function');
    listener({ detail: { href } });
  };
  return { valueEl, showToast, select, target, wybrane: () => select.mock.calls.map(([s]) => s.id) };
}

describe('?badanie= w przeliczniku: adres początkowy', () => {
  it.each(['?badanie=tsh', '#badanie=tsh', '?embedded=1&badanie=tsh'])('%s przy pustym polu wybiera TSH i ustawia kursor w polu wyniku', (query) => {
    const lab = przelicznik(query);
    expect(lab.wybrane()).toEqual(['tsh']);
    expect(lab.select.mock.calls[0][0].label_pl).toBe('TSH (tyreotropina)');
    expect(lab.valueEl.focus).toHaveBeenCalledOnce();
    expect(lab.showToast).not.toHaveBeenCalled();
  });

  it('query ma pierwszeństwo przed hash', () => {
    expect(przelicznik('?badanie=ft4#badanie=tsh').wybrane()).toEqual(['ft4']);
  });

  it('wpisany wynik: badanie się nie zmienia, jest komunikat', () => {
    const lab = przelicznik('?badanie=tsh', { wartosc: '4,2' });
    expect(lab.select).not.toHaveBeenCalled();
    expect(lab.showToast).toHaveBeenCalledExactlyOnceWith('Nie zmieniono badania na TSH: pole wyniku nie jest puste.');
  });

  it.each(['', '?badanie=', '?badanie=nieznane', '?wskazanie=obesity_kids', '#badanie=%3Cscript%3E'])('bez znanego badania nic się nie dzieje: %s', (query) => {
    const lab = przelicznik(query);
    expect(lab.select).not.toHaveBeenCalled();
    expect(lab.showToast).not.toHaveBeenCalled();
  });

  it('to samo badanie już wybrane: bez ponownego wyboru i bez komunikatu (idempotentnie)', () => {
    const lab = przelicznik('?badanie=tsh', { biezace: 'tsh', wartosc: '4,2' });
    expect(lab.select).not.toHaveBeenCalled();
    expect(lab.showToast).not.toHaveBeenCalled();
  });
});

describe('?badanie= w przeliczniku: cel wejścia z powłoki do otwartej ramki', () => {
  it('jawny cel wybiera badanie bez przeładowania ramki', () => {
    const lab = przelicznik('?embedded=1');
    lab.target('/aplikacja/przelicznik-jednostek.html?badanie=lh');
    expect(lab.wybrane()).toEqual(['lh']);
  });

  it.each([
    '/aplikacja/przelicznik-jednostek.html',
    '/aplikacja/docpro.html?badanie=tsh',
    'https://inna.test/aplikacja/przelicznik-jednostek.html?badanie=tsh',
    null,
  ])('cel spoza strony albo bez badania nie zmienia wyboru: %s', (href) => {
    const lab = przelicznik('?embedded=1');
    lab.target(href);
    expect(lab.select).not.toHaveBeenCalled();
  });

  it('wskazanie i badanie w jednym adresie: każdy fragment obsługuje swój parametr', () => {
    const listeners = new Map();
    const window = { location: new URL('https://vilda.test/aplikacja/przelicznik-jednostek.html?wskazanie=obesity_kids&badanie=tsh'),
      addEventListener: (name, fn) => listeners.set(name, fn), scrollTo: vi.fn() };
    const suggest = { value: '' }, render = vi.fn();
    new Function('window', 'URL', 'URLSearchParams', 'suggestSelectEl', 'CLINICAL_INDICATIONS', 'renderSuggestions', 'setTimeout',
      wskazania)(window, URL, URLSearchParams, suggest, { obesity_kids: {} }, render, vi.fn());
    const select = vi.fn();
    new Function('window', 'URL', 'URLSearchParams', 'Conv', 'currentSubstance', 'valueEl', 'showToast', 'selectSubstanceFromDropdown',
      production)(window, URL, URLSearchParams, Conv, null, { value: '', focus: vi.fn() }, vi.fn(), select);
    expect(suggest.value).toBe('obesity_kids');
    expect(select.mock.calls.map(([s]) => s.id)).toEqual(['tsh']);
  });
});

describe('Powłoka: odnośnik z ?badanie= dociera do ramki przelicznika', () => {
  it('cold: ramka ładuje zwykły adres trasy, a badanie dostaje zdarzeniem po load; warm: kolejny jawny cel z innym badaniem', () => {
    const h = powloka();
    h.shell.navigate('lab', true, 'przelicznik-jednostek.html?badanie=tsh');
    const f = h.load('lab');
    expect(f.src).toBe('przelicznik-jednostek.html?embedded=1');
    expect(f.contentWindow.__events).toEqual(['/przelicznik-jednostek.html?badanie=tsh']);
    h.shell.navigate('docpro'); h.shell.navigate('lab');
    expect(f.contentWindow.__events).toEqual(['/przelicznik-jednostek.html?badanie=tsh']);
    h.shell.navigate('lab', true, 'przelicznik-jednostek.html?badanie=ft4');
    expect(f.contentWindow.__events.at(-1)).toBe('/przelicznik-jednostek.html?badanie=ft4');
  });
});
