import { describe, expect, it } from 'vitest';
import { bezKomentarzy, oknoZSilnikiem, zrodlo } from '../support/silnik-bmi.mjs';

// P-DS-18 (decyzja właściciela 2026-10-01, „Tylko BMI”): czy BMI pacjenta ocenia się progami dorosłego,
// decyduje JEDNO pytanie silnika — VildaBmi.doroslyWgPacjenta(wiekMies) z populacją z resolvera:
// populacja ogólna od 18 lat (216 mies.) jak dotąd, zespół Downa od 20 lat (240 mies., decyzja D3).
// Dotąd karta główna, podsumowanie, schowek i raport miały wiek 18 wpisany na sztywno, więc 18–19-latek
// z DS dostawał „Otyłość I stopnia wg BMI”, a „Droga do normy” i zalecenia — masę prawidłową z siatki DS.
// Zachowanie stron sprawdza tests/e2e/ds-bmi-18-19.spec.mjs. Dane FIKCYJNE.

function okno(populacja) {
  const win = oknoZSilnikiem();
  if (populacja) win.VildaPopulacjaPacjenta = () => populacja;
  return win;
}

describe('VildaBmi.doroslyWgPacjenta — populacja z resolvera', () => {
  it('populacja ogólna: dokładnie to samo, co dotąd (wiekMies >= 216), co miesiąc od 0 do 960 mies.', () => {
    const B = okno().VildaBmi;
    for (let m = 0; m <= 960; m += 0.5) expect(B.doroslyWgPacjenta(m), `${m} mies.`).toBe(m >= 216);
    expect(B.doroslyWgPacjenta(215.999)).toBe(false);
  });

  it('zespół Downa (resolver VildaPopulacjaPacjenta → DS): dziecko do 239,99 mies., dorosły od 240 mies.', () => {
    const B = okno('DS').VildaBmi;
    expect(B.doroslyWgPacjenta(216)).toBe(false);
    expect(B.doroslyWgPacjenta(222)).toBe(false);
    expect(B.doroslyWgPacjenta(239.9)).toBe(false);
    expect(B.doroslyWgPacjenta(240)).toBe(true);
    expect(B.dorosly(222, 'DS')).toBe(false);
  });

  it('wiek nieznany albo nieliczbowy → nie dorosły (jak dotychczasowe NaN >= 18)', () => {
    const B = okno().VildaBmi;
    for (const v of [NaN, undefined, null, '', 'abc']) expect(B.doroslyWgPacjenta(v)).toBe(false);
  });

  it('dziewczyna z DS 18;6, 150 cm, 68 kg: silnik daje masę prawidłową z siatki DS (ok. 56. centyla), a nie otyłość I stopnia', () => {
    const B = okno('DS').VildaBmi;
    const r = B.ocen({ bmi: 68 / 1.5 ** 2, plec: 'F', wiekMies: 222, zrodlo: 'OLAF' });
    expect(r.siatka).toBe('DS');
    expect(r.kategoria.klucz).toBe('prawidlowe');
    expect(r.kategoria.dorosly).toBe(false);
    expect(r.centyl).toBeGreaterThan(50);
    expect(r.centyl).toBeLessThan(60);
    const og = okno().VildaBmi.ocen({ bmi: 68 / 1.5 ** 2, plec: 'F', wiekMies: 222, zrodlo: 'OLAF' });
    expect(og.kategoria.klucz).toBe('otylosc-1');
  });
});

describe('Strażnik P-DS-18: ocena BMI bez wieku 18 wpisanego na sztywno', () => {
  const kod = (f) => bezKomentarzy(zrodlo(f));

  it('karta główna (vilda_update_prep.js): BMI dziecka / dorosłego z silnika; stare progi 18 przy BMI zniknęły', () => {
    const k = kod('vilda_update_prep.js');
    expect(k).toContain('B.doroslyWgPacjenta(Number(i)*12)');
    expect(k).toContain('function vildaUpdatePrepBmiDziecko(i){return i>=CHILD_AGE_MIN&&!vildaUpdatePrepBmiDorosly(i)}');
    expect(k).not.toContain('}else i>=18&&(a>=40?');
    expect(k).not.toContain('i=!(e.age>=18&&nadm)');
    expect(k).not.toContain('!(i>=VILDA_UPDATE_PREP_BMI_DOROSLY_LATA&&c<ADULT_BMI.OVER)');
    expect(k).not.toContain(':i>=18&&c>=24&&c<25?(');
  });

  it('app.js: sugestia WHR, „idealna masa”, ramka wyniku i flaga nadmiaru pytają silnik', () => {
    const k = kod('app.js');
    expect(k).toContain('if(vildaBmiDoroslyWiek(e))return n>=25;');
    expect(k).toContain('if(vildaBmiDoroslyWiek(g))b=h>=18.5&&h<25;');
    expect(k).toContain('if(vildaBmiDoroslyWiek(f))g=22*y*y');
    expect(k).toContain('if(vildaBmiDoroslyWiek(s.ageDec))u=d>=25;');
    expect(k).not.toMatch(/function bmiBoxClassForAdult\(e,t\)\{return t<18/);
  });

  it('podsumowanie, schowek i raport: ocena BMI dorosłego tylko gdy silnik tak mówi; masa, wzrost i ciśnienie bez zmian', () => {
    expect(kod('vilda_summary_cards.js')).toContain('sB=s&&vildaSummaryBmiDorosly(n)');
    expect(kod('vilda_patient_summary_copy.js')).toContain('BB=B&&GeBmi(i)');
    const r = kod('vilda_patient_report.js');
    expect(r).toContain('function patientReportBmiDoroslyWiek(e){return patientReportIsAdultAgeForCurrentMode(e)&&patientReportBmiDoroslyWgSilnika(e)}');
    expect(r).toContain('bmiDorosly:r&&patientReportBmiDoroslyWiek(e)');
    expect(r).toContain('oB=o&&patientReportBmiDoroslyWiek(e)');
    // nagłówek raportu (fakty) zostaje przy wieku 18, niezależnie od trybu PDF — dochodzi tylko populacja
    expect(r).toContain('dorosly=isFinite(wiek)&&wiek>=18,bmiDor=dorosly&&patientReportBmiDoroslyWgSilnika(wiek)');
  });
});
