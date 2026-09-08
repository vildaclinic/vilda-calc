import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Adapter ściągi B.64: zbiera dane rozsypane po stronie DocPro i podaje je silnikowi.
//
// Testy pilnują tej jednej rzeczy, na której adapter może zawieść po cichu: żeby NIE
// dopowiadał danych, których strona nie ma. Brak pomiaru ma zostać brakiem, a nie zerem —
// bo zero w ściądze kryterium przechodzi w „NIESPEŁNIONE" zamiast w „BRAK DANYCH".

let UI;
beforeAll(() => {
  const src = fs.readFileSync(path.join(korzen, 'vilda_b64_checklist_ui.js'), 'utf8');
  const okno = {};
  new Function('window', src)(okno);
  UI = okno.VildaB64ChecklistUI;
});

const MODEL = {
  sex: 'M',
  source: 'PALCZEWSKA',
  metrics: [
    { metric: 'weight', last: { value: 15, sd: -1.2, c: 11, ageMonths: 63 } },
    { metric: 'height', last: { value: 99.5, sd: -2.26, c: 1.2, ageMonths: 63 } },
  ],
  velocity: { cmPerYear: 4.1, gapM: 11 },
};

const KARTA = {
  sourceKeys: ['niklasson'], sex: 'male',
  weeks: '34', days: '2', weight: '1850', length: '43', head: '31', hasComputed: true,
};

const SDS = {
  sourceKey: 'niklasson', sourceShortLabel: 'Niklasson',
  weightSds: -2.4, lengthSds: -1.8, headSds: -1.1,
};

const ZRODLA = { model: MODEL, adv: { boneAgeMonths: 54 }, karta: KARTA, sds: SDS,
  imie: 'Testowy Jan', plecFormularza: 'M' };

describe('Zbieranie danych ze strony', () => {
  it('bierze wzrost, centyl, hSDS i wiek z ostatniego pomiaru wysokości', () => {
    const we = UI.zbierzZeZrodel(ZRODLA);
    expect(we.wzrostCm).toBe(99.5);
    expect(we.hSds).toBe(-2.26);
    expect(we.centyl).toBe(1.2);
    expect(we.wiekMies).toBe(63);
    // Kontrola negatywna: nie wolno wziąć metryki masy, choć jest pierwsza na liście.
    expect(we.wzrostCm).not.toBe(15);
  });

  it('przenosi źródło siatek, tempo i okno obserwacji', () => {
    const we = UI.zbierzZeZrodel(ZRODLA);
    expect(we.zrodloSiatek).toBe('PALCZEWSKA');
    expect(we.tempoCmRok).toBe(4.1);
    expect(we.tempoOknoMies).toBe(11);
  });

  it('wiek kostny przelicza z miesięcy na lata', () => {
    expect(UI.zbierzZeZrodel(ZRODLA).wiekKostnyLat).toBeCloseTo(4.5, 6);
  });

  it('składa sekcję urodzeniową z karty i z policzonego SDS', () => {
    const u = UI.zbierzZeZrodel(ZRODLA).urodzenie;
    expect(u.tygodnie).toBe(34);
    expect(u.dni).toBe(2);
    expect(u.masaSds).toBe(-2.4);
    expect(u.dlugoscSds).toBe(-1.8);
    expect(u.zrodloNorm).toBe('Niklasson');
  });
});

describe('Płeć — formularz pacjenta ma pierwszeństwo', () => {
  it('bierze płeć z formularza, nie z karty urodzeniowej', () => {
    const rozjazd = { ...ZRODLA, plecFormularza: 'F', karta: { ...KARTA, sex: 'male' } };
    expect(UI.zbierzZeZrodel(rozjazd).plec).toBe('F');
  });

  it('bez formularza schodzi na model, a potem na kartę', () => {
    expect(UI.zbierzZeZrodel({ ...ZRODLA, plecFormularza: null }).plec).toBe('M');
    expect(UI.zbierzZeZrodel({ ...ZRODLA, plecFormularza: '', model: { ...MODEL, sex: null } })
      .plec).toBe('M'); // z karty: „male"
    expect(UI.zbierzZeZrodel({
      ...ZRODLA, plecFormularza: '', model: { ...MODEL, sex: null },
      karta: { ...KARTA, sex: 'female' },
    }).plec).toBe('F');
  });

  it('kiedy nikt nie zna płci, zostaje null zamiast zgadywania', () => {
    expect(UI.zbierzZeZrodel({
      ...ZRODLA, plecFormularza: null, model: { ...MODEL, sex: null },
      karta: { ...KARTA, sex: '' },
    }).plec).toBeNull();
  });
});

describe('Czego adapter NIE dopowiada', () => {
  it('brak modelu daje same null-e, a nie zera', () => {
    const we = UI.zbierzZeZrodel({ karta: KARTA, sds: SDS });
    expect(we.wzrostCm).toBeNull();
    expect(we.hSds).toBeNull();
    expect(we.centyl).toBeNull();
    expect(we.wiekMies).toBeNull();
    expect(we.tempoCmRok).toBeNull();
    expect(we.zrodloSiatek).toBeNull();
  });

  it('brak wieku kostnego i wpisane zero traktuje jednakowo — jako brak', () => {
    expect(UI.zbierzZeZrodel({ ...ZRODLA, adv: null }).wiekKostnyLat).toBeNull();
    expect(UI.zbierzZeZrodel({ ...ZRODLA, adv: { boneAgeMonths: 0 } }).wiekKostnyLat).toBeNull();
  });

  it('brak karty urodzeniowej daje brak sekcji, a nie pusty obiekt udający dane', () => {
    expect(UI.zbierzZeZrodel({ model: MODEL }).urodzenie).toBeNull();
  });

  it('karta bez policzonego SDS niesie tygodnie, ale SDS zostaje pusty', () => {
    const u = UI.zbierzZeZrodel({ ...ZRODLA, sds: null }).urodzenie;
    expect(u.tygodnie).toBe(34);
    expect(u.masaSds).toBeNull();
    expect(u.dlugoscSds).toBeNull();
  });

  it('puste wejście nie wywraca adaptera', () => {
    expect(() => UI.zbierzZeZrodel(null)).not.toThrow();
    expect(UI.zbierzZeZrodel(null).plec).toBeNull();
    expect(UI.zbierzZeZrodel(undefined).urodzenie).toBeNull();
  });
});
