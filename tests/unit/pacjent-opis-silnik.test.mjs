import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Silnik opisu pacjenta (vilda_patient_narrative.js) — kilka zdań w języku karty leczenia,
// składanych WYŁĄCZNIE z wielkości, które aplikacja już wylicza.
//
// Testy pilnują trzech rzeczy:
//  1. brzmienia — zdania mają czytać się jak wpis lekarza, nie jak zrzut z tabeli;
//  2. parytetu — ocena tempa pochodzi DOSŁOWNIE z karty (vilda_trajectory_analysis.js),
//     a etykiety werdyktów odcinka z silnika werdyktu (vilda_werdykt.js), więc opis nie
//     może powiedzieć czegoś innego niż karta o tym samym pacjencie;
//  3. milczenia — brak danych i dane nieaktualne mają być nazwane, a nie pominięte.

// CDF rozkładu normalnego (Abramowitz–Stegun, jak normalCDF w app.js) — do zamiany SDS
// na centyl w atrapie silnika centylowego.
function centileFromSds(sds) {
  const sign = sds >= 0 ? 1 : -1;
  const x = Math.abs(sds) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + sign * y)));
}

// Jeden globalny obiekt na oba moduły — opis musi widzieć kartę, bo z niej czyta werdykty.
function srodowisko(tabela, opcje) {
  const g = {
    bmiSource: 'OLAF',
    advHistoryResolveMetric(param, value, sex, ageYears, source) {
      const key = `${param}|${Math.round(ageYears * 12)}`;
      if (!(key in tabela)) return { result: null, source: null, reason: '' };
      const sd = tabela[key];
      return { result: { percentile: centileFromSds(sd), sd }, source, reason: '' };
    },
    // P-TEMPO: tempo, dobór pary i normę liczy prawdziwy vilda_tempo_wzrastania.js
    // (ładowany niżej) — bez atrap; do SW 1.0.943 stały tu trzy atrapy funkcji app.js
    // i sztuczny próg 5,5 cm/rok.
  };
  // Normy prędkości wzrastania (HV-SDS) ładujemy TYLKO na życzenie. Bez nich karta oddaje
  // null i zdania „tempo-sds" po prostu nie ma — dokładnie tak, jak na stronie bez tych
  // tablic. Dzięki temu starsze testy mierzą to, co mierzyły, a nowe biorą prawdziwe normy.
  if (opcje && opcje.normyTempa) {
    for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js',
      'vilda_height_velocity.js']) {
      loadBrowserScript(plik, g);
    }
  }
  loadBrowserScript('vilda_tempo_wzrastania.js', g);
  loadBrowserScript('vilda_trajectory_analysis.js', g);
  loadBrowserScript('vilda_patient_narrative.js', g);
  return g;
}

const opis = (g, wejscie, extra) => {
  const model = g.VildaTrajectoryAnalysis.analyze(wejscie);
  expect(model, 'karta ma czym opisać pacjenta').not.toBeNull();
  return { model, wynik: g.VildaPatientNarrative.compose(model, extra || {}) };
};

const zdanie = (wynik, id) => {
  const z = wynik.sentences.filter((s) => s.id === id)[0];
  return z ? z.text : null;
};

// Chłopiec: tor wzrastania opada z +0,4 do −1,0 SD między 4. a 7. rokiem życia.
const DECELERACJA = {
  tabela: { 'HT|48': 0.4, 'HT|60': 0.3, 'HT|72': -0.9, 'HT|84': -1.0 },
  wejscie: {
    measurements: [
      { ageMonths: 48, height: 104 },
      { ageMonths: 60, height: 110 },
      { ageMonths: 72, height: 113 },
    ],
    currentAgeMonths: 84,
    currentHeight: 118,
    sex: 'M',
    source: 'OLAF',
  },
};

