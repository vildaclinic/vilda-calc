import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Przycisk „Kopiuj opis pacjenta" (vilda_patient_narrative_ui.js) — warstwa spinająca
// silnik opisu z danymi karty zaawansowanej. Tu sprawdzamy czystą część: jak z
// window.advancedGrowthData powstaje wejście dla compose(). Przycisk, obserwator karty
// i schowek mają test e2e na prawdziwej stronie (tests/e2e/podsumowanie-opis-schowek).
//
// Zasada: opis ma podawać TE SAME liczby, które epikryza bierze z tych samych pól
// (targetHeight, targetStats.sd, boneAgeMonths, errorSdCm metod). Inna liczba w opisie
// niż w epikryzie byłaby błędem dokumentacji, nie stylu.

function okno() {
  const g = { document: null, navigator: {} };
  loadBrowserScript('vilda_patient_narrative_ui.js', g);
  return g;
}

const DANE = {
  targetHeight: 178.2,
  targetStats: { sd: 0.41, percentile: 66 },
  boneAgeMonths: 66,
  motherHeight: 163,
  fatherHeight: 180,
  // errorSdCm (1 SD) i errorBoundHalfWidthCm (90%) to dwa rozne pola — opis ma brac to
  // drugie, czyli liczbe z karty C. Test trzyma oba, zeby pomylka byla widoczna.
  bayleyPinneau: { available: true, predictedAdultHeightCm: 170.3, errorSdCm: 1.9, errorBoundHalfWidthCm: 3.2 },
  rwt: { available: true, predictedAdultHeightCm: 172.1, errorSdCm: null, errorBoundHalfWidthCm: 4.4 },
  khamis: { available: true, predictedAdultHeightCm: 171 },
  predictionReliability: {
    agreementLabel: 'dobra',
    entryMap: {
      bayleyPinneau: { methodKey: 'bayleyPinneau', methodLabel: 'Bayley-Pinneau', levelKey: 'high', label: 'wysoka' },
      rwt: { methodKey: 'rwt', methodLabel: 'RWT', levelKey: 'moderate', label: 'umiarkowana' },
    },
  },
  finalHeightPrediction: {
    cm: 171,
    agreementLabel: 'dobra',
    methods: [
      { key: 'bayleyPinneau', label: 'Bayley-Pinneau', cm: 170.3 },
      { key: 'rwt', label: 'RWT', cm: 172.1 },
      // Khamis–Roche nie ma błędu na własnym obiekcie — karta C niesie stałą metody w pm.
      { key: 'khamis', label: 'Khamis–Roche', cm: 171, errorHalfWidthCm: 5.3 },
    ],
  },
};

