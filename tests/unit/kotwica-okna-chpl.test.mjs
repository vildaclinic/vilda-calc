import { describe, expect, it } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KOTWICA (2026-09-20, akceptacja kliniczna właściciela).
//
// DEFEKT. `obesity_response_criteria.js` od P-CHPL niesie w danych `windowAnchor` — informację,
// OD CZEGO ChPL liczy okno oceny odpowiedzi. Funkcja `evaluate()` tego pola NIGDY nie czytała:
// brała `weeks` od wołającego i porównywała z `windowWeeks`. Jedyny wołający w repozytorium
// (Karta Pacjenta, `vilda_auth_ui.js`) liczy tygodnie OD WŁĄCZENIA leczenia. Skutkiem był
// twardy werdykt „wg ChPL odstawić i ponownie ocenić" wydawany za wcześnie:
//   • liraglutyd u dorosłego — o 4 tygodnie (ChPL: 12 tyg. na dawce 3,0 mg/dobę),
//   • semaglutyd u młodzieży — o 16 tygodni (ChPL: 12 tyg. na dawce 2,4 mg).
//
// Testy wołają PRAWDZIWE `ObesityResponseCriteria.evaluate` i `getCriterion`.

const K = () => loadBrowserScript('obesity_response_criteria.js', {}).ObesityResponseCriteria;

const ocen = (lek, wiek, opts) => {
  const api = K();
  return api.evaluate(api.getCriterion(lek, '', wiek), opts);
};

describe('P-KOTWICA — okno liczy się od kotwicy, nie zawsze od włączenia', () => {
  it('liraglutyd u dorosłego: w 12. tygodniu OD WŁĄCZENIA nie wolno jeszcze orzekać', () => {
    // To jest dokładnie ten przypadek, w którym aplikacja mówiła „odstawić".
    const w = ocen('Saxenda', 40, { weeks: 12, massPct: -3 });
    expect(w.status, 'trwa jeszcze zwiększanie dawki + okno').toBe('before-window');
    expect(w.windowAnchor).toBe('dawka-podtrzymujaca');
    expect(w.weeks, '12 tyg. od włączenia to 8 tyg. od dawki podtrzymującej').toBe(8);
    expect(w.weeksFromStart).toBe(12);
  });

  it('liraglutyd u dorosłego: okno otwiera się w 16. tygodniu od włączenia', () => {
    expect(ocen('Saxenda', 40, { weeks: 16, massPct: -3 }).status, 'poniżej progu').toBe('fail-stop');
    expect(ocen('Saxenda', 40, { weeks: 16, massPct: -6 }).status, 'powyżej progu').toBe('pass');
    expect(ocen('Saxenda', 40, { weeks: 15, massPct: -3 }).status, 'tydzień wcześniej jeszcze nie').toBe('before-window');
  });

  it('semaglutyd u młodzieży: okno otwiera się w 28. tygodniu, nie w 12.', () => {
    // 16 tyg. zwiększania dawki do 2,4 mg + 12 tyg. stosowania tej dawki.
    expect(ocen('Wegovy', 15, { weeks: 12, bmiPct: -3 }).status).toBe('before-window');
    expect(ocen('Wegovy', 15, { weeks: 27, bmiPct: -3 }).status).toBe('before-window');
    expect(ocen('Wegovy', 15, { weeks: 28, bmiPct: -3 }).status).toBe('fail-stop');
    expect(ocen('Wegovy', 15, { weeks: 28, bmiPct: -6 }).status).toBe('pass');
  });

  it('rzeczywista data dawki podtrzymującej wygrywa z nominalną', () => {
    // Pacjent, u którego zwiększanie dawki trwało 8 tygodni zamiast 4 — kotwica nominalna
    // orzekłaby o 4 tygodnie za wcześnie. Podana wprost liczba tygodni na dawce rozstrzyga.
    const w = ocen('Saxenda', 40, { weeks: 20, weeksFromAnchor: 12, massPct: -3 });
    expect(w.anchorMode).toBe('rzeczywista');
    expect(w.weeks).toBe(12);
    expect(w.weeksFromStart).toBe(20);
    expect(w.status).toBe('fail-stop');

    const wczesniej = ocen('Saxenda', 40, { weeks: 20, weeksFromAnchor: 11, massPct: -3 });
    expect(wczesniej.status, '11 tyg. na dawce to jeszcze nie okno').toBe('before-window');
  });

  it('wynik NAZYWA, czy kotwica była rzeczywista, czy nominalna', () => {
    // Bez tego werdykt wygląda na twardy fakt z rekordu pacjenta, a jest odczytem
    // harmonogramu zwiększania dawki z ChPL.
    const nom = ocen('Saxenda', 40, { weeks: 16, massPct: -3 });
    expect(nom.anchorMode).toBe('nominalna');
    expect(nom.titrationWeeksNominal).toBe(4);

    const rz = ocen('Saxenda', 40, { weeks: 16, weeksFromAnchor: 12, massPct: -3 });
    expect(rz.anchorMode).toBe('rzeczywista');
  });

  it('kotwica w rozpoczęciu leczenia działa jak dotąd — Mysimba bez zmian', () => {
    const w = ocen('Mysimba', 40, { weeks: 16, massPct: -3 });
    expect(w.anchorMode).toBe('start');
    expect(w.weeks).toBe(16);
    expect(w.status).toBe('fail-stop');
    expect(ocen('Mysimba', 40, { weeks: 15, massPct: -3 }).status).toBe('before-window');
    expect(ocen('Mysimba', 40, { weeks: 16, massPct: -6 }).status).toBe('pass');
  });

  it('leki bez progu ChPL nadal nie dostają żadnego okna', () => {
    for (const lek of ['Wegovy', 'Mounjaro']) {
      expect(ocen(lek, 40, { weeks: 99, massPct: -1 }).status, lek).toBe('clinical');
    }
  });

  it('brak tygodni to brak oceny — nigdy fail-stop', () => {
    expect(ocen('Saxenda', 40, { massPct: -3 }).status).toBe('insufficient-data');
    expect(ocen('Mysimba', 40, { massPct: -3 }).status).toBe('insufficient-data');
  });

  it('kotwica bez nominalnego czasu zwiększania dawki nie orzeka, tylko prosi o dane', () => {
    // Gdyby kiedyś doszła grupa z kotwicą w dawce podtrzymującej i bez nominalnej titracji,
    // silnik nie może po cichu wrócić do liczenia od włączenia.
    const api = K();
    const kryt = {
      drugKey: 'test',
      group: { metric: 'massPct', windowWeeks: 12, thresholdPct: 5, hardStop: true, windowAnchor: 'dawka-podtrzymujaca' },
    };
    const w = api.evaluate(kryt, { weeks: 40, massPct: -1 });
    expect(w.status).toBe('insufficient-data');
    expect(w.anchorMode).toBe('brak-kotwicy');
    expect(w.reason).toContain('dawki podtrzymującej');
  });
});

