import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appSrc, funkcjaZ, korzen, oknoZSilnikiem, zrodlo } from '../support/silnik-bmi.mjs';

// P-DS etapy 1–2 — STRAŻNIK: zespół Downa to CECHA PACJENTA (pole w rekordzie), nie stan interfejsu,
// a siatki DS (Zemel 2015) liczy ten sam silnik, co wszystkie pozostałe. Do 1.0.966 jedyną flagą DS
// był rozwinięty `#downSyndromeCard`, a klasę BMI składał sobie sam moduł diety — z własnym
// czytnikiem wiersza LMS i własnymi progami 85/97/99. Ten plik pilnuje, żeby to nie wróciło:
// brak łańcucha zastępczego przy DS (decyzja D2), granica dorosłości 20 lat przy DS (decyzja D3)
// i pierwszeństwo rekordu nad kartą (decyzja D1). Etap 2 dołożył: moduł DS bez własnego wzoru LMS
// i bez własnej dystrybuanty (do 1.0.967 miał obie — centyle DS różniły się na siódmym miejscu od
// wszystkich innych w aplikacji), wspólny czytnik wieku i odmowa liczenia bez silnika. Etap 3:
// JEDEN znormalizowany zestaw tablic (window.VildaDsLMS z ds_lms.js) i JEDEN interpolator
// (VildaBmi.interpoluj) — koniec dwóch własnych interpolatorów modułu i konwersji kluczy w app.js.
// Dane pacjentów FIKCYJNE.

const dietaSrc = zrodlo('vilda_diet_plan_ui.js');
const dsSrc = zrodlo('vilda_down_syndrome.js');
const kartaSrc = zrodlo('vilda_auth_ui.js');

/* Moduł DS załadowany do okna z silnikiem — po etapie 2 nie ma własnego wzoru ani własnego Φ,
   więc to już nie jest niezależna wyrocznia, tylko druga droga do TEJ SAMEJ liczby. */
function modulDs(win, { document: doc = { getElementById: () => null, addEventListener() {} } } = {}) {
  const g = win;
  g.document = doc;
  if (typeof g.vildaAppOnReady !== 'function') g.vildaAppOnReady = () => {};
  const kod = `${zrodlo('vilda_down_syndrome.js')}\n;window.__dsTest={zFor:__ds_zFor,pct:__ds_percentile,karta:__ds_buildResultsHTML,wiek:__ds_readAgeYears,silnik:__ds_silnik,getLMS:__ds_getLMS};`;
  new Function('window', 'globalThis', 'document', kod)(g, g, doc);
  return g.__dsTest;
}

/* Asercje o kodzie muszą najpierw odciąć komentarze: komentarz naprawy cytuje usuniętą nazwę
   (__ds_zFromLMS), więc test bez tego czytałby własną dokumentację i przechodził z niewłaściwego
   powodu. Ta sama pułapka, co przy U6 w „Ustawieniach". */
function bezKomentarzy(src) {
  let out = '', i = 0, stan = 'kod', cudzyslow = '';
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (stan === 'kod') {
      if (c === '/' && d === '*') { stan = 'blok'; i += 2; continue; }
      if (c === '/' && d === '/') { stan = 'linia'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { stan = 'tekst'; cudzyslow = c; }
      out += c; i += 1; continue;
    }
    if (stan === 'tekst') {
      if (c === '\\') { out += c + (d || ''); i += 2; continue; }
      if (c === cudzyslow) stan = 'kod';
      out += c; i += 1; continue;
    }
    if (stan === 'blok') { if (c === '*' && d === '/') { stan = 'kod'; i += 2; } else i += 1; continue; }
    if (c === '\n') { stan = 'kod'; out += c; }
    i += 1;
  }
  return out;
}

function resolver() {
  const win = { document: null, addEventListener() {} };
  win.window = win;
  new Function('window', 'globalThis', zrodlo('vilda_ds_source.js'))(win, win);
  return win.VildaDsSource;
}

