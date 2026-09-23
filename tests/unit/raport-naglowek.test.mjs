import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-RAPORT rata R (decyzje właściciela 2026-09-22): nagłówek „Raportu po wizycie” składany z FAKTÓW.
// Test woła PRAWDZIWY moduł vilda_raport_naglowek.js na fixture faktów w kształcie, który oddaje
// patientReportZbierzFaktyNaglowka (pełna ścieżka strona → fakty → nagłówek jest w e2e). Dane FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZRODLO = fs.readFileSync(path.join(korzen, 'vilda_raport_naglowek.js'), 'utf8');
const w = {};
new Function('window', 'globalThis', ZRODLO)(w, w);
const N = w.VildaRaportNaglowek;
const NB = ' ';

const DZIECKO_OTYLOSC = {
  dorosly: false, wiekLat: 9.25, historia: false,
  masa: { kg: 52.6, centyl: 98, kolor: 'alert' },
  bmi: { wartosc: 24.6, centyl: 98, klucz: 'otylosc', etykieta: 'Otyłość', kolor: 'alert' },
  cole: { proc: 149.1, klucz: 'otylosc', kolor: 'alert' },
  wzrost: { cm: 146.2, centyl: 94 },
  krok: { masaKg: 50.4, roznicaKg: 2.2, opis: 'koniec otyłości', jestSzczebel: true, korzysc: false, klucz: 'otylosc' },
};