describe('buildInput — wejście opisu z danych karty zaawansowanej', () => {
  it('MPH, mpSDS i wiek kostny idą z tych samych pól, z których czyta epikryza', () => {
    const g = okno();
    const we = g.VildaPatientNarrativeUI.buildInput(DANE, null);

    expect(we.motherHeight).toBe(163);
    expect(we.fatherHeight).toBe(180);
    expect(we.mph).toBe(178.2);
    expect(we.mphSds).toBe(0.41);
    expect(we.boneAgeYears).toBeCloseTo(5.5, 5);
    // Dane z formularza są „teraz" — nie ma czego datować, więc zastrzeżeń o wieku
    // danych opis nie wygeneruje.
    expect(we.boneAgeMonthsAgo).toBeNull();
    expect(we.lastMeasuredMonthsAgo).toBeNull();
  });

  it('prognozy idą w kolejności karty, z błędem metody jak w karcie C (90%) i etykietą wiarygodności', () => {
    const g = okno();
    const we = g.VildaPatientNarrativeUI.buildInput(DANE, null);

    expect(we.predictions.map((p) => p.key)).toEqual(['bayleyPinneau', 'rwt', 'khamis']);
    expect(we.predictions[0]).toEqual({
      key: 'bayleyPinneau', label: 'Bayley-Pinneau', cm: 170.3, errorHalfWidthCm: 3.2, reliabilityLabel: 'wysoka',
    });
    expect(we.predictions[1].reliabilityLabel).toBe('umiarkowana');
    expect(we.predictions[1].errorHalfWidthCm, 'RWT ma przedział z karty C, choć nie ma errorSdCm').toBe(4.4);
    // Khamis–Roche nie ma wpisu w predictionReliability — opis nie może go wymyślić;
    // błąd metody idzie z karty C (pm), etykieta z finalHeightPrediction.
    expect(we.predictions[2]).toEqual({
      key: 'khamis', label: 'Khamis–Roche', cm: 171, errorHalfWidthCm: 5.3, reliabilityLabel: null,
    });
    expect(we.predictionAgreement).toBe('dobra');
  });

  it('bez finalHeightPrediction wraca do BP i RWT — tak jak kolektor epikryzy', () => {
    const g = okno();
    const d = { ...DANE, finalHeightPrediction: null, predictionReliability: null };
    const we = g.VildaPatientNarrativeUI.buildInput(d, null);

    expect(we.predictions.map((p) => p.key)).toEqual(['bayleyPinneau', 'rwt']);
    expect(we.predictions[0].label, 'etykieta awaryjna, gdy karta nie dała własnej').toBe('Bayley-Pinneau');
    expect(we.predictionAgreement).toBeNull();
  });

  it('mpSDS z modelu trajektorii, gdy karta nie policzyła targetStats', () => {
    const g = okno();
    const d = { ...DANE, targetStats: null };
    const we = g.VildaPatientNarrativeUI.buildInput(d, { context: { mpSds: -0.3 } });
    expect(we.mphSds).toBe(-0.3);
  });

  it('kontrola negatywna: pusta karta nie produkuje żadnej liczby', () => {
    const g = okno();
    const we = g.VildaPatientNarrativeUI.buildInput({}, null);
    expect(we.mph).toBeNull();
    expect(we.mphSds).toBeNull();
    expect(we.boneAgeYears).toBeNull();
    expect(we.predictions).toEqual([]);
    expect(we.predictionAgreement).toBeNull();
    // Metoda niedostępna (available !== true) też nie wchodzi do opisu.
    // Bez errorBoundHalfWidthCm nie ma „±" — errorSdCm NIE jest zamiennikiem (inna wielkość).
    const we3 = g.VildaPatientNarrativeUI.buildInput({ bayleyPinneau: { available: true, predictedAdultHeightCm: 170, errorSdCm: 2 } }, null);
    expect(we3.predictions[0].errorHalfWidthCm).toBeNull();
    const we2 = g.VildaPatientNarrativeUI.buildInput({ bayleyPinneau: { available: false, predictedAdultHeightCm: 170 } }, null);
    expect(we2.predictions).toEqual([]);
  });

  it('describeCurrent() nazywa brak modelu zamiast milczeć', () => {
    const g = okno();
    // Bez modułu opisu:
    expect(g.VildaPatientNarrativeUI.describeCurrent().reason).toContain('nie został załadowany');
    // Z modułem, ale bez modelu trajektorii i bez karty, która mogłaby go policzyć:
    loadBrowserScript('vilda_trajectory_analysis.js', g);
    loadBrowserScript('vilda_patient_narrative.js', g);
    const wynik = g.VildaPatientNarrativeUI.describeCurrent();
    expect(wynik.text).toBeNull();
    expect(wynik.reason).toContain('co najmniej dwóch pomiarów');
  });
});

// SGA bez catch-upu — adapter spina trzy źródła: stan karty urodzeniowej (albo wartość
// przeniesioną z rekordu), silnik SDS urodzeniowych i moduł progów. Testy pilnują reguły
// wyboru źródła, bo od niej zależy, czy opis mówi to samo na index.html i na docpro.html.

const MODEL_Z_WZROSTEM = {
  metrics: [
    { metric: 'weight', last: { value: 15, sd: -1.2, c: 11, ageMonths: 50 } },
    { metric: 'height', last: { value: 96, sd: -2.3, c: 1.1, ageMonths: 50 } },
  ],
};

const KARTA_Z_DANYMI = {
  sourceKeys: ['niklasson'], sex: 'male',
  weeks: '34', days: '2', weight: '1850', length: '43', head: '31',
};

const PUSTA_KARTA = { sourceKeys: ['niklasson'], sex: '', weeks: '', days: '0', weight: '', length: '', head: '' };

