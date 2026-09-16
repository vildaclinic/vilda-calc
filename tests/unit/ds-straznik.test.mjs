import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appSrc, dsNaMiesiace, funkcjaZ, korzen, oknoZSilnikiem, zrodlo } from '../support/silnik-bmi.mjs';

// P-DS etap 1 — STRAŻNIK: zespół Downa to CECHA PACJENTA (pole w rekordzie), nie stan interfejsu,
// a siatki DS (Zemel 2015) liczy ten sam silnik, co wszystkie pozostałe. Do 1.0.966 jedyną flagą DS
// był rozwinięty `#downSyndromeCard`, a klasę BMI składał sobie sam moduł diety — z własnym
// czytnikiem wiersza LMS i własnymi progami 85/97/99. Ten plik pilnuje, żeby to nie wróciło:
// parytet z dotychczasową drogą (wyrocznia), brak łańcucha zastępczego przy DS (decyzja D2),
// granica dorosłości 20 lat przy DS (decyzja D3) i pierwszeństwo rekordu nad kartą (decyzja D1).
// Dane pacjentów FIKCYJNE.

const dietaSrc = zrodlo('vilda_diet_plan_ui.js');
const dsSrc = zrodlo('vilda_down_syndrome.js');
const kartaSrc = zrodlo('vilda_auth_ui.js');

/* Wyrocznia: dotychczasowa droga DS z vilda_down_syndrome.js, wycięta ze źródła i uruchomiona
   bez DOM. Po etapie 2 moduł zacznie wołać silnik — wtedy ta wyrocznia zniknie razem z własnym Φ. */
function staraDroga(win) {
  const kod = ['__ds_interpYears', '__ds_interpMonths', '__ds_getLMS', '__ds_zFromLMS', '__ds_phi', '__ds_cdf', '__ds_zFor', '__ds_percentile']
    .map((n) => funkcjaZ(dsSrc, n)).join('\n');
  return new Function('window', `${kod}\nreturn { zFor: __ds_zFor, pct: __ds_percentile };`)(win);
}

function resolver() {
  const win = { document: null, addEventListener() {} };
  win.window = win;
  new Function('window', 'globalThis', zrodlo('vilda_ds_source.js'))(win, win);
  return win.VildaDsSource;
}

