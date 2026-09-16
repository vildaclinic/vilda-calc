import { describe, expect, it } from 'vitest';
import { funkcjaZ, oknoZSilnikiem, zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';


// P-BMI etap 3 — Karta pacjenta (kafelki, dymek siatki, panel otyłości), monitor otyłości DocPro
// i kryteria odpowiedzi na leczenie liczą BMI jednym silnikiem (vilda_bmi.js). Panel Karty (Mn)
// i monitor DocPro (ut) szły dotąd dwiema drogami (bez łańcucha zastępczego vs z nim — Karta dla
// OLAF < 3 lat pusta); „bmiZscorePct" (względna zmiana SDS w %) ustępuje bezwzględnej ΔbmiSDS
// (decyzja 9). Silnik dostaje PRAWDZIWE tablice. Dane FIKCYJNE.


describe('Panel otyłości Karty (Mn) i monitor DocPro (ut) — jedna droga do BMI-SDS punktu', () => {
  const karta = zrodlo('vilda_auth_ui.js');
  const monitor = zrodlo('obesity_therapy_monitor.js');
  function funkcje(win) {
    const Mn = new Function('i', 'window', `${funkcjaZ(karta, 'Mn')}return Mn;`)(win, win);
    const ut = new Function('window', 'ot', 'advHistoryGetPreferredSource', `${funkcjaZ(monitor, 'ut')}return ut;`)(win, () => 'M', () => 'OLAF');
    return { Mn, ut };
  }
  it('dwulatek przy OLAF: Karta i monitor dają TĘ SAMĄ liczbę z Palczewskiej (dotąd Karta była pusta, monitor szedł łańcuchem)', () => {
    const win = oknoZSilnikiem();
    const { Mn, ut } = funkcje(win);
    const bmi = 13.6 / Math.pow(0.894, 2);
    const oczek = win.VildaBmi.policz({ bmi, plec: 'M', wiekMies: 24, zrodlo: 'OLAF' });
    expect(oczek.siatka).toBe('PALCZEWSKA');
    expect(Mn(bmi, 'M', 2, 'OLAF')).toBeCloseTo(oczek.sds, 9);
    expect(ut(bmi, 2)).toBeCloseTo(oczek.sds, 9);
  });
  it('13-latek przy OLAF: obie drogi = silnik; od 18 lat obie milczą (null)', () => {
    const win = oknoZSilnikiem();
    const { Mn, ut } = funkcje(win);
    const bmi = 92 / Math.pow(1.65, 2);
    const oczek = win.VildaBmi.policz({ bmi, plec: 'M', wiekMies: 13.25 * 12, zrodlo: 'OLAF' });
    expect(oczek.siatka).toBe('OLAF');
    expect(Mn(bmi, 'M', 13.25, 'OLAF')).toBeCloseTo(oczek.sds, 9);
    expect(ut(bmi, 13.25)).toBeCloseTo(oczek.sds, 9);
    expect(Mn(bmi, 'M', 18, 'OLAF')).toBeNull();
    expect(ut(bmi, 18)).toBeNull();
  });
});

describe('Kryteria odpowiedzi (obesity_response_criteria.js) — ramię z-score jako bezwzględna ΔbmiSDS (decyzja 9)', () => {
  function kryteria() {
    const win = {};
    loadBrowserScript('obesity_response_criteria.js', win);
    return win.ObesityResponseCriteria;
  }
  const saxenda = (K) => K.getCriterion('Saxenda', 'liraglutide', 13);
  it('BMI −5 % po 12 tyg.: pass przez bmiPct (ramię BMI bez zmian)', () => {
    const K = kryteria();
    const r = K.evaluate(saxenda(K), { weeks: 12, bmiPct: -5, bmiSdsDelta: -0.3 });
    expect(r.status).toBe('pass');
    expect(r.metVia).toBe('bmiPct');
    expect(r.achievedSdsDelta).toBeCloseTo(-0.3, 9);
  });
  it('BMI −2 %, bmiSDS spada o 0,3: „clinical-zscore" — nie automatyczny pass ani stop (ChPL bez progu bezwzględnego)', () => {
    const K = kryteria();
    const r = K.evaluate(saxenda(K), { weeks: 12, bmiPct: -2, bmiSdsDelta: -0.3 });
    expect(r.status).toBe('clinical-zscore');
    expect(r.metVia).toBe('bmiSdsDelta');
    expect(r.achievedSdsDelta).toBeCloseTo(-0.3, 9);
    expect(r.achievedPct).toBe(-2);
  });
  it('BMI −2 %, bmiSDS rośnie: fail-stop; sam ΔbmiSDS bez BMI: clinical-zscore; stare bmiZscorePct nie daje już „pass"', () => {
    const K = kryteria();
    expect(K.evaluate(saxenda(K), { weeks: 12, bmiPct: -2, bmiSdsDelta: 0.1 }).status).toBe('fail-stop');
    expect(K.evaluate(saxenda(K), { weeks: 12, bmiSdsDelta: -0.05 }).status).toBe('clinical-zscore');
    // spadek z +0,20 do +0,10 to było „−50 %" i automatyczny pass — nieinterpretowalne przy SDS bliskim 0
    const stare = K.evaluate(saxenda(K), { weeks: 12, bmiPct: -2, bmiZscorePct: -50 });
    expect(stare.status).toBe('fail-stop');
    expect(K.evaluate(saxenda(K), { weeks: 12 }).status).toBe('insufficient-data');
    expect(K.evaluate(saxenda(K), { weeks: 4, bmiPct: -2 }).status).toBe('before-window');
  });
  it('Wegovy 12–17 (samo bmiPct) i dorośli (masa) bez zmian', () => {
    const K = kryteria();
    expect(K.evaluate(K.getCriterion('Wegovy', 'semaglutide', 14), { weeks: 12, bmiPct: -5 }).status).toBe('pass');
    expect(K.evaluate(K.getCriterion('Saxenda', 'liraglutide', 30), { weeks: 12, massPct: -3 }).status).toBe('fail-stop');
  });
});

describe('Kafelki, dymek siatki i oś czasu Karty — strażnicy źródła i kolor z kategorii silnika', () => {
  const karta = zrodlo('vilda_auth_ui.js');
  it('kafelek BMI: jeden ocen() (wiek pomiaru, źródło preferowane), kolor z kategorii, „kg/m²"; Cole z cole()', () => {
    expect(karta).toContain('Tb.ocen({bmi:$,plec:it,wiekMies:I,zrodlo:h})');
    expect(karta).toContain('Tb.cole({bmi:$,plec:it,wiekMies:I,zrodlo:h})');
    expect(karta).toContain('var Pe=Tb&&!tt?Bk:Y("bmi",$,yt)');
    expect(karta).toContain('At.push(xt("BMI",St($)+" kg/m\\xB2",Xt,Pe,zt))');
    expect(karta).toContain('var de=Tb&&!tt?Ck:Y("cole",f,null)');
  });
  it('panel otyłości: Mn z policz(); wiersz punktu „bmiSDS …", „BMI … kg/m²"; kryteria z bmiSdsDelta', () => {
    expect(karta).toContain('i.VildaBmi.policz({bmi:t,plec:a,wiekMies:n*12,zrodlo:o})');
    expect(karta).toContain('Y.push("bmiSDS "+be(q,"",2))');
    expect(karta).toContain('Y.push("BMI "+qt(dt,1)+" kg/m\\xB2")');
    expect(karta).toContain('var mt=x!=null&&k!=null&&!s?k-x:null,f=$.evaluate(it,{weeks:Q,massPct:N,bmiPct:H,bmiSdsDelta:mt})');
    expect(karta).not.toContain('bmiZscorePct');
    expect(karta).toContain('f.status==="clinical-zscore"');
  });
  it('dymek siatki i tryb porównania: BMI z silnika przed własnym wzorem LMS; toneCent BMI z kategorii', () => {
    expect(karta).toContain('i.VildaBmi.policz({bmi:val,plec:sc.sex,wiekMies:age,zrodlo:i.bmiSource})');
    expect(karta).toContain('var _b=i.VildaBmi.policz({bmi:_v,plec:_g,wiekMies:_a,zrodlo:_s||"OLAF"})');
    expect(karta).toContain('Tb.kategoriaDziecko(c,null,null).kolor');
    expect(karta, 'oś czasu sejfu z jednostką').toContain('T.fmtBmi(Number(v))+" kg/m\\xB2"');
  });
  it('toneCent("bmi"): z silnikiem 2 c → danger (alarm < 3 c), 4 c → warn, 50 → normal, 88 → warn, 98 → danger', () => {
    const win = oknoZSilnikiem();
    const toneCent = new Function('window', `${funkcjaZ(karta, 'toneCent')}return toneCent;`)(win);
    expect(toneCent('bmi', 2)).toBe('danger');
    expect(toneCent('bmi', 4)).toBe('warn');
    expect(toneCent('bmi', 50)).toBe('normal');
    expect(toneCent('bmi', 88)).toBe('warn');
    expect(toneCent('bmi', 98)).toBe('danger');
    const bez = new Function('window', `${funkcjaZ(karta, 'toneCent')}return toneCent;`)({});
    expect(bez('bmi', 4), 'P-BMI-5: bez silnika brak tonu (koniec zapasowych progów)').toBeNull();
    expect(toneCent('height', 2), 'wzrost bez zmian').toBe('danger');
  });
});
