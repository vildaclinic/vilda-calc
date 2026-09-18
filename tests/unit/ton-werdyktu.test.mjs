import { describe, expect, it } from 'vitest';
import { funkcjaZ, oknoZSilnikiem, zrodlo } from '../support/silnik-bmi.mjs';

// P-TON rata 1 (audyt werdyktów, punkt 3 — decyzja właściciela „ruszaj z punktami 3 i 4").
//
// Ton kafelka BMI (kolor + puls) powstawał z DOPASOWANIA WYŚWIETLANEJ ETYKIETY:
// `n.toLowerCase().includes("otyłość")`, `includes("nadwaga")`, `includes("niedowaga")`.
// Silnik liczył komplet {etykieta, klucz, kolor} i oddawał tylko etykietę, a kod niżej
// odtwarzał z niej kolor. Werdykt kliniczny zależał więc od brzmienia tekstu dla człowieka:
// zmiana jednego słowa, wielkiej litery albo tłumaczenia cicho przestawiała logikę.

const APP = zrodlo('app.js');
const PREP = zrodlo('vilda_update_prep.js');

const win = oknoZSilnikiem();

describe('P-TON-1 — silnik oddaje kategorię, nie sam napis', () => {
  it('kategoria niesie klucz i kolor, nie tylko etykietę', () => {
    const k = win.VildaBmi.ocen({ bmi: 26, plec: 'M', wiekMies: 120, zrodlo: 'OLAF' }).kategoria;
    expect(k).toHaveProperty('etykieta');
    expect(k).toHaveProperty('klucz');
    expect(k).toHaveProperty('kolor');
    expect(typeof k.klucz).toBe('string');
  });

  it('app.js oddaje obiekt, a etykieta jest już tylko jego widokiem', () => {
    expect(APP).toContain('function bmiKategoriaChild(e,t,n){const T0=vildaBmiSilnik();if(!T0)return null;');
    expect(APP).toContain('function bmiKategoriaDorosly(e){const T0=vildaBmiSilnik();return T0?T0.kategoriaDorosly(e):null}');
    expect(APP, 'etykieta pochodzi z obiektu, nie z osobnego wywołania silnika')
      .toContain('function bmiCategoryChild(e,t,n){const r=bmiKategoriaChild(e,t,n);return r?r.etykieta');
    expect(APP).toContain('function bmiCategory(e){const r=bmiKategoriaDorosly(e);return r?r.etykieta:""}');
  });

  it('karta główna prowadzi obiekt kategorii przez stan i wystawia go globalnie', () => {
    expect(PREP).toContain('function vildaUpdatePrepKategoriaBmi(e)');
    expect(PREP, 'obiekt trafia do stanu karty').toContain('c.bmiKategoria=K0');
    expect(PREP, 'puls dostaje obiekt, nie napis').toContain('window.lastBmiKategoria=e.bmiKategoria||null');
  });
});

describe('P-TON-1 — koniec czytania werdyktu z etykiety', () => {
  /** Ciało applyProModePulse BEZ komentarzy — strażnik ma sprawdzać kod, nie prozę. */
  const puls = () => APP.slice(APP.indexOf('function applyProModePulse('), APP.indexOf('window.setPulseMode'))
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const severity = new Function('window', [
    funkcjaZ(PREP, 'vildaUpdatePrepResolveBmiSeverity'),
    'return vildaUpdatePrepResolveBmiSeverity;',
  ].join('\n'))({});

  it('ton wychodzi z koloru silnika', () => {
    expect(severity({ bmiKategoria: { kolor: 'alert' }, proActive: true })).toBe('danger');
    expect(severity({ bmiKategoria: { kolor: 'improve' }, proActive: true })).toBe('warning');
    expect(severity({ bmiKategoria: { kolor: null }, proActive: true })).toBe(null);
  });

  it('poza trybem profesjonalnym nadal bez tonu — ta rata tego nie zmienia', () => {
    expect(severity({ bmiKategoria: { kolor: 'alert' }, proActive: false })).toBe(null);
  });

  it('brak kategorii nie zgaduje tonu', () => {
    expect(severity({ bmiKategoria: null, proActive: true })).toBe(null);
    expect(severity({ proActive: true })).toBe(null);
    expect(severity(null)).toBe(null);
  });

  it('ani puls, ani ton nie dopasowują już etykiet', () => {
    for (const odcisk of ['includes("oty', 'includes("nadwaga")', 'includes("niedowaga")', 'obesity', 'overweight', 'underweight']) {
      expect(puls(), `puls nie czyta etykiety: ${odcisk}`).not.toContain(odcisk);
    }
    const ton = funkcjaZ(PREP, 'vildaUpdatePrepResolveBmiSeverity');
    for (const odcisk of ['toLowerCase', 'includes(', 'obesity', 'overweight', 'underweight']) {
      expect(ton, `ton nie czyta etykiety: ${odcisk}`).not.toContain(odcisk);
    }
  });

  it('martwa gałąź progu 5 zniknęła z obu kopii', () => {
    // Przecinek odrzucał wynik porównania, więc próg 5 nie robił nic. Ta sama martwa
    // gałąź siedziała w dwóch miejscach naraz, bo cała logika była skopiowana.
    //
    // Strażnik patrzy na KOD z wyciętymi komentarzami: komentarz wyjaśniający usunięty
    // fragment cytuje go dosłownie i bez tego cięcia test czerwieniłby się na własnej prozie.
    expect(puls()).not.toContain('<=5,s="warning"');
    expect(funkcjaZ(PREP, 'vildaUpdatePrepResolveBmiSeverity')).not.toContain('<=5,"warning"');
  });
});

