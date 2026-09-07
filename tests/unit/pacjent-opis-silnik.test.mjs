import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

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
    expect(t).toMatch(/^Wzrost 118 cm \([^)]*hSDS −0,4[^)]*\)/);
    expect(t, 'masa i BMI w tej samej linii').toContain('masa 22,5 kg');
    expect(t).toContain('BMI');
    expect(t.endsWith('.'), 'zdanie kończy się kropką').toBe(true);
  });

  it('deceleracja opisana jak w karcie, z punktem odniesienia i wielkością spadku', () => {
    const g = srodowisko(DECELERACJA.tabela);
    const { wynik } = opis(g, DECELERACJA.wejscie);

    expect(zdanie(wynik, 'przebieg'))
      .toBe('Od pomiaru w wieku 4 lata pozycja centylowa wzrostu obniżyła się o 1,4 SD — obraz deceleracji wzrastania.');
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
      .toBe('Wiek kostny 6 lat wobec wieku metrykalnego 7 lat 4 mies. — opóźniony o 1 rok 4 mies.');
    // Skrót „mies." niesie własną kropkę — druga byłaby błędem zapisu w karcie.
    expect(zdanie(wynik, 'wiekKostny').endsWith('mies..'), 'zdublowana kropka').toBe(false);
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
    expect(t).toContain('Wzrost rodziców: matka 160 cm, ojciec 175 cm.');
    expect(t).toContain('MPH 161 cm (mpSDS +0,8).');
    expect(t).toContain('Aktualny wzrost dziecka 1,2 SD poniżej potencjału rodzinnego.');
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
      .toBe('Prognozowany wzrost ostateczny 168 cm (Bayley-Pinneau, ±3,2 cm, wiarygodność wysoka), 171 cm (RWT, ±4,4 cm) — zgodność metod dobra.');
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
    expect(zdanie(wynik, 'zastrzezenia')).toContain('stadium Tannera nieaktualne');
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
    expect(t).toContain('ostatni pomiar sprzed 14 mies.');
    expect(t).toContain('wiek kostny oznaczony 26 mies. temu');
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
