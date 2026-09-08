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
//  2. parytetu — ocena tempa i etykiety werdyktów pochodzą DOSŁOWNIE z karty
//     (vilda_trajectory_analysis.js), więc opis nie może powiedzieć czegoś innego
//     niż karta o tym samym pacjencie;
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
function srodowisko(tabela) {
  const g = {
    bmiSource: 'OLAF',
    advHistoryResolveMetric(param, value, sex, ageYears, source) {
      const key = `${param}|${Math.round(ageYears * 12)}`;
      if (!(key in tabela)) return { result: null, source: null, reason: '' };
      const sd = tabela[key];
      return { result: { percentile: centileFromSds(sd), sd }, source, reason: '' };
    },
    // Karta liczy tempo przez te trzy funkcje globalne aplikacji — atrapy odwzorowują
    // ich kontrakt, żeby test szedł prawdziwą ścieżką velocityAssessment, a nie obok niej.
    velocityCmPerYear(h1, m1, h2, m2) {
      const lata = (m2 - m1) / 12;
      return lata > 0 ? Math.round(((h2 - h1) / lata) * 10) / 10 : null;
    },
    pickPrevForLastYear(hist, target, minM, idealM, tolM) {
      const ok = hist.filter((p) => target - p.ageMonths >= minM
        && Math.abs(target - p.ageMonths - idealM) <= Math.max(idealM - minM, tolM));
      return ok.length ? ok[ok.length - 1] : null;
    },
    pickPrevFallback(hist, target, minM) {
      const ok = hist.filter((p) => target - p.ageMonths >= minM);
      return ok.length ? ok[ok.length - 1] : null;
    },
    // Norma tempa dla wieku metrykalnego <10 lat — atrapa oddaje kontrakt aplikacji
    // {threshold, label}; wartość dobrana pod scenariusz testu, nie jest progiem klinicznym.
    getVelocityThreshold(ageMonths) {
      if (ageMonths >= 120) return null;
      return { threshold: 5.5, label: '≥5,5 cm/rok' };
    },
  };
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

  it('werdykt odcinka otwiera zdanie w bierniku, tak jak pisze endokrynolog', () => {
    // Brzmienie właściciela (2026-09-07): „Istotną decelerację wzrastania zaobserwowano
    // pomiędzy 5 a 6 rokiem życia" — etykieta karty jest w mianowniku, zdanie wymaga
    // biernika i przedziału wieku bez liczebników porządkowych.
    const g = srodowisko(DECELERACJA.tabela);
    const { model, wynik } = opis(g, DECELERACJA.wejscie);

    const h = model.metrics.filter((m) => m.metric === 'height')[0];
    expect(h.worst.verdict.l, 'karta daje etykietę w mianowniku').toBe('istotna deceleracja wzrastania');
    expect(zdanie(wynik, 'odcinek'))
      .toBe('Istotną decelerację wzrastania zaobserwowano w wieku od 5 do 6 lat (ΔhSDS −1,2).');
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
      .toBe('Z analizy siatki centylowej wynika, że wzrost chłopca w wieku od 7 do 9 lat mieści się w kanale 50–75 c. (ΔhSDS +0,1), co wskazuje na stabilny tor wzrastania.');
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
    expect(t).toContain('Wzrost matki wynosi 160 cm, ojca 175 cm; potencjał genetyczny wzrostu (MPH) oceniono na 161 cm (±8,5 cm, mpSDS +0,8).');
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
      .toBe('Tempo wzrastania liczone z ostatnich 12 miesięcy obserwacji wynosi 4,0 cm/rok i znajduje się poniżej normy dla wieku (norma ≥5,5 cm/rok).');
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
    const zrodlo = fs.readFileSync(path.join(korzen, 'vilda_trajectory_analysis.js'), 'utf8');
    const etykiety = new Set();
    // Etykiety stoją po `l:` wprost albo w wyrażeniu warunkowym (`l: B ? '…' : '…'`),
    // a dwie wspólne (`ST`, `ND`) są zmiennymi — stąd dwa przebiegi.
    for (const m of zrodlo.matchAll(/\bl:\s*([^}]*)\}/g)) {
      for (const q of m[1].matchAll(/'([^']+)'/g)) etykiety.add(q[1]);
    }
    for (const m of zrodlo.matchAll(/\b(?:ST|ND)\s*=\s*([^;]*);/g)) {
      for (const q of m[1].matchAll(/'([^']+)'/g)) etykiety.add(q[1]);
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
    expect(N.formatSds(-0.04)).toBe('0,0');
    expect(N.formatSds(0.04)).toBe('0,0');
    expect(N.formatSds(-0.06)).toBe('−0,1');
    expect(N.formatSds(0.06)).toBe('+0,1');
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
    if (zdanie(wynik, 'odcinek')) {
      expect(zdanie(wynik, 'odcinek')).toMatch(/^W wieku od .* tor był stabilny, ale poniżej 3\. centyla — niedobór wzrostu\.$/);
      expect(zdanie(wynik, 'odcinek')).not.toContain('zaobserwowano');
    }
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