describe('Zdania opisu — brzmienie karty leczenia', () => {
  it('stan bieżący to jedna linia pomiaru, tak jak lekarz go zapisuje', () => {
    const g = srodowisko({
      'HT|72': -0.3, 'WT|72': -0.2, 'BMI|72': 0.2,
      'HT|84': -0.4, 'WT|84': -0.2, 'BMI|84': 0.3,
    });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 113, weight: 20 }],
      currentAgeMonths: 84,
      currentHeight: 118,
      currentWeight: 22.5,
      sex: 'M',
      source: 'OLAF',
    });

    const t = zdanie(wynik, 'stan');
    expect(t).toMatch(/^W wieku 7 lat chłopiec mierzy 118 cm \([^)]*hSDS −0,4[^)]*\)/);
    expect(t, 'masa i BMI w tym samym zdaniu').toContain('i waży 22,5 kg');
    expect(t).toContain('BMI wynosi');
    expect(t.endsWith('.'), 'zdanie kończy się kropką').toBe(true);
  });

  it('deceleracja opisana jak w karcie, z punktem odniesienia i wielkością spadku', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie);

    expect(zdanie(wynik, 'przebieg'))
      .toBe('Od pomiaru w wieku 4 lat pozycja centylowa wzrostu obniżyła się o 1,4 SD, co wskazuje na decelerację tempa wzrastania.');
  });

  it('rata T4: kontekst flagi — żółta wersja bez „deceleracji” (Tanner I w oknie), czerwona z frazą (Tanner III)', () => {
    const tabela = { 'HT|36': 0.0, 'HT|100': -0.4, 'HT|132': -0.9, 'HT|144': -1.04 };
    const wejscie = (ctx) => ({ measurements: [{ ageMonths: 36, height: 96 }, { ageMonths: 100, height: 128 }, { ageMonths: 132, height: 138.5 }],
      currentAgeMonths: 144, currentHeight: 141, sex: 'M', source: 'OLAF', context: ctx });
    const g = srodowisko(tabela);
    const p1 = opis(g, wejscie({ tannerStage: 1 })).wynik.sentences.filter((s) => s.id === 'przebieg')[0];
    expect(p1).toMatchObject({ tone: 'warn', text: 'Od pomiaru w wieku 3 lat pozycja centylowa wzrostu obniżyła się o 1,0 SD w wieku okołopokwitaniowym, bez cech dojrzewania (Tanner I).' });
    expect(zdanie(opis(g, wejscie({ tannerStage: 3 })).wynik, 'przebieg'))
      .toBe('Od pomiaru w wieku 3 lat pozycja centylowa wzrostu obniżyła się o 1,0 SD mimo cech dojrzewania (Tanner III), co wskazuje na decelerację tempa wzrastania.');
  });

  it('werdykt odcinka otwiera zdanie w bierniku, tak jak pisze endokrynolog', () => {
    // Brzmienie właściciela (2026-09-07): „Istotną decelerację wzrastania zaobserwowano
    // pomiędzy 5 a 6 rokiem życia" — etykieta karty jest w mianowniku, zdanie wymaga
    // biernika i przedziału wieku bez liczebników porządkowych.
    const g = srodowisko(DECELERACJA.tabela);
    const { model, wynik } = opis(g, DECELERACJA.wejscie);

    const h = model.metrics.filter((m) => m.metric === 'height')[0];
    expect(h.worst.verdict.l, 'karta daje etykietę w mianowniku').toBe('istotna deceleracja wzrastania');
    expect(zdanie(wynik, 'odcinek'))
      .toBe('Istotną decelerację wzrastania zaobserwowano w wieku od 5 do 6 lat (ΔhSDS −1,20).');
  });

  it('przebieg całości jest zdaniem z orzeczeniem, a wniosek wisi na spójniku', () => {
    const g = srodowisko({ 'HT|84': 0.3, 'HT|96': 0.35, 'HT|108': 0.4 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 84, height: 122 }, { ageMonths: 96, height: 128 }],
      currentAgeMonths: 108,
      currentHeight: 134,
      sex: 'M',
      source: 'OLAF',
    });

    expect(zdanie(wynik, 'przebieg'))
      .toBe('Z analizy siatki centylowej wynika, że wzrost chłopca w wieku od 7 do 9 lat mieści się w kanale 50–75 c. (ΔhSDS +0,10), co wskazuje na stabilny tor wzrastania.');
  });

  it('wiek kostny opisany różnicą, bez oceny', () => {
    const g = srodowisko({ 'HT|72': -0.5, 'HT|88': -0.6 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 88,
      currentHeight: 118,
      sex: 'M',
      source: 'OLAF',
    }, { boneAgeYears: 6 });

    expect(zdanie(wynik, 'wiekKostny'))
      .toBe('Wiek kostny oceniono na 6 lat przy wieku metrykalnym 7 lat i 4 miesięcy; jest on opóźniony o 1 rok i 4 miesiące.');
    expect(zdanie(wynik, 'wiekKostny').endsWith('..'), 'zdublowana kropka').toBe(false);
  });

  it('potencjał rodzinny to liczby, a nie werdykt', () => {
    const g = srodowisko({ 'HT|72': -0.4, 'HT|84': -0.4 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 84,
      currentHeight: 118,
      sex: 'M',
      source: 'OLAF',
      context: { mpSds: 0.8 },
    }, { motherHeight: 160, fatherHeight: 175, mph: 161 });

    const t = zdanie(wynik, 'potencjal');
    // MPH to potencjał genetyczny z przedziałem ±8,5 cm (Tanner 1970), nie „wzrost
    // docelowy" — obok prognozy czytałby się jak druga prognoza (uwaga właściciela
    // 2026-09-07). To samo słowo, którego używa epikryza.
    expect(t).toContain('Wzrost matki wynosi 160 cm, ojca 175 cm; potencjał genetyczny wzrostu (MPH) oceniono na 161 cm (±8,5 cm, mpSDS +0,80).');
    expect(t).toContain('Aktualny wzrost dziecka znajduje się 1,2 SD poniżej potencjału genetycznego.');
    expect(t, 'MPH nie jest prognozą ani celem').not.toMatch(/docelow|prognoz/);
    // Progu „poniżej potencjału” aplikacja nie ma — opis nie może go wprowadzać tylnymi
    // drzwiami przez słowo oceniające (AGENTS.md §3).
    expect(/istotn|nieprawidłow|niedobór|patologi/i.test(t), 'ocena bez podstawy w progach').toBe(false);
  });

  it('prognoza wzrostu ostatecznego z przedziałem błędu i zgodnością metod', () => {
    const g = srodowisko({ 'HT|72': -0.4, 'HT|84': -0.4 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 84,
      currentHeight: 118,
      sex: 'M',
      source: 'OLAF',
    }, {
      predictions: [
        { label: 'Bayley-Pinneau', cm: 168, errorHalfWidthCm: 3.2, reliabilityLabel: 'wysoka' },
        { label: 'RWT', cm: 171, errorHalfWidthCm: 4.4 },
      ],
      predictionAgreement: 'dobra',
    });

    expect(zdanie(wynik, 'prognoza'))
      .toBe('Prognozowany wzrost ostateczny wynosi 168 cm metodą Bayley-Pinneau (±3,2 cm, wiarygodność wysoka) oraz 171 cm metodą RWT (±4,4 cm); zgodność metod jest dobra.');
  });
});

