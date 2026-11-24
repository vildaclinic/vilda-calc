import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function engine(catalogue) {
  if (!arguments.length) catalogue = fixture();
  const win = {};
  loadBrowserScript('vilda_icd10_search.js', win);
  return win.VildaICD10Search.create(catalogue);
}

// Deliberately unsorted synthetic rows exercise matching and source preservation;
// this fixture does not add clinical terminology to the production catalogue.
function fixture() {
  return {
    metadata: { id: 'synthetic-icd10-test', editionDate: '2021-03-31', sourceUrl: 'https://example.invalid/icd10', license: 'CC-BY-4.0', sources: [{ title: 'Fikcyjne źródło' }] },
    entries: [
      ['Q90.9', 'Zespół Downa, nie określony', 'Q90'],
      ['E11.9', 'Bez powikłań', 'E11'],
      ['Q90.1', 'Trisomia 21, mozaikowatość', 'Q90'],
      ['E11', 'Cukrzyca insulinoniezależna', null],
      ['A01.1†', 'Łączność — fikcyjny przypadek', 'A01'],
      ['Q90', 'Zespół Downa', null],
      ['Q90.0', 'Trisomia 21, wolna trisomia', 'Q90'],
      ['E11.0', 'Ze śpiączką', 'E11'],
      ['A01†', 'Fikcyjna kategoria źródłowa', null],
      ['B01.0*', 'Fikcyjna manifestacja', null],
      ['B02.0+', 'Fikcyjny plus', null],
    ],
  };
}

const codes = result => result.items.map(entry => entry.code);

