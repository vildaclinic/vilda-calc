import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-CHPL: kryteria oceny odpowiedzi na farmakoterapię otyłości, sprawdzone wobec ChPL
// przysłanych przez właściciela 2026-09-19 (Wegovy 14.07.2026, Triglyva/liraglutyd 10.04.2026,
// Mysimba, Mounjaro). Testy wołają PRAWDZIWĄ funkcję produkcyjną `ObesityResponseCriteria.evaluate`.
//
// Co ten plik pilnuje i dlaczego:
//
//  1. Dwa z czterech leków NIE MAJĄ w ChPL progu skuteczności dla dorosłych (Wegovy, Mounjaro).
//     Aplikacja podawała dla tirzepatydu regułę „<5 % po 6 mies. (wg ChPL)", której w ChPL nie ma
//     — przypisywała dokumentowi rejestracyjnemu treść spoza niego. Test nie przepuści powrotu progu.
//  2. Dwa pozostałe mają nakaz TWARDY („należy przerwać" / „należy odstawić"), nie „rozważyć".
//     Aplikacja łagodziła nakaz liraglutydu w warstwie UI.
//  3. Okno oceny liczy się od RÓŻNYCH momentów: liraglutyd i semaglutyd od dawki podtrzymującej,
//     Mysimba od rozpoczęcia. ChPL liraglutydu definiuje to wprost (5.1: „zwiększanie dawki przez
//     4 tygodnie, a następnie stosowanie dawki terapeutycznej przez 12 tygodni").
//  4. Zdania dla lekarza mają JEDNO źródło — ten moduł. `obesity_therapy.js` nie może trzymać kopii.

let K;
beforeAll(() => {
  K = loadBrowserScript('obesity_response_criteria.js', {}).ObesityResponseCriteria;
});

const grupa = (lek, wiek) => K.getCriterion(lek, '', wiek);
const ocen = (lek, wiek, dane) => K.evaluate(grupa(lek, wiek), dane);

describe('Leki BEZ progu skuteczności w ChPL dla dorosłych', () => {
  it.each([['Wegovy', 'semaglutyd'], ['Mounjaro', 'tirzepatyd']])(
    '%s: brak progu, brak okna, brak twardego stopu',
    (nazwa) => {
      const g = grupa(nazwa, 40).group;
      expect(g.thresholdPct, 'próg ChPL musi zostać pusty').toBeNull();
      expect(g.windowWeeks, 'ChPL nie podaje terminu oceny').toBeNull();
      expect(g.hardStop).toBe(false);
      expect(g.metric).toBe('clinical');
    },
  );

  it.each(['Wegovy', 'Mounjaro'])(
    '%s: ocena zawsze oddaje „clinical" — niezależnie od tygodni i ubytku masy',
    (nazwa) => {
      for (const dane of [{ weeks: 12, massPct: -1 }, { weeks: 26, massPct: -4.9 },
        { weeks: 52, massPct: -20 }, {}]) {
        expect(ocen(nazwa, 40, dane).status).toBe('clinical');
      }
    },
  );

  it('tirzepatyd nie odtwarza progu 5 % po 26 tyg. pod żadną nazwą', () => {
    for (const nazwa of ['Mounjaro', 'tirzepatyd', 'tirzepatide']) {
      const g = grupa(nazwa, 40).group;
      expect(g.thresholdPct).toBeNull();
      expect(g.windowWeeks).not.toBe(26);
    }
  });
});

describe('Leki z TWARDYM nakazem odstawienia', () => {
  it('liraglutyd 3,0 mg u dorosłych: 12 tyg., ≥5 % początkowej masy, twardy stop', () => {
    const g = grupa('Saxenda', 40).group;
    expect(g.thresholdPct).toBe(5);
    expect(g.windowWeeks).toBe(12);
    expect(g.metric).toBe('massPct');
    expect(g.hardStop, 'ChPL: „Należy przerwać leczenie" — nie „rozważyć"').toBe(true);

    expect(ocen('Saxenda', 40, { weeks: 12, massPct: -5.0 }).status).toBe('pass');
    expect(ocen('Saxenda', 40, { weeks: 12, massPct: -4.9 }).status).toBe('fail-stop');
    expect(ocen('Saxenda', 40, { weeks: 11, massPct: -1 }).status).toBe('before-window');
  });

  it('naltrekson/bupropion: 16 tyg., ≥5 % początkowej masy, twardy stop', () => {
    const g = grupa('Mysimba', 40).group;
    expect(g.thresholdPct).toBe(5);
    expect(g.windowWeeks).toBe(16);
    expect(g.hardStop).toBe(true);

    expect(ocen('Mysimba', 40, { weeks: 16, massPct: -6 }).status).toBe('pass');
    expect(ocen('Mysimba', 40, { weeks: 16, massPct: -4 }).status).toBe('fail-stop');
    expect(ocen('Mysimba', 40, { weeks: 15, massPct: -4 }).status).toBe('before-window');
  });

  it('żaden dorosły nie dostaje statusu „fail-benefit-risk" — to był ślad reguły spoza ChPL', () => {
    for (const nazwa of ['Wegovy', 'Saxenda', 'Mysimba', 'Mounjaro']) {
      for (const w of [12, 16, 26, 52]) {
        expect(ocen(nazwa, 40, { weeks: w, massPct: -1 }).status).not.toBe('fail-benefit-risk');
      }
    }
  });
});