describe('Parytet z kartą — opis nie mówi nic od siebie', () => {
  it('ocena tempa jest dosłownie tą, którą pokazuje karta', () => {
    const g = srodowisko({ 'HT|72': -0.4, 'HT|84': -0.9 });
    const { model, wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 84,
      currentHeight: 117,
      sex: 'M',
      source: 'OLAF',
    });

    const zKarty = g.VildaTrajectoryAnalysis.velocityAssessment(model.velocity);
    expect(zKarty, 'karta ma ocenę tempa dla tego pacjenta').toBeTruthy();
    // Werdykt i norma to dwa pola tej samej oceny karty. Opis przepisuje oba, tylko
    // rozdziela je przecinkiem zamiast zagnieżdżać nawias w nawiasie.
    expect(zdanie(wynik, 'tempo'), 'opis cytuje werdykt karty, a nie parafrazuje').toContain(zKarty.short);
    expect(zdanie(wynik, 'tempo'), 'opis podaje normę karty').toContain(zKarty.note);
    // Pełne brzmienie właściciela (2026-09-07), słowo w słowo.
    expect(zdanie(wynik, 'tempo'))
      .toBe('Tempo wzrastania liczone z ostatnich 12 miesięcy obserwacji wynosi 4,0 cm/rok i znajduje się poniżej normy dla wieku (norma ≥5 cm/rok).');
  });

  it('zdanie o tempie nie ma nawiasu w nawiasie', () => {
    // Chłopiec 12 lat, Tanner I — jedyna gałąź, w której karta wkłada nawias w etykietę
    // normy („≥4 cm/rok przed skokiem (Tanner I)"). Bez tego pacjenta test byłby pusty.
    const g = srodowisko({ 'HT|132': -1.2, 'HT|144': -1.8 });
    const { model, wynik } = opis(g, {
      measurements: [{ ageMonths: 132, height: 138 }],
      currentAgeMonths: 144,
      currentHeight: 141,
      sex: 'M',
      source: 'OLAF',
      context: { tannerStage: 1 },
    });

    const glebokoscNawiasow = (txt) => {
      let g2 = 0, max = 0;
      for (const ch of txt) {
        if (ch === '(') max = Math.max(max, ++g2);
        else if (ch === ')') g2 -= 1;
      }
      return { max, bilans: g2 };
    };

    const zKarty = g.VildaTrajectoryAnalysis.velocityAssessment(model.velocity);
    expect(zKarty && zKarty.note, 'karta podaje normę z nawiasem').toContain('(Tanner I)');
    expect(glebokoscNawiasow(zKarty.text).max, 'karta sama zagnieżdża nawias — to jest naprawiane').toBe(2);

    // Kontrola składu: to samo zdanie u nas ma być na jednym poziomie nawiasów.
    const t = zdanie(wynik, 'tempo');
    const skl = glebokoscNawiasow(t);
    expect(skl.max, `zdanie ma zagnieżdżony nawias: ${t}`).toBeLessThanOrEqual(1);
    expect(skl.bilans, 'nawiasy się domykają').toBe(0);
    // Spłaszczenie nie gubi słów karty — zmienia się wyłącznie interpunkcja.
    expect(t).toContain('≥4 cm/rok przed skokiem');
    expect(t).toContain('Tanner I');
  });

  it('każda etykieta słownika karty ma formę zdaniową, żadna nie spada do ramki awaryjnej', () => {
    // Etykiety czytane wprost ze źródła karty — to lista słów, nie kształt logiki.
    // Gdy ktoś dopisze etykietę w karcie, ten test powie, że opis jej nie odmienia.
    // P-WERDYKT rata 1: etykiety werdyktu odcinka mieszkają w silniku (vilda_werdykt.js),
    // reszta (tempo, przebieg) nadal w karcie — opis musi odmieniać jedne i drugie.
    const zrodlo = ['vilda_werdykt.js', 'vilda_trajectory_analysis.js']
      .map((f) => fs.readFileSync(path.join(korzen, f), 'utf8'))
      .join('\n');
    const etykiety = new Set();
    // Etykiety stoją po `l:` wprost albo w wyrażeniu warunkowym (`l: B ? '…' : '…'`),
    // a dwie wspólne (`ST`, `ND`) są zmiennymi — stąd dwa przebiegi.
    // Literał w pojedynczych cudzysłowach z UWZGLĘDNIENIEM ucieczek: etykieta „wskaźnik
    // Cole\'a" urywała się dotąd na odwrotnym ukośniku i test sprawdzał ogryzek zamiast
    // pełnego napisu. Aplikacja ma takich etykiet więcej, więc poprawka jest w czytniku.
    const LITERAL = /'((?:[^'\\]|\\.)*)'/g;
    const odkoduj = (t) => t.replace(/\\(.)/g, '$1');
    for (const m of zrodlo.matchAll(/\bl:\s*([^}]*)\}/g)) {
      for (const q of m[1].matchAll(LITERAL)) etykiety.add(odkoduj(q[1]));
    }
    for (const m of zrodlo.matchAll(/\b(?:ST|ND)\s*=\s*([^;]*);/g)) {
      for (const q of m[1].matchAll(LITERAL)) etykiety.add(odkoduj(q[1]));
    }
    expect(etykiety.size, 'regex znalazł słownik, a nie pustkę').toBeGreaterThanOrEqual(50);

    const g = srodowisko({});
    const spadly = [];
    etykiety.forEach((l) => {
      const k = g.VildaPatientNarrative.konkluzja(l, 'teraz');
      if (k.startsWith(' — ')) spadly.push(l);
    });
    expect(spadly, 'etykiety bez odmiany w opisie').toEqual([]);

    // Kontrola negatywna: etykieta spoza słownika NIE może trafić po „co wskazuje na"
    // w złym przypadku — dostaje bezpieczną ramkę z myślnikiem.
    expect(g.VildaPatientNarrative.konkluzja('nowa etykieta z przyszłości', 'teraz'))
      .toBe(' — nowa etykieta z przyszłości');
  });

  it('etykieta werdyktu przebiegu pochodzi z karty', () => {
    const g = srodowisko({ 'HT|48': 0.4, 'HT|60': 0.3, 'HT|72': 0.25, 'HT|84': 0.2 });
    const { model, wynik } = opis(g, {
      measurements: [
        { ageMonths: 48, height: 104 },
        { ageMonths: 60, height: 110 },
        { ageMonths: 72, height: 116 },
      ],
      currentAgeMonths: 84,
      currentHeight: 122,
      sex: 'M',
      source: 'OLAF',
    });

    const h = model.metrics.filter((m) => m.metric === 'height')[0];
    expect(h.total, 'karta ma werdykt całości').toBeTruthy();
    expect(zdanie(wynik, 'przebieg')).toContain(h.total.l);
  });
});

describe('Kontrola końcowa 2026-09-07 — usterki składu znalezione na siatce', () => {
  it('zero SDS bez znaku, minus typograficzny w liczbach', () => {
    const N = srodowisko({}).VildaPatientNarrative;
    // Znak dopiero po zaokrągleniu: −0,04 to „0,0", nie „−0,0".
    // P-SDS etap 3 (decyzja 4): dwa miejsca po przecinku.
    expect(N.formatSds(-0.004)).toBe('0,00');
    expect(N.formatSds(0.004)).toBe('0,00');
    expect(N.formatSds(-0.06)).toBe('−0,06');
    expect(N.formatSds(0.06)).toBe('+0,06');
    // Ujemne tempo (błąd pomiaru) — łącznik ASCII nie jest minusem.
    const g = srodowisko({ 'HT|72': -0.4, 'HT|84': -0.9 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 118 }],
      currentAgeMonths: 84,
      currentHeight: 117.8,
      sex: 'M',
      source: 'OLAF',
    });
    expect(zdanie(wynik, 'tempo')).toContain('wynosi −0,2 cm/rok');
    expect(zdanie(wynik, 'tempo')).not.toContain('-0,2');
  });

  it('nakładka pozycyjna karty jest opisana jako stan, nie jako zdarzenie', () => {
    // Trzy punkty <3c ze stabilnym torem: karta nakłada „tor stabilny, ale poniżej
    // 3. centyla — niedobór wzrostu" (warn). To nie jest zdarzenie, którego się
    // „zaobserwowano" — zdanie ma mówić o stanie.
    const g = srodowisko({ 'HT|72': -2.4, 'HT|84': -2.4, 'HT|96': -2.4 });
    const { model, wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 104 }, { ageMonths: 84, height: 109 }],
      currentAgeMonths: 96,
      currentHeight: 114,
      sex: 'M',
      source: 'OLAF',
    });
    const h = model.metrics.filter((m) => m.metric === 'height')[0];
    expect(h.total.l, 'karta nałożyła werdykt pozycyjny').toBe('tor stabilny, ale poniżej 3. centyla — niedobór wzrostu');
    expect(zdanie(wynik, 'przebieg')).toContain('; tor jest stabilny, ale poniżej 3. centyla — niedobór wzrostu.');
    expect(zdanie(wynik, 'przebieg')).not.toContain('co wskazuje na tor stabilny');
    // Audyt składu 2026-09-27: stan nie jest zdarzeniem — „W wieku od 7 do 8 lat tor był stabilny,
    // ale poniżej 3. centyla" powtarzało tylko zdanie o przebiegu z węższym oknem.
    expect(zdanie(wynik, 'odcinek'), 'nakładka poziomu nie dostaje zdania o odcinku').toBeNull();
  });

  it('nota karty po skoku pokwitaniowym i flaga poza oknem — dosłownie, bez „wieku chłopca"', () => {
    // Tanner V, 15 lat: karta oddaje notę „po skoku pokwitaniowym (Tanner V) — deceleracja
    // fizjologiczna"; opis ma ją wprowadzić średnikiem, nie drugim myślnikiem.
    const g = srodowisko({ 'HT|168': 0.2, 'HT|180': 0.1 });
    const { model, wynik } = opis(g, {
      measurements: [{ ageMonths: 168, height: 168 }],
      currentAgeMonths: 180,
      currentHeight: 171,
      sex: 'M',
      source: 'OLAF',
      context: { tannerStage: 5 },
    });
    const a = g.VildaTrajectoryAnalysis.velocityAssessment(model.velocity);
    expect(a && a.text, 'karta ma notę Tanner V').toContain('po skoku pokwitaniowym');
    expect(zdanie(wynik, 'tempo')).toContain('cm/rok; po skoku pokwitaniowym (Tanner V) — deceleracja fizjologiczna.');
    expect((zdanie(wynik, 'tempo').match(/ — /g) || []).length, 'jeden myślnik, nie dwa').toBe(1);

    // Chłopiec 17 lat 6 mies. bez Tannera: wiek poza oknem norm — dosłowny tekst karty,
    // bez „wiek chłopca", bo ta sama flaga zapala się także od wieku KOSTNEGO.
    const g2 = srodowisko({ 'HT|198': 0.2, 'HT|210': 0.1 });
    const { model: m2, wynik: w2 } = opis(g2, {
      measurements: [{ ageMonths: 198, height: 174 }],
      currentAgeMonths: 210,
      currentHeight: 175,
      sex: 'M',
      source: 'OLAF',
    });
    expect(m2.velocity.aboveNormAge, 'karta zapaliła aboveNormAge').toBe(true);
    expect(zdanie(w2, 'tempo')).toContain(' — poza oknem automatycznej oceny normy tempa.');
    expect(zdanie(w2, 'tempo')).not.toMatch(/wiek (chłopca|dziewczynki|pacjenta)/);
  });
});