describe('P-TON-1 — zmierzone różnice wobec dawnego czytania etykiety', () => {
  // Te dwa przypadki ZMIENIAJĄ ton (tylko w trybie profesjonalnym) i są przypięte celowo,
  // żeby nikt nie uznał ich później za przypadek. Reszta skali jest bez zmian.
  const dawny = (cat, centyl) => {
    if (typeof cat !== 'string') return null;
    const o = cat.toLowerCase();
    if (o.includes('otyłość')) return 'danger';
    if (o.includes('nadwaga')) return 'warning';
    if (o.includes('niedowaga')) {
      if (typeof centyl === 'number' && !isNaN(centyl)) return Math.round(centyl) <= 3 ? 'danger' : 'warning';
      return 'warning';
    }
    return null;
  };
  const nowy = (kolor) => (kolor === 'alert' ? 'danger' : kolor === 'improve' ? 'warning' : null);

  it('dziecko z niedowagą na centylu 3–3,5: alarm ustępuje ostrzeżeniu', () => {
    // Dawny próg zaokrąglał (Math.round(centyl) <= 3), więc alarm sięgał do 3,49.
    // Silnik ma próg ostry: alert poniżej 3. centyla, improve od 3 do 5.
    for (const c of [3, 3.2, 3.49]) {
      expect(dawny('Niedowaga', c), `centyl ${c} dawniej`).toBe('danger');
      expect(nowy(c < 3 ? 'alert' : 'improve'), `centyl ${c} teraz`).toBe('warning');
    }
    for (const c of [2.4, 2.9]) {
      expect(dawny('Niedowaga', c)).toBe('danger');
      expect(nowy(c < 3 ? 'alert' : 'improve'), `centyl ${c} bez zmian`).toBe('danger');
    }
  });

  it('dorosły z BMI poniżej 18,5: ostrzeżenie staje się alarmem', () => {
    // Dawniej dorosły dostawał „warning", bo centyl BMI jest dla dorosłego niedostępny
    // i gałąź niedowagi spadała do wartości domyślnej. To był skutek implementacji,
    // nie decyzja: silnik klasyfikuje niedowagę dorosłego jako alert.
    const k = win.VildaBmi.kategoriaDorosly(17.2);
    expect(k.klucz).toBe('niedowaga');
    expect(k.kolor).toBe('alert');
    expect(dawny(k.etykieta, null), 'dawniej').toBe('warning');
    expect(nowy(k.kolor), 'teraz').toBe('danger');
  });

  it('reszta skali bez zmian', () => {
    const pary = [['Nadwaga', 'improve'], ['Otyłość', 'alert'], ['Otyłość olbrzymia', 'alert'],
      ['Otyłość III stopnia', 'alert'], ['Prawidłowe', null], ['W normie', null]];
    for (const [etykieta, kolor] of pary) {
      expect(nowy(kolor), etykieta).toBe(dawny(etykieta, 50));
    }
  });
});
