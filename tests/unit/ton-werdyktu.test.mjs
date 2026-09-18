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

/** Kod bez komentarzy. Strażnik „tego już tu nie ma" MUSI patrzeć na kod: komentarz
 *  wyjaśniający usunięty fragment cytuje go dosłownie, więc bez tego cięcia test
 *  czerwieniłby się na własnej prozie. (Trzeci raz w tej serii — stąd jeden pomocnik.) */
const kod = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ');

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
  const puls = () => kod(APP.slice(APP.indexOf('function applyProModePulse('), APP.indexOf('window.setPulseMode')));
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
    const ton = kod(funkcjaZ(PREP, 'vildaUpdatePrepResolveBmiSeverity'));
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
    expect(kod(funkcjaZ(PREP, 'vildaUpdatePrepResolveBmiSeverity'))).not.toContain('<=5,"warning"');
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

describe('P-TON-2 — kategoria Cole\'a i bramki karty też z klucza', () => {
  const stan = () => kod(funkcjaZ(PREP, 'vildaUpdatePrepComputeColeState'));

  it('kategoria Cole\'a pochodzi z silnika, nie z ręcznej kopii progów', () => {
    // Karta wołała T0.cole(...), brała SAMĄ LICZBĘ i przeklasyfikowywała ją własnym
    // wyrażeniem `c<90 / c>110&&c<120 / c>=120` — czwarta kopia progów Cole'a, stojąca
    // obok silnika, który tę kategorię właśnie policzył.
    const c = stan();
    expect(c, 'kategoria z silnika').toContain('KC=q0&&q0.kategoria||null');
    expect(c, 'koniec ręcznej kopii progów').not.toContain('c<90?m=');
    expect(c, 'koniec ręcznej kopii progów').not.toContain('c>=120&&');
  });

  it('sześć flag porównania BMI↔Cole idzie z kluczy, nie z etykiet', () => {
    const c = stan();
    expect(c).toContain('kb=KB&&KB.klucz||""');
    expect(c).toContain('kc=KC&&KC.klucz||""');
    for (const odcisk of ['==="Nadwaga"', '==="Niedowaga"', '==="W normie"', 'startsWith("Oty']) {
      expect(c, `flaga nie czyta etykiety: ${odcisk}`).not.toContain(odcisk);
    }
  });

  it('baner z zalecanymi badaniami pierwszego rzutu nie wisi już na napisie', () => {
    // Zalecenie TSH / 25-OHD / oGTT / lipidogramu dla dziecka z otyłością było włączane
    // przez dopasowanie etykiety Cole'a. Zmiana jej brzmienia wyłączała całe zalecenie.
    const r = kod(funkcjaZ(PREP, 'vildaUpdatePrepRenderColeMetrics'));
    expect(r).toContain('coleObesityKidsBanner');
    expect(r).toContain('o.coleKategoria&&o.coleKategoria.klucz');
    expect(r, 'żadna bramka tej karty nie czyta już etykiety').not.toContain('o.coleCat===');
  });

  it('kolor kafelka Cole\'a z koloru silnika', () => {
    const r = kod(funkcjaZ(PREP, 'vildaUpdatePrepRenderColeMetrics'));
    expect(r).toContain('clearPulse(i.coleInfoEl)');
    expect(r).toContain('o.coleKategoria&&o.coleKategoria.kolor');
  });
});

describe('P-TON-2 — zmierzone skutki przepięcia Cole\'a', () => {
  // Progi silnika Cole'a (PROGI.COLE) kontra dawne ręczne wyrażenie w karcie.
  const silnik = (c) => (!isFinite(c) ? { e: '', k: 'brak', kolor: null }
    : c < 90 ? { e: 'Niedowaga', k: 'niedowaga', kolor: 'alert' }
      : c <= 110 ? { e: 'W normie', k: 'norma', kolor: null }
        : c < 120 ? { e: 'Nadwaga', k: 'nadwaga', kolor: 'improve' }
          : { e: 'Otyłość', k: 'otylosc', kolor: 'alert' });
  const reczna = (c) => {
    let m = 'W normie';
    if (c < 90) m = 'Niedowaga'; else if (c > 110 && c < 120) m = 'Nadwaga'; else if (c >= 120) m = 'Otyłość';
    return m;
  };
  const przemiataj = (fn) => {
    const rozne = [];
    for (let c = 60; c <= 200.0001; c += 0.1) { const x = Math.round(c * 10) / 10; if (fn(x)) rozne.push(x); }
    return rozne;
  };

  it('pasma kategorii bez zmian — ręczna kopia zgadzała się z silnikiem', () => {
    expect(przemiataj((x) => silnik(x).e !== reczna(x))).toEqual([]);
  });

  it('zestaw wyzwalający baner badań bez zmian', () => {
    expect(przemiataj((x) => {
      const dawny = reczna(x) === 'Nadwaga' || String(reczna(x)).startsWith('Otyłość');
      const nowy = silnik(x).k === 'nadwaga' || silnik(x).k === 'otylosc';
      return dawny !== nowy;
    })).toEqual([]);
  });

  it('kolor kafelka: niedowaga Cole\'a przechodzi z ostrzeżenia na alarm', () => {
    // Dawna reguła stawiała niedowagę w tej samej gałęzi co nadwagę, więc Cole poniżej 90 %
    // mediany dostawał ton pomarańczowy. Silnik klasyfikuje niedowagę jako alert — tak samo
    // jak niedowagę BMI. To jedyna zmiana zachowania w tym przepięciu.
    const dawny = (x) => (reczna(x) === 'Otyłość' ? 'danger' : (reczna(x) === 'Nadwaga' || reczna(x) === 'Niedowaga') ? 'warning' : null);
    const nowy = (x) => (silnik(x).kolor === 'alert' ? 'danger' : silnik(x).kolor === 'improve' ? 'warning' : null);
    const rozne = przemiataj((x) => dawny(x) !== nowy(x));
    expect(rozne.length, 'wyłącznie pasmo niedowagi').toBe(300);
    expect(Math.min(...rozne)).toBe(60);
    expect(Math.max(...rozne)).toBeLessThan(90);
    expect(dawny(85)).toBe('warning');
    expect(nowy(85)).toBe('danger');
    // Powyżej 90 % mediany nic się nie zmienia.
    for (const x of [90, 100, 110, 115, 125]) expect(nowy(x), `Cole ${x}`).toBe(dawny(x));
  });
});