describe('Rozjazd prognozy w czasie — etap 4', () => {
  const DRYF = {
    method: 'Bayley-Pinneau',
    first: { ageMonths: 96, cm: 176 },
    last: { ageMonths: 144, cm: 168 },
    deltaCm: -8,
    yardstickCm: 3.2,
    coverage: 90,
    exceedsOwnInterval: true,
  };

  it('zdanie podaje wielkość zmiany i stawia obok niepewność metody', () => {
    const g = srodowisko({ 'HT|132': -0.4, 'HT|144': -0.5 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 132, height: 138 }],
      currentAgeMonths: 144,
      currentHeight: 141,
      sex: 'M',
      source: 'OLAF',
    }, { predictionDrift: DRYF });

    expect(zdanie(wynik, 'prognozaDryf'))
      .toBe('Prognoza wzrostu ostatecznego metodą Bayley-Pinneau obniżyła się o 8,0 cm w porównaniu z oceną w wieku 8 lat (176 cm → 168 cm) — więcej niż półszerokość przedziału 90% tej metody (±3,2 cm).');
    // Zdanie NIE twierdzi, że zmiana jest istotna — moduł tego nie orzeka, więc opis też nie.
    expect(zdanie(wynik, 'prognozaDryf')).not.toMatch(/istotn|znamienn|nieprawidłow/i);
  });

  it('wzrost prognozy opisany tym samym wzorem, w drugą stronę', () => {
    const g = srodowisko({ 'HT|132': -0.4, 'HT|144': -0.5 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 132, height: 138 }],
      currentAgeMonths: 144,
      currentHeight: 141,
      sex: 'M',
      source: 'OLAF',
    }, { predictionDrift: { ...DRYF, first: { ageMonths: 96, cm: 160 }, last: { ageMonths: 144, cm: 168 }, deltaCm: 8 } });

    expect(zdanie(wynik, 'prognozaDryf')).toContain('podwyższyła się o 8,0 cm');
    expect(zdanie(wynik, 'prognozaDryf')).toContain('(160 cm → 168 cm)');
  });

  it('kontrola negatywna: zmiana w granicach metody nie generuje zdania', () => {
    const g = srodowisko({ 'HT|132': -0.4, 'HT|144': -0.5 });
    const wej = {
      measurements: [{ ageMonths: 132, height: 138 }],
      currentAgeMonths: 144,
      currentHeight: 141,
      sex: 'M',
      source: 'OLAF',
    };
    expect(zdanie(opis(g, wej, { predictionDrift: { ...DRYF, deltaCm: -2, exceedsOwnInterval: false } }).wynik, 'prognozaDryf')).toBeNull();
    // Brak modelu dryfu w ogóle — opis bez tego zdania, bez błędu.
    expect(zdanie(opis(g, wej, {}).wynik, 'prognozaDryf')).toBeNull();
  });

  it('zdanie o dryfie stoi po prognozie, a przed zastrzeżeniami', () => {
    const g = srodowisko({ 'HT|132': -0.4, 'HT|144': -0.5 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 132, height: 138 }],
      currentAgeMonths: 144,
      currentHeight: 141,
      sex: 'M',
      source: 'OLAF',
    }, {
      predictions: [{ label: 'Bayley-Pinneau', cm: 168, errorHalfWidthCm: 3.2 }],
      predictionDrift: DRYF,
      lastMeasuredMonthsAgo: 14,
    });
    const kolejnosc = wynik.sentences.map((z) => z.id);
    expect(kolejnosc.indexOf('prognoza')).toBeLessThan(kolejnosc.indexOf('prognozaDryf'));
    expect(kolejnosc.indexOf('prognozaDryf')).toBeLessThan(kolejnosc.indexOf('zastrzezenia'));
  });
});

describe('Milczenie jest nazwane', () => {
  it('nieaktualne stadium Tannera trafia do zastrzeżeń, a nie do oceny', () => {
    const g = srodowisko({ 'HT|72': -0.4, 'HT|180': -0.5 });
    const { model, wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 180,
      currentHeight: 160,
      sex: 'M',
      source: 'OLAF',
      context: { tannerStage: 1, tannerAtAgeMonths: 100 },
    });

    expect(model.context.tannerStale, 'karta uznała stadium za nieaktualne').toBe(true);
    expect(zdanie(wynik, 'zastrzezenia')).toContain('Zapisane stadium Tannera jest nieaktualne');
    expect(zdanie(wynik, 'dojrzewanie'), 'nieaktualne stadium nie udaje aktualnego').toBeNull();
  });

  it('stary pomiar i stary wiek kostny są odnotowane', () => {
    const g = srodowisko({ 'HT|72': -0.4, 'HT|96': -0.6 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 96,
      currentHeight: 120,
      sex: 'M',
      source: 'OLAF',
    }, { lastMeasuredMonthsAgo: 14, boneAgeYears: 7, boneAgeMonthsAgo: 26 });

    const t = zdanie(wynik, 'zastrzezenia');
    expect(t).toContain('Ostatni pomiar wykonano 14 miesięcy temu.');
    expect(t).toContain('Wiek kostny oznaczono 26 miesięcy temu, dlatego pominięto go w ocenie.');
  });

  it('okno oceny tempa jest w zdaniu o tempie, a nie powtórzone w zastrzeżeniach', () => {
    // Uwaga właściciela (2026-09-07): „Do odnotowania: odstęp pomiarów poza oknem oceny
    // tempa" nic nie wnosiło, bo to samo mówiło już zdanie o tempie.
    const g = srodowisko({ 'HT|84': 0.3, 'HT|108': 0.4 });
    const { model, wynik } = opis(g, {
      measurements: [{ ageMonths: 84, height: 122 }],
      currentAgeMonths: 108,
      currentHeight: 133,
      sex: 'M',
      source: 'OLAF',
    });

    expect(model.velocity.usedLastYear, 'odstęp 24 mies. jest poza oknem karty').toBe(false);
    expect(zdanie(wynik, 'tempo')).toContain('dlatego tempa nie porównano z normą');
    expect(zdanie(wynik, 'zastrzezenia')).toBeNull();
  });

  it('kontrola negatywna: komplet świeżych danych nie generuje zastrzeżeń', () => {
    const g = srodowisko({ 'HT|72': -0.4, 'HT|84': -0.4 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 84,
      currentHeight: 118,
      sex: 'M',
      source: 'OLAF',
    }, { lastMeasuredMonthsAgo: 2, boneAgeYears: 7, boneAgeMonthsAgo: 3 });

    expect(zdanie(wynik, 'zastrzezenia')).toBeNull();
  });
});

