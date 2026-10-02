import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// Uruchamiamy fragment produkcyjnego inicjalizatora laboratorium, a nie kopię parsera.
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const from = html.indexOf('// Faza 14 — deep link:');
const to = html.indexOf('    if (suggestBodyEl)', from);
if (from < 0 || to < 0) throw new Error('Brak inicjalizatora wskazania klinicznego.');
const production = html.slice(from, to);
const eventName = 'vilda:shell-navigate-target';

function laboratory(search = '') {
  const listeners = new Map();
  const window = {
    location: new URL(`https://vilda.test/aplikacja/przelicznik-jednostek.html${search}`),
    addEventListener: (name, fn) => listeners.set(name, fn),
    scrollTo: vi.fn(),
  };
  const select = { value: 'adrenal_insufficiency' };
  const render = vi.fn();
  const indications = { obesity_kids: {}, adrenal_insufficiency: {} };
  new Function('window', 'URL', 'URLSearchParams', 'suggestSelectEl', 'CLINICAL_INDICATIONS', 'renderSuggestions', 'setTimeout',
    production)(window, URL, URLSearchParams, select, indications, render, vi.fn());
  const target = (href) => {
    const listener = listeners.get(eventName);
    expect(listener, 'laboratorium odbiera cel wejścia z powłoki także po inicjalizacji').toBeTypeOf('function');
    listener({ detail: { href } });
  };
  return { select, render, target };
}

describe('Wskazanie kliniczne — początkowy URL i wejście do ciepłej ramki', () => {
  it.each(['?wskazanie=obesity_kids', '#indication=obesity_kids'])(
    'standalone nadal odczytuje %s', (query) => {
      const lab = laboratory(query);
      expect(lab.select.value).toBe('obesity_kids');
      expect(lab.render).toHaveBeenCalledExactlyOnceWith('obesity_kids');
    },
  );

  it.each(['?wskazanie=obesity_kids', '?indication=obesity_kids', '#wskazanie=obesity_kids'])(
    'jawny cel %s zastępuje wcześniejsze wskazanie bez ponownego tworzenia ramki', (query) => {
      const lab = laboratory('?embedded=1');
      lab.target(`/aplikacja/przelicznik-jednostek.html${query}`);
      expect(lab.select.value).toBe('obesity_kids');
      expect(lab.render).toHaveBeenCalledExactlyOnceWith('obesity_kids');
    },
  );

  it('query ma pierwszeństwo przed wskazaniem w hash', () => {
    const lab = laboratory();
    lab.target('/aplikacja/przelicznik-jednostek.html?wskazanie=obesity_kids#indication=adrenal_insufficiency');
    expect(lab.select.value).toBe('obesity_kids');
    expect(lab.render).toHaveBeenCalledExactlyOnceWith('obesity_kids');
  });

  it.each([
    '/aplikacja/przelicznik-jednostek.html',
    '/aplikacja/przelicznik-jednostek.html?wskazanie=nieznane',
    '/aplikacja/docpro.html?wskazanie=obesity_kids',
    'https://inna.test/aplikacja/przelicznik-jednostek.html?wskazanie=obesity_kids',
    null,
  ])('cel bez właściwego wskazania nie zeruje bieżącego wyboru: %s', (href) => {
    const lab = laboratory();
    lab.target(href);
    expect(lab.select.value).toBe('adrenal_insufficiency');
    expect(lab.render).not.toHaveBeenCalled();
  });
});
