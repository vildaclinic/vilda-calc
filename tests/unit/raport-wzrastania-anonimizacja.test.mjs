import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ADV-REPORT-7 (decyzja właściciela 2026-09-13), etap 7 i ostatni naprawy Raportu wzrastania.
//
// Znalezisko audytu: raport niesie imię i nazwisko pacjenta w nagłówku ORAZ w nazwie pliku,
// więc każdy wygenerowany PDF ląduje na dysku z danymi osobowymi w samej nazwie — także
// wtedy, gdy wydruk ma trafić do koperty, do konsultanta albo na zdjęcie w wiadomości.
// Przełącznik jest DOSTĘPNY, ale DOMYŚLNIE WYŁĄCZONY: ciche skracanie nazwiska byłoby
// zmianą zachowania bez pytania.
//
// Reguła inicjałów jest KOPIĄ reguły z modułu terminarza (moduły ładują się niezależnie
// i nie mają wspólnego globalu) — ostatni test w tym pliku pilnuje, żeby obie mówiły to samo.
//
// Dane wyłącznie FIKCYJNE.

let win;
let pola;
let anon;

function makeDoc() {
  return {
    getElementById(id) {
      if (id === 'advReportAnon') return anon === null ? null : { get checked() { return anon; } };
      if (!Object.prototype.hasOwnProperty.call(pola, id)) return null;
      return { get value() { return pola[id]; } };
    },
  };
}

let magazyn;

beforeEach(() => {
  pola = { advName: 'Zofia Przykładowska' };
  anon = false;
  magazyn = new Map();
  globalThis.document = makeDoc();
  // Moduł czyta `window.localStorage`, a loader podstawia przekazany obiekt jako `window`.
  win = loadBrowserScript('vilda_advanced_growth.js', { localStorage: magazynStub() });
});
afterEach(() => { win = null; delete globalThis.document; });

function magazynStub() {
  return {
    getItem: (k) => (magazyn.has(k) ? magazyn.get(k) : null),
    setItem: (k, v) => { magazyn.set(k, String(v)); },
    removeItem: (k) => { magazyn.delete(k); },
  };
}

const api = () => win.VildaAdvancedGrowth;

describe('Raport wzrastania — anonimizacja nagłówka i nazwy pliku', () => {
  it('domyślnie wyłączona: nazwisko zostaje w całości', () => {
    expect(api().advGrowthReportAnonymizationOn()).toBe(false);
    expect(api().advGrowthResolveReportPatientName()).toBe('Zofia Przykładowska');
  });

  it('włączona: zostają same inicjały', () => {
    anon = true;
    expect(api().advGrowthReportAnonymizationOn()).toBe(true);
    expect(api().advGrowthResolveReportPatientName()).toBe('Z.P.');
  });

  it('brak przełącznika na stronie czyta się jak wyłączony, a nie jak błąd', () => {
    anon = null;
    expect(api().advGrowthReportAnonymizationOn()).toBe(false);
    expect(api().advGrowthResolveReportPatientName()).toBe('Zofia Przykładowska');
  });

  it('inicjały radzą sobie z polskimi znakami i nazwiskiem dwuczłonowym', () => {
    const f = api().advGrowthPatientInitials;
    expect(f('Łukasz Żmuda')).toBe('Ł.Ż.');
    expect(f('Ćwikła Śliwiński')).toBe('Ć.Ś.');
    expect(f('Anna Maria Ćwik')).toBe('A.M.Ć.');
  });

  it('data urodzenia w nawiasie nie staje się inicjałem', () => {
    // Karta Pacjenta dopisuje do nazwiska „(ur. 2015-03-02)" — bez odcięcia wyszłoby „Z.P.(."
    expect(api().advGrowthPatientInitials('Zofia Przykładowska (ur. 2015-03-02)')).toBe('Z.P.');
  });

  it('puste nazwisko zostaje puste, a nie zamienia się w kropki', () => {
    const f = api().advGrowthPatientInitials;
    expect(f('')).toBe('');
    expect(f(null)).toBe('');
    expect(f('   ')).toBe('');
  });

  it('nazwa pliku i nagłówek biorą nazwisko z JEDNEGO punktu', () => {
    // Gdyby nazwa pliku liczyła sama, przełącznik anonimizowałby nagłówek, a PDF i tak
    // leżałby na pulpicie z nazwiskiem w nazwie — czyli nie dawałby nic.
    const src = fs.readFileSync(path.join(korzen, 'vilda_advanced_growth.js'), 'utf8');
    const odczyty = src.match(/document\.getElementById\("advName"\)\?\.value/g) || [];
    expect(odczyty.length).toBe(1);
    expect(src).toMatch(/const n=\(Ai\(\)\|\|""\)\.normalize\("NFD"\)/);
  });

  it('przełącznik istnieje w kontrolkach raportu i nie jest domyślnie zaznaczony', () => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_advanced_growth.js'), 'utf8');
    expect(src).toMatch(/id="advReportAnon"/);
    expect(src).not.toMatch(/id="advReportAnon"[^>]*checked/);
  });
});