describe('Kryteria pediatryczne zostają nietknięte', () => {
  it('semaglutyd 12–17 lat: BMI ≥5 % po 12 tyg., twardy stop', () => {
    const g = grupa('Wegovy', 15).group;
    expect(g.thresholdPct).toBe(5);
    expect(g.metric, 'ChPL mierzy u młodzieży BMI, nie masę ciała').toBe('bmiPct');
    expect(g.windowWeeks).toBe(12);
    expect(g.hardStop).toBe(true);
    expect(ocen('Wegovy', 15, { weeks: 12, bmiPct: -5 }).status).toBe('pass');
    expect(ocen('Wegovy', 15, { weeks: 12, bmiPct: -4 }).status).toBe('fail-stop');
  });

  it.each([[8, 'saxenda-6-11'], [15, 'saxenda-12-17']])(
    'liraglutyd, wiek %i: BMI albo Z-score ≥4 %% po 12 tyg.',
    (wiek, id) => {
      const g = grupa('Saxenda', wiek).group;
      expect(g.id).toBe(id);
      expect(g.thresholdPct).toBe(4);
      expect(g.metric).toBe('bmiPctOrZscore');
      expect(g.hardStop).toBe(true);
    },
  );
});

describe('Kotwica okna oceny', () => {
  it.each([
    ['Saxenda', 40, 'dawka-podtrzymujaca'],
    ['Wegovy', 15, 'dawka-podtrzymujaca'],
    ['Mysimba', 40, 'start'],
  ])('%s (wiek %i): okno liczone od „%s"', (nazwa, wiek, kotwica) => {
    expect(grupa(nazwa, wiek).group.windowAnchor).toBe(kotwica);
  });

  it('grupa bez okna nie ma też kotwicy', () => {
    for (const nazwa of ['Wegovy', 'Mounjaro']) {
      const g = grupa(nazwa, 40).group;
      expect(g.windowWeeks).toBeNull();
      expect(g.windowAnchor).toBeNull();
    }
  });
});

describe('Zdania dla lekarza mają jedno źródło', () => {
  it('każda grupa niesie zdanie, a zdanieGrupy dobiera je po wieku', () => {
    for (const lek of K.CRITERIA) {
      for (const g of lek.groups) {
        expect(g.zdanie, `${g.id} bez zdania`).toBeTruthy();
      }
    }
    expect(K.zdanieGrupy('Saxenda', 40)).toContain('12 tyg.');
    expect(K.zdanieGrupy('Saxenda', 8)).toContain('Dzieci 6–11 lat');
    expect(K.zdanieGrupy('Mounjaro', 40)).toContain('ocena kliniczna');
    expect(K.zdanieGrupy('Mounjaro', 10), 'poniżej wskazania — brak grupy').toBeNull();
  });

  it('zdaniaLeku oddaje komplet zdań danego leku', () => {
    expect(K.zdaniaLeku('Saxenda')).toHaveLength(3);
    expect(K.zdaniaLeku('Mounjaro')).toHaveLength(1);
    expect(K.zdaniaLeku('nieistniejacy-lek')).toEqual([]);
  });

  // Strażnik: warstwa UI nie może trzymać własnej kopii zdania ani własnej reguły.
  it('obesity_therapy.js nie zawiera żadnego zdania o ocenie odpowiedzi', () => {
    const ui = fs.readFileSync(path.join(korzen, 'obesity_therapy.js'), 'utf8')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

    for (const lek of K.CRITERIA) {
      for (const g of lek.groups) {
        expect(ui, `kopia zdania ${g.id} w warstwie UI`).not.toContain(g.zdanie);
      }
    }

    // Próbki składane z kawałków, żeby ten plik nie wywracał własnego strażnika.
    const proba = (a, b) => a + b;
    for (const fraza of [proba('Zakończyć leczenie', ', jeśli'), proba('Rozważyć przerwanie', ' leczenia'),
      proba('Ocena odpowiedzi po 6', ' miesiącach'), proba('Po 1 roku leczenia', ': odstawić')]) {
      expect(ui, `własna reguła w warstwie UI: ${fraza}`).not.toContain(fraza);
    }

    // Kontrola pozytywna: strażnik naprawdę potrafi znaleźć tekst w tym pliku.
    expect(ui).toContain(proba('ObesityResponse', 'Criteria'));
  });
});