describe('P-KOTWICA — nominalny czas titracji zgadza się z tabelą dawkowania', () => {
  // Strażnik MIĘDZY PLIKAMI. `titrationWeeksNominal` w kryteriach i tabela `escalation`
  // w `obesity_therapy.js` opisują ten sam fakt z ChPL. Rozjazd między nimi nie wywaliłby
  // żadnego testu funkcjonalnego — zmieniłby tylko moment, w którym aplikacja każe odstawić lek.
  const TER = zrodlo('obesity_therapy.js').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)));

  /** Tydzień, w którym wg tabeli dawkowania zaczyna się dawka podtrzymująca. */
  function tydzienDawkiPodtrzymujacej(klucz) {
    const i = TER.indexOf(klucz + ':{');
    expect(i, 'preparat ' + klucz + ' jest w tabelach dawkowania').toBeGreaterThan(-1);
    const blok = TER.slice(i, i + 3000);
    const wiersze = blok.match(/\{label:"[^"]*",dose:"[^"]*",note:"[^"]*"\}/g) || [];
    const podtrzymujaca = wiersze.find((w) => /note:"dawka podtrzymuj/.test(w));
    expect(podtrzymujaca, 'w tabeli ' + klucz + ' jest wiersz dawki podtrzymującej').toBeTruthy();
    const label = podtrzymujaca.match(/label:"([^"]*)"/)[1];
    const liczby = label.match(/\d+/g);
    expect(liczby, 'etykieta „' + label + '" niesie numer tygodnia').toBeTruthy();
    return Number(liczby[liczby.length - 1]);
  }

  it.each([
    ['wegovy', 'wegovy-12-17', 16],
    ['saxenda', 'saxenda-adult', 4],
    ['saxenda', 'saxenda-12-17', 4],
    ['saxenda', 'saxenda-6-11', 4],
  ])('%s: nominalna titracja grupy %s = %i tyg. i zgadza się z tabelą', (preparat, idGrupy, oczekiwane) => {
    const api = K();
    const grupa = api.CRITERIA.flatMap((d) => d.groups).find((g) => g.id === idGrupy);
    expect(grupa, idGrupy).toBeTruthy();
    expect(grupa.windowAnchor).toBe('dawka-podtrzymujaca');
    expect(grupa.titrationWeeksNominal).toBe(oczekiwane);
    // Tabela mówi „od tygodnia N", czyli zwiększanie dawki trwało N−1 tygodni.
    expect(tydzienDawkiPodtrzymujacej(preparat) - 1,
      'tabela dawkowania ' + preparat + ' i kryteria ' + idGrupy + ' muszą mówić to samo').toBe(oczekiwane);
  });

  it('każda grupa z kotwicą w dawce podtrzymującej ma nominalną titrację', () => {
    const api = K();
    const zKotwica = api.CRITERIA.flatMap((d) => d.groups)
      .filter((g) => g.windowAnchor === 'dawka-podtrzymujaca');
    expect(zKotwica.length, 'są takie grupy').toBeGreaterThanOrEqual(4);
    for (const g of zKotwica) {
      expect(typeof g.titrationWeeksNominal, g.id).toBe('number');
      expect(g.titrationWeeksNominal, g.id).toBeGreaterThan(0);
    }
  });
});

describe('P-KOTWICA — Karta Pacjenta nazywa kotwicę i założenie', () => {
  const UI = zrodlo('vilda_auth_ui.js');

  it('fraza o tygodniach mówi, że chodzi o dawkę podtrzymującą', () => {
    // Po zmianie `f.weeks` liczy się od kotwicy. Gołe „12 tyg." czytałoby się jak tygodnie
    // od włączenia — czyli dokładnie jak błąd, który ta rata usuwa.
    expect(UI).toContain('f.windowAnchor==="dawka-podtrzymujaca"');
    expect(UI).toContain('tyg. stosowania dawki podtrzymuj\\u0105cej');
  });

  it('w trakcie zwiększania dawki nie pokazuje ujemnego numeru tygodnia', () => {
    expect(UI).toContain('Trwa zwi\\u0119kszanie dawki');
  });

  it('założenie nominalnej titracji jest wypisane przy werdykcie', () => {
    expect(UI).toContain('f.anchorMode==="nominalna"');
    expect(UI).toContain('Okno liczone od nominalnego czasu zwi\\u0119kszania dawki wg ChPL');
  });
});
