import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Wpięcie progu B.64 w monitor terapii GH.
//
// Test wycina PRAWDZIWĄ funkcję `Bg1` z pliku produkcyjnego i uruchamia ją na atrapie DOM.
// Pilnuje trzech rzeczy, które łatwo zepsuć po cichu: że nota w ogóle powstaje, że znika
// razem z danymi (a nie zostaje na ekranie po wyczyszczeniu monitora) i że wyjątek w silniku
// nie wywraca renderowania całej tabeli.

let zrob;
beforeAll(() => {
  const src = fs.readFileSync(path.join(korzen, 'gh_therapy_monitor.js'), 'utf8');
  const start = src.indexOf('function Bg1(');
  const end = src.indexOf('function de(', start);
  expect(start, 'znaleziono Bg1 w monitorze').toBeGreaterThan(-1);
  expect(end, 'znaleziono koniec bloku').toBeGreaterThan(start);
  const body = src.slice(start, end);
  zrob = (document, window, p = () => {}) =>
    new Function('document', 'window', 'p', `${body}\nreturn Bg1;`)(document, window, p);
});

// Minimalna atrapa DOM: tyle, ile Bg1 naprawdę dotyka.
function atrapaDom() {
  const el = (id) => ({
    id,
    dataset: {},
    style: { cssText: '' },
    textContent: '',
    dzieci: [],
    usuniety: false,
    setAttribute() {},
    appendChild(c) { this.dzieci.push(c); c.rodzic = this; },
    remove() { this.usuniety = true; if (this.rodzic) this.rodzic.dzieci = this.rodzic.dzieci.filter((x) => x !== this); },
  });
  const sekcja = el('ghTherapyMetricsSection');
  const wg = { ghTherapyMetricsSection: sekcja };
  return {
    sekcja,
    document: {
      getElementById: (id) => wg[id] || null,
      createElement: () => {
        const n = el('ghB64ResponseNote');
        wg.ghB64ResponseNote = n;
        return n;
      },
    },
    nota: () => wg.ghB64ResponseNote || null,
    zapomnijNote: () => { delete wg.ghB64ResponseNote; },
  };
}

const SILNIK = {
  ocenOstatni: (punkty) => (Array.isArray(punkty) && punkty.length
    ? { tekst: 'Zdanie o tempie.', ponizejProgu: punkty[0].nisko === true }
    : null),
};

const PUNKTY = [{ nisko: true }];

describe('Nota o progu B.64 pod tabelą monitora', () => {
  it('powstaje i niesie tekst z silnika', () => {
    const d = atrapaDom();
    const Bg1 = zrob(d.document, { VildaGhResponseB64: SILNIK });
    expect(Bg1(PUNKTY)).toBe(true);
    expect(d.nota().textContent).toBe('Zdanie o tempie.');
    expect(d.sekcja.dzieci).toHaveLength(1);
  });

  it('oznacza w danych, po której stronie progu jest wynik', () => {
    const d = atrapaDom();
    const Bg1 = zrob(d.document, { VildaGhResponseB64: SILNIK });
    Bg1([{ nisko: true }]);
    expect(d.nota().dataset.ponizejProgu).toBe('1');
    const d2 = atrapaDom();
    zrob(d2.document, { VildaGhResponseB64: SILNIK })([{ nisko: false }]);
    expect(d2.nota().dataset.ponizejProgu).toBe('0');
  });

  it('znika, gdy nie ma czego ocenić — nie zostaje na ekranie po wyczyszczeniu', () => {
    const d = atrapaDom();
    const Bg1 = zrob(d.document, { VildaGhResponseB64: SILNIK });
    Bg1(PUNKTY);
    expect(d.sekcja.dzieci).toHaveLength(1);
    expect(Bg1([])).toBe(false);
    expect(d.nota().usuniety, 'stara nota zdjęta').toBe(true);
    expect(d.sekcja.dzieci).toHaveLength(0);
  });

  it('bez silnika i bez sekcji nie wywraca renderowania tabeli', () => {
    const d = atrapaDom();
    expect(zrob(d.document, {})(PUNKTY)).toBe(false);
    expect(d.sekcja.dzieci).toHaveLength(0);
    const pusty = { getElementById: () => null, createElement: () => ({}) };
    expect(zrob(pusty, { VildaGhResponseB64: SILNIK })(PUNKTY)).toBe(false);
  });

  it('wyjątek w silniku jest zgłoszony i połknięty, a nie wypuszczony na tabelę', () => {
    const d = atrapaDom();
    const zgloszenia = [];
    const wybuchowy = { ocenOstatni: () => { throw new Error('silnik padł'); } };
    const Bg1 = zrob(d.document, { VildaGhResponseB64: wybuchowy },
      (...a) => zgloszenia.push(a));
    expect(() => Bg1(PUNKTY)).not.toThrow();
    expect(Bg1(PUNKTY)).toBe(false);
    expect(zgloszenia.length).toBeGreaterThan(0);
  });
});
