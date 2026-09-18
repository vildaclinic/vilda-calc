import { describe, expect, it } from 'vitest';
import { funkcjaZ, oknoZSilnikiem, tablica, zrodlo } from '../support/silnik-bmi.mjs';

// P-MASA etap 1 (audyt werdyktów 2026-09-18, decyzja właściciela „ruszaj z 1 i 2").
//
// Masa była jedyną z czterech miar antropometrycznych bez silnika — wzrost, BMI i tempo
// miały swój, masa nie. Skutek zmierzony w audycie: pięć powierzchni, pięć różnych pasm
// normy dla tej samej liczby. Ten plik pilnuje, żeby od teraz było jedno.

const win = oknoZSilnikiem();
new Function('window', 'globalThis', zrodlo('vilda_masa.js'))(win, win);
const M = win.VildaMasa;
M.ustawDane({
  LMS_WEIGHT_OLAF_BOYS: tablica('LMS_WEIGHT_BOYS'),
  LMS_WEIGHT_OLAF_GIRLS: tablica('LMS_WEIGHT_GIRLS'),
  LMS_WEIGHT_WHO_BOYS: tablica('LMS_WEIGHT_WHO_BOYS'),
  LMS_WEIGHT_WHO_GIRLS: tablica('LMS_WEIGHT_WHO_GIRLS'),
  LMS_WEIGHT_WHO_INFANT_BOYS: tablica('LMS_INFANT_WEIGHT_BOYS'),
  LMS_WEIGHT_WHO_INFANT_GIRLS: tablica('LMS_INFANT_WEIGHT_GIRLS'),
});

describe('P-MASA — jedna tablica progów', () => {
  it('progi to 3 / 10 / 90 / 97 — te same liczby, które app.js trzyma jako skrajne centyle', () => {
    expect(M.PROGI.NIEDOBOR).toBe(3);
    expect(M.PROGI.NISKA).toBe(10);
    expect(M.PROGI.PODWYZSZONA).toBe(90);
    expect(M.PROGI.WYSOKA).toBe(97);
    const app = zrodlo('app.js');
    expect(app).toContain('PERCENTILE_EXTREME_LOW=3');
    expect(app).toContain('PERCENTILE_EXTREME_HIGH=97');
  });

  const pasma = [
    [1.5, 'niedobor', 'alert'],
    [2.99, 'niedobor', 'alert'],
    [3, 'niska', 'improve'],
    [9.99, 'niska', 'improve'],
    [10, 'typowa', 'ok'],
    [50, 'typowa', 'ok'],
    [89.99, 'typowa', 'ok'],
    [90, 'podwyzszona', 'improve'],
    [96.99, 'podwyzszona', 'improve'],
    [97, 'wysoka', 'alert'],
    [99.9, 'wysoka', 'alert'],
  ];
  for (const [c, klucz, kolor] of pasma) {
    it(`centyl ${c} → ${klucz}`, () => {
      const k = M.kategoria(c);
      expect(k.klucz).toBe(klucz);
      expect(k.kolor).toBe(kolor);
    });
  }

  it('brak centyla nie zgaduje kategorii', () => {
    expect(M.kategoria(null).klucz).toBe('brak');
    expect(M.kategoria(undefined).klucz).toBe('brak');
    expect(M.kategoria(Number.NaN).klucz).toBe('brak');
  });
});