describe('Nagłówek z faktów — zasady Z1–Z7', () => {
  it('przypadek właściciela: otyłość + proporcja masy do wysokości → jedno zdanie o masie, zero ogólników', () => {
    const h = N.zbuduj(DZIECKO_OTYLOSC);
    expect(h.badge).toBe('Otyłość'); expect(h.tone).toBe('danger');
    expect(h.title).toBe('Masa ciała i BMI są obecnie wyraźnie powyżej typowych wartości dla wieku.');
    expect(h.text).toBe(`Pierwszy krok to ok. 50,4${NB}kg (koniec otyłości), czyli około 2,2${NB}kg mniej.`);
    expect(h.dodatkowe).toEqual([]);
    expect(h.text).not.toMatch(/Równocześnie|jeszcze jeden parametr|inne parametry/);
  });

  it('Z6 (decyzja 1): najcięższy wynik w tytule — nadciśnienie 165/100 przed BMI „do obserwacji”', () => {
    const h = N.zbuduj({ dorosly: true, wiekLat: 47, masa: { kg: 70.8 }, bmi: { wartosc: 24.5, klucz: 'upper-normal', etykieta: 'Do obserwacji', kolor: 'improve' },
      cisnienie: { dziecko: false, sk: 165, roz: 100, klucz: 'hypertension', ton: 'danger' } });
    expect(h.badge).toBe('Nadciśnienie'); expect(h.tone).toBe('danger');
    expect(h.title).toBe(`Ciśnienie tętnicze odpowiada nadciśnieniu: 165/100${NB}mm${NB}Hg.`);
    expect(h.text).toBe('Rozpoznanie wymaga potwierdzenia w powtarzanych pomiarach; dalsze postępowanie ustalono na wizycie. Dodatkowo BMI (24,5) zbliża się do górnej granicy normy.');
  });

  it('ciśnienie ≥ 180/120 (ciężkość 3) wyprzedza otyłość III stopnia; K1: szczebel BMI 35 to „wyjście z otyłości III stopnia”; limit dwóch „Dodatkowo”', () => {
    const h = N.zbuduj({ dorosly: true, wiekLat: 47, masa: { kg: 121.4 }, bmi: { wartosc: 42, klucz: 'obesity-3', etykieta: 'Otyłość III stopnia', kolor: 'alert' },
      krok: { masaKg: 101.1, roznicaKg: 20.3, opis: 'wyjście z otyłości II stopnia', jestSzczebel: true, korzysc: true, klucz: 'otylosc-2' },
      cisnienie: { dziecko: false, sk: 185, roz: 125, klucz: 'severe', ton: 'danger' },
      tetno: { naMin: 108, klucz: 'high', ton: 'warn' },
      talia: { cm: 120, whr: 1.09, stan: 'bad', dorosly: true } });
    expect(h.badge).toBe('Pilna kontrola');
    expect(h.title).toBe(`Ciśnienie tętnicze jest bardzo wysokie: 185/125${NB}mm${NB}Hg.`);
    expect(h.text).toContain('Taki wynik wymaga pilnej kontroli lekarskiej.');
    expect(h.text).toContain('(wyjście z otyłości III stopnia)');
    expect(h.text).not.toContain('otyłości II stopnia');
    expect(h.dodatkowe.map((d) => d.os)).toEqual(['masa', 'talia']); // tętno (ciężkość 1) nie mieści się w limicie 2
    expect(h.text).not.toContain('tętno');
  });

  it('decyzja 2: dziecko z niskim wzrostem i otyłością dostaje krok masy w „Dodatkowo”; podtytuł o tempie wzrastania', () => {
    const h = N.zbuduj({ ...DZIECKO_OTYLOSC, wiekLat: 9, historia: true, masa: { kg: 41.5, centyl: 95, kolor: 'alert' }, bmi: { wartosc: 27, klucz: 'otylosc', kolor: 'alert' },
      wzrost: { cm: 123.9, centyl: 2 }, krok: { masaKg: 38, roznicaKg: 3.5, opis: '', jestSzczebel: true, korzysc: true, klucz: 'reinehr' } });
    expect(h.badge).toBe('Niski wzrost');
    expect(h.title).toBe(`Wzrost jest wyraźnie niski jak na wiek: 123,9${NB}cm, 2. centyl.`); // P8 (rata S): etykieta jak w kartach
    expect(h.text).toBe(`Dodatkowo masa ciała i BMI są wyraźnie powyżej typowych wartości dla wieku (41,5${NB}kg, BMI 27,0). Pierwszy krok to ok. 38,0${NB}kg, czyli około 3,5${NB}kg mniej; już ta zmiana poprawia ciśnienie i wyniki badań krwi.`);
    expect(h.subtext).toBe('Szczególnie ważne jest porównanie obecnego wzrostu z wcześniejszymi pomiarami i oceną tempa wzrastania. Wynik warto interpretować także w odniesieniu do wzrostu rodziców i całego obrazu klinicznego.');
  });

  it('decyzja 3: poniżej 2 lat bez kroku redukcji — zdanie o wolniejszym przyroście; granica < 0,5 kg', () => {
    const niemowle = N.zbuduj({ ...DZIECKO_OTYLOSC, wiekLat: 1.5, masa: { kg: 13.1, centyl: 98, kolor: 'alert' }, krok: { masaKg: 12.9, roznicaKg: 0.2, jestSzczebel: true, korzysc: true, klucz: 'reinehr' } });
    expect(niemowle.text).toBe('U małych dzieci nie stosuje się odchudzania; celem jest, aby masa ciała rosła wolniej niż wzrost.');
    expect(niemowle.text).not.toMatch(/kg mniej|poprawia ciśnienie/);
    const granica = N.zbuduj({ dorosly: false, wiekLat: 4, masa: { kg: 22.5, centyl: 80, kolor: 'ok' }, bmi: { wartosc: 17.4, klucz: 'nadwaga', kolor: 'improve' },
      krok: { masaKg: 22.45, roznicaKg: 0.05, opis: 'górna granica normy dla wieku', jestSzczebel: false, korzysc: false, klucz: 'norma' } });
    expect(granica.text).toBe(`Do górnej granicy normy dla wieku brakuje mniej niż 0,5${NB}kg; celem jest, aby masa ciała przestała rosnąć szybciej niż wzrost. Najważniejsze jest, aby w kolejnych pomiarach masa ciała rosła wolniej niż wzrost.`); // P4 (rata S)
    expect(granica.text).not.toContain('0,1');
  });

  it('remis ciężkości: wysoki wzrost ustępuje nadwadze; niski wzrost 3–10 c ustępuje otyłości', () => {
    const wysoki = N.zbuduj({ dorosly: false, wiekLat: 4, masa: { kg: 22.5, centyl: 92, kolor: 'improve' }, bmi: { wartosc: 17.4, klucz: 'nadwaga', kolor: 'improve' }, wzrost: { cm: 113.8, centyl: 98 },
      krok: { masaKg: 21, roznicaKg: 1.5, opis: 'górna granica normy dla wieku', jestSzczebel: false, korzysc: false, klucz: 'norma' } });
    expect(wysoki.badge).toBe('Nadwaga');
    expect(wysoki.text).toContain(`Dodatkowo wzrost jest wysoki jak na wiek (113,8${NB}cm, 98. centyl).`);
    const niski = N.zbuduj({ ...DZIECKO_OTYLOSC, wzrost: { cm: 128.5, centyl: 6 } });
    expect(niski.badge).toBe('Otyłość');
    expect(niski.text).toContain(`Dodatkowo wzrost jest niski jak na wiek (128,5${NB}cm, 6. centyl).`);
  });

  it('decyzja 4/6: dorosły od 18 lat składa nagłówek dorosłego; ciśnienie wpisane < 3 lat → zdanie o ocenie przez lekarza', () => {
    const d = N.zbuduj({ dorosly: true, wiekLat: 18.5, masa: { kg: 95 }, bmi: { wartosc: 31, klucz: 'obesity-1', etykieta: 'Otyłość I stopnia', kolor: 'alert' }, krok: { masaKg: 91.9, roznicaKg: 3.1, opis: 'koniec otyłości', jestSzczebel: true, korzysc: true, klucz: 'otylosc-1' } });
    expect(d.title).toBe('BMI wskazuje na otyłość I stopnia.');
    const m = N.zbuduj({ dorosly: false, wiekLat: 2.9, masa: { kg: 14.5, centyl: 50, kolor: 'ok' }, bmi: { wartosc: 16, klucz: 'prawidlowe', etykieta: 'Prawidłowe', kolor: 'ok' }, cisnieniePonizej3Lat: true });
    expect(m.tone).toBe('normal'); expect(m.badge).toBe('Prawidłowe');
    expect(m.title).toBe('Najważniejsze wyniki mieszczą się obecnie w typowym zakresie dla wieku i płci.');
    expect(m.text).toBe('Ciśnienie tętnicze poniżej 3. roku życia wymaga oceny przez lekarza.');
  });

  it('ciśnienie dziecka: kierunek, wartość i centyl; wysokie = alarm, niskie = ostrzeżenie', () => {
    const wys = N.zbuduj({ dorosly: false, wiekLat: 9, bmi: { klucz: 'prawidlowe', etykieta: 'Prawidłowe', kolor: 'ok' }, cisnienie: { dziecko: true, sk: 130, roz: 50, centylSk: 99, centylRoz: 40, klasa: 'wysokie', ton: 'danger' } });
    expect(wys.badge).toBe('Ciśnienie wysokie'); expect(wys.tone).toBe('danger');
    expect(wys.title).toBe(`Ciśnienie tętnicze jest wysokie: 130/50${NB}mm${NB}Hg.`);
    expect(wys.text).toBe('Ciśnienie skurczowe na 99. centylu dla wieku, płci i wzrostu. Pojedynczy pomiar wymaga potwierdzenia w kolejnych pomiarach w spokoju.');
    const nis = N.zbuduj({ dorosly: false, wiekLat: 9, bmi: { klucz: 'prawidlowe', kolor: 'ok' }, cisnienie: { dziecko: true, sk: 78, roz: 40, centylSk: 1, centylRoz: 2, klasa: 'niskie', ton: 'warn' } });
    expect(nis.badge).toBe('Ciśnienie niskie'); expect(nis.tone).toBe('warn');
    expect(nis.text).toContain('skurczowe na 1. centylu i rozkurczowe na 2. centylu');
    // to samo jako zdanie dodatkowe przy otyłości
    const razem = N.zbuduj({ ...DZIECKO_OTYLOSC, cisnienie: { dziecko: true, sk: 130, roz: 50, centylSk: 99, centylRoz: 40, klasa: 'wysokie', ton: 'danger' } });
    expect(razem.badge).toBe('Otyłość');
    expect(razem.text).toContain(`Dodatkowo ciśnienie tętnicze jest wysokie: 130/50${NB}mm${NB}Hg (skurczowe na 99. centylu dla wieku, płci i wzrostu).`);
    const razem93 = N.zbuduj({ ...DZIECKO_OTYLOSC, cisnienie: { dziecko: true, sk: 118, roz: 50, centylSk: 93, centylRoz: 40, klasa: 'podwyzszone', ton: 'warn' } });
    expect(razem93.text).toContain(`Dodatkowo ciśnienie tętnicze jest podwyższone: 118/50${NB}mm${NB}Hg (skurczowe na 93. centylu dla wieku, płci i wzrostu).`);
  });

  it('dorosły: klasy ciśnienia i tętna ze zdaniem „co dalej” (decyzja 5); talia = otyłość brzuszna', () => {
    const baza = { dorosly: true, wiekLat: 47, masa: { kg: 63.6 }, bmi: { wartosc: 22, klucz: 'normal', etykieta: 'W zakresie', kolor: 'ok' } };
    expect(N.zbuduj({ ...baza, cisnienie: { dziecko: false, sk: 128, roz: 82, klucz: 'elevated', ton: 'warn' } })).toMatchObject({ badge: 'Ciśnienie podwyższone', tone: 'warn', title: `Ciśnienie tętnicze jest podwyższone: 128/82${NB}mm${NB}Hg.`, text: 'Warto potwierdzić je w pomiarach domowych i na kolejnej wizycie.' });
    expect(N.zbuduj({ ...baza, cisnienie: { dziecko: false, sk: 88, roz: 55, klucz: 'low', ton: 'warn' } })).toMatchObject({ badge: 'Ciśnienie niskie', text: 'Przy zawrotach głowy lub omdleniach warto to skonsultować z lekarzem.' });
    expect(N.zbuduj({ ...baza, cisnienie: { dziecko: false, sk: 142, roz: 92, klucz: 'stage2', ton: 'danger' } }).title).toBe(`Ciśnienie tętnicze odpowiada nadciśnieniu 2. stopnia: 142/92${NB}mm${NB}Hg.`);
    expect(N.zbuduj({ ...baza, tetno: { naMin: 108, klucz: 'high', ton: 'warn' } })).toMatchObject({ badge: 'Tachykardia', title: 'Tętno spoczynkowe jest przyspieszone: 108/min (typowo 60–100/min).' });
    expect(N.zbuduj({ ...baza, tetno: { naMin: 44, klucz: 'low-context-warn', ton: 'warn', kontekst: 'stosowaniu beta‑blokera' } })).toMatchObject({ badge: 'Do oceny', title: 'Tętno spoczynkowe jest wyraźnie wolne: 44/min (typowo 60–100/min).', text: 'Przy stosowaniu beta‑blokera niższe tętno spoczynkowe może występować.' });
    expect(N.zbuduj({ ...baza, talia: { cm: 100, whr: 1.05, stan: 'bad', dorosly: true } })).toMatchObject({ badge: 'Otyłość brzuszna', tone: 'danger', title: `Obwód talii wskazuje na otyłość brzuszną: 100,0${NB}cm (WHR 1,05).` });
    expect(N.zbuduj({ ...baza, bmi: { wartosc: 16.6, klucz: 'underweight', etykieta: 'Niedowaga', kolor: 'improve' }, masa: { kg: 48 }, granice: { dolKg: 53.5, goraKg: 72 } }).text).toBe(`Do dolnej granicy normy (BMI 18,5) brakuje ok. 5,5${NB}kg. Przyczyny niedoboru masy ciała omówiono na wizycie.`);
  });

  it('dziecko: talia, obwód głowy, klatka, tempo wzrastania, MPH — zawsze parametr, kierunek, wartość', () => {
    const baza = { dorosly: false, wiekLat: 9, masa: { kg: 31, centyl: 50, kolor: 'ok' }, bmi: { wartosc: 16.7, klucz: 'prawidlowe', etykieta: 'Prawidłowe', kolor: 'ok' }, wzrost: { cm: 136.3, centyl: 50 } };
    expect(N.zbuduj({ ...baza, talia: { cm: 80, centyl: 86, stan: 'warn', dorosly: false } })).toMatchObject({ badge: 'Obwód talii', tone: 'warn', title: `Obwód talii jest duży jak na wiek: 80,0${NB}cm, 86. centyl.` });
    expect(N.zbuduj({ ...baza, glowa: { cm: 43, centyl: 0.4 } })).toMatchObject({ badge: 'Obwód głowy', tone: 'danger', title: `Obwód głowy jest mały jak na wiek: 43,0${NB}cm, poniżej 1. centyla.` });
    expect(N.zbuduj({ ...baza, klatka: { cm: 70, centyl: 99 } }).title).toBe(`Obwód klatki piersiowej jest duży jak na wiek: 70,0${NB}cm, 99. centyl.`);
    expect(N.zbuduj({ ...baza, klatka: { cm: 72, centyl: 99.4 } }).title).toBe(`Obwód klatki piersiowej jest duży jak na wiek: 72,0${NB}cm, powyżej 99. centyla.`);
    expect(N.zbuduj({ ...baza, glowa: { cm: 50, centyl: 50 } }).tone).toBe('normal'); // obwód w normie nie tworzy faktu
    expect(N.zbuduj({ ...baza, tempo: { cmRok: 2, ton: 'danger', norma: '≥4 cm/rok' } })).toMatchObject({ badge: 'Wolne tempo wzrastania', tone: 'danger', title: `Tempo wzrastania jest wolne: 2,0${NB}cm/rok (norma ≥4 cm/rok).` });
    expect(N.zbuduj({ ...baza, tempo: { cmRok: 3, ton: 'warn', norma: null } }).title).toBe(`Tempo wzrastania wymaga oceny: 3,0${NB}cm/rok.`);
    expect(N.zbuduj({ ...baza, mph: { roznicaSds: -1.8 } })).toMatchObject({ badge: 'Wzrost a rodzice', tone: 'warn', title: `Wzrost dziecka jest niższy, niż wynika ze wzrostu rodziców (różnica −1,80${NB}SDS).` }); // rata T: 2 miejsca i znak jak linia podsumowania
    expect(N.zbuduj({ ...baza, mph: { roznicaSds: 2.3 } }).tone).toBe('danger');
    expect(N.zbuduj({ ...baza, mph: { roznicaSds: 1.2 } }).tone).toBe('normal');
  });

  it('jedna oś masy: BMI w normie, ale wskaźnik Cole’a lub sama masa poza zakresem', () => {
    const baza = { dorosly: false, wiekLat: 12, masa: { kg: 49, centyl: 88, kolor: 'ok' }, bmi: { wartosc: 21.8, centyl: 84, klucz: 'prawidlowe', etykieta: 'Prawidłowe', kolor: 'ok' }, wzrost: { cm: 150, centyl: 50 } };
    const cole = N.zbuduj({ ...baza, cole: { proc: 120.3, klucz: 'otylosc', kolor: 'alert' } });
    expect(cole.badge).toBe('Otyłość');
    expect(cole.title).toBe(`Masa ciała w stosunku do wzrostu jest wyraźnie za duża (wskaźnik Cole’a 120${NB}%, norma 90–110${NB}%).`);
    expect(cole.text).toBe('BMI mieści się jeszcze w typowym zakresie; warto, aby w kolejnych pomiarach masa ciała rosła wolniej niż wzrost.');
    const nadw = N.zbuduj({ ...baza, cole: { proc: 114, klucz: 'nadwaga', kolor: 'improve' } });
    expect(nadw.badge).toBe('Nadwaga'); expect(nadw.tone).toBe('warn');
    const masa = N.zbuduj({ ...baza, masa: { kg: 41.5, centyl: 90, kolor: 'improve' }, wzrost: { cm: 147, centyl: 80 } });
    expect(masa.title).toBe(`Masa ciała jest wysoka jak na wiek (41,5${NB}kg, 90. centyl), ale w stosunku do wzrostu pozostaje prawidłowa.`);
    expect(masa.text).toBe(`Masa ciała jest proporcjonalna do wzrostu (147,0${NB}cm, 80. centyl); BMI mieści się w typowym zakresie.`); // P1 (rata S): pasmo 10–90 c
    // Cole + otyłość BMI = jedna oś, jedno zdanie
    expect(N.zbuduj(DZIECKO_OTYLOSC).text).not.toMatch(/Cole/);
  });

  it('brak faktów: tytuł domyślny dziecka i dorosłego; niedowaga dziecka z celem przyrostu', () => {
    expect(N.zbuduj({ dorosly: false, wiekLat: 9, bmi: { klucz: 'prawidlowe', etykieta: 'Prawidłowe', kolor: 'ok' } })).toMatchObject({ badge: 'Prawidłowe', tone: 'normal', title: 'Najważniejsze wyniki mieszczą się obecnie w typowym zakresie dla wieku i płci.', text: '' });
    expect(N.zbuduj({ dorosly: true, wiekLat: 34, bmi: { klucz: 'normal', etykieta: 'W zakresie', kolor: 'ok' } }).title).toBe('Najważniejsze wyniki mieszczą się obecnie w typowym zakresie.');
    const nied = N.zbuduj({ dorosly: false, wiekLat: 15, masa: { kg: 40, centyl: 2, kolor: 'alert' }, bmi: { wartosc: 14.7, centyl: 0.2, klucz: 'niedowaga', etykieta: 'Niedowaga', kolor: 'alert' }, celPrzyrost: { masaKg: 44.7, roznicaKg: 4.7 } });
    expect(nied.badge).toBe('Niedowaga');
    expect(nied.title).toBe('Masa ciała i BMI są obecnie poniżej typowego zakresu dla wieku.');
    expect(nied.text).toBe(`Do dolnej granicy normy brakuje ok. 4,7${NB}kg (cel ok. 44,7${NB}kg). Przyczyny niedoboru masy ciała i sposób jej zwiększenia omówiono na wizycie.`);
  });

  it('strażnik źródła: moduł nie zna ogólników dawnego nagłówka', () => {
    for (const z of ['Równocześnie', 'jeszcze jeden parametr', 'inne parametry z podsumowania', 'Szczególnej uwagi wymaga parametr', 'w kontekście całego badania', 'Wynik nieprawidłowy', 'Wymaga omówienia', 'wymaga pilnej konsultacji']) {
      expect(ZRODLO.replace(/\/\*[\s\S]*?\*\//g, ''), z).not.toContain(z); // kod bez komentarzy (nagłówek pliku opisuje dawne zdanie)
    }
    expect(N.LIMIT_DODATKOWO).toBe(2); expect(N.KROK_OD_LAT).toBe(2);
  });
});

// P-RAPORT rata S (decyzje właściciela 2026-09-22): bez dublowania osi wzrostu, strażnik < 0,5 kg nazywa
// szczebel, jedno zdanie o nadwadze < 2 lat, etykieta centyla jak w kartach. Dane FIKCYJNE.
describe('Nagłówek z faktów — rata S', () => {
  const BAZA_NORMA_BMI = { dorosly: false, wiekLat: 1, historia: false, bmi: { wartosc: 17.1, klucz: 'prawidlowe', etykieta: 'Prawidłowe', kolor: 'ok' }, cole: { proc: 99.7, klucz: 'norma', kolor: 'ok' } };

  it('P1: wysoka masa przy prawidłowym BMI i wzrost > 97 c — wzrost w zdaniu masy, bez „Dodatkowo wzrost”, zdanie o wzroście w podtytule', () => {
    const h = N.zbuduj({ ...BAZA_NORMA_BMI, masa: { kg: 11.8, centyl: 93, kolor: 'improve' }, wzrost: { cm: 83, centyl: 99.6 } });
    expect(h.badge).toBe('Wysoka masa ciała'); expect(h.tone).toBe('warn');
    expect(h.title).toBe(`Masa ciała jest wysoka jak na wiek (11,8${NB}kg, 93. centyl), ale w stosunku do wzrostu pozostaje prawidłowa.`);
    expect(h.text).toBe(`Wzrost jest również wysoki (83,0${NB}cm, powyżej 99. centyla); masa ciała jest proporcjonalna do wzrostu, a BMI mieści się w typowym zakresie.`);
    expect(h.subtext).toBe('Sam wysoki wzrost nie jest nieprawidłowością; ocenia się go razem z tempem wzrastania i wzrostem rodziców.');
    expect(h.dodatkowe).toEqual([]);
    expect(h.text).not.toMatch(/Wynika to|Dodatkowo wzrost/);
  });

  it('P1: pasma wzrostu 90–97 c („powyżej przeciętnej”) i 3–10 c („niski”); bez wzrostu — samo zdanie o proporcji', () => {
    const p93 = N.zbuduj({ ...BAZA_NORMA_BMI, masa: { kg: 11.3, centyl: 93, kolor: 'improve' }, wzrost: { cm: 79.3, centyl: 93 } });
    expect(p93.text).toBe(`Wzrost jest również powyżej przeciętnej (79,3${NB}cm, 93. centyl); masa ciała jest proporcjonalna do wzrostu, a BMI mieści się w typowym zakresie.`);
    expect(p93.subtext).toBe('');
    const n5 = N.zbuduj({ ...BAZA_NORMA_BMI, masa: { kg: 7.2, centyl: 1.5, kolor: 'alert' }, wzrost: { cm: 71.8, centyl: 5 } });
    expect(n5.badge).toBe('Niska masa ciała'); // masa < 3 c (alarm) wygrywa z wzrostem 5 c (ostrzeżenie)
    expect(n5.text).toBe(`Wzrost jest również niski (71,8${NB}cm, 5. centyl); masa ciała jest proporcjonalna do wzrostu, a BMI mieści się w typowym zakresie.`);
    expect(n5.subtext).toContain('tempa wzrastania');
    expect(n5.dodatkowe).toEqual([]);
    const bez = N.zbuduj({ ...BAZA_NORMA_BMI, masa: { kg: 11.3, centyl: 93, kolor: 'improve' } });
    expect(bez.text).toBe('Masa ciała jest proporcjonalna do wzrostu; BMI mieści się w typowym zakresie.');
  });

  it('P2: niski wzrost w tytule, masa niska przy prawidłowym BMI w „Dodatkowo” — proporcja, nie przyczyna', () => {
    const h = N.zbuduj({ ...BAZA_NORMA_BMI, masa: { kg: 8.1, centyl: 6, kolor: 'improve' }, wzrost: { cm: 70.2, centyl: 0.6 } });
    expect(h.badge).toBe('Niski wzrost');
    expect(h.title).toBe(`Wzrost jest wyraźnie niski jak na wiek: 70,2${NB}cm, poniżej 1. centyla.`);
    expect(h.text).toBe(`Dodatkowo masa ciała jest niska jak na wiek (8,1${NB}kg, 6. centyl), ale proporcjonalna do wzrostu; BMI mieści się w typowym zakresie.`);
    expect(h.text).not.toMatch(/wynika|choć/);
  });

  it('wchłonięta oś nie wraca także wtedy, gdy masa jest zdaniem dodatkowym (tytuł: ciśnienie)', () => {
    const h = N.zbuduj({ ...BAZA_NORMA_BMI, wiekLat: 9, masa: { kg: 41.5, centyl: 93, kolor: 'improve' }, wzrost: { cm: 150, centyl: 99 },
      cisnienie: { dziecko: true, sk: 130, roz: 50, centylSk: 98, centylRoz: 40, klasa: 'wysokie', ton: 'danger' } });
    expect(h.badge).toBe('Ciśnienie wysokie');
    expect(h.dodatkowe.map((d) => d.os)).toEqual(['masa']);
    expect(h.text).toContain('ale proporcjonalna do wzrostu; BMI mieści się w typowym zakresie.');
    expect(h.text).not.toContain('Dodatkowo wzrost');
  });

  it('P3: nadwaga poniżej 2 lat — jedno zdanie o wolniejszym przyroście; od 2 lat krok + zdanie o kolejnych pomiarach', () => {
    const krok = { masaKg: 8.6, roznicaKg: 0.3, opis: 'górna granica normy dla wieku', jestSzczebel: false, korzysc: false, klucz: 'norma' };
    const maly = N.zbuduj({ dorosly: false, wiekLat: 0.5, masa: { kg: 8.9, centyl: 85, kolor: 'ok' }, bmi: { wartosc: 19.5, klucz: 'nadwaga', etykieta: 'Nadwaga', kolor: 'improve' }, krok });
    expect(maly.text).toBe('U małych dzieci nie stosuje się odchudzania; celem jest, aby masa ciała rosła wolniej niż wzrost.');
    expect((maly.text.match(/rosła wolniej niż wzrost/g) || []).length).toBe(1);
    const bezKroku = N.zbuduj({ dorosly: false, wiekLat: 0.5, masa: { kg: 8.9, centyl: 85, kolor: 'ok' }, bmi: { wartosc: 19.5, klucz: 'nadwaga', etykieta: 'Nadwaga', kolor: 'improve' } });
    expect(bezKroku.text).toBe('Najważniejsze jest, aby w kolejnych pomiarach masa ciała rosła wolniej niż wzrost.');
  });

  it('P4: szczebel bliżej niż 0,5 kg nazywa szczebel — koniec otyłości, próg −0,25 BMI-SDS, otyłość III stopnia u dorosłego', () => {
    const baza = { dorosly: false, wiekLat: 2, masa: { kg: 16.3, centyl: 99, kolor: 'alert' }, bmi: { wartosc: 25.5, klucz: 'otylosc', etykieta: 'Otyłość', kolor: 'alert' } };
    const reinehr = N.zbuduj({ ...baza, krok: { masaKg: 15.886, roznicaKg: 0.414, opis: '', jestSzczebel: true, korzysc: true, klucz: 'reinehr' } });
    expect(reinehr.title).toBe('Masa ciała i BMI są obecnie wyraźnie powyżej typowych wartości dla wieku.');
    expect(reinehr.text).toBe(`Pierwszy krok to ok. 15,9${NB}kg, czyli mniej niż 0,5${NB}kg; celem jest, aby masa ciała przestała rosnąć szybciej niż wzrost.`);
    expect(reinehr.text).not.toMatch(/granicy normy|poprawia ciśnienie/);
    const koniec = N.zbuduj({ ...baza, masa: { kg: 12.2, centyl: 90, kolor: 'improve' }, bmi: { wartosc: 19.1, klucz: 'otylosc', etykieta: 'Otyłość', kolor: 'alert' }, krok: { masaKg: 11.95, roznicaKg: 0.25, opis: 'koniec otyłości', jestSzczebel: true, korzysc: false, klucz: 'otylosc' } });
    expect(koniec.text).toBe(`Do końca otyłości brakuje mniej niż 0,5${NB}kg; celem jest, aby masa ciała przestała rosnąć szybciej niż wzrost.`);
    const dorosly = N.zbuduj({ dorosly: true, wiekLat: 47, masa: { kg: 101.5 }, bmi: { wartosc: 40.1, klucz: 'obesity-3', etykieta: 'Otyłość III stopnia', kolor: 'alert' },
      krok: { masaKg: 101.2, roznicaKg: 0.3, opis: 'wyjście z otyłości II stopnia', jestSzczebel: true, korzysc: true, klucz: 'otylosc-2' } });
    expect(dorosly.text).toContain(`Do wyjścia z otyłości III stopnia brakuje mniej niż 0,5${NB}kg; celem jest, aby masa ciała dalej nie rosła.`);
    expect(dorosly.text).not.toContain('szybciej niż wzrost');
  });

  it('P8: etykieta centyla jak w kartach raportu — „poniżej 1. centyla”, „powyżej 99. centyla”, inaczej zaokrąglenie', () => {
    const baza = { dorosly: false, wiekLat: 9, masa: { kg: 31, centyl: 50, kolor: 'ok' }, bmi: { wartosc: 16.7, klucz: 'prawidlowe', etykieta: 'Prawidłowe', kolor: 'ok' } };
    expect(N.zbuduj({ ...baza, wzrost: { cm: 118, centyl: 0.3 } }).title).toBe(`Wzrost jest wyraźnie niski jak na wiek: 118,0${NB}cm, poniżej 1. centyla.`);
    expect(N.zbuduj({ ...baza, wzrost: { cm: 123.9, centyl: 2.4 } }).title).toBe(`Wzrost jest wyraźnie niski jak na wiek: 123,9${NB}cm, 2. centyl.`);
    expect(N.zbuduj({ ...baza, wzrost: { cm: 152, centyl: 98.2 } }).title).toBe(`Wzrost jest wysoki jak na wiek: 152,0${NB}cm, 98. centyl.`);
    expect(N.zbuduj({ ...baza, wzrost: { cm: 156, centyl: 99.7 } }).title).toBe(`Wzrost jest wysoki jak na wiek: 156,0${NB}cm, powyżej 99. centyla.`);
    expect(N.WERSJA).toBe(3);
  });
});


// P-RAPORT rata T (decyzje właściciela 2026-09-23): wysoki wzrost wobec wzrostu docelowego wg rodziców (MPH).
// Progi 1,5 / 2,0; alarm od 3 lat; łagodzenie od 10 lat; wyjątek hSDS ≥ +3,0; liczba SDS tylko w trybie
// profesjonalnym; remis 2:2 przed „masą proporcjonalną”, za otyłością. Dane FIKCYJNE.
describe('Nagłówek z faktów — rata T (wysoki wzrost a wzrost docelowy wg rodziców)', () => {
  const NORMA = { bmi: { wartosc: 15.8, klucz: 'prawidlowe', etykieta: 'Prawidłowe', kolor: 'ok' }, cole: { proc: 100, klucz: 'norma', kolor: 'ok' }, masa: { kg: 24, centyl: 60, kolor: 'ok' } };
  const SZESC = { dorosly: false, wiekLat: 6, historia: false, ...NORMA, wzrost: { cm: 129, centyl: 98.3 } };
  const ROCZNIAK = { dorosly: false, wiekLat: 1, historia: false, bmi: { wartosc: 17.1, klucz: 'prawidlowe', etykieta: 'Prawidłowe', kolor: 'ok' }, cole: { proc: 99.7, klucz: 'norma', kolor: 'ok' }, masa: { kg: 11.8, centyl: 93, kolor: 'improve' }, wzrost: { cm: 83, centyl: 99.6 } };
  const mph = (r, extra) => ({ roznicaSds: r, mphCm: 169.5, mphCentyl: 8, mpSds: -1.44, hSds: 2.13, liczbaWidoczna: true, ...(extra || {}) });
  const WYSOKI = `Wzrost jest wysoki jak na wiek: 129,0${NB}cm, 98. centyl.`;
  const CEL_NISKI = `wzrost docelowy wg rodziców 169,5${NB}cm, 8. centyl dorosłych`;

  it('progi i granice wieku są danymi modułu', () => {
    expect(N.WZROST_A_RODZICE).toEqual({ PASMO: 1.5, ALARM: 2.0, WIEK_ALARM_OD_LAT: 3, WIEK_POKWITANIA_OD_LAT: 10, HSDS_BEZ_LAGODZENIA: 3.0 });
    expect(Object.isFrozen(N.WZROST_A_RODZICE)).toBe(true);
  });

  it('W0: brak obojga rodziców → zdanie jak dotąd + dopisek o rodzicach; populacja DS → bez członu o rodzicach i bez dopisku', () => {
    const bez = N.zbuduj({ ...SZESC, rodziceBrak: true });
    expect(bez).toMatchObject({ badge: 'Wysoki wzrost', tone: 'warn', title: WYSOKI });
    expect(bez.text).toBe('Sam wysoki wzrost nie jest nieprawidłowością; ocenia się go razem z tempem wzrastania i wzrostem rodziców. Do pełniejszej oceny potrzebny jest wzrost obojga rodziców.');
    expect(N.zbuduj({ ...SZESC }).text).toBe('Sam wysoki wzrost nie jest nieprawidłowością; ocenia się go razem z tempem wzrastania i wzrostem rodziców.');
    expect(N.zbuduj({ ...SZESC, ds: true, rodziceBrak: true }).text).toBe('Sam wysoki wzrost nie jest nieprawidłowością; ocenia się go razem z tempem wzrastania.');
  });

  it('W1: w paśmie — żółte, opisowe („zgodny ze wzrostem rodziców”), bez „rodzinny”; historia i tempo zmieniają drugie zdanie', () => {
    const h = N.zbuduj({ ...SZESC, mph: mph(0.04, { mphCm: 192, mphCentyl: 98, mpSds: 2.09 }) });
    expect(h).toMatchObject({ badge: 'Wysoki wzrost', tone: 'warn', title: WYSOKI, dodatkowe: [] });
    expect(h.text).toBe(`Wzrost jest zgodny ze wzrostem rodziców (wzrost docelowy wg rodziców 192,0${NB}cm, 98. centyl dorosłych). Najwięcej informacji daje tempo wzrastania w kolejnych pomiarach.`);
    expect(h.text).not.toMatch(/rodzinn|przemawia|SDS/);
    expect(N.zbuduj({ ...SZESC, historia: true, mph: mph(0.04, { mphCm: 192, mphCentyl: 98 }) }).text).toMatch(/\)\. Najwięcej informacji daje porównanie z wcześniejszymi pomiarami i tempo wzrastania\.$/);
    const zTempem = N.zbuduj({ ...SZESC, tempo: { cmRok: 3, ton: 'warn', norma: null }, mph: mph(0.04, { mphCm: 192, mphCentyl: 98 }) });
    expect(zTempem.text).toBe(`Wzrost jest zgodny ze wzrostem rodziców (wzrost docelowy wg rodziców 192,0${NB}cm, 98. centyl dorosłych). Dodatkowo tempo wzrastania wymaga oceny: 3,0${NB}cm/rok.`);
    expect(N.zbuduj({ ...SZESC, cisnienie: { dziecko: true, sk: 130, roz: 50, centylSk: 99, centylRoz: 20, klasa: 'wysokie', ton: 'danger' }, mph: mph(0.04, { mphCm: 192, mphCentyl: 98 }) }).text)
      .toMatch(/Dodatkowo wzrost jest wysoki jak na wiek \(129,0\u00A0cm, 98\. centyl\), ale zgodny ze wzrostem rodziców \(wzrost docelowy wg rodziców 192,0\u00A0cm, 98\. centyl dorosłych\)\.$/);
  });

  it('W1′: roczne dziecko z wysoką masą przy prawidłowym BMI (przypadek właściciela) — tytuł o masie, podtytuł z zastrzeżeniem wieku', () => {
    const h = N.zbuduj({ ...ROCZNIAK, mph: { roznicaSds: 0.63, mphCm: 190, mphCentyl: 97, mpSds: 1.82, hSds: 2.45, liczbaWidoczna: true } });
    expect(h.badge).toBe('Wysoka masa ciała'); expect(h.tone).toBe('warn');
    expect(h.title).toBe(`Masa ciała jest wysoka jak na wiek (11,8${NB}kg, 93. centyl), ale w stosunku do wzrostu pozostaje prawidłowa.`);
    expect(h.text).toBe(`Wzrost jest również wysoki (83,0${NB}cm, powyżej 99. centyla); masa ciała jest proporcjonalna do wzrostu, a BMI mieści się w typowym zakresie.`);
    expect(h.subtext).toBe(`Wzrost jest zgodny ze wzrostem rodziców (wzrost docelowy wg rodziców 190,0${NB}cm, 97. centyl dorosłych). U dzieci poniżej 3 lat pozycja na siatce może się jeszcze zmieniać, dlatego najważniejsze jest tempo wzrastania w kolejnych pomiarach.`);
    expect(h.dodatkowe).toEqual([]);
    expect(h.subtext + h.text).not.toMatch(/Sam wysoki|SDS/);
  });

  it('W2: pogranicze 1,5–2,0 — „wyższy” bez „nieco” i bez „wyraźnie”, z wartościami i różnicą', () => {
    const h = N.zbuduj({ ...SZESC, mph: mph(1.62, { mphCm: 182, mphCentyl: 76, mpSds: 0.51 }) });
    expect(h).toMatchObject({ badge: 'Wysoki wzrost', tone: 'warn', title: WYSOKI });
    expect(h.text).toBe(`Wzrost jest wyższy, niż wynika ze wzrostu rodziców (wzrost docelowy wg rodziców 182,0${NB}cm, 76. centyl dorosłych; różnica +1,62${NB}SDS). Taki wynik ocenia się razem z tempem wzrastania w kolejnych pomiarach.`);
    expect(h.text).not.toMatch(/nieco|wyraźnie/);
    expect(N.kandydaci({ ...SZESC, mph: mph(1.62) }).some((k) => k.os === 'mph')).toBe(false);
  });

  it('W3: ≥ 2,0 w wieku 3–10 lat — czerwony, tytuł z wartościami, przedwczesne dojrzewanie nazwane, bez „Plan ustalono”, bez drugiej osi', () => {
    const h = N.zbuduj({ ...SZESC, mph: mph(3.57) });
    expect(h).toMatchObject({ badge: 'Wysoki wzrost — do oceny', tone: 'danger', dodatkowe: [] });
    expect(h.title).toBe(`Wzrost jest wysoki jak na wiek: 129,0${NB}cm, 98. centyl — wyraźnie wyższy, niż wynika ze wzrostu rodziców.`);
    expect(h.text).toBe(`Wzrost docelowy wg rodziców to 169,5${NB}cm (8. centyl dorosłych); różnica wynosi +3,57${NB}SDS. Taki wynik wymaga dalszej oceny, m.in. w kierunku przedwczesnego dojrzewania (tempo wzrastania, objawy dojrzewania, wiek kostny).`);
    expect(h.text).not.toMatch(/Plan ustalono|Dodatkowo wzrost/);
    expect(N.kandydaci({ ...SZESC, mph: mph(3.57) }).map((k) => k.os)).toEqual(['wzrost']);
  });

  it('W3 przy nadwadze/otyłości: masa wygrywa tytuł (remis 2:2 za otyłością), wzrost w jednym „Dodatkowo” z wiekiem kostnym na czele', () => {
    const h = N.zbuduj({ ...SZESC, masa: { kg: 34, centyl: 97, kolor: 'alert' }, bmi: { wartosc: 20.4, centyl: 97, klucz: 'nadwaga', etykieta: 'Nadwaga', kolor: 'alert' }, cole: { proc: 118, klucz: 'nadwaga', kolor: 'improve' }, krok: { masaKg: 32.3, roznicaKg: 1.7, opis: 'koniec nadwagi', jestSzczebel: true, korzysc: true, klucz: 'nadwaga' }, mph: mph(3.57) });
    expect(h.badge).toBe('Nadwaga'); expect(h.tone).toBe('danger');
    expect(h.dodatkowe).toEqual([{ os: 'wzrost', ciezkosc: 2 }]);
    expect(h.text).toMatch(/Dodatkowo wzrost jest wysoki jak na wiek \(129,0\u00A0cm, 98\. centyl\) i wyraźnie wyższy, niż wynika ze wzrostu rodziców \(wzrost docelowy wg rodziców 169,5\u00A0cm, 8\. centyl dorosłych; różnica \+3,57\u00A0SDS\) — wymaga dalszej oceny, przede wszystkim wieku kostnego\.$/);
    expect((h.text.match(/Dodatkowo/g) || []).length).toBe(1);
  });

  it('R1: remis 2:2 z „masą proporcjonalną” (masa ≥ 97 c przy prawidłowym BMI) — W3 w tytule, masa jako „Dodatkowo”', () => {
    const h = N.zbuduj({ ...SZESC, masa: { kg: 32, centyl: 98, kolor: 'alert' }, mph: mph(3.57) });
    expect(h.badge).toBe('Wysoki wzrost — do oceny'); expect(h.tone).toBe('danger');
    expect(h.title).toMatch(/^Wzrost jest wysoki jak na wiek/);
    expect(h.dodatkowe).toEqual([{ os: 'masa', ciezkosc: 2 }]);
    expect(h.text).toMatch(/różnica wynosi \+3,57\u00A0SDS\..*Dodatkowo masa ciała jest wysoka jak na wiek \(32,0\u00A0kg, 98\. centyl\), ale proporcjonalna do wzrostu; BMI mieści się w typowym zakresie\.$/);
    // masa 1 vs W3 2: W3 wygrywa ciężkością, masa nie wchłania
    const h2 = N.zbuduj({ ...SZESC, masa: { kg: 30, centyl: 93, kolor: 'improve' }, mph: mph(3.57) });
    expect(h2.badge).toBe('Wysoki wzrost — do oceny'); expect(h2.dodatkowe).toEqual([{ os: 'masa', ciezkosc: 1 }]);
    // masa 1 vs W2 1: jak w racie S — masa w tytule, W2 w podtytule (samowystarczalny)
    const h3 = N.zbuduj({ ...SZESC, masa: { kg: 30, centyl: 93, kolor: 'improve' }, mph: mph(1.62, { mphCm: 182, mphCentyl: 76 }) });
    expect(h3.badge).toBe('Wysoka masa ciała');
    expect(h3.subtext).toMatch(/^Wzrost jest wyższy, niż wynika ze wzrostu rodziców \(wzrost docelowy wg rodziców 182,0\u00A0cm, 76\. centyl dorosłych; różnica \+1,62\u00A0SDS\)\./);
    expect(h3.dodatkowe).toEqual([]);
  });

  it('W3′: poniżej 3 lat — żółte „do obserwacji” bez „wyraźnie”; hSDS ≥ +3,0 nie jest łagodzone', () => {
    const baza = { ...ROCZNIAK, masa: { kg: 10.5, centyl: 60, kolor: 'ok' } };
    const h = N.zbuduj({ ...baza, mph: mph(3.88, { hSds: 2.45 }) });
    expect(h).toMatchObject({ badge: 'Wysoki wzrost — do obserwacji', tone: 'warn', dodatkowe: [] });
    expect(h.text).toBe(`Wzrost jest wyższy, niż wynika ze wzrostu rodziców (${CEL_NISKI}; różnica +3,88${NB}SDS). U dzieci poniżej 3 lat pozycja na siatce może się jeszcze zmieniać, dlatego najważniejsze jest tempo wzrastania w kolejnych pomiarach.`);
    const h2 = N.zbuduj({ ...baza, mph: mph(3.94, { hSds: 3.05 }) });
    expect(h2).toMatchObject({ badge: 'Wysoki wzrost — do oceny', tone: 'danger' });
    expect(N.zbuduj({ ...baza, wiekLat: 2.9, mph: mph(3.88, { hSds: 2.45 }) }).tone).toBe('warn');
    expect(N.zbuduj({ ...baza, wiekLat: 3, mph: mph(3.88, { hSds: 2.45 }) }).tone).toBe('danger');
  });

  it('W3″: od 10 lat — żółte, ocena wobec etapu dojrzewania i wieku kostnego', () => {
    const h = N.zbuduj({ ...SZESC, wiekLat: 12, wzrost: { cm: 168, centyl: 98.5 }, mph: mph(2.31, { mphCm: 164.5, mphCentyl: 46, hSds: 2.2 }) });
    expect(h).toMatchObject({ badge: 'Wysoki wzrost', tone: 'warn' });
    expect(h.text).toBe(`Wzrost jest wyraźnie wyższy, niż wynika ze wzrostu rodziców (wzrost docelowy wg rodziców 164,5${NB}cm, 46. centyl dorosłych; różnica +2,31${NB}SDS). W tym wieku wynik ocenia się w odniesieniu do etapu dojrzewania i wieku kostnego.`);
    expect(N.zbuduj({ ...SZESC, wiekLat: 9.9, mph: mph(2.31) }).tone).toBe('danger');
  });

  it('progi na liczbie zaokrąglonej do 2 miejsc (jak drukowana): 1,996 → alarm, 1,994 → pogranicze „+1,99”; 1,50 → W2, 1,4949 → W1', () => {
    expect(N.zbuduj({ ...SZESC, mph: mph(1.996) }).tone).toBe('danger');
    const p = N.zbuduj({ ...SZESC, mph: mph(1.994) });
    expect(p.tone).toBe('warn'); expect(p.text).toMatch(/różnica \+1,99\u00A0SDS/);
    expect(N.zbuduj({ ...SZESC, mph: mph(1.5) }).text).toMatch(/^Wzrost jest wyższy/);
    expect(N.zbuduj({ ...SZESC, mph: mph(1.4949) }).text).toMatch(/^Wzrost jest zgodny/);
  });

  it('tryb standardowy (liczbaWidoczna: false): zdania słowami i z wzrostem docelowym, bez liczby SDS', () => {
    const w3 = N.zbuduj({ ...SZESC, mph: mph(3.57, { liczbaWidoczna: false }) });
    expect(w3.tone).toBe('danger');
    expect(w3.text).toBe(`Wzrost docelowy wg rodziców to 169,5${NB}cm (8. centyl dorosłych). Taki wynik wymaga dalszej oceny, m.in. w kierunku przedwczesnego dojrzewania (tempo wzrastania, objawy dojrzewania, wiek kostny).`);
    const w2 = N.zbuduj({ ...SZESC, mph: mph(1.62, { mphCm: 182, mphCentyl: 76, liczbaWidoczna: false }) });
    expect(w2.text).toBe(`Wzrost jest wyższy, niż wynika ze wzrostu rodziców (wzrost docelowy wg rodziców 182,0${NB}cm, 76. centyl dorosłych). Taki wynik ocenia się razem z tempem wzrastania w kolejnych pomiarach.`);
    expect(w3.text + w2.text).not.toMatch(/SDS/);
  });

  it('strona ujemna przy wysokim wzroście (bardzo wysocy rodzice): oś mph zostaje z wartościami, oś wzrostu mówi W0 bez dopisku', () => {
    const h = N.zbuduj({ ...SZESC, mph: mph(-2.23, { mphCm: 206.5, mphCentyl: 99.6, mpSds: 4.36 }) });
    expect(h).toMatchObject({ badge: 'Wzrost a rodzice', tone: 'danger' });
    expect(h.title).toBe(`Wzrost dziecka jest niższy, niż wynika ze wzrostu rodziców (wzrost docelowy wg rodziców 206,5${NB}cm, powyżej 99. centyla dorosłych; różnica −2,23${NB}SDS).`);
    expect(h.text).toBe(`Taki wynik ocenia się razem z tempem wzrastania i wiekiem kostnym. Dodatkowo wzrost jest wysoki jak na wiek (129,0${NB}cm, 98. centyl).`);
  });

  it('oś mph bez wysokiego wzrostu: ta sama bramka wieku (< 3 lat ostrzeżenie z zastrzeżeniem) i nawias z wartościami', () => {
    const h = N.zbuduj({ ...ROCZNIAK, masa: { kg: 10, centyl: 55, kolor: 'ok' }, wzrost: { cm: 79.5, centyl: 85 }, mph: mph(3.7, { mphCm: 161.5, mphCentyl: 0.6, mpSds: -2.6, hSds: 1.1 }) });
    expect(h).toMatchObject({ badge: 'Wzrost a rodzice', tone: 'warn' });
    expect(h.title).toBe(`Wzrost dziecka jest wyższy, niż wynika ze wzrostu rodziców (wzrost docelowy wg rodziców 161,5${NB}cm, poniżej 1. centyla dorosłych; różnica +3,70${NB}SDS).`);
    expect(h.text).toBe('U dzieci poniżej 3 lat pozycja na siatce może się jeszcze zmieniać, dlatego najważniejsze jest tempo wzrastania w kolejnych pomiarach.');
    expect(N.zbuduj({ ...SZESC, wzrost: { cm: 124, centyl: 90 }, mph: mph(1.9) }).title).toBe(`Wzrost dziecka jest wyższy, niż wynika ze wzrostu rodziców (${CEL_NISKI}; różnica +1,90${NB}SDS).`);
  });

  it('strażnik: bez „Plan ustalono na wizycie” w gałęzi wysokiego wzrostu i bez „rodzinny” w źródle zdań', () => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_raport_naglowek.js'), 'utf8');
    const blok = src.slice(src.indexOf('function kandydatWysokiegoWzrostu'), src.indexOf('function kandydatCisnienia'))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // bez komentarzy — liczą się zdania
    expect(blok).not.toMatch(/Plan ustalono|rodzinn|przemawia za|prognoza rodzicielska/);
  });
});