describe('Kompozycja — kolejność zdań jest częścią bezpieczeństwa', () => {
  it('fakty otwierają opis, zastrzeżenia go zamykają', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie, { lastMeasuredMonthsAgo: 15 });

    const kolejnosc = wynik.sentences.map((z) => z.id);
    expect(kolejnosc[0], 'najpierw pomiar, nie ocena').toBe('stan');
    expect(kolejnosc[kolejnosc.length - 1], 'zastrzeżenia na końcu').toBe('zastrzezenia');
    expect(kolejnosc.indexOf('przebieg')).toBeLessThan(kolejnosc.indexOf('zastrzezenia'));
  });

  it('opis jest krótki i złożony z całych zdań', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie);

    expect(wynik.sentences.length, 'kilka zdań, nie akapit').toBeLessThanOrEqual(6);
    wynik.sentences.forEach((z) => {
      expect(z.text.endsWith('.'), `zdanie „${z.text}" kończy się kropką`).toBe(true);
      expect(z.text[0]).toBe(z.text[0].toUpperCase());
    });
    expect(wynik.text, 'sklejony tekst to te same zdania').toBe(
      wynik.sentences.map((z) => z.text).join(' '),
    );
  });

  it('BMI dostaje zdanie tylko wtedy, gdy jest o czym mówić', () => {
    // Kontrola negatywna: stabilne BMI nie zaśmieca opisu.
    const g = srodowisko({ 'HT|72': 0, 'HT|84': 0, 'WT|72': 0, 'WT|84': 0, 'BMI|72': 0.1, 'BMI|84': 0.1 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 116, weight: 21 }],
      currentAgeMonths: 84,
      currentHeight: 122,
      currentWeight: 23,
      sex: 'M',
      source: 'OLAF',
    });
    expect(zdanie(wynik, 'masa')).toBeNull();
  });

  it('describe() składa opis wprost z danych wejściowych karty', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const wynik = g.VildaPatientNarrative.describe(
      Object.assign({}, DECELERACJA.wejscie, { boneAgeYears: 5 }),
    );
    expect(wynik).not.toBeNull();
    expect(wynik.sentences.map((z) => z.id)).toContain('wiekKostny');
    expect(wynik.analysisVersion, 'opis niesie wersję karty, z której powstał')
      .toBe(g.VildaTrajectoryAnalysis.version);
  });
});

// Zdanie o utrwalonej niskorosłości po urodzeniu jako SGA (wariant A konsensusu 2023).
// Progi liczy vilda_sga_catchup.js; tutaj sprawdzamy wyłącznie głos i miejsce w opisie.
const SGA_PONIZEJ = {
  kryteriumSga: 'masa',
  masaSdsUr: -2.4,
  dlugoscSdsUr: null,
  tygodnie: 34,
  dni: 2,
  wczesniak: true,
  wiekMies: 50,
  hSds: -2.3,
  prog: -2,
  pasmo: '3-4lata',
  ponizejProgu: true,
};

describe('SGA bez catch-upu — etap 4b', () => {
  it('zdanie nazywa pochodzenie, próg i to, czego dotyczy zalecenie', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie, { sgaCatchUp: SGA_PONIZEJ });
    const t = zdanie(wynik, 'sgaCatchUp');

    expect(t).toMatch(/urodzone jako SGA/);
    expect(t).toMatch(/masa urodzeniowa −2,4 SD/);
    expect(t).toMatch(/34\+2 tc/);
    expect(t).toMatch(/poniżej progu −2,0 SD/);
    expect(t).toMatch(/konsensus międzynarodowy z 2023 roku/);
    expect(t).toMatch(/diagnostykę utrwalonej niskorosłości/);
  });

  it('nie powtarza wieku ani hSDS — to już powiedziało zdanie o stanie', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie, { sgaCatchUp: SGA_PONIZEJ });
    const t = zdanie(wynik, 'sgaCatchUp');
    expect(t).not.toMatch(/W wieku/);
    expect(t, 'hSDS pacjenta należy do zdania o stanie').not.toMatch(/−2,3/);
  });

  it('stoi zaraz po zdaniu o stanie — pochodzenie ramuje resztę opisu', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie, { sgaCatchUp: SGA_PONIZEJ });
    const kolejnosc = wynik.sentences.map((z) => z.id);
    expect(kolejnosc[0]).toBe('stan');
    expect(kolejnosc[1]).toBe('sgaCatchUp');
  });

  it('powyżej progu zdanie nie powstaje — milczenie to konwencja tego silnika', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie, {
      sgaCatchUp: { ...SGA_PONIZEJ, hSds: -0.4, ponizejProgu: false },
    });
    expect(zdanie(wynik, 'sgaCatchUp')).toBeNull();
  });

  it('bez oceny SGA opis wygląda dokładnie tak jak dotąd', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const bez = opis(g, DECELERACJA.wejscie, {});
    const zNull = opis(g, DECELERACJA.wejscie, { sgaCatchUp: null });
    expect(zdanie(bez.wynik, 'sgaCatchUp')).toBeNull();
    expect(zNull.wynik.text).toBe(bez.wynik.text);
  });

});

// Powyżej 4. r.ż. próg jest CENTYLOWY i pochodzi z programu B.64, nie z konsensusu.
// Do SW 1.0.864 zdanie w ogóle tam nie powstawało — czyli milczało na rdzeniowej
// populacji programu. Zgłoszone przez właściciela.
const SGA_B64 = {
  kryteriumSga: 'masa',
  masaSdsUr: -2.4,
  dlugoscSdsUr: null,
  tygodnie: 39,
  dni: 0,
  wczesniak: false,
  wiekMies: 78,
  hSds: -2.4,
  centyl: 0.8,
  konsensus: null,
  b64: {
    progCentyl: 3, centyl: 0.8, ponizej: true, zCentyla: true,
    siatkiPolskie: true, zrodloSiatek: 'PALCZEWSKA',
  },
  prog: null,
  pasmo: 'b64',
  ponizejProgu: true,
};