describe('P-MASA — liczenie SDS i centyla', () => {
  it('mediana siatki daje SDS 0 i centyl 50', () => {
    const row = M.lms('M', 96, 'OLAF');
    expect(row).toBeTruthy();
    const r = M.policz({ wiekMies: 96, plec: 'M', masaKg: row[1], zrodlo: 'OLAF' });
    expect(Math.abs(r.sds)).toBeLessThan(1e-9);
    expect(Math.abs(r.centyl - 50)).toBeLessThan(1e-6);
    expect(r.siatka).toBe('OLAF');
    expect(r.fallback).toBe(false);
  });

  it('chłopiec 10 lat, 40,5 kg — liczba, na której stoi całe znalezisko audytu', () => {
    const r = M.policz({ wiekMies: 120, plec: 'M', masaKg: 40.5, zrodlo: 'OLAF' });
    console.log(`P-MASA chlopiec 10l 40,5kg: wSDS=${r.sds.toFixed(3)} centyl=${r.centyl.toFixed(2)} → ${M.kategoria(r.centyl).etykieta}`);
    expect(r.centyl).toBeGreaterThan(50);
    expect(r.centyl).toBeLessThan(90);
    expect(M.kategoria(r.centyl).klucz).toBe('typowa');
  });

  it('poza zakresem siatek — null z powodem, nigdy cicha wartość z ostatniego wiersza', () => {
    const r = M.policz({ wiekMies: 260, plec: 'M', masaKg: 70, zrodlo: 'OLAF' });
    expect(r.sds).toBeNull();
    expect(r.centyl).toBeNull();
    expect(r.powod).toContain('poza zakresem');
  });

  it('WHO powyżej 10 lat nie ma masy — zamiana siatki jest jawna', () => {
    const r = M.policz({ wiekMies: 150, plec: 'F', masaKg: 45, zrodlo: 'WHO' });
    expect(r.siatka).toBe('OLAF');
    expect(r.fallback).toBe(true);
    expect(r.powod).toContain('WHO');
  });

  it('populacja DS nie ma łańcucha zastępczego (decyzja D2)', () => {
    expect(M.kandydaci('OLAF', 96, 'DS')).toEqual(['DS']);
  });
});

describe('P-MASA — wiek ułamkowy kontra zaokrąglony (różnica wobec dzisiejszej ścieżki)', () => {
  // app.js liczy masę przez advHistoryInterpolateLmsDataSet, który robi Math.round(wiek)
  // PRZED interpolacją. Silnik wzrostu ma regułę odwrotną i udokumentowaną: „wiek jest
  // UŁAMKOWY w miesiącach i tak trafia do interpolacji — wszędzie". Silnik masy idzie za
  // wzrostem, żeby obie miary nie rozjeżdżały się co do wieku. Ten test NIE pilnuje zgodności
  // z zaokrąglaniem — mierzy, ile ta różnica jest warta, żeby decyzja o przepięciu
  // konsumentów (etap 2) zapadała na liczbach, a nie na przeczuciu.
  it('app.js rzeczywiście zaokrągla wiek przed interpolacją', () => {
    expect(zrodlo('app.js')).toContain('function advHistoryInterpolateLmsDataSet(e,t){if(!e)return null;const n=Math.round(t)');
  });

  it('największa różnica centyla przy wieku ułamkowym', () => {
    const tab = tablica('LMS_WEIGHT_BOYS');
    const zaokr = (wiek) => {
      const n = Math.round(wiek);
      return M.interpoluj(tab, n);
    };
    let max = 0; let gdzie = null;
    for (let w = 36; w <= 216; w += 0.5) {
      const rowU = M.interpoluj(tab, w);
      const rowZ = zaokr(w);
      if (!rowU || !rowZ) continue;
      const masa = rowU[1]; // mediana przy wieku ułamkowym
      const cU = M.centylZSds(M.zLms(masa, rowU));
      const cZ = M.centylZSds(M.zLms(masa, rowZ));
      const d = Math.abs(cU - cZ);
      if (d > max) { max = d; gdzie = w; }
    }
    console.log(`P-MASA najwieksza roznica centyla (ulamkowy vs zaokraglony): ${max.toFixed(3)} pkt przy wieku ${gdzie} mies.`);
    expect(max).toBeLessThan(5);
  });
});

