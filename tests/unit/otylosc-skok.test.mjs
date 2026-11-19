import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-OTYLOSC-SKOK (etap 2 projektu „Leczenie otyłości — wpisy poza wizytą”; decyzje właściciela 2026-11-19).
// Karta pacjenta przenosi do monitora DocPro wpisem „vilda:gh-jump” (ta sama droga co skok do punktu GH). Tu: kształt
// celu skoku (celSkoku) i krótkie powody pod przyciskiem „Edytuj w DocPro →” (powodKrotki) na produkcyjnym module.
// Dane wyłącznie FIKCYJNE.

const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)' };
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };
const pkt = (id, type, dateISO, mies, weight, lek, dose = '2,4 mg / tydz.') => ({
  id, type, dateISO, ageYears: 13, ageMonths: mies, weight, height: 160, dose, ...lek,
});
const PID = 'fikcyjna-pacjentka-skok';

function moduly() {
  const g = loadBrowserScript('vilda_cykle_leczenia.js', {});
  return { D: g.VildaDziennikOtylosci, U: g.VildaDziennikOtylosciUI._internal };
}

describe('celSkoku — wpis „vilda:gh-jump” z polem obesity', () => {
  const { U } = moduly();

  it('wpis dziennika: entryId; punkt z dawnej wizyty (jeszcze nieprzeniesiony): id punktu z migawki', () => {
    const zDziennika = U.celSkoku(PID, 'edytuj', { entryId: 'otylm-abc-p1', punkt: { id: 'otylm-abc-p1' } });
    expect(zDziennika).toEqual({ patientId: PID, obesity: { tryb: 'edytuj', entryId: 'otylm-abc-p1' }, ts: zDziennika.ts });
    expect(typeof zDziennika.ts).toBe('number');
    expect(zDziennika.ghPointId, 'bez ghPointId — monitor GH nie podświetla niczego').toBeUndefined();
    expect(U.celSkoku(PID, 'edytuj', { punkt: { id: 'p-start' } }).obesity.entryId).toBe('p-start');
  });

  it('bez danych klinicznych w sessionStorage: „ponownie” niesie tylko id usuniętego wpisu; wlaczenie — bez wpisu', () => {
    // Zwykły sessionStorage nie przechowuje treści pacjenta (docs/ARCHITECTURE.md) — dane usuniętego wpisu monitor
    // DocPro czyta z dziennika w sejfie (obesityTherapyMonitorSkok, wpisPoId). Alert CodeQL w PR vildaclinic/vilda-calc#1003.
    const dane = { type: 'end', dateISO: '2026-11-03', weight: 72.4, height: 163.6, ...WEGOVY };
    const cel = U.celSkoku(PID, 'ponownie', { entryId: 'otylm-x-p-end', biezaca: { dane } });
    expect(cel.obesity).toEqual({ tryb: 'ponownie', entryId: 'otylm-x-p-end' });
    const zapis = JSON.stringify(cel);
    for (const tresc of ['72.4', '163.6', '2026-11-03', 'Wegovy', 'Semaglutyd']) expect(zapis, tresc).not.toContain(tresc);
    expect(U.celSkoku(PID, 'wlaczenie', null).obesity).toEqual({ tryb: 'wlaczenie', entryId: null });
  });
});

describe('powodKrotki — widoczny powód pod „Edytuj w DocPro →”', () => {
  const { D, U } = moduly();
  const wpis = (stan, id) => stan.wpisy.find((x) => x.punkt && x.punkt.id === id);

  it('Włączenie, Zakończenie, zmiana leku — powód; Kontynuacja tego samego leku — brak (Popraw/Usuń w Karcie)', () => {
    const stan = D.zloz([], [
      pkt('a', 'start', '2026-01-12', 0, 80, WEGOVY, '0,25 mg / tydz.'),
      pkt('b', 'continue', '2026-04-14', 3, 78, WEGOVY),
      pkt('c', 'continue', '2026-06-16', 5, 77, SAXENDA, '3,0 mg / dobę'),
      pkt('d', 'end', '2026-10-06', 9, 74, SAXENDA, '3,0 mg / dobę'),
    ]);
    const ctx = { stan };
    expect(U.powodKrotki(ctx, wpis(stan, 'a'))).toBe('Od Włączenia zależą cykl, ocena wg ChPL i listy pacjentów.');
    expect(U.powodKrotki(ctx, wpis(stan, 'b'))).toBeNull();
    expect(U.powodKrotki(ctx, wpis(stan, 'c'))).toBe('Ten wpis zmienia lek — od leku zależą ocena wg ChPL i listy pacjentów.');
    expect(U.powodKrotki(ctx, wpis(stan, 'd'))).toBe('Od Zakończenia zależą cykl i listy pacjentów.');
  });
});

describe('zmianaPrzebiegu z opcją lekPoNazwie — dopisek monitora o listach pacjentów', () => {
  const { D } = moduly();
  const wpis = (stan, id) => stan.wpisy.find((x) => x.punkt && x.punkt.id === id);

  it('ten sam lek, uzupełniona substancja: Karta — zmiana leku (jak dotąd); listy (po nazwie) — bez zmiany', () => {
    const bezSubstancji = { drug: WEGOVY.drug, substance: '' };
    const stan = D.zloz([], [
      pkt('a', 'start', '2026-01-12', 0, 80, bezSubstancji, '0,25 mg / tydz.'),
      pkt('b', 'continue', '2026-04-14', 3, 78, bezSubstancji),
      pkt('c', 'continue', '2026-06-16', 5, 77, WEGOVY),
      pkt('d', 'continue', '2026-08-18', 7, 76, SAXENDA, '3,0 mg / dobę'),
    ]);
    expect(D.zmianaPrzebiegu(stan, wpis(stan, 'c')), 'reguła Karty bez zmian').toBe('zmiana-leku');
    expect(D.zmianaPrzebiegu(stan, wpis(stan, 'c'), { lekPoNazwie: true })).toBeNull();
    expect(D.zmianaPrzebiegu(stan, wpis(stan, 'd'), { lekPoNazwie: true }), 'inny lek — zmiana').toBe('zmiana-leku');
    expect(D.zmianaPrzebiegu(stan, wpis(stan, 'a'), { lekPoNazwie: true })).toBe('wlaczenie');
  });
});
