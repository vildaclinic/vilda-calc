import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (f) => fs.readFileSync(path.join(korzen, f), 'utf8');

// Dwie prośby właściciela po zamknięciu planu P-BMI (2026-09-16):
//
//  1. WSAD XLSX — kolumna „Data pomiaru". Silnik umiał liczyć wiek wiersza na datę pomiaru
//     od P-BMI-4, ale szablon (dwa przykładowe arkusze do pobrania z DocPro) i instrukcja
//     w ogóle o tej kolumnie nie mówiły, więc funkcja była niewidoczna. Kolumna jest
//     OPCJONALNA: bez niej wiek liczy się na dziś, czyli stare arkusze dają te same liczby.
//  2. „wSDS" dla masy — wzrost mówi „hSDS −1,23", BMI „bmiSDS +1,20", a masa jako jedyna
//     zostawała przy „(Z‑score = -0,25)": inny znak (ASCII zamiast minusa typograficznego),
//     brak plusa i inna nazwa tej samej wielkości. Jeden zapis dla trzech miar.
//     Pozostałe miary (obwody, ciśnienie, tętno, masa do wysokości) zostają przy „Z-score" —
//     mają własne siatki i własne decyzje, poza zakresem tej zmiany.
//
// Dane FIKCYJNE.

function wytnij(src, od) {
  let d = 0;
  for (let k = src.indexOf('{', od); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(od, k + 1); }
  }
  throw new Error('niezbalansowane nawiasy');
}
const funkcja = (src, nazwa) => wytnij(src, src.indexOf(`function ${nazwa}(`));

async function arkusz(plik) {
  const win = {};
  new Function('window', 'globalThis', zrodlo('jszip.min.js'))(win, win);
  const zip = await win.JSZip.loadAsync(fs.readFileSync(path.join(korzen, plik)));
  const ss = await zip.file('xl/sharedStrings.xml').async('string');
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const teksty = [...ss.matchAll(/<t[^>]*>(.*?)<\/t>/g)].map((m) => m[1]);
  // Komórka tekstowa niesie indeks do sharedStrings; liczbowa — samą wartość.
  const komorka = (adres) => {
    const m = new RegExp(`<c r="${adres}"([^>]*)><v>(.*?)</v></c>`).exec(sheet);
    if (!m) return null;
    return /t="s"/.test(m[1]) ? teksty[Number(m[2])] : m[2];
  };
  return { teksty, sheet, komorka };
}

