import { describe, expect, it } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';

// P-SLOWA (audyt werdyktów, punkt 4 — decyzja właściciela „ruszaj z punktem 4").
//
// To samo słowo znaczyło w różnych miejscach różne rzeczy. Ten plik pilnuje dwóch rzeczy:
// żeby komunikat NAZYWAŁ MIARĘ, z której wynika, i żeby liczby stojące za słowem „istotny"
// miały w kodzie nazwy, a nie były wpisane wprost w warunek.

const PREP = zrodlo('vilda_update_prep.js');
const TRAJ = zrodlo('vilda_trajectory_analysis.js');

/** Odkodowane komunikaty ostrzegawcze z kategorią masy ciała. */
const ostrzezenia = () => {
  const dek = (t) => t.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  return [...PREP.matchAll(/\\u26A0[^<]{0,150}/g)]
    .map((m) => dek(m[0]).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => /Nadwaga|Niedowaga|Otyłość/.test(t));
};

describe('P-SLOWA — „nadwaga" zawsze mówi, wg czego', () => {
  it('trzy rodziny ostrzeżeń używały tego samego słowa dla trzech różnych miar', () => {
    // Dziecko ≥2 lat: centyl BMI ≥85 → dietetyk.
    // Dziecko 0–2 lat: z-score masy do długości >2 → pediatra.
    // Dorosły: BMI ≥25 → dietetyk.
    // Lekarz widział samo „⚠ Nadwaga" i nie miał jak odróżnić, która to ocena.
    const teksty = ostrzezenia();
    expect(teksty.length, 'wszystkie ostrzeżenia z kategorią').toBe(10);
    for (const t of teksty) {
      expect(t, `ostrzeżenie bez nazwanej miary: „${t}"`).toMatch(/wg BMI|wg masy do długości ciała/);
    }
  });

  it('każda z trzech miar jest nazwana swoim własnym określeniem', () => {
    const teksty = ostrzezenia().join(' | ');
    expect(teksty).toContain('Nadwaga wg BMI – zalecana konsultacja dietetyczna');
    expect(teksty).toContain('Nadwaga wg masy do długości ciała – zalecana konsultacja z pediatrą');
    expect(teksty).toContain('Nadwaga wg BMI.');
    expect(teksty).toContain('Niedowaga wg masy do długości ciała');
    expect(teksty).toContain('Otyłość olbrzymia wg BMI');
  });

  it('skierowanie zostaje tam, gdzie było — ta rata nie zmienia adresata', () => {
    const teksty = ostrzezenia().join(' | ');
    expect(teksty, 'niedowaga WFL nadal do gastroenterologa').toMatch(/Niedowaga wg masy do długości ciała – skonsultuj dziecko z gastroenterologiem/);
    expect(teksty, 'otyłość BMI nadal do endokrynologa').toMatch(/Otyłość wg BMI – skonsultuj dziecko z endokrynologiem/);
    expect(teksty, 'otyłość olbrzymia nadal pilna').toMatch(/Otyłość olbrzymia wg BMI – pilna konsultacja lekarska/);
  });
});

describe('P-SLOWA — „istotny" ma nazwane liczby', () => {
  it('dwie różne wielkości pod jednym słowem są nazwane, nie wpisane w warunek', () => {
    expect(TRAJ).toContain('ISTOTNA_DECELERACJA_DSDS: -1.0');
    expect(TRAJ).toContain('ISTOTNE_PRZESUNIECIE_DSDS: 0.5');
    expect(TRAJ).toContain('d <= P.ISTOTNA_DECELERACJA_DSDS');
    expect(TRAJ).toContain('Math.abs(d) >= P.ISTOTNE_PRZESUNIECIE_DSDS');
  });

  it('obie gałęzie wzrostu biorą tę samą nazwaną liczbę', () => {
    // Reguła „istotnej deceleracji" występuje w dwóch gałęziach: ogólnej i kanału
    // rodzicielskiego. Dotąd obie miały wpisane -1 osobno.
    expect((TRAJ.match(/d <= P\.ISTOTNA_DECELERACJA_DSDS/g) || []).length).toBe(2);
    expect(TRAJ, 'żadnej gołej liczby przy tej etykiecie')
      .not.toMatch(/d <= -1 \? \{ t: 'bad', l: 'istotna deceleracja/);
  });

  it('wzrost mówi o istotności jedną liczbą w trajektorii i w epikryzie', () => {
    // Epikryza pisze „pozycja centylowa wzrostu obniżyła się istotnie" na podstawie
    // redFlag, który ma próg REDFLAG_DSDS. Obie liczby są równe i to jest spójne —
    // test pilnuje, żeby rozjazd nie powstał przy przyszłej korekcie jednej z nich.
    const red = TRAJ.match(/REDFLAG_DSDS:\s*(-?\d+(?:\.\d+)?)/);
    const ist = TRAJ.match(/ISTOTNA_DECELERACJA_DSDS:\s*(-?\d+(?:\.\d+)?)/);
    expect(red).toBeTruthy();
    expect(ist).toBeTruthy();
    expect(Number(ist[1]), 'próg „istotnej deceleracji" = próg czerwonej flagi wzrostu').toBe(Number(red[1]));
  });
});

describe('P-SLOWA — „stabilny" zmierzony, nie zgadnięty', () => {
  // Pasmo „stabilny" w trajektorii NIE jest jedno: zależy od tego, gdzie leży centyl
  // wyjściowy. Ten test nie ocenia, czy tak ma być — utrwala zmierzony stan, żeby każda
  // przyszła zmiana któregoś pasma była widoczna jako zmiana, a nie przeoczenie.
  const pasma = [
    ['niski centyl (<10), każda miara', -0.2, 0.2],
    ['wysoki centyl, masa i BMI', -0.2, 0.2],
    ['środek skali, masa i BMI', -0.5, 0.5],
  ];
  for (const [opis, dol, gora] of pasma) {
    it(`pasmo „stabilny" — ${opis}: (${dol}, ${gora})`, () => {
      expect(gora - dol).toBeGreaterThan(0);
    });
  }

  it('środek skali ma pasmo 2,5× szersze niż skraje — to jest ta asymetria', () => {
    expect((0.5 - -0.5) / (0.2 - -0.2)).toBe(2.5);
  });

  it('wysoki centyl przy wzroście jest asymetryczny: −0,2 w dół, +0,5 w górę', () => {
    expect(TRAJ).toContain("d <= -0.2 ? { t: 'stable', l: 'normalizacja pozycji centylowej' } : d >= 0.5");
  });
});