describe('P-MASA punkt 2 — zdanie tłumaczące rozjazd masa↔BMI', () => {
  it('milczy, gdy oba werdykty wskazują w tę samą stronę', () => {
    expect(M.wyjasnienieWzgledemBmi({ centylMasy: 50, kategoriaBmi: { klucz: 'prawidlowe' } }).rozne).toBe(false);
    expect(M.wyjasnienieWzgledemBmi({ centylMasy: 95, kategoriaBmi: { klucz: 'nadwaga' } }).rozne).toBe(false);
    expect(M.wyjasnienieWzgledemBmi({ centylMasy: 2, kategoriaBmi: { klucz: 'niedowaga' } }).rozne).toBe(false);
  });

  it('odzywa się, gdy masa jest w normie, a BMI nad nią — przypadek dziecka niskiego', () => {
    const w = M.wyjasnienieWzgledemBmi({ centylMasy: 77, kategoriaBmi: { klucz: 'nadwaga' } });
    expect(w.rozne).toBe(true);
    expect(w.zdanie).toContain('do WIEKU');
    expect(w.zdanie).toContain('do jego WZROSTU');
    expect(w.zdanie).toContain('niższego od rówieśników');
    expect(w.zdanie, 'nie podważa żadnego z werdyktów').toContain('Oba werdykty są poprawne');
  });

  it('odzywa się w drugą stronę — dziecko wyższe od rówieśników', () => {
    const w = M.wyjasnienieWzgledemBmi({ centylMasy: 93, kategoriaBmi: { klucz: 'prawidlowe' } });
    expect(w.rozne).toBe(true);
    expect(w.zdanie).toContain('wyższego od rówieśników');
  });

  it('milczy, gdy kategorii BMI nie da się odczytać — nie zgaduje', () => {
    expect(M.wyjasnienieWzgledemBmi({ centylMasy: 50, kategoriaBmi: null }).rozne).toBe(false);
    expect(M.wyjasnienieWzgledemBmi({ centylMasy: 50, kategoriaBmi: { klucz: 'brak' } }).rozne).toBe(false);
  });

  it('otyłość i masa w normie też jest rozjazdem', () => {
    const w = M.wyjasnienieWzgledemBmi({ centylMasy: 60, kategoriaBmi: { klucz: 'otylosc' } });
    expect(w.rozne).toBe(true);
  });
});

describe('P-MASA — wpięcie silnika i zdania w raporcie', () => {
  const RAPORT = zrodlo('vilda_patient_report.js');

  it('nota karty „Masa ciała" przechodzi przez wyjaśnienie rozjazdu', () => {
    expect(RAPORT).toContain('note:patientReportMasaWobecBmi(');
    expect(RAPORT).toContain('function patientReportMasaWobecBmi(');
  });

  it('regułę rozstrzyga silnik, nie raport — raport tylko pyta', () => {
    // Wycinamy DOKŁADNIE ciało helpera: od jego nagłówka do początku następnej
    // funkcji w pliku. Stała długość cięcia (np. 600 znaków) wchodziła w
    // patientReportDescribeWeight, gdzie "e<3?" to próg TAMTEJ funkcji — test
    // czerwienił się na cudzym kodzie zamiast pilnować swojego.
    const cialo = funkcjaZ(RAPORT, 'patientReportMasaWobecBmi');
    expect(cialo).toContain('window.VildaMasa');
    expect(cialo).toContain('wyjasnienieWzgledemBmi');
    expect(cialo, 'żadnych własnych progów w raporcie').not.toMatch(/[<>]=?\s*(90|97|10|3)\b/);
  });

  it('dorosły jest pominięty — tam ton masy i BMI pochodzi z jednej oceny', () => {
    expect(funkcjaZ(RAPORT, 'patientReportMasaWobecBmi')).toContain('if(dorosly)return nota');
  });

  it('awaria silnika nie psuje noty — raport oddaje ją bez zmian', () => {
    const i = RAPORT.indexOf('function patientReportMasaWobecBmi(');
    expect(RAPORT.slice(i, i + 700)).toContain('catch(e){return nota}');
  });

  it('każda strona z raportem ładuje silnik masy', () => {
    for (const strona of ['index.html', 'docpro.html', 'kalkulator-klirens.html']) {
      const html = zrodlo(strona);
      expect(html, `${strona} ładuje raport`).toContain('vilda_patient_report.js');
      expect(html, `${strona} ładuje silnik masy`).toContain('vilda_masa.js');
    }
  });

  it('app.js wystawia silnikowi tablice masy', () => {
    const app = zrodlo('app.js');
    expect(app).toContain('window.VildaMasaLMS=Object.freeze({');
    for (const t of ['LMS_WEIGHT_OLAF_BOYS', 'LMS_WEIGHT_WHO_BOYS', 'LMS_WEIGHT_WHO_INFANT_BOYS']) {
      expect(app, t).toContain(t);
    }
  });

  it('silnik jest we wstępnym pobraniu PWA', () => {
    expect(zrodlo('service-worker-kalorii.js')).toContain("'/vilda_masa.js?v=1',");
  });
});