describe('Reguła inicjałów — obie kopie mówią to samo', () => {
  function wytnij(src, nazwa, marker) {
    const igla = `function ${nazwa}(`;
    for (let i = src.indexOf(igla); i >= 0; i = src.indexOf(igla, i + 1)) {
      let d = 0;
      for (let k = src.indexOf('{', i); k < src.length; k += 1) {
        if (src[k] === '{') d += 1;
        else if (src[k] === '}') {
          d -= 1;
          if (d === 0) {
            const cialo = src.slice(i, k + 1);
            if (!marker || cialo.includes(marker)) return cialo;
            break;
          }
        }
      }
    }
    return null;
  }

  it('terminarz i raport wzrastania dają te same inicjały', () => {
    const tz = fs.readFileSync(path.join(korzen, 'vilda_terminarz.js'), 'utf8');
    const cialo = wytnij(tz, 'Na', 'ur\\.');
    expect(cialo, 'vilda_terminarz.js ma pomocnika inicjałów').toBeTruthy();
    const terminarz = new Function(`${cialo}\nreturn Na;`)();
    const raport = api().advGrowthPatientInitials;
    for (const n of ['Zofia Przykładowska', 'Łukasz Żmuda', 'Anna Maria Ćwik',
      'Zofia Przykładowska (ur. 2015-03-02)', '', '   ']) {
      expect(raport(n), `inicjały dla „${n}"`).toBe(terminarz(n));
    }
  });
});

// ADV-REPORT-10 (decyzja właściciela 2026-09-13): stan przełącznika ma przetrwać między wydrukami.
// To USTAWIENIE URZĄDZENIA, nie dana pacjenta — w magazynie ląduje wyłącznie „1" albo nic.
describe('Raport wzrastania — pamięć przełącznika anonimizacji', () => {
  it('pusty magazyn czyta się jako wyłączony, tak jak dotąd', () => {
    expect(api().advGrowthReadAnonymizationPreference()).toBe(false);
  });

  it('włączenie zapisuje, wyłączenie kasuje wpis', () => {
    api().advGrowthWriteAnonymizationPreference(true);
    expect(magazyn.get('vilda-adv-report-anon-v1')).toBe('1');
    expect(api().advGrowthReadAnonymizationPreference()).toBe(true);

    api().advGrowthWriteAnonymizationPreference(false);
    expect(magazyn.has('vilda-adv-report-anon-v1')).toBe(false);
    expect(api().advGrowthReadAnonymizationPreference()).toBe(false);
  });

  it('w magazynie nie ląduje nic poza znacznikiem — żadnego nazwiska', () => {
    api().advGrowthWriteAnonymizationPreference(true);
    expect([...magazyn.keys()]).toEqual(['vilda-adv-report-anon-v1']);
    expect([...magazyn.values()].join('')).toBe('1');
  });

  it('niedostępny magazyn nie wywraca raportu — czyta się jak wyłączony', () => {
    // Prywatne okno albo zablokowane dane witryny: każdy dostęp rzuca wyjątkiem.
    const w2 = loadBrowserScript('vilda_advanced_growth.js', {
      localStorage: {
        getItem() { throw new Error('brak dostępu'); },
        setItem() { throw new Error('brak dostępu'); },
        removeItem() { throw new Error('brak dostępu'); },
      },
    });
    expect(w2.VildaAdvancedGrowth.advGrowthReadAnonymizationPreference()).toBe(false);
    expect(() => w2.VildaAdvancedGrowth.advGrowthWriteAnonymizationPreference(true)).not.toThrow();
  });

  it('kontrolki raportu ustawiają przełącznik z pamięci i zapisują każdą zmianę', () => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_advanced_growth.js'), 'utf8');
    expect(src).toMatch(/an\.checked=Anr\(\)/);
    expect(src).toMatch(/an\.addEventListener\("change",function\(\)\{Anw\(!!an\.checked\)\}\)/);
    // Znacznik chroni przed podwójnym nasłuchem przy ponownym wywołaniu kontrolek.
    expect(src).toMatch(/an&&!an\.dataset\.wired/);
  });
});