describe('local ICD-10 production search engine', () => {
  it('looks up a physician-entered compact code without changing source code or description', () => {
    const index = engine();
    const expected = { code: 'E11.9', name: 'Bez powikłań', parentCode: 'E11', parentName: 'Cukrzyca insulinoniezależna' };
    expect(index.lookup(' e 11 . 9 ')).toEqual(expected);
    expect(index.lookup('E119')).toEqual(expected);
    expect(index.search('E119')).toEqual({ items: [expected], total: 1 });
    expect(index.search('e11.9')).toEqual({ items: [expected], total: 1 });
    expect(index.search(' E 11 . 9 ')).toEqual({ items: [expected], total: 1 });
    expect(index.lookup('E11-9')).toBeNull();
    expect(index.lookup('E11.99')).toBeNull();
    expect(index.lookup('diabetes')).toBeNull();
    expect(index.search('diabetes').total).toBe(0);
  });

  it('folds Polish Unicode, decomposed accents, case and whitespace only for search', () => {
    const index = engine();
    expect(codes(index.search('LACZNOSC'))).toEqual(['A01.1†']);
    expect(codes(index.search('  ła\u0328cznos\u0301c\u0301  '))).toEqual(['A01.1†']);
    expect(index.lookup('a011').name).toBe('Łączność — fikcyjny przypadek');
    expect(codes(index.search('ZESPOL\tDOWNA'))).toEqual(['Q90', 'Q90.9', 'Q90.0', 'Q90.1']);
  });

  it('uses the actual category name as context and ANDs every query term across fields', () => {
    const index = engine();
    expect(codes(index.search('Down'))).toEqual(['Q90', 'Q90.9', 'Q90.0', 'Q90.1']);
    expect(codes(index.search('down trisomia'))).toEqual(['Q90.0', 'Q90.1']);
    expect(codes(index.search('down trisomia mozaik'))).toEqual(['Q90.1']);
    expect(codes(index.search('E119 CUKRZYCA'))).toEqual(['E11.9']);
    expect(codes(index.search('cukrzyca powiklan'))).toEqual(['E11.9']);
    expect(index.search('down cukrzyca').total).toBe(0);
    expect(index.search('cukrzyca typu drugiego').total).toBe(0);
    expect(index.lookup('Q90.0').parentName).toBe('Zespół Downa');
  });

  it('keeps dagger, asterisk and plus markers while resolving unmarked category parents', () => {
    const index = engine();
    expect(index.lookup('A01.1+')).toEqual({ code: 'A01.1†', name: 'Łączność — fikcyjny przypadek', parentCode: 'A01', parentName: 'Fikcyjna kategoria źródłowa' });
    expect(index.lookup('A01').code).toBe('A01†');
    expect(index.lookup('B010').code).toBe('B01.0*');
    expect(index.lookup('b020†').code).toBe('B02.0+');
    expect(codes(index.search('b01.0*'))).toEqual(['B01.0*']);
  });

  it('ranks exact code, code prefix, name prefix, word, substring and parent context deterministically', () => {
    const index = engine({ entries: [
      ['B04', 'Kategoria', null],
      ['B04.0', 'Fikcyjny przykład', 'B04'],
      ['B03', 'Niekategoria', null],
      ['B02', 'Fikcyjna kategoria', null],
      ['B01', 'Kategoria początkowa', null],
      ['B00', 'A01 — fikcyjna wzmianka', null],
      ['B00.0', 'Fikcyjna wzmianka A01', 'B00'],
      ['B00.1', 'FikcyjnyDoA01czonyWyraz', 'B00'],
      ['B00.2', 'Opis potomny', 'B00'],
      ['A01', 'Kategoria A01', null],
      ['A01.1', 'Kategoria A01 szczegółowa', 'A01'],
      ['A01.0', 'Kategoria A01 szczegółowa', 'A01'],
    ] });
    expect(codes(index.search('a01'))).toEqual(['A01', 'A01.0', 'A01.1', 'B00', 'B00.0', 'B00.1', 'B00.2']);
    expect(codes(index.search('kategoria'))).toEqual(['A01', 'A01.0', 'A01.1', 'B01', 'B04', 'B02', 'B03', 'B04.0']);
    expect(codes(index.search('kategoria'))).toEqual(codes(index.search('kategoria')));
  });

  it('counts every match independently of the default and clamped result limit', () => {
    const index = engine({ entries: Array.from({ length: 65 }, (_, i) => [`A${String(i).padStart(2, '0')}`, 'Fikcyjny wpis', null]) });
    expect(index.search('fikcyjny').total).toBe(65);
    expect(index.search('fikcyjny').items).toHaveLength(12);
    for (const limit of [0, -20, -Infinity]) expect(index.search('fikcyjny', { limit }).items).toHaveLength(1);
    for (const limit of [51, 1000, Infinity]) expect(index.search('fikcyjny', { limit }).items).toHaveLength(50);
    expect(index.search('fikcyjny', { limit: 3.9 }).items).toHaveLength(3);
    expect(index.search('fikcyjny', { limit: NaN }).items).toHaveLength(12);
    expect(index.search('fikcyjny', { limit: '5' }).items).toHaveLength(12);
    expect(index.search('fikcyjny', { limit: 1 }).total).toBe(65);
  });

  it('returns no matches for empty, symbol-only or non-string input', () => {
    const index = engine();
    for (const query of ['', ' \n\t ', '.', '† * +', null, undefined, {}, 119]) {
      expect(index.search(query)).toEqual({ items: [], total: 0 });
    }
    expect(index.lookup(null)).toBeNull();
    expect(index.lookup({})).toBeNull();
  });

  it('never mutates source rows or metadata, and returned objects cannot alter the index', () => {
    const catalogue = fixture();
    const before = JSON.stringify(catalogue);
    for (const row of catalogue.entries) Object.freeze(row);
    Object.freeze(catalogue.entries);
    Object.freeze(catalogue.metadata.sources[0]);
    Object.freeze(catalogue.metadata.sources);
    Object.freeze(catalogue.metadata);
    Object.freeze(catalogue);
    const index = engine(catalogue);
    expect(index.metadata).toEqual(catalogue.metadata);
    expect(index.metadata).not.toBe(catalogue.metadata);
    expect(index.metadata.sources[0]).not.toBe(catalogue.metadata.sources[0]);
    expect(Object.isFrozen(index.metadata.sources[0])).toBe(true);
    const result = index.search('E119');
    expect(Object.isFrozen(result.items[0])).toBe(true);
    expect(() => { result.items[0].name = 'Zmiana'; }).toThrow(TypeError);
    result.items.length = 0;
    expect(index.lookup('E119').name).toBe('Bez powikłań');
    expect(JSON.stringify(catalogue)).toBe(before);
  });

  it('snapshots valid data, tolerates missing metadata and skips malformed rows without invented parents', () => {
    for (const catalogue of [undefined, null, {}, { entries: null }, { entries: {}, metadata: 'not metadata' }]) {
      expect(engine(catalogue).search('a')).toEqual({ items: [], total: 0 });
      expect(engine(catalogue).metadata).toEqual({});
    }
    const catalogue = { entries: [null, {}, [], ['', 'Missing code'], ['A00'], ['A00', null], ['A00', 'Pierwszy'], ['A00†', 'Duplikat'], ['A00.1', 'Brak kategorii', 'Z99']] };
    const index = engine(catalogue);
    catalogue.entries[6][1] = 'Zmienione po indeksacji';
    expect(index.lookup('A00').name).toBe('Pierwszy');
    expect(index.lookup('A00.1')).toEqual({ code: 'A00.1', name: 'Brak kategorii', parentCode: 'Z99', parentName: '' });
    expect(index.search('pierwszy').total).toBe(1);
  });

  it('treats all source strings and prototype-like keys as inert data without browser facilities', () => {
    const sentinel = '<img src=x onerror="globalThis.executed=true">';
    const metadata = JSON.parse('{"__proto__":{"polluted":true},"id":"fixture"}');
    const context = vm.createContext({});
    const source = fs.readFileSync(new URL('../../vilda_icd10_search.js', import.meta.url), 'utf8');
    vm.runInContext(source, context);
    const index = context.VildaICD10Search.create({ metadata, entries: [['__proto__', sentinel, null], ['A00', '__proto__ constructor', null]] });
    expect(index.lookup('__proto__').name).toBe(sentinel);
    expect(index.search('onerror').items[0].name).toBe(sentinel);
    expect(index.search('constructor').items[0].code).toBe('A00');
    expect(Object.hasOwn(index.metadata, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(index.metadata).polluted).toBeUndefined();
    expect(context.executed).toBeUndefined();
    expect(context.document).toBeUndefined();
    expect(context.fetch).toBeUndefined();
    expect(context.localStorage).toBeUndefined();
    expect(context.setTimeout).toBeUndefined();
  });
});