// 4,5 roku: obowiązują oba kryteria naraz.
const SGA_OBA = {
  ...SGA_B64,
  wiekMies: 54,
  konsensus: { prog: -2, pasmo: '3-4lata', ponizej: true },
};

describe('SGA powyżej 4. roku życia — kryterium programu B.64', () => {
  const zloz = (c) => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie, { sgaCatchUp: c });
    return zdanie(wynik, 'sgaCatchUp');
  };

  it('sześciolatek poniżej 3. centyla dostaje zdanie o programie B.64', () => {
    const t = zloz(SGA_B64);
    expect(t).not.toBeNull();
    expect(t).toMatch(/urodzone jako SGA/);
    expect(t).toMatch(/poniżej 3\. centyla/);
    expect(t).toMatch(/programu lekowego B\.64/);
  });

  it('nie przypisuje progu konsensusowi, który go tam nie definiuje', () => {
    const t = zloz(SGA_B64);
    expect(t).not.toMatch(/konsensus/);
    // Nawias z danymi urodzeniowymi nadal podaje SD — chodzi o BRAK progu w SD.
    expect(t).not.toMatch(/poniżej progu/);
    expect(t).not.toMatch(/diagnostykę utrwalonej niskorosłości/);
  });

  it('samodzielne kryterium B.64 dostaje pełną nazwę programu', () => {
    expect(zloz(SGA_B64)).toMatch(/zbyt małe w porównaniu do czasu trwania ciąży/);
  });

  it('w paśmie 49–60 miesięcy zdanie nazywa OBA kryteria', () => {
    const t = zloz(SGA_OBA);
    expect(t).toMatch(/poniżej progu −2,0 SD/);
    expect(t).toMatch(/konsensus międzynarodowy z 2023 roku/);
    expect(t).toMatch(/a zarazem poniżej 3\. centyla/);
    expect(t).toMatch(/programu lekowego B\.64/);
    // Wersja łączona NIE powtarza pełnej nazwy programu — zdanie i tak jest długie.
    expect(t).not.toMatch(/zbyt małe w porównaniu do czasu trwania ciąży/);
  });

  it('centyl policzony spoza siatek polskich jest nazwany wprost', () => {
    const t = zloz({
      ...SGA_B64,
      b64: { ...SGA_B64.b64, siatkiPolskie: false, zrodloSiatek: 'OLAF' },
    });
    expect(t).toMatch(/wg siatek OLAF/);
    expect(t).toMatch(/siatek dla populacji polskiej/);
  });

  it('kontrola negatywna: przy siatkach polskich dopisku nie ma', () => {
    expect(zloz(SGA_B64)).not.toMatch(/siatek dla populacji polskiej/);
  });

  it('kontrola negatywna: powyżej 3. centyla zdanie nie powstaje', () => {
    expect(zloz({
      ...SGA_B64,
      centyl: 5,
      b64: { ...SGA_B64.b64, centyl: 5, ponizej: false },
      ponizejProgu: false,
    })).toBeNull();
  });

  it('zdanie zestawia kryterium, a NIE orzeka o kwalifikacji do programu', () => {
    const t = zloz(SGA_B64);
    expect(t).not.toMatch(/kwalifikuje/);
    expect(t).not.toMatch(/spełnia kryteria/);
  });
});

describe('SGA bez catch-upu — etap 4b, ciąg dalszy', () => {
  it('dziecko SGA po samej długości urodzeniowej też jest opisane', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie, {
      sgaCatchUp: {
        ...SGA_PONIZEJ, kryteriumSga: 'dlugosc', masaSdsUr: null, dlugoscSdsUr: -2.2,
        tygodnie: 39, dni: 0, wczesniak: false, prog: -2.5, pasmo: '2lata', wiekMies: 30,
      },
    });
    const t = zdanie(wynik, 'sgaCatchUp');
    expect(t).toMatch(/długość urodzeniowa −2,2 SD/);
    expect(t).toMatch(/39 tc/);
    expect(t, 'bez „+0" przy pełnych tygodniach').not.toMatch(/39\+0/);
    expect(t).toMatch(/poniżej progu −2,5 SD/);
  });
});

// ── SDS tempa wzrastania w opisie (zgłoszenie właściciela 2026-09-10) ─────────────────
//
// Karta pacjenta i „Podsumowanie wyników" niosły SDS tempa, a opis kopiowany do
// dokumentacji milczał — i mówił „poza oknem automatycznej oceny normy tempa" nawet wtedy,
// gdy norma prędkości wzrastania istnieje i daje wynik (progi getVelocityThreshold kończą
// się na 10. roku życia, normy HV-SDS sięgają dalej).

describe('SDS tempa wzrastania w opisie', () => {
  it('opis dostaje osobne zdanie, zaraz po zdaniu o tempie', () => {
    const g = srodowisko(DECELERACJA.tabela, { normyTempa: true });
    const { wynik } = opis(g, DECELERACJA.wejscie);

    const t = zdanie(wynik, 'tempo-sds');
    expect(t, 'zdanie o SDS tempa jest').toBeTruthy();
    expect(t)
      .toBe('SDS tempa wzrastania dla wieku i płci wynosi −1,8 (4 centyl) — wg Duran i wsp., J Pediatr Endocrinol Metab 2025.');

    const kolejnosc = wynik.sentences.map((z) => z.id);
    expect(kolejnosc.indexOf('tempo-sds'), 'stoi zaraz po zdaniu o tempie')
      .toBe(kolejnosc.indexOf('tempo') + 1);
    expect(wynik.text, 'wchodzi do kopiowanego akapitu').toContain(t);
  });

  it('liczba jest ta sama, którą karta pokazuje w kafelku i w podsumowaniu', () => {
    const g = srodowisko(DECELERACJA.tabela, { normyTempa: true });
    const { model, wynik } = opis(g, DECELERACJA.wejscie);
    const zKarty = g.VildaTrajectoryAnalysis.hvSdsDlaOpisu(model.velocity, model);
    expect(zKarty).toBeTruthy();
    expect(zdanie(wynik, 'tempo-sds')).toContain(`${zKarty.centylTekst} centyl`);
    expect(Math.round(zKarty.sds * 10) / 10).toBe(-1.8);
  });

  it('gdy SDS się nie liczy, opis milczy — bez komunikatu „nie policzono"', () => {
    // Ten sam pacjent, ale pomiar odniesienia sprzed trzech lat: odstęp wypada poza okno
    // norm HV-SDS. Karta powie dlaczego, notatka do dokumentacji ma o tym nie wspominać.
    const g = srodowisko({ 'HT|48': 0.4, 'HT|84': -1.0 }, { normyTempa: true });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 48, height: 104 }],
      currentAgeMonths: 84,
      currentHeight: 118,
      sex: 'M',
      source: 'OLAF',
    });
    expect(zdanie(wynik, 'tempo'), 'zdanie o samym tempie zostaje').toBeTruthy();
    expect(zdanie(wynik, 'tempo-sds')).toBeNull();
    expect(wynik.text).not.toMatch(/nie policzono/);
    expect(wynik.text).not.toMatch(/SDS tempa/);
  });

  it('bez tablic norm zdania nie ma — opis nie zmyśla liczby', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie);
    expect(zdanie(wynik, 'tempo-sds')).toBeNull();
    expect(zdanie(wynik, 'tempo'), 'reszta opisu bez zmian').toBeTruthy();
  });
});

