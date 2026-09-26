import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA rata G2 (decyzja właściciela 2026-09-26, po makiecie): stabilizacja dziecka w dokumentach dla pacjenta to plan
// UTRZYMANIA masy — tytuł „Twój plan utrzymania masy ciała”, w „Twojej drodze” „CEL NA TEN ETAP: utrzymanie obecnej masy”
// bez osi w kilogramach i bez „pierwszego kroku” w dół; w „Raporcie po wizycie” „Na tym etapie celem jest utrzymanie
// obecnej masy ciała (ok. X kg).” i karta masy „Cel na ten etap: utrzymanie masy ok. X kg”. Redukcja, dorośli i pozostałe
// strategie bez zmian. PRAWDZIWE moduły: vilda_raport_plan.js, vilda_raport_naglowek.js, vilda_patient_report.js
// (wejście — `dane` generatora — w kształcie vildaDaneZalecen; pełna ścieżka strona → PDF jest w e2e). Dane FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');
const NB = '\u00A0';

const okP = wczytajDoOkna(oknoZSilnikiem(), 'vilda_raport_plan.js');
const DANE = (extra) => ({
  wersja: 1, dorosly: false, strategia: 'stabilization', pacjent: { wiekLat: 13, wiekMies: 156, plec: 'F', masaKg: 75, wzrostCm: 155, bmi: 31.2 },
  klasyfikacja: { nadmiar: true, otylosc: true }, energia: { podazZaokrKcal: 2200, gornaGranica: false, deficytKcal: null, tempoKgTydz: null, dietaNazwa: null },
  masa: { docelowaKg: 53.84 }, zdania: {}, punkty: {}, ...extra,
});
const html = (d) => okP.VildaRaportPlan.html({ patient: { name: 'Testowa Fikcyjna' }, baseResult: { dane: d } });
const droga = (h) => (h.match(/<section class="vrp-blok vrp-droga[^"]*">[\s\S]*?<\/section>/) || [''])[0];
const tekst = (h) => h.replace(/<[^>]+>/g, '¶').split('¶').map((s) => s.replace(/[\u00A0\u202F]/g, ' ').trim()).filter(Boolean);

describe('rata G2: „Twoja droga” w planie PDF przy stabilizacji dziecka', () => {
  it('wersja modułu 15', () => { expect(okP.VildaRaportPlan.version).toBe(15); });

  it('cel na ten etap = obecna masa, bez osi i bez pierwszego kroku; stopka jak karta „Droga do normy BMI”', () => {
    const s = droga(html(DANE()));
    expect(tekst(s)).toEqual(['TWOJA DROGA', 'CEL NA TEN ETAP', '75,0 kg', 'utrzymanie obecnej masy ciała', 'Górna granica normy BMI przy obecnym wzroście:', '53,8 kg', '(85. centyl).']);
    expect(s).not.toMatch(/PIERWSZY CEL|pierwszy krok|vrp-pasek|Cel końcowy|−/);
  });

  it('zachęta o wzrastaniu tylko wtedy, gdy generator ją podaje (przy tempie poniżej normy — nie podaje)', () => {
    const z = droga(html(DANE({ wzrastanie: { tempoCmRokLabel: '6,0' } })));
    expect(tekst(z)).toContain('Wzrastanie wciąż trwa (ok. 6,0 cm/rok) i każdy centymetr sam obniża BMI, nawet przy niezmienionej masie ciała.');
    expect(droga(html(DANE({ wzrastanie: null, tempoWzrastania: { ocena: 'ponizej', zdanie: 'x' } })))).not.toContain('Wzrastanie wciąż trwa');
  });

  it('bez masy docelowej — bez stopki; bez masy pacjenta — bez sekcji', () => {
    expect(droga(html(DANE({ masa: {} })))).not.toContain('vrp-stopa');
    expect(droga(html(DANE({ pacjent: { wiekLat: 13, plec: 'F' } })))).toBe('');
  });

  it('redukcja i dorosły: sekcja utrzymania się nie pojawia', () => {
    expect(html(DANE({ strategia: 'reduction' }))).not.toContain('CEL NA TEN ETAP');
    expect(html(DANE({ dorosly: true }))).not.toContain('CEL NA TEN ETAP');
  });
});

describe('rata G2: tytuł planu PDF (generator zaleceń)', () => {
  it('stabilizacja dziecka → „Twój plan utrzymania masy ciała”; pozostałe tytuły bez zmian', () => {
    const src = czytaj('vilda_diet_recommendations.js');
    expect(src).toContain('d.dane&&d.dane.strategia==="stabilization"&&!d.dane.dorosly?"Tw\\xF3j plan utrzymania masy cia\\u0142a":d.dane&&d.dane.masa&&d.dane.masa.docelowaKg!=null?"Tw\\xF3j plan redukcji masy cia\\u0142a":"Tw\\xF3j plan \\u017Cywieniowy"');
  });
});

describe('rata G2: nagłówek „Raportu po wizycie” — utrzymanie zamiast pierwszego kroku', () => {
  const w = {};
  new Function('window', 'globalThis', czytaj('vilda_raport_naglowek.js'))(w, w);
  const N = w.VildaRaportNaglowek;
  const BAZA = { dorosly: false, wiekLat: 13, historia: false, masa: { kg: 75, centyl: 99, kolor: 'alert' }, bmi: { wartosc: 31.2, centyl: 99.2, klucz: 'otylosc', etykieta: 'Otyłość', kolor: 'alert' } };
  it('fakt { utrzymanie, masaKg } → „Na tym etapie celem jest utrzymanie obecnej masy ciała (ok. 75,0 kg).”', () => {
    const h = N.zbuduj({ ...BAZA, krok: { utrzymanie: true, masaKg: 75 } });
    expect(h.text).toBe(`Na tym etapie celem jest utrzymanie obecnej masy ciała (ok. 75,0${NB}kg).`);
    expect(h.text).not.toContain('Pierwszy krok');
    expect(N.WERSJA).toBe(8);
  });
  it('redukcja bez zmian', () => {
    const h = N.zbuduj({ ...BAZA, krok: { masaKg: 69.7, roznicaKg: 5.3, opis: '', jestSzczebel: true, korzysc: true, klucz: 'reinehr' } });
    expect(h.text).toContain(`Pierwszy krok to ok. 69,7${NB}kg, czyli około 5,3${NB}kg mniej`);
  });
});

describe('rata G2: „Raport po wizycie” — fakt i karta masy wg strategii generatora', () => {
  function okno(strategia, dorosly) {
    const w = {};
    const doc = { getElementById: () => null, querySelector: () => null, addEventListener() {}, documentElement: { classList: { add() {}, remove() {} } } };
    w.window = w; w.document = doc; w.globalThis = w;
    globalThis.ADULT_BMI = globalThis.ADULT_BMI || { UNDER: 18.5, OVER: 25, OBESE: 30 };
    new Function('window', 'document', 'globalThis', czytaj('vilda_patient_report.js'))(w, doc, w);
    // wejście modułu: wynik generatora zaleceń (tylko pola, które czyta raport)
    w.buildDietEnergyRecommendationResult = () => ({ dane: { strategia, dorosly: !!dorosly } });
    return w;
  }
  const DRAB = { dorosly: false, kierunek: 'redukcja', cel: { klucz: 'norma', masa: 53.8, etykieta: '85. centyl' }, szczeble: [{ klucz: 'reinehr', masa: 69.7 }] };
  it('stabilizacja dziecka: zdanie i karta masy mówią o utrzymaniu obecnej masy', () => {
    const w = okno('stabilization');
    expect(w.patientReportZdaniePierwszegoKroku({ utrzymanie: true, masaKg: 75 })).toBe(`Na tym etapie celem jest utrzymanie obecnej masy ciała (ok. 75,0${NB}kg).`);
    expect(w.patientReportKrokReference(DRAB, 75)).toEqual({ available: true, label: 'Cel na ten etap', medianText: 'utrzymanie masy ok. 75,0 kg', diffText: '' });
  });
  it('redukcja: karta masy jak dotąd („Pierwszy krok: do 69,7 kg”)', () => {
    const w = okno('reduction');
    expect(w.patientReportKrokReference(DRAB, 75)).toMatchObject({ label: 'Pierwszy krok', medianText: 'do 69,7 kg' });
  });
});