describe('Strażnik P-DS: siatka DS w silniku, rozpoznanie w rekordzie', () => {
  it('etap 2: karta modułu DS i silnik dają DOKŁADNIE tę samą liczbę — jeden wzór, jedna dystrybuanta', () => {
    const win = oknoZSilnikiem();
    const modul = modulDs(win);
    let maxZ = 0, maxP = 0, n = 0;
    for (const plec of ['M', 'F']) for (let mies = 24; mies <= 240; mies += 3) for (const bmi of [13, 16.5, 19, 22.4, 27, 33]) {
      const r = win.VildaBmi.policz({ bmi, plec, wiekMies: mies, zrodlo: 'OLAF', populacja: 'DS' });
      expect(r.siatka, `${plec} ${mies} mies.`).toBe('DS');
      maxZ = Math.max(maxZ, Math.abs(r.sds - modul.zFor(plec, mies / 12, 'BMI', bmi)));
      maxP = Math.max(maxP, Math.abs(r.centyl - modul.pct(plec, mies / 12, 'BMI', bmi)));
      n += 1;
    }
    expect(n).toBeGreaterThan(800);
    // P-DS-3: zero BITOWO. Wzór, dystrybuanta, zestaw tablic i interpolator są już jedne, więc
    // nie ma gdzie powstać nawet szumowi zmiennoprzecinkowemu.
    expect(maxZ, 'BMI-SDS: silnik i moduł liczą tym samym wzorem na tym samym wierszu').toBe(0);
    expect(maxP, 'centyl: jedna dystrybuanta i jeden interpolator').toBe(0);
  });

  it('etapy 2–3: moduł DS nie ma własnego wzoru LMS, własnej dystrybuanty ani własnych interpolatorów (asercja po odcięciu komentarzy)', () => {
    const kod = bezKomentarzy(dsSrc);
    for (const odcisk of ['__ds_zFromLMS', '__ds_cdf', '__ds_phi', '0.31938153', '2.3263', 'Math.sqrt(2 * Math.PI)',
      '__ds_interpMonths', '__ds_interpYears', 'window.DS.DS_', 'Math.floor(e), s = Math.ceil(e)']) {
      expect(kod, `vilda_down_syndrome.js: ${odcisk}`).not.toContain(odcisk);
    }
    expect(kod, 'kontrola negatywna: komentarz naprawy nadal cytuje usuniętą nazwę').not.toBe(dsSrc);
    expect(dsSrc, 'komentarz naprawy zostaje w pliku').toContain('__ds_zFromLMS');
    expect(kod).toContain('function __ds_silnik()');
    expect(kod).toContain('T.zLms(value, lms)');
    expect(kod).toContain('T.centylZSds(z)');
    expect(kod, 'jeden interpolator — silnika').toContain('T.interpoluj(tab, wiekMies)');
    expect(kod, 'jeden zestaw tablic').toContain('window.VildaDsLMS');
  });

  it('etap 3: wiersz LMS modułu i wiersz silnika są BITOWO ten sam (jeden zestaw tablic, jeden interpolator)', () => {
    const win = oknoZSilnikiem();
    const modul = modulDs(win);
    let n = 0;
    for (const plec of ['M', 'F']) for (let mies = 24; mies <= 240; mies += 1) {
      const a = modul.getLMS(plec, mies / 12, 'BMI'), b = win.VildaBmi.lms(plec, mies, 'DS');
      expect(a, `${plec} ${mies}`).not.toBeNull();
      expect(a, `${plec} ${mies} mies.: wiersz modułu == wiersz silnika`).toEqual(b);
      n += 1;
    }
    expect(n).toBe(434);
    // reguła wieku bez zmian: poniżej 2 lat tabele niemowlęce, BMI dopiero od 2 lat
    expect(modul.getLMS('M', 1, 'BMI'), 'BMI DS dopiero od 2 lat').toBeNull();
    expect(modul.getLMS('M', 1, 'WT'), 'masa niemowlęca z tabel 0–36 mies.').toEqual(win.VildaDsLMS.NIEMOWLE.WT.M['12']);
    expect(modul.getLMS('M', 10, 'WT')).toEqual(win.VildaDsLMS.DZIECKO.WT.M['120']);
    // klamry brzegowe zostają: poza zakresem tabel bierzemy wiersz skrajny, nie null
    expect(modul.getLMS('M', 25, 'HT'), 'powyżej 20 lat — wiersz 20 lat').toEqual(win.VildaDsLMS.DZIECKO.HT.M['240']);
    // bez zestawu tablic nie ma wiersza
    expect(modulDs({ addEventListener() {}, window: null }).getLMS('M', 10, 'BMI')).toBeNull();
  });

  it('etap 2: bez silnika karta DS odmawia liczenia zamiast liczyć po swojemu', () => {
    const doc = { getElementById: () => null, addEventListener() {} };
    const bez = { vildaAppOnReady: () => {}, document: doc, addEventListener() {} };
    bez.window = bez;
    new Function('window', 'globalThis', zrodlo('ds_lms.js'))(bez, bez);
    const modul = modulDs(bez, { document: doc });
    expect(modul.silnik()).toBeNull();
    expect(modul.pct('M', 10, 'BMI', 20)).toBeNull();
    expect(modul.zFor('M', 10, 'BMI', 20)).toBeNaN();
    expect(modul.karta().html).toContain('wymagaj');
    expect(modul.karta().html).toContain('vilda_bmi.js');
  });

  it('etap 2 / decyzja 8: wiek karty DS liczy się z daty urodzenia ułamkowo, a bez niej z pól wieku', () => {
    const win = oknoZSilnikiem();
    const els = { age: { value: '7' }, ageMonths: { value: '6' } };
    const doc = { getElementById: (id) => els[id] || null, addEventListener() {} };
    const modul = modulDs(win, { document: doc });
    expect(modul.wiek(), 'bez daty urodzenia — pola wieku').toBeCloseTo(7.5, 12);
    win.VildaDobAge = { readExactAge: () => ({ totalMonths: 123, days: 3745, exactMonths: 123.07 }) };
    expect(modul.wiek(), 'z datą urodzenia — wiek ułamkowy, nie 7,5').toBeCloseTo(123.07 / 12, 12);
    win.VildaDobAge = { readExactAge: () => null };
    expect(modul.wiek(), 'pusta data urodzenia nie kasuje pól wieku').toBeCloseTo(7.5, 12);
    els.age.value = ''; els.ageMonths.value = '';
    expect(Number.isNaN(modul.wiek()), 'puste pola ≠ noworodek').toBe(true);
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

  it('decyzja D1 (zaostrzona w P-DS-4): rozpoznanie tylko z rekordu — stan interfejsu nigdy go nie zastępuje', () => {
    const S = resolver();
    expect(S.zRekordu({ clinical: { downSyndrome: true } })).toBe(true);
    expect(S.zRekordu({ clinical: { downSyndrome: 'tak' } }), 'tylko jawne true').toBe(false);
    expect(S.zRekordu({ clinical: {} })).toBe(false);
    expect(S.zRekordu({}), 'stary rekord bez sekcji clinical').toBe(false);
    expect(S.zRekordu(null)).toBe(false);
    // rozwinięta karta nie dodaje DS pacjentowi, który go w rekordzie nie ma…
    expect(S.wybierz({ maRekord: true, rekord: false, karta: true })).toBe(false);
    expect(S.wybierz({ maRekord: true, rekord: true, karta: false })).toBe(true);
    // …ani pacjentowi, którego w ogóle nie ma. Od P-DS-4 ta flaga przestawia siatki CAŁEJ strony,
    // więc rozwinięcie karty informacyjnej nie może po cichu przeklasyfikować wyników.
    expect(S.wybierz({ maRekord: false, karta: true }), 'stan karty nie jest rozpoznaniem').toBe(false);
    expect(S.wybierz({ maRekord: false, karta: false })).toBe(false);
    expect(S.zKarty, 'czytnik stanu karty usunięty razem z furtką').toBeUndefined();
    expect(zrodlo('vilda_ds_source.js'), 'moduł nie zagląda już do DOM po flagę').not.toContain("getElementById('downSyndromeCard')");
    expect(S.populacjaZFlagi(true)).toBe('DS');
    expect(S.populacjaZFlagi(false)).toBe('OGOLNA');
    // pamięć rekordu: wczytanie i kasowanie stanu
    S.zapamietaj({ clinical: { downSyndrome: true } });
    expect(S.maFlage()).toBe(true);
    S.zapamietaj({ user: { sex: 'M' } });
    expect(S.maFlage(), 'inny pacjent bez DS').toBe(false);
    S.zapomnij();
    expect(S.maFlage(), 'po wylogowaniu nie ma rozpoznania').toBe(false);
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

  it('wpięcie: tablice DS idą do silnika ze wspólnego zestawu, resolver jest na stronach, w precache i w mapie zależności', () => {
    expect(appSrc, 'P-DS-3: app.js nie przelicza już kluczy sam').not.toContain('function vildaBmiDsMiesiace(');
    expect(appSrc).toContain('function vildaBmiDsTablica(');
    expect(appSrc).toContain('LMS_BMI_DS_BOYS:vildaBmiDsTablica("M")');
    expect(appSrc).toContain('LMS_BMI_DS_GIRLS:vildaBmiDsTablica("F")');
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
    const L = win.VildaDsLMS;
    expect(L.wersja).toBe(1);
    // normalizacja: żaden wiersz nie ginie, a surowe tablice zostają nietknięte (na nich stoją kotwice)
    expect(Object.keys(L.DZIECKO.BMI.M).length).toBe(Object.keys(win.DS.DS_CHILD_BMI_BOYS).length);
    expect(L.DZIECKO.BMI.M['120']).toEqual(win.DS.DS_CHILD_BMI_BOYS['10']);
    expect(L.DZIECKO.BMI.F['30']).toEqual(win.DS.DS_CHILD_BMI_GIRLS['2.5']);
    expect(L.NIEMOWLE.WT.M['12'], 'tablice niemowlęce już były w miesiącach').toEqual(win.DS.DS_INFANT_WEIGHT_BOYS['12']);
    expect(L.WFL.M['70'], 'WFL zostaje przy kluczu długości w cm').toEqual(win.DS.DS_WFL_BOYS['70']);
    expect(win.DS.DS_CHILD_BMI_BOYS['10'], 'surowe tablice bez zmian').toBeTruthy();
    // wiersz z silnika to dokładnie wiersz z tablicy (bez interpolacji na węźle)
    expect(win.VildaBmi.lms('M', 120, 'DS')).toEqual(win.DS.DS_CHILD_BMI_BOYS['10']);
    expect(win.VildaBmi.lms('F', 30, 'DS')).toEqual(win.DS.DS_CHILD_BMI_GIRLS['2.5']);
  });

  it('etap 4: populacja jest ambientna — resolver aplikacji działa bez zmiany 27 wywołań, a jawna opcja go bije', () => {
    const win = oknoZSilnikiem(), T = win.VildaBmi;
    const bmi = 45 / 1.35 ** 2, p = { bmi, plec: 'M', wiekMies: 120, zrodlo: 'OLAF' };
    expect(T.policz(p).siatka, 'bez resolvera — populacja ogólna').toBe('OLAF');
    win.VildaPopulacjaPacjenta = () => 'DS';
    expect(T.policz(p).siatka, 'resolver przez dobrze znaną globalną').toBe('DS');
    expect(T.mediana('M', 120, 'OLAF').siatka).toBe('DS');
    expect(T.celNormy({ wiekMies: 120, wzrostCm: 135, plec: 'M', zrodlo: 'OLAF' }).siatka).toBe('DS');
    expect(T.cole(p).siatka).toBe('DS');
    expect(T.ocen({ bmi: 26, plec: 'M', wiekMies: 228, zrodlo: 'OLAF' }).kategoria.dorosly, 'decyzja D3 też przez resolver').toBe(false);
    // jawna opcja zawsze wygrywa — tak wypisuje się wsad XLSX
    expect(T.policz({ ...p, populacja: 'OGOLNA' }).siatka).toBe('OLAF');
    expect(T.mediana('M', 120, 'OLAF', 'OGOLNA').siatka).toBe('OLAF');
    // wstrzyknięcie przez ustawDane bije globalną (droga testów)
    T.ustawDane({ populacjaDomyslna: () => 'OGOLNA' });
    expect(T.policz(p).siatka).toBe('OLAF');
    // resolver, który rzuca, znaczy „populacja ogólna", a nie wywrócenie wyniku
    T.ustawDane({ populacjaDomyslna: () => { throw new Error('sejf zamkniety'); } });
    expect(T.policz(p).siatka).toBe('OLAF');
    T.ustawDane({ populacjaDomyslna: null });
    delete win.VildaPopulacjaPacjenta;
  });

  it('etap 4: vilda_ds_source.js wystawia resolver, a wsad XLSX jawnie się z niego wypisuje', () => {
    const S = resolver();
    expect(typeof S.populacja).toBe('function');
    expect(zrodlo('vilda_ds_source.js')).toContain('w.VildaPopulacjaPacjenta = populacja;');
    // wsad liczy dla wierszy arkusza, nie dla wczytanego pacjenta
    const wsad = zrodlo('vilda_professional_module.js');
    expect(wsad, 'wsad XLSX nie może iść za rozpoznaniem wczytanego pacjenta').toContain('zrodlo:zz,populacja:"OGOLNA"');
  });

  it('etap 4 (decyzja D4): każde wyjście z centylem BMI nazywa siatkę DS — jedno brzmienie noty', () => {
    const win = oknoZSilnikiem();
    expect(win.VildaBmi.NOTA_DS).toBe('wg siatki dla zespołu Downa (Zemel 2015)');
    const f = win.VildaBmi.formatuj(win.VildaBmi.ocen({ bmi: 45 / 1.35 ** 2, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: 'DS' }));
    expect(f.siatkaNota).toBe(win.VildaBmi.NOTA_DS);
    expect(win.VildaBmi.formatuj(win.VildaBmi.ocen({ bmi: 17, plec: 'M', wiekMies: 120, zrodlo: 'OLAF' })).siatkaNota).toBe('');
    // konsumenci: nota przy wyniku BMI, zawsze tym samym zdaniem
    // Pliki minifikowane trzymaja polskie znaki jako \uXXXX, wiec porownujemy fragmenty bez nich —
    // inaczej test przechodzilby albo nie w zaleznosci od zapisu, a nie od tresci.
    const NOTA_POCZ = 'wg siatki dla zespo', NOTA_KON = 'u Downa (Zemel 2015)';
    for (const [plik, odcisk, drukuje] of [
      ['vilda_update_prep.js', 'function vildaUpdatePrepNotaSiatki(', true],
      ['vilda_patient_summary_copy.js', 'Bo&&Bo.siatka==="DS"', true],
      ['vilda_summary_cards.js', 'Bsi==="DS"', true],
      // epikryza rozdziela role: UI tylko PRZEKAZUJE siatkę, zdanie składa vilda_epicrisis.js
      ['vilda_epicrisis_ui.js', 'bmiCategoryKey:Bk,bmiSiatka:Bsi', false],
      // P-DS-5: epikryza nazywa siatkę RAZ dla całego bloku antropometrii, nie przy samym BMI
      ['vilda_epicrisis.js', 'e.bmiSiatka==="DS"||e.populacjaDs===!0', true],
      ['vilda_patient_report.js', 'Bm&&Bm.siatka==="DS"', true],
    ]) {
      const src = zrodlo(plik);
      expect(src, `${plik}: rozpoznaje siatkę DS`).toContain(odcisk);
      if (!drukuje) continue;
      expect(src, `${plik}: to samo brzmienie noty`).toContain(NOTA_POCZ);
      expect(src, `${plik}: to samo brzmienie noty`).toContain(NOTA_KON);
    }
  });

  it('karta główna: wiersz BMI nazywa siatkę DS i tylko ją', () => {
    const src = zrodlo('vilda_update_prep.js');
    const linia = new Function('window', 'formatCentile', 'centylWord', `${funkcjaZ(src, 'vildaUpdatePrepBmiSilnik')}${funkcjaZ(src, 'vildaUpdatePrepFmtSds')}${funkcjaZ(src, 'vildaUpdatePrepNotaSiatki')}${funkcjaZ(src, 'vildaUpdatePrepBuildBmiLine')}return vildaUpdatePrepBuildBmiLine;`)({}, (c) => String(Math.round(c)), () => 'centyl');
    const stan = { bmiReady: true, bmiText: '22,8', bmi: 22.8, bmiPercentile: 68, bmiZVal: 0.48, proActive: true, age: 10, bmiCat: 'Prawidłowe' };
    const zDs = linia({ ...stan, bmiSiatka: 'DS' });
    expect(zDs).toContain('68 centyl');
    expect(zDs, 'nota po kategorii').toContain('u Downa (Zemel 2015)');
    expect(linia({ ...stan, bmiSiatka: 'OLAF' }), 'siatka populacyjna bez noty').not.toContain('Downa');
    expect(linia(stan), 'brak informacji o siatce — bez noty').not.toContain('Downa');
  });

  it('etap 4b: silnik SDS wzrostu liczy DS tą samą drogą, co karta modułu — i bez łańcucha zastępczego', () => {
    const doc = { getElementById: () => null, addEventListener() {} };
    const win = oknoZSilnikiem({ document: doc, vildaAppOnReady: () => {} });
    new Function('window', 'globalThis', zrodlo('vilda_sds_wzrostu.js'))(win, win);
    const L = win.VildaDsLMS;
    win.VildaSdsWzrostu.ustawDane({
      LMS_HEIGHT_DS_INFANT_BOYS: L.NIEMOWLE.HT.M, LMS_HEIGHT_DS_INFANT_GIRLS: L.NIEMOWLE.HT.F,
      LMS_HEIGHT_DS_BOYS: L.DZIECKO.HT.M, LMS_HEIGHT_DS_GIRLS: L.DZIECKO.HT.F,
    });
    const modul = modulDs(win, { document: doc });
    const T = win.VildaSdsWzrostu;

    let maxZ = 0, n = 0;
    for (const plec of ['M', 'F']) for (let m = 1; m <= 240; m += 3) for (const cm of [50, 65, 80, 100, 120, 140, 155]) {
      const r = T.policz({ wzrost: cm, plec, wiekMies: m, zrodlo: 'OLAF', populacja: 'DS' });
      expect(r.siatka, `${plec} ${m} mies.`).toBe('DS');
      maxZ = Math.max(maxZ, Math.abs(r.sds - modul.zFor(plec, m / 12, 'HT', cm)));
      n += 1;
    }
    expect(n).toBeGreaterThan(1000);
    expect(maxZ, 'wzrost DS: silnik i karta modułu liczą TĘ SAMĄ liczbę').toBe(0);

    // decyzja D2 — żadnego cichego zejścia na siatkę populacyjną
    expect(T.kandydaci('OLAF', 120, 'DS')).toEqual(['DS']);
    for (const [m, fragment] of [[0, 'od 1. miesiąca'], [241, '20 latach']]) {
      const r = T.policz({ wzrost: 100, plec: 'M', wiekMies: m, zrodlo: 'OLAF', populacja: 'DS' });
      expect(r.siatka, `${m} mies.`).toBeNull();
      expect(r.powod, `${m} mies.`).toContain(fragment);
    }
    // granica 2 lat jak w karcie modułu: poniżej — długość niemowlęca, od 2 lat — wzrost
    expect(T.lms('M', 12, 'DS')).toEqual(L.NIEMOWLE.HT.M['12']);
    expect(T.lms('M', 120, 'DS')).toEqual(L.DZIECKO.HT.M['120']);
    // resolver działa tak samo, jak w silniku BMI
    win.VildaPopulacjaPacjenta = () => 'DS';
    expect(T.policz({ wzrost: 120, plec: 'M', wiekMies: 120, zrodlo: 'OLAF' }).siatka).toBe('DS');
    expect(T.policz({ wzrost: 120, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: 'OGOLNA' }).siatka).not.toBe('DS');
    expect(T.mediana('M', 120, 'OLAF').siatka).toBe('DS');
    delete win.VildaPopulacjaPacjenta;
  });

  it('etap 4b: masa i masa do długości w rdzeniu app.js biorą wiersz z tego samego zestawu DS', () => {
    const win = oknoZSilnikiem();
    const kod = `${funkcjaZ(appSrc, 'vildaDsTablica')}${funkcjaZ(appSrc, 'vildaPopulacjaDs')}${funkcjaZ(appSrc, 'vildaDsWiersz')}return { wiersz: vildaDsWiersz, ds: vildaPopulacjaDs };`;
    const rdzen = new Function('window', kod)(win);
    const L = win.VildaDsLMS;
    expect(rdzen.ds(), 'bez resolvera — populacja ogólna').toBe(false);
    win.VildaPopulacjaPacjenta = () => 'DS';
    expect(rdzen.ds()).toBe(true);
    expect(rdzen.wiersz('WT', 'M', 120)).toEqual(L.DZIECKO.WT.M['120']);
    expect(rdzen.wiersz('WT', 'F', 12)).toEqual(L.NIEMOWLE.WT.F['12']);
    expect(rdzen.wiersz('WT', 'M', 241), 'poza zakresem siatki DS brak wiersza').toBeNull();
    expect(rdzen.wiersz('HC', 'M', 24)).toEqual(L.DZIECKO.HC.M['24']);
    delete win.VildaPopulacjaPacjenta;
    // rdzeń nie ma własnej kopii wzoru ani własnego interpolatora dla DS
    expect(appSrc).toContain('T.interpoluj(tab,Math.max(');
    expect(appSrc).toContain('if(vildaPopulacjaDs()){const Td=vildaDsWiersz(');
    expect(appSrc, 'masa do długości też idzie na tablice DS').toContain('L.WFL?L.WFL[e==="M"?"M":"F"]:null');
    expect(appSrc, 'wynik masy niesie nazwę siatki').toContain('siatka:vildaPopulacjaDs()?"DS":null');
  });

  it('etap 4b: wsad XLSX wypisuje się z ambientnej populacji także przy wzroście', () => {
    const wsad = zrodlo('vilda_professional_module.js');
    expect(wsad).toContain('zrodlo:zz,populacja:"OGOLNA"});if(q&&typeof q.sds');
    expect((wsad.match(/populacja:"OGOLNA"/g) || []).length, 'BMI i wzrost — oba wypisane').toBe(2);
  });

  it('etap 4b (decyzja D4): masa i wzrost też nazywają siatkę DS w karcie głównej i wyjściach', () => {
    for (const [plik, odciski] of [
      ['vilda_update_prep.js', ['vildaUpdatePrepNotaSiatki(a.siatka)']],
      ['vilda_patient_summary_copy.js', ['s&&s.siatka==="DS"', 'v&&v.siatka==="DS"']],
      ['vilda_summary_cards.js', ['g&&g.siatka==="DS"', '_&&_.siatka==="DS"']],
    ]) {
      const src = zrodlo(plik);
      for (const o of odciski) expect(src, `${plik}: ${o}`).toContain(o);
    }
    // karta główna: nota przy masie i przy wzroście, nie tylko przy BMI
    const src = zrodlo('vilda_update_prep.js');
    expect((src.match(/vildaUpdatePrepNotaSiatki\(a\.siatka\)/g) || []).length, 'masa i wzrost').toBe(2);
  });

  it('etap 5: raport pacjenta liczy masę na siatce DS i ją nazywa (D2 + D4)', () => {
    const win = oknoZSilnikiem();
    win.VildaPopulacjaPacjenta = () => 'DS';
    const kod = `${funkcjaZ(appSrc, 'vildaDsTablica')}${funkcjaZ(appSrc, 'vildaPopulacjaDs')}${funkcjaZ(appSrc, 'vildaDsWiersz')}`
      + `${funkcjaZ(appSrc, 'advHistoryGetChildLMSForSource')}${funkcjaZ(appSrc, 'advHistoryMetricCandidates')}`
      + `${funkcjaZ(appSrc, 'advHistoryMetricFallbackReason')}`
      + 'return { lms: advHistoryGetChildLMSForSource, kand: advHistoryMetricCandidates, powod: advHistoryMetricFallbackReason };';
    const r = new Function('window', 'OLAF_DATA_MIN_AGE', kod)(win, 3);
    const L = win.VildaDsLMS;

    // decyzja D2: rozpoznanie zastępuje wybór źródła — jedna siatka, bez łańcucha zastępczego
    expect(r.kand('OLAF', 'WT', 10)).toEqual(['DS']);
    expect(r.kand('WHO', 'BMI', 10)).toEqual(['DS']);
    // wzrost ma własną oś populacji w silniku, wskaźnik Cole’a zostaje przy IOTF
    expect(r.kand('OLAF', 'HT', 10)).not.toEqual(['DS']);
    expect(r.kand('OLAF', 'COLE', 10)).not.toEqual(['DS']);
    // ten sam zestaw tablic i ten sam interpolator, co karta główna
    expect(r.lms('DS', 'M', 10, 'WT')).toEqual(L.DZIECKO.WT.M['120']);
    expect(r.lms('DS', 'F', 1, 'WT')).toEqual(L.NIEMOWLE.WT.F['12']);
    expect(r.lms('DS', 'M', 10, 'HT'), 'wzrost czyta wyłącznie silnik SDS').toBeNull();
    expect(r.lms('DS', 'M', 20, 'WT'), '20 lat mieści się w siatce DS, choć nie w populacyjnej').not.toBeNull();
    expect(r.lms('DS', 'M', 21, 'WT'), 'poza 240 mies. brak wiersza').toBeNull();
    // DS nie jest „zejsciem zastepczym" — powód nazywa rozpoznanie, nie brak danych w źródle
    expect(r.powod('OLAF', 'DS', 'WT', 10)).toContain('rozpoznanie zespołu Downa');
    delete win.VildaPopulacjaPacjenta;
    expect(r.kand('OLAF', 'WT', 10), 'bez rozpoznania — zwykły łańcuch źródeł').not.toEqual(['DS']);

    const raport = zrodlo('vilda_patient_report.js');
    expect(raport, 'masa nazywa siatkę').toContain('k&&k.source==="DS"?patientReportAppendSentence(L,');
    expect(raport, 'wzrost nazywa siatkę').toContain('m&&m.source==="DS"?patientReportAppendSentence(L,');
  });

  it('etap 5: generator siatki PDF nie ma już własnej matematyki', () => {
    for (const plik of ['inline_index_05.js', 'inline_docpro_03.js']) {
      const src = bezKomentarzy(zrodlo(plik));
      expect(src, `${plik}: wiersz z jednego interpolatora silnika`).toContain('T.interpoluj(e,m)');
      expect(src, `${plik}: wartość dla SDS z silnika`).toContain('T.xLms(i,[e,n,t])');
      expect(src, `${plik}: dane z jednego znormalizowanego zestawu`).toContain('window.VildaDsLMS');
      expect(src, `${plik}: bez własnego wzoru LMS`).not.toMatch(/Math\.pow\([^)]*1\s*\/\s*[a-zA-Z]/);
      expect(src, `${plik}: bez własnej surowej tablicy DS`).not.toContain('window.DS');
    }
  });

  it('D5/P-DS-6: moduł obwodu głowy jest DOKŁADNY na WHO, ale skrót po 7 liniach nie przenosi się na DS', () => {
    // SPROSTOWANIE względem pierwszej wersji tego etapu. Napisałem właścicielowi, że moduł liczy
    // „innym modelem: średnia ± z·SD, a nie łańcuchem LMS". To było NIEPRAWDĄ: WHO publikuje obwód
    // głowy z L = 1 w KAŻDYM wierszu, a wtedy M·(1+z·S) JEST łańcuchem LMS. Moduł idzie jeszcze
    // krok dalej — z liczy interpolacją między siedmioma liniami centylowymi (`zc`) — i przy L = 1
    // też wychodzi dokładnie, bo linie są wtedy LINIOWE w z. Zero różnicy, nie „inny model".
    //
    // Ale ta dokładność jest właściwością danych, nie kodu. Tablice DS mają L ≈ 1,8–3,9, więc ich
    // linie NIE są liniowe w z i ten sam skrót dałby przybliżenie. Ten test trzyma oba fakty naraz,
    // żeby P-DS-6 (obwód głowy na siatce DS) nie wpiął tablic DS w istniejącą maszynerię 7 linii — i żeby nikt
    // nie cofnął tego później. Zachowanie sprawdza tests/unit/ds-obwod-glowy.test.mjs.
    const win = oknoZSilnikiem();
    new Function('window', 'globalThis', zrodlo('who_head_data.js'))(win, win);
    const WHO = win.WHO_HEAD_LMS, L = win.VildaDsLMS;
    const Z = [-1.881, -1.282, -0.674, 0, 0.674, 1.282, 1.881];
    const lin = (t, a, b, za, zb) => (a === b ? za : za + ((t - a) / (b - a)) * (zb - za));
    const z7 = (x, linie) => {
      if (x <= linie[0]) return lin(x, linie[0], linie[1], Z[0], Z[1]);
      for (let i = 0; i < 6; i += 1) if (x <= linie[i + 1]) return lin(x, linie[i], linie[i + 1], Z[i], Z[i + 1]);
      return lin(x, linie[5], linie[6], Z[5], Z[6]);
    };
    const wartosc = (z, [l, m, s]) => (l !== 0 ? m * Math.pow(1 + l * s * z, 1 / l) : m * Math.exp(s * z));

    // 1. WHO: interpolacja po 7 liniach == łańcuch LMS, CO DO ZERA (bo L = 1)
    let maxWho = 0;
    for (const plec of ['male', 'female']) {
      for (let mies = 0; mies <= 60; mies += 1) {
        const [M, S] = WHO[plec][mies];
        const linie = Z.map((z) => M * (1 + z * S));
        for (let z = -3; z <= 3.0001; z += 0.25) maxWho = Math.max(maxWho, Math.abs(z7(M * (1 + z * S), linie) - z));
      }
    }
    expect(maxWho, 'WHO: skrót po liniach jest dokładny, bo L = 1').toBeLessThan(1e-9);

    // 2. DS: te same tablice mają L daleko od 1, więc ten skrót przestaje być dokładny
    let maxDs = 0, lMin = Infinity, lMax = -Infinity;
    for (const grupa of ['NIEMOWLE', 'DZIECKO']) {
      for (const plec of ['M', 'F']) {
        const tab = L[grupa].HC[plec];
        for (const klucz of Object.keys(tab)) {
          const wiersz = tab[klucz];
          lMin = Math.min(lMin, wiersz[0]); lMax = Math.max(lMax, wiersz[0]);
          const linie = Z.map((z) => wartosc(z, wiersz));
          for (let z = -3; z <= 3.0001; z += 0.25) maxDs = Math.max(maxDs, Math.abs(z7(wartosc(z, wiersz), linie) - z));
        }
      }
    }
    expect(lMin, 'tablice DS nie są grid-em o L = 1').toBeGreaterThan(1.5);
    expect(lMax).toBeLessThan(4);
    expect(maxDs, 'DS: skrót po liniach już NIE jest dokładny — P-DS-6 musi liczyć łańcuchem LMS').toBeGreaterThan(0.05);

    // 3. Powodem klinicznym P-DS-6 jest to, że dziecko NA MEDIANIE DS czyta się na WHO jako ~2. centyl,
    //    czyli typowy pacjent z zespołem Downa dostaje fałszywy alarm małogłowia.
    const cdf = (z) => {
      const t = z >= 0 ? 1 : -1, x = Math.abs(z) / Math.SQRT2, u = 1 / (1 + 0.3275911 * x);
      const y = 1 - ((((1.061405429 * u - 1.453152027) * u + 1.421413741) * u - 0.284496736) * u + 0.254829592) * u * Math.exp(-x * x);
      return 0.5 * (1 + t * y);
    };
    for (const [plec, who] of [['M', 'male'], ['F', 'female']]) {
      for (const mies of [36, 48, 60]) {
        const medDs = L.DZIECKO.HC[plec][String(mies)][1];
        const [M, S] = who === 'male' ? WHO.male[mies] : WHO.female[mies];
        const centyl = cdf((medDs - M) / (M * S)) * 100;
        expect(centyl, `${plec} ${mies} mies.: mediana DS na siatce WHO`).toBeLessThan(5);
      }
    }

    // P-DS-6 to wykorzystał: moduł czyta teraz tablice DS przez JEDYNY czytnik (vildaDsWiersz)
    // i liczy łańcuchem LMS silnika, a nie skrótem `zc`. Ścieżka WHO/IMiD zostaje dla reszty pacjentów.
    const src = zrodlo('circumference_module.js');
    expect(src).toContain('WHO_HEAD_LMS');
    expect(src, 'DS przez jedyny czytnik tablic').toContain('f("HC"');
    expect(src, 'z z łańcucha LMS silnika').toContain('T0.zLms(n,L0)');
    // Że to NIE jest skrót po liniach, dowodzi pomiar w ds-obwod-glowy.test.mjs — asercja tekstowa
    // na brak `zc(` w tej gałęzi byłaby atrapą (skrót da się zapisać na dziesiątki sposobów).
    expect(Object.keys(L.DZIECKO.HC), 'zestaw DS ma obwód głowy').toEqual(['M', 'F']);
  });

  it('etap 5: nota siatki brzmi wszędzie tak samo', () => {
    const NOTA = 'u Downa (Zemel 2015)';
    const pliki = ['vilda_update_prep.js', 'vilda_patient_summary_copy.js', 'vilda_summary_cards.js',
      'vilda_patient_report.js', 'vilda_epicrisis.js', 'vilda_bmi.js'];
    for (const plik of pliki) {
      const src = zrodlo(plik);
      expect(src, `${plik}: nota siatki DS`).toContain(NOTA);
      expect(src, `${plik}: bez innego rocznika publikacji`).not.toMatch(/Zemel\s+(?!2015)\d{4}/);
    }
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
