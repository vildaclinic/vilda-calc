import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-RAPORT rata S (decyzje właściciela 2026-09-22): odniesienia kart „Raportu po wizycie” bez „To o 0,0 …”,
// tolerancje kart dziecka jako dane, kropka w nocie masy. Test woła PRAWDZIWE funkcje z vilda_patient_report.js
// (eksport na window) i prawdziwy silnik masy vilda_masa.js. Dane FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZRODLO = fs.readFileSync(path.join(korzen, 'vilda_patient_report.js'), 'utf8');
const MASA = fs.readFileSync(path.join(korzen, 'vilda_masa.js'), 'utf8');

function okno() {
  const w = {};
  const doc = { getElementById: () => null, querySelector: () => null, addEventListener() {}, documentElement: { classList: { add() {}, remove() {} } } };
  w.window = w; w.document = doc; w.globalThis = w;
  globalThis.ADULT_BMI = globalThis.ADULT_BMI || { UNDER: 18.5, OVER: 25, OBESE: 30 };
  new Function('window', 'document', 'globalThis', MASA)(w, doc, w);
  new Function('window', 'document', 'globalThis', ZRODLO)(w, doc, w);
  return w;
}
const w = okno();
const PRZECIETNE = 'Wynik mieści się w wartościach przeciętnych dla wieku.';
const PRZECIETNE_PLEC = 'Wynik mieści się w wartościach przeciętnych dla wieku i płci.';
const dziecko = (extra) => ({ friendlyLabel: 'Przeciętne BMI dla tego wieku', medianUnit: '', diffUnit: 'pkt', digits: 1, exactText: PRZECIETNE, nearText: PRZECIETNE, ...extra });

describe('P5: różnica „0,0” po zaokrągleniu nie jest odchyleniem', () => {
  it('BMI 17,13 vs 17,16 (raport właściciela): dotąd „To o 0,0 pkt poniżej tej wartości”', () => {
    const r = w.patientReportBuildMedianReference('BMI', 17.13, 17.16, dziecko({ nearTolerance: 0.2 }));
    expect(r).toMatchObject({ available: true, medianText: '17,2', diffText: PRZECIETNE, neutral: true });
    // bez żadnej tolerancji też — sama reguła „0,0”
    const bez = w.patientReportBuildMedianReference('BMI', 17.13, 17.16, { digits: 1, diffUnit: 'pkt' });
    expect(bez.diffText).toBe('To dokładnie tyle, ile wynosi wartość odniesienia.');
    expect(bez.diffText).not.toContain('0,0');
  });

  it('poza tolerancją bez zmian: kierunek i wartość', () => {
    expect(w.patientReportBuildMedianReference('BMI', 17.5, 17.16, dziecko({ nearTolerance: 0.2 }))).toMatchObject({ diffText: 'To o 0,3 pkt powyżej tej wartości.', neutral: false });
    expect(w.patientReportBuildMedianReference('BMI', 16.8, 17.16, dziecko({ nearTolerance: 0.2 }))).toMatchObject({ diffText: 'To o 0,4 pkt poniżej tej wartości.', neutral: false });
  });

  it('dorosły BMI 24,93 (stan „above-normal”): „BMI jest na górnej granicy zakresu.”; 18,47 — dolnej; 27 — bez zmian', () => {
    expect(w.patientReportAdultBmiRangeReference(24.93, { state: 'above-normal' })).toMatchObject({ diffText: 'BMI jest na górnej granicy zakresu.', neutral: true, medianText: '18,5–24,9' });
    expect(w.patientReportAdultBmiRangeReference(18.47, { state: 'underweight' })).toMatchObject({ diffText: 'BMI jest na dolnej granicy zakresu.', neutral: true });
    expect(w.patientReportAdultBmiRangeReference(27, { state: 'above-normal' })).toMatchObject({ diffText: 'To o 2,1 pkt powyżej górnej granicy.', neutral: false });
    expect(w.patientReportAdultBmiRangeReference(22, { state: 'normal' })).toMatchObject({ diffText: 'BMI mieści się w tym zakresie.', neutral: true });
  });
});

