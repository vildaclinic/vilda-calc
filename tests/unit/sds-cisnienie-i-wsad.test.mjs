import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// P-SDS etap 4 (decyzja 5) — ciśnienie, nadciśnienie i wsad XLSX na tym samym silniku SDS
// wzrostu. Audyt 2026-09-15: moduł ciśnienia liczył SDS wzrostu zawsze z OLAF (własny wzór
// na getLMSHeightHybrid), moduł nadciśnienia zawsze z Palczewskiej, a bez niej podstawiał
// z = 0 po cichu (klasyfikacja jak dla mediany wzrostu); gałąź Kułagi była blokowana „błędem
// wzrostu", choć SDS wzrostu nie używa; wsad liczył wzrost przez calcPercentileStats, więc
// wiersz o tym samym wieku w miesiącach co pacjent na formularzu dostawał jego uściślenie
// wieku z daty urodzenia, a źródło WHO było nieosiągalne (wymuszone OLAF).

function wytnij(src, od) {
  let d = 0;
  for (let k = src.indexOf('{', od); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(od, k + 1); }
  }
  throw new Error('niezbalansowane nawiasy');
}

describe('Moduł ciśnienia (bp_module.js)', () => {
  const src = zrodlo('bp_module.js');

  it('re(): SDS wzrostu z silnika ze źródłem siatek aplikacji; bez silnika brak wyniku', () => {
    const i = src.indexOf('function re(t,n,e)');
    expect(i).toBeGreaterThan(-1);
    const log = [];
    const zSilnikiem = new Function('window', 'advHistoryGetPreferredSource', `${wytnij(src, i)}return re;`)(
      { VildaSdsWzrostu: { policz(o) { log.push(o); return { sds: -0.75 }; } } },
      () => 'PALCZEWSKA',
    );
    expect(zSilnikiem('M', 150, 155)).toBe(-0.75);
    expect(log).toEqual([{ wzrost: 155, plec: 'M', wiekMies: 150, zrodlo: 'PALCZEWSKA' }]);
    // P-SDS-5: bez silnika nie ma wyniku — zadnej kopii wzoru na getLMSHeightHybrid.
    const bez = new Function('window', `${wytnij(src, i)}return re;`)({});
    expect(bez('M', 150, 155)).toBeUndefined();
    expect(src).not.toContain('getLMSHeightHybrid');
  });

  it('brak SDS blokuje tylko normy NHBPEP i mówi wprost dlaczego; gałąź OLAF (Kułaga) liczy dalej', () => {
    expect(src).toContain('if(F!=="OLAF"&&(typeof z!="number"||isNaN(z))){');
    expect(src).toContain('Nie policzono SDS wzrostu (wzrost lub wiek poza zakresem siatek) \\u2014 normy NHBPEP wymagaj\\u0105 SDS wzrostu, wi\\u0119c centyla ci\\u015Bnienia nie obliczono.');
    expect(src).not.toContain('Brak danych do obliczenia centyla (b\\u0142\\u0105d wzrostu)');
  });
});

describe('Moduł nadciśnienia (hypertension_therapy.js)', () => {
  const src = zrodlo('hypertension_therapy.js');

  it('Se(): SDS wzrostu z rdzenia (ta sama siatka, co moduł ciśnienia), bez rdzenia brak wyniku', () => {
    const i = src.indexOf('function Se(e)');
    const log = [];
    const Se = new Function('calcPercentileStats', 'calcPercentileStatsPal', `${wytnij(src, i)}return Se;`)(
      (h, s, y, k) => { log.push({ h, s, y, k }); return { sd: -1.1, percentile: 13.6 }; },
      () => { throw new Error('Palczewska nie powinna być wołana, gdy rdzeń odpowiada'); },
    );
    expect(Se({ heightCm: 140, sex: 'F', ageYears: 11 })).toEqual({ sd: -1.1, percentile: 13.6 });
    expect(log).toEqual([{ h: 140, s: 'F', y: 11, k: 'HT' }]);
    // P-SDS-5: bez rdzenia nie ma wyniku — Palczewska nie jest juz zapasem.
    const bezRdzenia = new Function('calcPercentileStatsPal', `${wytnij(src, i)}return Se;`)(() => ({ sd: -0.3, percentile: 38 }));
    expect(bezRdzenia({ heightCm: 140, sex: 'F', ageYears: 11 })).toBeNull();
  });

  it('bez SDS wzrostu: nie ma cichego z = 0 — jawny komunikat, normy NHBPEP nieliczone', () => {
    expect(src).toContain('O=H&&typeof H.sd=="number"&&isFinite(H.sd)?H.sd:null,');
    expect(src).not.toContain('O=H&&typeof H.sd=="number"?H.sd:0');
    expect(src).toContain('const t=O==null?null:Re(i.ageYears,i.sex,O);');
    expect(src).toContain('O==null&&m.push({text:"Nie policzono SDS wzrostu (wzrost lub wiek poza zakresem siatek)');
  });

  it('zapis „hSDS −1,23" i etykieta centyla wg ADV-REPORT-5 (koniec „100. centyl")', () => {
    expect(src).toContain('cm (${Ct(T)}. centyl; hSDS ${O!=null?Sd(O):"nie policzono"}).');
    expect(src).not.toContain('T.toFixed(0)}. centyl');
    expect(src).not.toContain('P.toFixed(0)}. centyl');
    const Ct = new Function(`${wytnij(src, src.indexOf('function Ct(e)'))}return Ct;`)();
    expect(Ct(99.6)).toBe('>99');
    expect(Ct(0.2)).toBe('<1');
    expect(Ct(47.5)).toBe('48');
    const Sd = new Function('window', `${wytnij(src, src.indexOf('function Sd(e)'))}return Sd;`)({});
    expect(Sd(-1.234)).toBe('−1,23');
    expect(Sd(0.004)).toBe('0,00');
  });
});

describe('Wsad XLSX (vilda_professional_module.js)', () => {
  it('SDS wzrostu wiersza liczy silnik z dokładnym wiekiem wiersza i źródłem wsadu (także WHO), bez przecieku wieku z formularza', () => {
    const src = zrodlo('vilda_professional_module.js');
    expect(src, 'P-DS-4b: wsad liczy dla wierszy arkusza, nie dla wczytanego pacjenta')
      .toContain('const q=Ts.policz({wzrost:hh,plec:pp,wiekMies:yy*12,zrodlo:zz,populacja:"OGOLNA"})');
    expect(src).toContain('Ne=Zw(ae,r,re,"PALCZEWSKA");');
    expect(src).toContain('Ne=Zw(ae,r,re,t);');
    expect(src, 'masa nadal przez rdzeń (poza zakresem planu)').toContain('const y=calcPercentileStats(P,r,re,"WT");We=y?y.sd:null;');
    const i = src.indexOf('const Zw=(hh,pp,yy,zz)=>');
    expect(i).toBeGreaterThan(-1);
    const log = [];
    const Zw = new Function('window', `${src.slice(i, src.indexOf(';if(t==="PALCZEWSKA")', i))};return Zw;`)({
      VildaSdsWzrostu: { policz(o) { log.push(o); return { sds: 0.42 }; } },
    });
    expect(Zw(150, 'M', 12.503, 'WHO')).toBe(0.42);
    expect(log[0].wiekMies).toBeCloseTo(150.036, 6);
    expect(log[0].zrodlo).toBe('WHO');
  });
});