describe('DOB-AGE-3 — niemowlę opisane w tygodniach, nie w miesiącach', () => {
  // Sześciotygodniowe i czterotygodniowe niemowlę to dla opisu ten sam „1 miesiąc",
  // a klinicznie zupełnie inne dziecko. Tygodnie przychodzą z formularza (VildaDobAge);
  // silnik opisu ich nie liczy, tylko wstawia w dopełniaczu.
  const NIEMOWLE = {
    tabela: { 'HT|0': -0.2, 'HT|1': -0.3, 'WT|1': -0.1 },
    wejscie: {
      measurements: [{ ageMonths: 0, height: 50 }],
      currentAgeMonths: 1,
      currentHeight: 55,
      currentWeight: 4.4,
      sex: 'M',
      source: 'OLAF',
    },
  };

  it('z tygodniami zdanie mówi „w wieku 6 tygodni", nie „1 miesiąca"', () => {
    const g = srodowisko(NIEMOWLE.tabela);
    const { wynik } = opis(g, NIEMOWLE.wejscie, { ageWeeks: 6 });
    const t = zdanie(wynik, 'stan');
    expect(t).toMatch(/^W wieku 6 tygodni chłopiec/);
    expect(t).not.toMatch(/miesiąca/);
  });

  it('bez tygodni zostaje dotychczasowe brzmienie w miesiącach', () => {
    const g = srodowisko(NIEMOWLE.tabela);
    const { wynik } = opis(g, NIEMOWLE.wejscie, {});
    expect(zdanie(wynik, 'stan')).toMatch(/^W wieku 1 miesiąca chłopiec/);
  });

  it('jeden tydzień ma własną formę dopełniacza', () => {
    const g = srodowisko(NIEMOWLE.tabela);
    const { wynik } = opis(g, NIEMOWLE.wejscie, { ageWeeks: 1 });
    expect(zdanie(wynik, 'stan')).toMatch(/^W wieku 1 tygodnia chłopiec/);
  });

  it('powyżej 3. miesiąca tygodnie są ignorowane — miesiąc jest już dobrą jednostką', () => {
    const g = srodowisko({ 'HT|72': -0.3, 'HT|84': -0.4 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 84,
      currentHeight: 118,
      sex: 'M',
      source: 'OLAF',
    }, { ageWeeks: 6 });
    expect(zdanie(wynik, 'stan')).toMatch(/^W wieku 7 lat chłopiec/);
  });

  it('liczba tygodni spoza sensownego zakresu nie wchodzi do zdania', () => {
    const g = srodowisko(NIEMOWLE.tabela);
    for (const zla of [40, -2, Number.NaN, Infinity]) {
      const { wynik } = opis(g, NIEMOWLE.wejscie, { ageWeeks: zla });
      expect(zdanie(wynik, 'stan'), String(zla)).toMatch(/^W wieku 1 miesiąca/);
    }
  });

  it('formatAgeWithWeeks jest czysty i sam pilnuje okna', () => {
    const g = srodowisko(NIEMOWLE.tabela);
    const f = g.VildaPatientNarrative.formatAgeWithWeeks;
    expect(f(1, 6)).toBe('6 tygodni');
    expect(f(0, 2)).toBe('2 tygodni');
    expect(f(2, 13)).toBe('13 tygodni');
    expect(f(3, 13)).toBe('3 miesięcy');
    expect(f(1, 14)).toBe('1 miesiąca');
    expect(f(1, null)).toBe('1 miesiąca');
  });
});


// ── Audyt składu 2026-09-27 — zdania puste, powtórzenia i werdykty karty, których opis nie mówił ──
//
// Przegląd na siatce scenariuszy z PRAWDZIWYMI vilda_werdykt.js, vilda_trajectory_analysis.js
// i vilda_tempo_wzrastania.js. Żaden próg ani werdykt się nie zmienia — zmienia się to, KTÓRE
// z policzonych przez kartę wielkości dostają zdanie i jak są łączone.