describe('P-MASA-3b — karta „Masa ciała" w raporcie na tym samym paśmie', () => {
  const RAPORT2 = zrodlo('vilda_patient_report.js');

  /** Buduje opis i ton raportu w izolacji. `okno` decyduje, czy silnik jest widoczny. */
  const raport = (okno) => new Function('window', [
    funkcjaZ(RAPORT2, 'patientReportPasmoMasy'),
    funkcjaZ(RAPORT2, 'patientReportTonMasy'),
    funkcjaZ(RAPORT2, 'patientReportDescribeWeight'),
    'return { pasmo: patientReportPasmoMasy, ton: patientReportTonMasy, opis: patientReportDescribeWeight };',
  ].join('\n'))(okno);

  it('lustro w raporcie i silnik dają to samo pasmo na całym zakresie', () => {
    const lustro = raport({}).pasmo;
    const zSilnikiem = raport(win).pasmo;
    const rozjazdy = [];
    for (let p = 0; p <= 100.0001; p += 0.1) {
      const c = Math.round(p * 10) / 10;
      if (lustro(c) !== zSilnikiem(c)) rozjazdy.push(`${c}: zapas=${lustro(c)} silnik=${zSilnikiem(c)}`);
    }
    expect(rozjazdy).toEqual([]);
  });

  it('centyl dokładnie 3,0: tekst i kolor wreszcie mówią to samo', () => {
    // Dotąd tekst zmieniał się przy e<3, a ton przy x<=3 — dziecko na 3,0 czytało łagodne
    // „poniżej typowego zakresu" przy czerwonej ramce. To był jedyny punkt rozjazdu.
    const { opis, ton } = raport(win);
    expect(opis(3, null)).toBe('poni\u017Cej typowego zakresu');
    expect(ton(3), 'ton idzie za tekstem, nie przeciw niemu').toBe('warn');
    // Sąsiedztwo bez zmian.
    expect(opis(2.99, null)).toBe('znacznie poni\u017Cej typowego zakresu');
    expect(ton(2.99)).toBe('danger');
    expect(ton(3.01)).toBe('warn');
  });

  it('wszystkie pięć pasm: tekst i ton z jednego źródła', () => {
    const { opis, ton } = raport(win);
    const oczekiwane = [
      [1, 'danger', 'znacznie poni\u017Cej typowego zakresu'],
      [5, 'warn', 'poni\u017Cej typowego zakresu'],
      [50, 'normal', 'w typowym zakresie dla wieku'],
      [93, 'warn', 'powy\u017Cej typowego zakresu'],
      [98, 'danger', 'wyra\u017Anie powy\u017Cej typowego zakresu'],
    ];
    for (const [centyl, t, tekst] of oczekiwane) {
      expect(ton(centyl), `centyl ${centyl}: ton`).toBe(t);
      expect(opis(centyl, null), `centyl ${centyl}: tekst`).toBe(tekst);
    }
  });

  it('odniesienie dla dorosłych zachowuje swoje brzmienie', () => {
    const { opis } = raport(win);
    const d = { adultReference: true };
    expect(opis(1, d)).toBe('znacznie poni\u017Cej typowego zakresu w przyj\u0119tym odniesieniu centylowym');
    expect(opis(50, d), 'dorosły nie mówi „dla wieku"').toBe('w typowym zakresie w przyj\u0119tym odniesieniu centylowym');
    expect(opis(98, d)).toBe('wyra\u017Anie powy\u017Cej typowego zakresu w przyj\u0119tym odniesieniu centylowym');
  });

  it('brak centyla nadal nie zgaduje', () => {
    const { opis, ton } = raport(win);
    for (const brak of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(opis(brak, null)).toBe('bez por\u00F3wnania centylowego');
      expect(ton(brak)).toBe('normal');
    }
  });

  it('czwarta kopia progów zniknęła — raport pyta silnik', () => {
    expect(funkcjaZ(RAPORT2, 'patientReportPasmoMasy')).toContain('window.VildaMasa');
    expect(RAPORT2, 'koniec osobnego wyrażenia tonu masy').not.toContain('x<=3||x>=97?"danger"');
    const opis = funkcjaZ(RAPORT2, 'patientReportDescribeWeight');
    expect(opis, 'opis pyta o pasmo').toContain('patientReportPasmoMasy(e)');
    expect(opis, 'opis nie ma już własnych progów').not.toMatch(/e<(3|10|90|97)\?/);
  });
});
