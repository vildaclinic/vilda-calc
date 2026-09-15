import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// P-SDS etap 3 — Karta pacjenta, panel porównania, trajektoria, narracja, B.64 i dietetyka
// na tym samym silniku i w tym samym zapisie. Audyt 2026-09-15: Karta miała własny wzór LMS
// (panel porównania) i własne progi 18 lat (punkt terapii w wieku dokładnie 18,0 lat miał
// hSDS w monitorze, a „—" na Karcie), żeton GH „hSDS +1,2" i ΔhSDS z jednym miejscem,
// panel „<3/>97" wbrew ADV-REPORT-5, dietetyka narzucała siatkę wiekiem. SDS tempa zostaje
// przy jednym miejscu (GROWTH-HV-UI4 — osobna decyzja właściciela).

function wytnij(src, od) {
  let d = 0;
  for (let k = src.indexOf('{', od); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(od, k + 1); }
  }
  throw new Error('niezbalansowane nawiasy');
}
const fmtSdsSilnika = (z) => {
  if (typeof z !== 'number' || !isFinite(z)) return '—';
  const v = Math.round(z * 100) / 100;
  const a = Math.abs(v).toFixed(2).replace('.', ',');
  return v === 0 ? a : (v < 0 ? '−' : '+') + a;
};

describe('Karta pacjenta (vilda_auth_ui.js) — wzrost przez rdzeń, granice i zapis jak w silniku', () => {
  const src = zrodlo('vilda_auth_ui.js');

  it('En(): wzrost zawsze calcPercentileStats (reguła siatki w silniku); masa zostaje przy Palczewskiej z rekordu', () => {
    expect(src).toContain('function En(t,a,n,r,o){try{if(r!=="HT"&&o==="PALCZEWSKA"&&typeof calcPercentileStatsPal=="function")return calcPercentileStatsPal(t,a,n,r);');
  });

  it('granica 18 lat jak w rdzeniu (216 mies. włącznie): warstwa GH i Status Karty', () => {
    expect(src).toContain('function ci(t,a,n,r){try{if(!(t>0)||!(n>0)||n>18)return null;');
    expect(src).toContain('tt=I!=null&&I>216,it=S,');
    expect(src).not.toContain('tt=I!=null&&I>=216');
  });

  it('panel porównania: wzrost przez policz() silnika z płcią i źródłem siatki; własny wzór LMS zostaje tylko dla masy', () => {
    expect(src).toContain('i.VildaSdsWzrostu.policz({wzrost:val,plec:sc.sex,wiekMies:age,zrodlo:i.bmiSource})');
    expect(src).toContain('var lms=null;if(c==null&&sc.param!=="HT"){');
    expect(src).toContain('sex:typeof p.normalizeSex=="function"?p.normalizeSex(n):n,param:p.palParam,');
  });

  it('żeton „hSDS −1,23" i ΔhSDS warstwy GH z dwoma miejscami; SDS panelu tak samo; centyl wg ADV-REPORT-5', () => {
    const i = src.indexOf('function Ur(t)');
    const Ur = new Function('window', `${wytnij(src, i)}return Ur;`)({ VildaSdsWzrostu: { fmtSds: fmtSdsSilnika } });
    expect(Ur(-1.234)).toBe('hSDS −1,23');
    expect(Ur(0.004)).toBe('hSDS 0,00');
    const UrBez = new Function('window', `${wytnij(src, i)}return Ur;`)({});
    expect(UrBez(-1.234), 'zapas bez silnika daje ten sam zapis').toBe('hSDS −1,23');
    expect(src).toContain('"Odpowied\\u017A (\\u0394hSDS)",z!=null?be(z,"",2):"\\u2014"');
    expect(src).toContain('K.push("\\u0394hSDS "+be(_.deltaHsds,"",2))');
    const j = src.indexOf('function fmtS(s)');
    const fmtS = new Function('window', `${wytnij(src, j)}return fmtS;`)({});
    expect(fmtS(-0.5)).toBe('−0,50');
    expect(fmtS(0.004)).toBe('0,00');
    const k = src.indexOf('function fmtC(c)');
    const fmtC = new Function(`${wytnij(src, k)}return fmtC;`)();
    expect(fmtC(0.4)).toBe('<1');
    expect(fmtC(2.6)).toBe(3);
    expect(fmtC(99.4)).toBe('>99');
  });
});