describe('Audyt składu 2026-09-27 — opis mówi to, co nagłówek karty', () => {
  it('flaga spadku + ostatnia faza: po zdaniu o fladze idzie zdanie o fazie (plateau), jak nagłówek karty', () => {
    // Rata 5: 75c → 25c w 3 lata, od 2 lat stabilnie. Karta: flaga w dół zostaje, nagłówek = „stabilny tor".
    // Do audytu opis kończył się na spadku sprzed lat i milczał o plateau.
    const M = [84, 96, 108, 120, 132, 144];
    const H = [0.67, 0.40, 0.05, -0.67, -0.64, -0.66];
    const tabela = {};
    M.forEach((m, i) => { tabela[`HT|${m}`] = H[i]; });
    const g = srodowisko(tabela);
    const { model, wynik } = opis(g, {
      measurements: [124, 129, 133, 137, 142].map((h, i) => ({ ageMonths: M[i], height: h })),
      currentAgeMonths: 144,
      currentHeight: 150,
      sex: 'M',
      source: 'OLAF',
    });
    const h = model.metrics.find((m) => m.metric === 'height');
    expect(h.redFlag, 'karta trzyma flagę').not.toBeNull();
    expect(h.naglowek.l, 'nagłówek karty to faza').toBe('stabilny tor wzrastania');
    const t = zdanie(wynik, 'przebieg');
    expect(t).toMatch(/^Od pomiaru w wieku 7 lat pozycja centylowa wzrostu obniżyła się o 1,3 SD/);
    expect(t).toContain(' Od pomiaru w wieku 10 lat wzrost mieści się w kanale 25–50 c. (ΔhSDS +0,01), co wskazuje na stabilny tor wzrastania.');
  });

  it('flaga spadku u dziecka na GH: werdykt odpowiedzi na GH z nagłówka karty nie ginie', () => {
    // Trzy lata na GH, flaga w wariancie P0 (bez nadrabiania): do audytu opis nie miał ANI SŁOWA o GH.
    const g = srodowisko({ 'HT|48': 0.0, 'HT|72': -1.0, 'HT|96': -2.2, 'HT|120': -2.15, 'HT|132': -2.1 });
    const { model, wynik } = opis(g, {
      measurements: [
        { ageMonths: 48, height: 104 }, { ageMonths: 72, height: 113 },
        { ageMonths: 96, height: 120 }, { ageMonths: 120, height: 126 },
      ],
      currentAgeMonths: 132,
      currentHeight: 130,
      sex: 'M',
      source: 'OLAF',
      context: { gh: { a: 96, b: null } },
    });
    const h = model.metrics.find((m) => m.metric === 'height');
    expect(h.naglowek.l).toBe('słaba odpowiedź na GH — do oceny, nadal poniżej 3. centyla');
    expect(zdanie(wynik, 'przebieg'))
      .toContain(' Od pomiaru w wieku 8 lat wzrost mieści się w kanale <3 c. (ΔhSDS +0,10), co wskazuje na słabą odpowiedź na GH — do oceny, nadal poniżej 3. centyla.');
  });

  it('bez fazy w nagłówku zdanie o fladze brzmi jak dotąd', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie);
    expect(zdanie(wynik, 'przebieg'))
      .toBe('Od pomiaru w wieku 4 lat pozycja centylowa wzrostu obniżyła się o 1,4 SD, co wskazuje na decelerację tempa wzrastania.');
  });

  it('aktywne leczenie redukcyjne: zdanie o BMI z okna kursu, także przy dobrej odpowiedzi', () => {
    // Rata 6: nagłówkiem wiersza masy/BMI przy aktywnym kursie jest chip leczenia. Do audytu opis
    // czytał całość i milczał, bo ton „good" nie przechodził przez bramkę „tylko ostrzeżenia".
    const tabela = { 'HT|120': 0, 'HT|126': 0, 'HT|132': 0, 'HT|138': 0,
      'WT|120': 1.9, 'WT|126': 1.95, 'WT|132': 1.6, 'WT|138': 1.3,
      'BMI|120': 2.0, 'BMI|126': 2.05, 'BMI|132': 1.7, 'BMI|138': 1.4 };
    const g = srodowisko(tabela);
    const { model, wynik } = opis(g, {
      measurements: [
        { ageMonths: 120, height: 140, weight: 55 }, { ageMonths: 126, height: 143, weight: 57 },
        { ageMonths: 132, height: 146, weight: 55 },
      ],
      currentAgeMonths: 138,
      currentHeight: 149,
      currentWeight: 54,
      sex: 'M',
      source: 'OLAF',
      context: { red: { a: 126, b: null, label: 'Saxenda' } },
    });
    const b = model.metrics.find((m) => m.metric === 'bmi');
    expect(b.treatment && b.treatment.aktywne, 'karta ma aktywny chip leczenia').toBe(true);
    expect(b.naglowek.l).toBe('redukcja w trakcie leczenia');
    const z = wynik.sentences.find((s) => s.id === 'masa');
    expect(z, 'zdanie o BMI jest mimo dobrej odpowiedzi').toBeTruthy();
    expect(z.tone).toBe('plain');
    expect(z.text).toBe('W okresie leczenia redukcyjnego (Saxenda), od pomiaru w wieku 10 lat i 6 miesięcy, BMI przesunęło się z kanału >97 c. do kanału 90–97 c. (ΔbmiSDS −0,65), co wskazuje na redukcję w trakcie leczenia.');
  });

  it('niemowlę: „od urodzenia do wieku 1 roku", nie „od 0 do 1 lat"', () => {
    const g = srodowisko({ 'HT|0': -0.2, 'HT|12': -0.6 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 0, height: 50 }],
      currentAgeMonths: 12,
      currentHeight: 74,
      sex: 'M',
      source: 'OLAF',
    });
    expect(zdanie(wynik, 'przebieg')).toContain('wzrost chłopca od urodzenia do wieku 1 roku mieści się w kanale');
    expect(zdanie(wynik, 'przebieg')).not.toMatch(/od 0 do|1 lat\b/);
  });

  it('wzrost równy potencjałowi: „odpowiada potencjałowi", nie „0,0 SD powyżej"', () => {
    const g = srodowisko({ 'HT|72': -0.4, 'HT|84': -0.4 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 84,
      currentHeight: 118,
      sex: 'M',
      source: 'OLAF',
      context: { mpSds: -0.4 },
    }, { motherHeight: 158, fatherHeight: 172, mph: 165, mphSds: -0.4 });
    const t = zdanie(wynik, 'potencjal');
    expect(t).toContain('Aktualny wzrost dziecka odpowiada potencjałowi genetycznemu.');
    expect(t).not.toMatch(/0,0 SD/);
  });

  it('norma tempa wg wieku kostnego albo Tannera: „w normie", bez „dla wieku"', () => {
    const g = srodowisko({ 'HT|120': -0.5, 'HT|132': -0.5 });
    const { wynik } = opis(g, {
      measurements: [{ ageMonths: 120, height: 133 }],
      currentAgeMonths: 132,
      currentHeight: 138.5,
      sex: 'M',
      source: 'OLAF',
      context: { boneAge: { baMonths: 108, atAgeMonths: 132 } },
    });
    expect(zdanie(wynik, 'tempo'))
      .toBe('Tempo wzrastania liczone z ostatnich 12 miesięcy obserwacji wynosi 5,5 cm/rok i mieści się w normie (norma ≥5 cm/rok — wg wieku kostnego 9 lat).');
    // Norma z wieku metrykalnego — „dla wieku" zostaje, jak dotąd.
    const g2 = srodowisko({ 'HT|72': -0.4, 'HT|84': -0.4 });
    const { wynik: w2 } = opis(g2, {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 84,
      currentHeight: 118,
      sex: 'M',
      source: 'OLAF',
    });
    expect(zdanie(w2, 'tempo')).toContain('mieści się w normie dla wieku (norma ≥5 cm/rok)');
  });

  it('wiek kostny oznaczony dawniej: porównanie z wiekiem metrykalnym z chwili oznaczenia, w czasie przeszłym', () => {
    const g = srodowisko({ 'HT|72': -0.4, 'HT|96': -0.6 });
    const wej = {
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 96,
      currentHeight: 120,
      sex: 'M',
      source: 'OLAF',
    };
    // 5,5 roku wieku kostnego oznaczone 20 mies. temu, czyli w wieku 6 lat i 4 mies. Do audytu
    // opis porównywał je z DZISIEJSZYM wiekiem (8 lat) i mówił o opóźnieniu 2 lat i 6 mies.
    const { wynik } = opis(g, wej, { boneAgeYears: 5.5, boneAgeMonthsAgo: 20 });
    expect(zdanie(wynik, 'wiekKostny'))
      .toBe('Wiek kostny oceniono na 5 lat i 6 miesięcy przy wieku metrykalnym 6 lat i 4 miesięcy; był on opóźniony o 10 miesięcy.');
    expect(zdanie(wynik, 'zastrzezenia')).toContain('Wiek kostny oznaczono 20 miesięcy temu');
    // Jawny wiek oznaczenia ma pierwszeństwo.
    expect(zdanie(opis(g, wej, { boneAgeYears: 5.5, boneAgeAtAgeMonths: 90 }).wynik, 'wiekKostny'))
      .toBe('Wiek kostny oceniono na 5 lat i 6 miesięcy przy wieku metrykalnym 7 lat i 6 miesięcy; był on opóźniony o 2 lata.');
    // Bez żadnej daty — „teraz", jak dotąd.
    expect(zdanie(opis(g, wej, { boneAgeYears: 7 }).wynik, 'wiekKostny'))
      .toBe('Wiek kostny oceniono na 7 lat przy wieku metrykalnym 8 lat; jest on opóźniony o 1 rok.');
  });
});
