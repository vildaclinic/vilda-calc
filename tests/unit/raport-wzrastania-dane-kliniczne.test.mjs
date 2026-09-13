import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// ADV-REPORT-4 (decyzja właściciela 2026-09-13), etap 4 naprawy Raportu wzrastania.
// Audyt: raport miał te dane pod ręką i je pomijał.
//  - Wiek kostny: raport ostrzegał, że Bayley–Pinneau może zawyżać „przy opóźnieniu
//    wieku kostnego przekraczającym 2 lata", ale nigdzie nie podawał ani wieku kostnego,
//    ani wielkości opóźnienia — czytelnik nie wiedział, czy ostrzeżenie go dotyczy.
//  - Cel rodzicielski: MPH stało jako pojedyncza liczba, bez pasma i bez zestawienia
//    prognozy z celem, choć karta liczy to i pokazuje.
//  - Pokwitanie: dziecko leczone GnRHa dostawało wydruk z prognozami i zerową informacją
//    o leczeniu, przy którym sama aplikacja uznaje prognozę za nierzetelną.
// Testy wołają PRAWDZIWĄ funkcję produkcyjną. Dane wyłącznie FIKCYJNE.

let win;
beforeEach(() => { win = loadBrowserScript('vilda_advanced_growth.js', {}); });
afterEach(() => { win = null; });

const lines = (d, fh, mph) => win.VildaAdvancedGrowth.advGrowthBuildClinicalContextLines(d, fh, mph);

describe('Raport wzrastania — wiek kostny, pasmo celu i pokwitanie w podsumowaniu', () => {
  it('podaje wiek kostny, wiek metrykalny i wielkość opóźnienia w miesiącach', () => {
    const out = lines({ boneAgeMonths: 90, currentAgeMonths: 116 }, null, null);
    expect(out[0]).toBe('Wiek kostny: 7 lat 6 mies. wobec metrykalnego 9 lat 8 mies. — opóźniony o 26 mies.');
  });

  it('rozróżnia przyspieszenie i zgodność z wiekiem metrykalnym', () => {
    expect(lines({ boneAgeMonths: 130, currentAgeMonths: 116 }, null, null)[0]).toContain('przyspieszony o 14 mies.');
    expect(lines({ boneAgeMonths: 118, currentAgeMonths: 116 }, null, null)[0]).toContain('zgodny z metrykalnym');
  });

  it('podaje pasmo celu rodzicielskiego i zestawia z nim prognozę', () => {
    const out = lines({}, { targetAssessment: { diffCm: -2.4, tierLabel: 'w zakresie celu' } }, 176.5);
    // model niesie spacje nierozdzielające między liczbą a jednostką
    expect(out[0]).toContain('pasmo celu 166,5–186,5\u00A0cm');
    expect(out[0]).toContain('prognoza 2,4\u00A0cm poniżej celu');
    expect(out[0]).toContain('w zakresie celu');
  });

  it('prognoza powyżej celu jest nazwana powyżej, nie ujemną liczbą', () => {
    const out = lines({}, { targetAssessment: { diffCm: 6.1, tierLabel: 'w zakresie celu' } }, 170);
    expect(out[0]).toContain('prognoza 6,1\u00A0cm powyżej celu');
    expect(out[0]).not.toContain('-6,1');
  });

  it('leczenie GnRHa w trakcie daje ostrzeżenie o nierzetelności prognozy', () => {
    const out = lines({ pubertyProfile: { etykieta: 'przedwczesne pokwitanie (tempo szybkie)', gnrha: { status: 'w-trakcie' } } }, null, null);
    expect(out.join(' | ')).toContain('Pokwitanie: przedwczesne pokwitanie (tempo szybkie)');
    expect(out.join(' | ')).toContain('prognoza rezydualnego wzrostu jest nierzetelna');
  });

  it('leczenie zakończone nie wywołuje ostrzeżenia o trwającym leczeniu (kontrola negatywna)', () => {
    const out = lines({ pubertyProfile: { etykieta: 'wczesne pokwitanie', gnrha: { status: 'zakonczone' } } }, null, null);
    expect(out.join(' | ')).toContain('Pokwitanie: wczesne pokwitanie');
    expect(out.join(' | ')).not.toContain('nierzetelna');
  });

  it('brak danych nie produkuje żadnej linii — raport nie zgaduje', () => {
    expect(lines(null, null, null)).toEqual([]);
    expect(lines({}, null, null)).toEqual([]);
    expect(lines({ boneAgeMonths: null, pubertyProfile: null }, null, null)).toEqual([]);
  });
});