function oknoSga(g, { karta, przeniesione } = {}) {
  g.VildaSgaBirth = {
    compute: (klucz, we) => {
      g.__computeWolane = { klucz, we };
      return { sourceShortLabel: 'Niklasson', weightSds: -2.4, lengthSds: -1.8, headSds: -1.1 };
    },
  };
  g.VildaSgaCatchUp = {
    ocen: (we) => { g.__ocenWolane = we; return { ponizejProgu: true, prog: -2, ...we }; },
  };
  if (karta) g.vildaSgaBirthPersistApi = { captureState: () => karta };
  if (przeniesione) g.vildaBirthData = przeniesione;
  return g;
}

describe('buildInput — ocena SGA bez catch-upu', () => {
  it('bierze stan karty urodzeniowej, gdy ta niesie dane', () => {
    const g = oknoSga(okno(), { karta: KARTA_Z_DANYMI });
    const we = g.VildaPatientNarrativeUI.buildInput({}, MODEL_Z_WZROSTEM);
    expect(we.sgaCatchUp).not.toBeNull();
    expect(g.__computeWolane.we.weeks).toBe('34');
    expect(g.__ocenWolane.masaSdsUr).toBe(-2.4);
    expect(g.__ocenWolane.tygodnie).toBe('34');
    // Wiek i hSDS z metryki WYSOKOŚCI, nie z pierwszej metryki na liście.
    expect(g.__ocenWolane.wiekMies).toBe(50);
    expect(g.__ocenWolane.hSds).toBe(-2.3);
  });

  it('bez karty schodzi na wartość przeniesioną z rekordu — to samo zdanie na obu stronach', () => {
    const g = oknoSga(okno(), { przeniesione: KARTA_Z_DANYMI });
    g.VildaPatientNarrativeUI.buildInput({}, MODEL_Z_WZROSTEM);
    expect(g.__computeWolane.we.weeks).toBe('34');
  });

  it('pusta karta nie wygrywa z wartością przeniesioną', () => {
    const g = oknoSga(okno(), { karta: PUSTA_KARTA, przeniesione: { ...KARTA_Z_DANYMI, weeks: '36' } });
    g.VildaPatientNarrativeUI.buildInput({}, MODEL_Z_WZROSTEM);
    expect(g.__computeWolane.we.weeks).toBe('36');
  });

  it('bez danych urodzeniowych, bez silnika albo bez pomiaru wzrostu — po prostu null', () => {
    expect(oknoSga(okno()).VildaPatientNarrativeUI.buildInput({}, MODEL_Z_WZROSTEM).sgaCatchUp)
      .toBeNull();
    const bezSilnika = okno();
    bezSilnika.vildaBirthData = KARTA_Z_DANYMI;
    bezSilnika.VildaSgaCatchUp = { ocen: () => ({}) };
    expect(bezSilnika.VildaPatientNarrativeUI.buildInput({}, MODEL_Z_WZROSTEM).sgaCatchUp)
      .toBeNull();
    const bezWzrostu = oknoSga(okno(), { karta: KARTA_Z_DANYMI });
    expect(bezWzrostu.VildaPatientNarrativeUI.buildInput({}, { metrics: [] }).sgaCatchUp)
      .toBeNull();
    expect(bezWzrostu.VildaPatientNarrativeUI.buildInput({}, null).sgaCatchUp).toBeNull();
  });

  it('wyjątek silnika SDS nie wywraca całego opisu', () => {
    const g = oknoSga(okno(), { karta: KARTA_Z_DANYMI });
    g.VildaSgaBirth = { compute: () => { throw new Error('silnik padł'); } };
    expect(() => g.VildaPatientNarrativeUI.buildInput({}, MODEL_Z_WZROSTEM)).not.toThrow();
    expect(g.VildaPatientNarrativeUI.buildInput({}, MODEL_Z_WZROSTEM).sgaCatchUp).toBeNull();
  });

  it('błąd SDS z karty (np. wiek ciążowy poza zakresem źródła) też daje null', () => {
    const g = oknoSga(okno(), { karta: KARTA_Z_DANYMI });
    g.VildaSgaBirth = { compute: () => ({ error: 'Źródło nie obejmuje podanego wieku ciążowego.' }) };
    expect(g.VildaPatientNarrativeUI.buildInput({}, MODEL_Z_WZROSTEM).sgaCatchUp).toBeNull();
  });
});