describe('P6: tolerancje kart dziecka jako dane', () => {
  it('tabela: BMI 0,2 pkt, Cole 1 pkt, wzrost 1 cm, masa 2 % odniesienia', () => {
    expect(ZRODLO).toContain('DZIECKO:Object.freeze({BMI:.2,COLE_PKT:1,HEIGHT_CM:1,WEIGHT_REL:.02})');
    expect(w.patientReportTolerancjaMasyDziecka(10)).toBeCloseTo(0.2, 6);
    expect(w.patientReportTolerancjaMasyDziecka(30)).toBeCloseTo(0.6, 6);
    expect(w.patientReportTolerancjaMasyDziecka(70)).toBeCloseTo(1.4, 6);
    expect(w.patientReportTolerancjaMasyDziecka(null)).toBeNull();
    expect(w.patientReportTolerancjaMasyDziecka(0)).toBeNull();
  });

  it('wzrost 73,8 vs 74,0 cm i 74,9 vs 74,0 → w tolerancji; 75,1 → „To o 1,1 cm powyżej”', () => {
    const o = { friendlyLabel: 'Przeciętny wzrost dla tego wieku', medianUnit: 'cm', diffUnit: 'cm', digits: 1, nearTolerance: 1, exactText: PRZECIETNE, nearText: PRZECIETNE };
    expect(w.patientReportBuildMedianReference('Wzrost', 73.8, 74, o)).toMatchObject({ medianText: '74,0 cm', diffText: PRZECIETNE, neutral: true });
    expect(w.patientReportBuildMedianReference('Wzrost', 74.9, 74, o)).toMatchObject({ diffText: PRZECIETNE, neutral: true });
    expect(w.patientReportBuildMedianReference('Wzrost', 75.1, 74, o)).toMatchObject({ diffText: 'To o 1,1 cm powyżej tej wartości.', neutral: false });
  });

  it('wskaźnik Cole’a 99,7 % (raport właściciela) → „…dla wieku i płci.”; 101,2 % → „To o 1,2 pkt powyżej”', () => {
    const o = { friendlyLabel: 'Wartość odniesienia', medianUnit: '%', diffUnit: 'pkt', digits: 1, nearTolerance: 1, exactText: PRZECIETNE_PLEC, nearText: PRZECIETNE_PLEC };
    expect(w.patientReportBuildMedianReference('Wskaźnik Cole’a', 99.7, 100, o)).toMatchObject({ medianText: '100,0 %', diffText: PRZECIETNE_PLEC, neutral: true });
    expect(w.patientReportBuildMedianReference('Wskaźnik Cole’a', 101.2, 100, o)).toMatchObject({ diffText: 'To o 1,2 pkt powyżej tej wartości.', neutral: false });
  });

  it('wpięcie w karty: masa, wzrost, BMI i Cole dziecka wołają odniesienie z tolerancją i jednym zdaniem', () => {
    expect(ZRODLO).toContain('nearTolerance:patientReportTolerancjaMasyDziecka(SH!=null?SH:S),exactText:PATIENT_REPORT_PRZECIETNE_WIEK,nearText:PATIENT_REPORT_PRZECIETNE_WIEK');
    expect(ZRODLO).toContain('diffUnit:"cm",digits:1,nearTolerance:PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.DZIECKO.HEIGHT_CM,exactText:PATIENT_REPORT_PRZECIETNE_WIEK');
    expect(ZRODLO).toContain('diffUnit:"pkt",digits:1,nearTolerance:PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.DZIECKO.BMI,exactText:PATIENT_REPORT_PRZECIETNE_WIEK');
    expect(ZRODLO).toContain('nearTolerance:PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.DZIECKO.COLE_PKT,exactText:PATIENT_REPORT_PRZECIETNE_WIEK_PLEC');
    // karty dorosłego bez zmian brzmienia
    expect(w.patientReportAdultMassReference(71.82, { state: 'normal', lowerWeight: 53.47, upperWeight: 71.96 }, { state: 'normal' }).diffText).toBe('To prawie dokładnie ta granica.');
  });
});

describe('P7: nota karty masy — kropka przed doklejonym zdaniem P-MASA-2', () => {
  it('„powyżej typowego zakresu” + rozjazd masa↔BMI → „powyżej typowego zakresu. Masa ciała i BMI oceniają co innego: …”', () => {
    const nota = w.patientReportMasaWobecBmi('powyżej typowego zakresu', false, 93, { kategoria: { klucz: 'prawidlowe' } });
    expect(nota).toMatch(/^powyżej typowego zakresu\. Masa ciała i BMI oceniają co innego: /);
    expect(nota).not.toContain('zakresu Masa');
  });
  it('bez rozjazdu nota bez zmian; dorosły bez zmian', () => {
    expect(w.patientReportMasaWobecBmi('w typowym zakresie dla wieku', false, 50, { kategoria: { klucz: 'prawidlowe' } })).toBe('w typowym zakresie dla wieku');
    expect(w.patientReportMasaWobecBmi('cokolwiek', true, 93, { kategoria: { klucz: 'prawidlowe' } })).toBe('cokolwiek');
  });
});