describe('Trajektoria (vilda_trajectory_analysis.js) — SDS pozycji z dwoma miejscami, SDS tempa z jednym', () => {
  const src = zrodlo('vilda_trajectory_analysis.js');

  it('fmtP (pozycja) 2 miejsca przez silnik, fmtS (tempo) 1 miejsce bez silnika; blok SDS tempa woła wyłącznie fmtS', () => {
    const iP = src.indexOf('function fmtP(s)');
    const iS = src.indexOf('function fmtS(s)');
    const fmtP = new Function('window', `${wytnij(src, iP)}return fmtP;`)({ VildaSdsWzrostu: { fmtSds: fmtSdsSilnika } });
    const fmtS = new Function('window', `${wytnij(src, iS)}return fmtS;`)({});
    expect(fmtP(-1.2)).toBe('−1,20');
    expect(fmtS(-1.75)).toBe('−1,8');
    const a = src.indexOf('  function hvSdsDane(');
    const b = src.indexOf('  function hvSdsKafelek(');
    const c = src.indexOf('\n  function ', b + 10);
    const blokTempa = src.slice(a, c);
    expect(blokTempa).not.toContain('fmtP(');
    expect(blokTempa.split('fmtS(').length - 1).toBeGreaterThanOrEqual(8);
    // Poza blokiem tempa nie ma już fmtS( poza definicją.
    const poza = src.slice(0, a) + src.slice(c);
    expect(poza.replace('function fmtS(s)', '').split('fmtS(').length - 1).toBe(0);
  });

  it('fmtC wg ADV-REPORT-5', () => {
    const k = src.indexOf('function fmtC(c)');
    const fmtC = new Function(`${wytnij(src, k)}return fmtC;`)();
    expect(fmtC(0.4)).toBe('<1');
    expect(fmtC(2.6)).toBe('3');
    expect(fmtC(99.4)).toBe('>99');
  });
});

describe('Narracja, ściąga B.64 i dietetyka', () => {
  it('opis pacjenta: hSDS/ΔhSDS/mpSDS z dwoma miejscami, SDS tempa i SDS urodzeniowe z jednym', () => {
    const win = loadBrowserScript('vilda_patient_narrative.js', {});
    expect(win.VildaPatientNarrative.formatSds(-1.2)).toBe('−1,20');
    const src = zrodlo('vilda_patient_narrative.js');
    const i = src.indexOf('  function zdanieTempoSds(');
    const seg = src.slice(i, src.indexOf('\n  function ', i + 10));
    expect(seg).not.toContain('fmtSds(');
    expect(seg).toContain('fmtSds1(');
    expect(src).toContain("opis.push('masa urodzeniowa ' + fmtSds1(c.masaSdsUr) + ' SD')");
    expect(src).toContain("? 'poniżej progu ' + fmtSds1(kons.prog)");
  });

  it('ściąga B.64 formatuje hSDS formaterem silnika, gdy jest', () => {
    const win = { VildaSdsWzrostu: { fmtSds: () => 'ZE-SILNIKA' } };
    loadBrowserScript('vilda_b64_checklist.js', win);
    const api = win.VildaB64Checklist || win.VildaB64Sciaga;
    expect(api, 'moduł ściągi wystawia API').toBeTruthy();
    const src = zrodlo('vilda_b64_checklist.js');
    expect(src).toContain("if (eng && typeof eng.fmtSds === 'function') return eng.fmtSds(x);");
  });

  it('dietetyka nie narzuca siatki wiekiem — bierze źródło aplikacji, regułę wieku ma silnik', () => {
    const src = zrodlo('vilda_diet_plan_ui.js');
    expect(src).not.toContain('const p=Number(e)<3?"WHO":"OLAF"');
    expect(src).toContain('const p=typeof advHistoryGetPreferredSource=="function"?advHistoryGetPreferredSource():typeof bmiSource<"u"&&bmiSource?String(bmiSource).toUpperCase():"OLAF"');
  });
});