describe('Szablon wsadu XLSX — opcjonalna kolumna „Data pomiaru"', () => {
  for (const plik of ['zscore_przyklad_palczewska.xlsx', 'zscore_przyklad_olaf.xlsx']) {
    it(`${plik}: siódma kolumna to „Data pomiaru", a każdy wiersz ma datę`, async () => {
      const a = await arkusz(plik);
      expect(a.komorka('A1')).toBe('Lp.');
      expect(a.komorka('D1')).toBe('Data urodzenia');
      expect(a.komorka('F1')).toBe('wzrost (cm)');
      expect(a.komorka('G1'), 'nagłówek kolumny daty pomiaru').toBe('Data pomiaru');
      for (const w of [2, 3, 4, 5, 6]) {
        const d = a.komorka(`G${w}`);
        expect(d, `wiersz ${w}: data pomiaru`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // Data pomiaru musi być PÓŹNIEJSZA niż urodzenia, inaczej moduł ją zignoruje.
        expect(Date.parse(d)).toBeGreaterThan(Date.parse(a.komorka(`D${w}`)));
      }
      expect(a.sheet, 'zakres arkusza obejmuje kolumnę G').toContain('A1:G6');
    });
  }

  it('DocPro mówi o kolumnie i nadal linkuje do obu szablonów', () => {
    const html = zrodlo('docpro.html');
    expect(html).toContain('Możesz dodać kolumnę „Data pomiaru”');
    expect(html, 'instrukcja nazywa zachowanie bez kolumny').toContain('a bez niej na dziś');
    expect(html).toContain('href="zscore_przyklad_palczewska.xlsx" download');
    expect(html).toContain('href="zscore_przyklad_olaf.xlsx" download');
  });

  it('moduł wsadu: rozpoznaje nagłówki, nie myli ich z datą urodzenia, liczy wiek na datę pomiaru i oddaje użyty wiek', () => {
    const src = zrodlo('vilda_professional_module.js');
    expect(src).toContain('dpK=ue(M[0],U,["data pomiaru","datapomiaru","data badania","data wizyty","pomiaru"])');
    // Kolumna daty urodzenia szukana z POMINIĘCIEM kolumny pomiaru — generyczne „data" jej nie porwie.
    expect(src).toContain('xe=ue(M[0],U.filter(cK=>cK!==dpK),["data urodzenia","dataurodzenia","urodzenia","data"])');
    expect(src).toContain('dpOk=!!(dpD&&dpD.getTime()>p.getTime()),re=((dpOk?dpD:new Date()).getTime()-p.getTime())/(365.25*24*3600*1e3)');
    expect(src, 'wynik niesie wiek użyty do centyli').toContain('h.Wiek_lata=Math.round(re*100)/100');
    expect(src, 'data pomiaru wraca w wyniku jako tekst, jak data urodzenia').toContain('h[dpK]="\'"+dt');
    expect(src).toContain('Kolumna \\u201Edata pomiaru\\u201D jest opcjonalna');
  });
});

describe('Jeden zapis SDS: „hSDS", „wSDS", „bmiSDS"', () => {
  it('karta główna (vilda_update_prep.js): masa „wSDS −0,25", wzrost „hSDS −1,23", BMI „bmiSDS +1,20" i „kg/m²"', () => {
    const src = zrodlo('vilda_update_prep.js');
    const kod = `
      function formatCentile(p){return p<1?'&lt;1':p>99?'&gt;99':String(Math.round(p))}
      function centylWord(c){return c.includes('&lt;')||c.includes('&gt;')?'centyla':'centyl'}
      ${funkcja(src, 'vildaUpdatePrepResolveCentileSeverity')}
      ${funkcja(src, 'vildaUpdatePrepResolveProClass')}
      ${funkcja(src, 'vildaUpdatePrepFmtSds')}
      ${funkcja(src, 'vildaUpdatePrepBuildWeightCentileLine')}
      ${funkcja(src, 'vildaUpdatePrepBuildHeightCentileLine')}
      ${funkcja(src, 'vildaUpdatePrepBuildBmiLine')}
      return { waga: vildaUpdatePrepBuildWeightCentileLine, wzrost: vildaUpdatePrepBuildHeightCentileLine, bmi: vildaUpdatePrepBuildBmiLine };`;
    const f = new Function('window', kod)({});
    const waga = f.waga({ statsW: { percentile: 40, sd: -0.25 }, professionalModeActive: true, weight: 28 });
    expect(waga).toContain('40 centyl');
    expect(waga, 'masa jak wzrost: nazwa miary, znak i przecinek').toContain('(wSDS −0,25)');
    expect(waga).not.toContain('Z‑score');
    expect(f.wzrost({ statsH: { percentile: 11, sd: -1.23 }, professionalModeActive: true, height: 123.8 })).toContain('(hSDS −1,23)');
    const bmi = f.bmi({ bmiReady: true, bmiText: '17,3', bmi: 17.3, bmiPercentile: 89, bmiZVal: 1.2, proActive: true, age: 9, bmiCat: 'Prawidłowe' });
    expect(bmi, 'decyzja 10: jednostka także na karcie głównej').toContain('17,3</span> kg/m²');
    expect(bmi).toContain('(bmiSDS +1,20)');
    expect(bmi).not.toContain('Z‑score');
    // Poza trybem PRO karta nie pokazuje SDS — bez zmian.
    expect(f.waga({ statsW: { percentile: 40, sd: -0.25 }, professionalModeActive: false, weight: 28 })).not.toContain('wSDS');
  });

  it('epikryza: „masa ciała 28 kg (40. centyl, wSDS −0,25)" obok „wzrost … (hSDS …)" i „BMI … (bmiSDS …)"', () => {
    const requireCjs = createRequire(import.meta.url);
    const epicrisis = requireCjs(path.join(korzen, 'vilda_epicrisis.js'));
    const t = epicrisis.generate({
      sex: 'M', ageYears: 9, ageMonths: 0, height: 123.8, heightPercentile: 11, heightSds: -1.23,
      weight: 28, weightPercentile: 40, weightSds: -0.25, bmi: 18.3, bmiPercentile: 71, bmiSds: 0.54,
    }, {}).text;
    expect(t).toContain('masa ciała 28 kg (40. centyl, wSDS −0,25)');
    expect(t).toContain('wzrost 123,8 cm (11. centyl, hSDS −1,23)');
    expect(t).toContain('BMI 18,3 kg/m² (71. centyl, bmiSDS +0,54)');
    // Gdy masa jest poniżej 3. centyla, zdanie mówi o niedoborze w kg — i dokłada wSDS.
    const niska = epicrisis.generate({ sex: 'M', ageYears: 9, ageMonths: 0, weight: 18, weightDeficitTo3rd: 2.4, weightSds: -2.6 }, {}).text;
    expect(niska).toContain('2,4 kg poniżej 3. centyla, wSDS −2,60');
  });

  it('schowek Karty pacjenta i karta „Podsumowanie wyników" liczą masę tym samym formaterem', () => {
    expect(zrodlo('vilda_patient_summary_copy.js')).toContain('(k+=" (wSDS "+Sd(s.sd)+")")');
    expect(zrodlo('vilda_summary_cards.js')).toContain('(r+=` (wSDS ${qFmtSds(g.sd)})`)');
    for (const f of ['vilda_patient_summary_copy.js', 'vilda_summary_cards.js']) {
      expect(zrodlo(f), `${f}: koniec „Z‑score" przy masie`).not.toMatch(/Waga[^`"]{0,80}Z\\u2011score/);
    }
  });

  it('opis pacjenta (vilda_patient_narrative.js): „waży 22,5 kg (25.–50. c., wSDS −0,20)"', () => {
    const src = zrodlo('vilda_patient_narrative.js');
    expect(src).toContain("if (wt.last.sd != null) w3.push('wSDS ' + fmtSds(wt.last.sd));");
    expect(src).toContain("czesci.push('waży ' + fmt(wt.last.value, 1) + ' kg' + (w3.length ? ' (' + w3.join(', ') + ')' : ''));");
  });

  it('pozostałe miary zostają przy „Z-score" — zmiana dotyczy wyłącznie masy (i BMI z decyzji 10)', () => {
    const app = zrodlo('app.js');
    const kod = `
      function advHistoryFormatNumber(v,n){return Number(v).toFixed(n).replace('.',',')}
      ${funkcja(app, 'advHistorySdsLabel')}
      return advHistorySdsLabel;`;
    // Zapis liczby bierze formater silnika (minus typograficzny, plus przy dodatnich) —
    // na każdej stronie z app.js oba silniki stoją przed nim (strażniki P-SDS-5 i P-BMI-5).
    const okno = {};
    new Function('window', 'globalThis', zrodlo('vilda_sds_wzrostu.js'))(okno, okno);
    new Function('window', 'globalThis', zrodlo('vilda_bmi.js'))(okno, okno);
    const etykieta = new Function('window', kod)(okno);
    expect(etykieta('Waga', -0.25)).toBe('wSDS −0,25');
    expect(etykieta('Wzrost', -0.12)).toBe('hSDS −0,12');
    expect(etykieta('BMI', 1.2)).toBe('bmiSDS +1,20');
    expect(etykieta('Obwód głowy', -0.25)).toBe('Z-score: -0,25');
    expect(etykieta('Wskaźnik Cole’a', 0.4)).toBe('Z-score: 0,40');
    // Bez silników zostaje sama nazwa miary i zapis awaryjny — nazwa nie wraca do „Z-score".
    const bez = new Function('window', kod)({});
    expect(bez('Waga', -0.25)).toBe('wSDS -0,25');
  });
});