describe('Strażnik P-DS: siatka DS w silniku, rozpoznanie w rekordzie', () => {
  it('parytet z dotychczasową drogą: BMI-SDS co do liczby, centyl co do 1e-5 punktu (różni się tylko Φ, do usunięcia w etapie 2)', () => {
    const win = oknoZSilnikiem();
    const stary = staraDroga(win);
    let maxZ = 0, maxP = 0, n = 0;
    for (const plec of ['M', 'F']) for (let mies = 24; mies <= 240; mies += 3) for (const bmi of [13, 16.5, 19, 22.4, 27, 33]) {
      const r = win.VildaBmi.policz({ bmi, plec, wiekMies: mies, zrodlo: 'OLAF', populacja: 'DS' });
      expect(r.siatka, `${plec} ${mies} mies.`).toBe('DS');
      maxZ = Math.max(maxZ, Math.abs(r.sds - stary.zFor(plec, mies / 12, 'BMI', bmi)));
      maxP = Math.max(maxP, Math.abs(r.centyl - stary.pct(plec, mies / 12, 'BMI', bmi)));
      n += 1;
    }
    expect(n).toBeGreaterThan(800);
    expect(maxZ, 'BMI-SDS na siatce DS musi być IDENTYCZNY z dotychczasowym').toBeLessThan(1e-10);
    expect(maxP, 'centyl: różnica wyłącznie z dwóch przybliżeń dystrybuanty').toBeLessThan(1e-5);
  });

  it('decyzja D2: przy DS nie ma łańcucha zastępczego — poza 2–20 lat wynik jest pusty z powodem, nigdy OLAF/WHO', () => {
    const win = oknoZSilnikiem(), T = win.VildaBmi;
    expect(T.kandydaci('OLAF', 120, 'DS')).toEqual(['DS']);
    expect(T.kandydaci('WHO', 30, 'DS')).toEqual(['DS']);
    expect(T.kandydaci('OLAF', 120)).toContain('OLAF');
    for (const [mies, fragment] of [[23, 'od 2 lat'], [241, '20 latach'], [12, 'od 2 lat']]) {
      const r = T.policz({ bmi: 20, plec: 'M', wiekMies: mies, zrodlo: 'OLAF', populacja: 'DS' });
      expect(r.siatka, `${mies} mies. nie może zejść na siatkę populacyjną`).toBeNull();
      expect(r.sds).toBeNull();
      expect(r.powod, `${mies} mies.`).toContain(fragment);
    }
    for (const mies of [24, 240]) {
      expect(T.policz({ bmi: 20, plec: 'M', wiekMies: mies, zrodlo: 'OLAF', populacja: 'DS' }).siatka).toBe('DS');
    }
    // mediana, cel P85 i Cole też nie schodzą na siatkę populacyjną
    expect(T.mediana('M', 120, 'OLAF', 'DS').siatka).toBe('DS');
    expect(T.mediana('M', 12, 'OLAF', 'DS'), 'poniżej 2 lat brak mediany DS').toBeNull();
    expect(T.celNormy({ wiekMies: 120, wzrostCm: 130, plec: 'M', zrodlo: 'OLAF', populacja: 'DS' }).siatka).toBe('DS');
    expect(T.cole({ bmi: 20, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: 'DS' }).siatka).toBe('DS');
    // siatka DS różni się od populacyjnej — gdyby ktoś po cichu wrócił do OLAF, to by się nie zgadzało
    const ds = T.policz({ bmi: 20, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: 'DS' });
    const og = T.policz({ bmi: 20, plec: 'M', wiekMies: 120, zrodlo: 'OLAF' });
    expect(og.siatka).toBe('OLAF');
    expect(Math.abs(ds.sds - og.sds)).toBeGreaterThan(0.2);
  });

  it('decyzja D3: przy DS granica dorosłości to 20 lat — 19-latek ma kategorię dziecka z siatki DS, bez DS jest dorosły', () => {
    const win = oknoZSilnikiem(), T = win.VildaBmi;
    expect(T.dorosly(228, 'DS')).toBe(false);
    expect(T.dorosly(240, 'DS')).toBe(true);
    expect(T.dorosly(228)).toBe(true);
    const ds = T.ocen({ bmi: 26, plec: 'M', wiekMies: 228, zrodlo: 'OLAF', populacja: 'DS' });
    expect(ds.siatka).toBe('DS');
    expect(ds.kategoria.dorosly).toBe(false);
    expect(T.ocen({ bmi: 26, plec: 'M', wiekMies: 228, zrodlo: 'OLAF' }).kategoria.dorosly).toBe(true);
    // cel leczenia: przy DS 85. centyl z siatki DS, bez DS próg dorosłego 24,9
    expect(T.celNormy({ wiekMies: 228, wzrostCm: 160, plec: 'M', zrodlo: 'OLAF', populacja: 'DS' }).rodzaj).toBe('dziecko-P85');
    expect(T.celNormy({ wiekMies: 228, wzrostCm: 160, plec: 'M', zrodlo: 'OLAF' }).rodzaj).toBe('dorosly-24.9');
  });

  it('decyzja D1: rekord wygrywa z kartą, brak pola znaczy brak DS, karta działa tylko bez wczytanego pacjenta', () => {
    const S = resolver();
    expect(S.zRekordu({ clinical: { downSyndrome: true } })).toBe(true);
    expect(S.zRekordu({ clinical: { downSyndrome: 'tak' } }), 'tylko jawne true').toBe(false);
    expect(S.zRekordu({ clinical: {} })).toBe(false);
    expect(S.zRekordu({}), 'stary rekord bez sekcji clinical').toBe(false);
    expect(S.zRekordu(null)).toBe(false);
    // rozwinięta karta nie dodaje DS pacjentowi, który go w rekordzie nie ma
    expect(S.wybierz({ maRekord: true, rekord: false, karta: true })).toBe(false);
    expect(S.wybierz({ maRekord: true, rekord: true, karta: false })).toBe(true);
    // bez wczytanego pacjenta zostaje użycie doraźne
    expect(S.wybierz({ maRekord: false, karta: true })).toBe(true);
    expect(S.wybierz({ maRekord: false, karta: false })).toBe(false);
    expect(S.populacjaZFlagi(true)).toBe('DS');
    expect(S.populacjaZFlagi(false)).toBe('OGOLNA');
    // pamięć rekordu: wczytanie i kasowanie stanu
    S.zapamietaj({ clinical: { downSyndrome: true } });
    expect(S.maFlage()).toBe(true);
    S.zapamietaj({ user: { sex: 'M' } });
    expect(S.maFlage(), 'inny pacjent bez DS').toBe(false);
    S.zapomnij();
    expect(S.maFlage(), 'po wylogowaniu zostaje sam stan karty (tu: brak DOM)').toBe(false);
  });

  it('moduł diety nie ma już własnej flagi DS, własnego czytnika LMS ani własnych progów — pyta silnik o populację', () => {
    for (const odcisk of ['dietDsFlag', 'dietDsBmiClass', '__ds_getLMS', 'downSyndromeCard']) {
      expect(dietaSrc, `vilda_diet_plan_ui.js: ${odcisk}`).not.toContain(odcisk);
    }
    expect(dietaSrc).not.toMatch(/overweight:p>=85|obese:p>=97|severe:p>=99/);
    expect(dietaSrc).toContain('function dietPopulacja()');
    expect(dietaSrc).toContain('populacja:pop');
    expect(dietaSrc).toContain('dietBmiZrodlo(),dietPopulacja()');
  });

  it('klasa BMI z modułu diety przy DS to dokładnie wynik silnika (jedna droga, nie dwie)', () => {
    const win = oknoZSilnikiem();
    const T = win.VildaBmi;
    win.VildaDsSource = { populacja: () => 'DS' };
    win.document = { getElementById: () => null };
    for (const k of ['KCAL_PER_KG', 'CHILD_AGE_MIN']) if (!(k in globalThis)) globalThis[k] = k === 'KCAL_PER_KG' ? 7700 : 0.25;
    new Function('window', 'globalThis', dietaSrc)(win, win);
    const pacjent = { sex: 'M', ageYears: 8, weightKg: 30, heightCm: 120 };
    const h2 = 1.2 ** 2, bmi = 30 / h2;
    const c = win.energyChildBmiClass(pacjent);
    const r = T.ocen({ bmi, plec: 'M', wiekMies: 96, zrodlo: 'OLAF', populacja: 'DS' });
    const cel = T.celNormy({ wiekMies: 96, wzrostCm: 120, plec: 'M', zrodlo: 'OLAF', populacja: 'DS' });
    expect(c.source).toBe('DS');
    expect(c.z).toBeCloseTo(r.sds, 12);
    expect(c.percentile).toBeCloseTo(r.centyl, 12);
    expect(c.medianBmi).toBeCloseTo(r.mediana, 12);
    expect(c.neededWeightKg).toBeCloseTo(r.mediana * h2, 12);
    expect(c.targetBmi).toBeCloseTo(cel.bmiCel, 12);
    expect(c.overweight).toBe(r.centyl >= 85);
    expect(c.obese).toBe(r.centyl >= 97);
    expect(c.severe).toBe(r.centyl >= 99);
    // ten sam pacjent bez DS — inna siatka, inne liczby
    win.VildaDsSource = { populacja: () => 'OGOLNA' };
    const og = win.energyChildBmiClass(pacjent);
    expect(og.source).toBe('OLAF');
    expect(Math.abs(og.z - c.z), 'siatka DS naprawdę daje inną liczbę niż populacyjna').toBeGreaterThan(0.2);
    expect(c.overweight).toBe(true);
    expect(c.obese).toBe(false);
    // poniżej 2 lat przy DS nie ma klasy BMI (zostaje WFL DS poza tym modułem)
    win.VildaDsSource = { populacja: () => 'DS' };
    expect(win.energyChildBmiClass({ sex: 'M', ageYears: 1.5, ageMonthsOpt: 18, weightKg: 11, heightCm: 80 })).toBeNull();
  });

  it('rekord pacjenta niesie rozpoznanie: Karta Pacjenta buduje i czyta sekcję `clinical`, a brak sekcji nie tworzy pustej', () => {
    expect(kartaSrc).toContain('c.clinical&&typeof c.clinical=="object"?c.clinical:{}');
    expect(kartaSrc).toContain('Ds0.checked?Dsc.downSyndrome=!0:delete Dsc.downSyndrome');
    expect(kartaSrc).toContain('Object.keys(Dsc).length?At.clinical=Dsc:"clinical"in At&&delete At.clinical');
    expect(kartaSrc).toContain('vePatientDownSyndrome');
  });

  it('wpięcie: tablice DS idą do silnika z app.js w miesiącach, resolver jest na stronach, w precache i w mapie zależności', () => {
    expect(appSrc).toContain('function vildaBmiDsMiesiace(');
    expect(appSrc).toContain('LMS_BMI_DS_BOYS:vildaBmiDsMiesiace(window.DS&&window.DS.DS_CHILD_BMI_BOYS)');
    expect(appSrc).toContain('LMS_BMI_DS_GIRLS:vildaBmiDsMiesiace(window.DS&&window.DS.DS_CHILD_BMI_GIRLS)');
    for (const strona of ['index.html', 'docpro.html', 'kalkulator-klirens.html']) {
      const html = zrodlo(strona);
      expect(html, `${strona}: resolver flagi DS`).toContain('vilda_ds_source.js?v=');
      const iDs = html.indexOf('ds_lms.js?v='), iApp = html.indexOf('app.js?v=');
      expect(iDs, `${strona}: tablice DS obecne`).toBeGreaterThan(-1);
      expect(iDs, `${strona}: tablice DS przed app.js`).toBeLessThan(iApp);
    }
    expect(zrodlo('service-worker-kalorii.js')).toMatch(/'\/vilda_ds_source\.js\?v=\d+'/);
    expect(zrodlo('vilda_deps.js')).toContain('VildaDsSource:');
    // przeliczenie kluczy: lata → miesiące, bez gubienia wiersza
    const win = oknoZSilnikiem();
    const wMiesiacach = dsNaMiesiace(win.DS.DS_CHILD_BMI_BOYS);
    expect(Object.keys(wMiesiacach).length, 'żaden wiersz nie ginie przy przeliczeniu').toBe(Object.keys(win.DS.DS_CHILD_BMI_BOYS).length);
    expect(wMiesiacach['120']).toEqual(win.DS.DS_CHILD_BMI_BOYS['10']);
    expect(wMiesiacach['30']).toEqual(win.DS.DS_CHILD_BMI_BOYS['2.5']);
    expect(dsNaMiesiace(null), 'brak ds_lms.js na stronie → brak siatki, nie pusty obiekt').toBeNull();
    // wiersz z silnika to dokładnie wiersz z tablicy (bez interpolacji na węźle)
    expect(win.VildaBmi.lms('M', 120, 'DS')).toEqual(win.DS.DS_CHILD_BMI_BOYS['10']);
    expect(win.VildaBmi.lms('F', 30, 'DS')).toEqual(win.DS.DS_CHILD_BMI_GIRLS['2.5']);
  });

  it('cytowanie (decyzja 11): silnik nazywa źródło siatek DS z PMID i DOI', () => {
    const s = zrodlo('vilda_bmi.js');
    expect(s).toContain('PMID 26504127');
    expect(s).toContain('10.1542/peds.2015-1652');
    expect(s).toContain('Zemel BS, Pipan M, Stallings VA');
    const alg = fs.readFileSync(path.join(korzen, 'docs/clinical/ALGORITHMS.md'), 'utf8');
    expect(alg).toContain('GROWTH-LMS-DS');
    expect(alg).toContain('10.1542/peds.2015-1652');
  });
});
