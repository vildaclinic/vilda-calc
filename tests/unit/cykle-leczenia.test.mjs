import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-OTYLOSC-CYKLE rata 1 (decyzja właściciela 2026-09-30: rekomendacje D1–D8 projektu „Cykle
// leczenia otyłości" przyjęte). Test woła PRODUKCYJNY moduł vilda_cykle_leczenia.js — ten sam plik,
// który DocPro ładuje przed monitorem otyłości — bez własnej kopii reguł.
//
// Przykład z projektu (dane FIKCYJNE): dorosły, 170 cm. Cykl 1 — Saxenda: Włączenie 12.01.2024
// (104,0 kg), Kontynuacja 12.04.2024 (99,0 kg), Zakończenie 15.10.2024 (97,5 kg). Po 28 dniach
// przerwy cykl 2 — Wegovy: Włączenie 12.11.2024 (98,5 kg), Kontynuacje 12.02.2025 i 10.05.2025.
//
// Rata 4 (R6 — zmiana substancji czynnej zaczyna nowy cykl): loader ładuje przed modułem cykli
// PRODUKCYJNE kryteria ChPL (obesity_response_criteria.js, `ZALEZNOSCI`), bo to one rozpoznają
// substancję punktu — tak jak na stronie, gdzie kryteria stoją w kolejności skryptów wcześniej.

let C;

beforeAll(() => {
  const win = {};
  loadBrowserScript('vilda_cykle_leczenia.js', win);
  C = win.VildaCykleLeczenia;
});

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

/** Moduł cykli w oknie BEZ kryteriów ChPL (albo z podanymi atrapami) — to, co moduł robi sam. */
function oknoCykli(zaleznosci = {}) {
  const win = { ...zaleznosci };
  new Function('window', 'globalThis', zrodlo('vilda_cykle_leczenia.js'))(win, win);
  return win.VildaCykleLeczenia;
}

const P = (id, type, lata, mies, masa, data, lek = 'Saxenda') => ({
  id, type, ageYears: lata, ageMonths: mies, weight: masa, height: 170, dateISO: data, drug: lek, dose: '',
});
const CYKL1 = Object.freeze([
  P('a', 'start', 40, 0, 104, '2024-01-12'),
  P('b', 'continue', 40, 3, 99, '2024-04-12'),
  P('c', 'end', 40, 9, 97.5, '2024-10-15'),
]);
const CYKL2 = Object.freeze([
  P('d', 'start', 40, 10, 98.5, '2024-11-12', 'Wegovy'),
  P('e', 'continue', 41, 1, 95.5, '2025-02-12', 'Wegovy'),
  P('f', 'continue', 41, 4, 93, '2025-05-10', 'Wegovy'),
]);
const OBA = Object.freeze([...CYKL1, ...CYKL2]);
const dodaj = (lista, punkt, opcje) => C.sprawdz(lista, { rodzaj: 'dodaj', punkt }, opcje);

describe('podział na cykle', () => {
  it('granicę cyklu wyznacza Zakończenie; przykład z projektu to dwa cykle', () => {
    const w = C.podziel(OBA);
    expect(w.tryb).toBe('daty');
    expect(w.cykle.map((c) => c.punkty.map((p) => p.id).join(''))).toEqual(['abc', 'def']);
    expect(w.cykle.map((c) => c.stan)).toEqual(['zakonczony', 'aktywny']);
    expect(w.cykle[1].wlaczenie.id).toBe('d');
    expect(w.niezgodnosci).toEqual([]);
  });

  it('kolejność jak w tabeli monitora: po datach, a gdy któryś punkt nie ma daty — po wieku', () => {
    const pomieszane = [OBA[4], OBA[0], OBA[3], OBA[2], OBA[5], OBA[1]];
    expect(C.uporzadkuj(pomieszane).punkty.map((p) => p.id).join('')).toBe('abcdef');
    const bezDaty = pomieszane.map((p) => (p.id === 'e' ? { ...p, dateISO: '' } : p));
    const u = C.uporzadkuj(bezDaty);
    expect(u.tryb).toBe('wiek');
    expect(u.punkty.map((p) => p.id).join('')).toBe('abcdef');
  });

  it('stary zapis z dwoma Włączeniami bez Zakończenia to JEDEN cykl z niezgodnością, nie dwa cykle', () => {
    const stary = [...CYKL1.slice(0, 2), P('g', 'start', 40, 4, 99, '2024-05-03'), P('h', 'continue', 40, 8, 96, '2024-09-01')];
    const w = C.podziel(stary);
    expect(w.cykle.length).toBe(1);
    expect(w.niezgodnosci.map((n) => n.kod)).toEqual(['dwa-wlaczenia']);
    expect(w.cykle[0].wlaczenie.id).toBe('a');
  });

  it('Kontynuacja po Zakończeniu otwiera cykl bez Włączenia (dotychczasowy przypadek P-OTYLOSC-BEZ-STARTU)', () => {
    const w = C.podziel([...CYKL1, P('k', 'continue', 41, 0, 100, '2025-01-10')]);
    expect(w.cykle.length).toBe(2);
    expect(w.cykle[1].wlaczenie).toBeNull();
    expect(w.niezgodnosci).toEqual([]);
  });
});

describe('dodawanie punktu — przypadki z projektu', () => {
  it('CY-1: drugie Włączenie w trakcie cyklu jest odrzucane', () => {
    const r = dodaj(CYKL1.slice(0, 2), P('x', 'start', 40, 5, 98, '2024-06-10'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('dwa-wlaczenia');
    expect(r.komunikat).toBe('Cykl 1 ma już Włączenie (12.01.2024). Nowy cykl rozpoczniesz po Zakończeniu cyklu 1.');
  });

  it('CY-2: Włączenie po Zakończeniu zaczyna cykl 2', () => {
    const r = dodaj(CYKL1, CYKL2[0]);
    expect(r.ok).toBe(true);
    expect(r.cykl).toEqual({ numer: 2, stan: 'aktywny' });
    expect(r.punkty.map((p) => p.id).join('')).toBe('abcd');
  });

  it('CY-4: Kontynuacja z datą w przerwie między cyklami jest odrzucana', () => {
    const r = dodaj(OBA, P('x', 'continue', 40, 9, 97, '2024-11-01'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('przerwa');
    expect(r.komunikat).toBe('Data 01.11.2024 wypada w przerwie między cyklem 1 (zakończony 15.10.2024) a cyklem 2 (Włączenie 12.11.2024). Popraw datę wizyty.');
  });

  it('CY-5: Zakończenie przed późniejszą wizytą cyklu jest odrzucane', () => {
    const r = dodaj(CYKL1.slice(0, 2), P('x', 'end', 40, 2, 100, '2024-03-10'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zakonczenie-nie-ostatnie');
    expect(r.komunikat).toBe('Po 10.03.2024 w cyklu 1 są jeszcze wizyty (1). Zakończenie musi być ostatnim punktem cyklu.');
  });

  it('CY-8: Zakończenie i nowe Włączenie tego samego dnia to dwa cykle, Zakończenie pierwsze', () => {
    const z = P('z', 'end', 40, 9, 97.5, '2024-10-15');
    const r1 = dodaj(CYKL1.slice(0, 2), z);
    expect(r1.ok).toBe(true);
    const r2 = dodaj(r1.punkty, P('w', 'start', 40, 9, 97.5, '2024-10-15', 'Wegovy'));
    expect(r2.ok).toBe(true);
    expect(r2.cykl.numer).toBe(2);
    expect(C.podziel(r2.punkty).cykle.map((c) => c.punkty.map((p) => p.id).join(''))).toEqual(['abz', 'w']);
  });

  it('remis dat: Włączenie dopisane wstecz w dniu pierwszej wizyty cyklu bez Włączenia trafia przed nią', () => {
    const bez = [P('k1', 'continue', 41, 0, 100, '2025-01-10'), P('k2', 'continue', 41, 3, 97, '2025-04-10')];
    const r = dodaj(bez, P('w', 'start', 41, 0, 100, '2025-01-10'));
    expect(r.ok).toBe(true);
    expect(r.indeks).toBe(0);
    expect(C.podziel(r.punkty).cykle[0].wlaczenie.id).toBe('w');
  });

  it('Włączenie w środku cyklu bez Włączenia jest odrzucane — musi być pierwszym punktem', () => {
    const bez = [P('k1', 'continue', 41, 0, 100, '2025-01-10'), P('k2', 'continue', 41, 3, 97, '2025-04-10')];
    const r = dodaj(bez, P('w', 'start', 41, 1, 99, '2025-02-10'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('wlaczenie-w-trakcie');
  });

  it('Kontynuacja sprzed pierwszego Włączenia jest odrzucana', () => {
    const r = dodaj(CYKL1, P('x', 'continue', 39, 11, 105, '2023-12-01'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('przed-wlaczeniem');
  });

  it('drugie Zakończenie jest odrzucane — po Zakończeniu i przed nim', () => {
    expect(dodaj(CYKL1, P('x', 'end', 41, 0, 96, '2024-12-01')).kod).toBe('drugie-zakonczenie');
    const r = dodaj(CYKL1, P('x', 'end', 40, 5, 98, '2024-06-01'));
    expect(r.kod).toBe('drugie-zakonczenie');
    expect(r.komunikat).toBe('Cykl 1 ma już Zakończenie (15.10.2024).');
    expect(dodaj([], P('x', 'end', 41, 0, 100, '2025-01-10')).kod).toBe('zakonczenie-bez-wizyt');
  });
});

describe('cykl bez Włączenia tylko świadomie (D2)', () => {
  it('Kontynuacja po zakończonym cyklu wymaga wyboru', () => {
    const r = dodaj(CYKL1, P('x', 'continue', 41, 0, 100, '2025-01-10'));
    expect(r.ok).toBe(false);
    expect(r.wybor).toBe(true);
    expect(r.kod).toBe('nowy-cykl-bez-wlaczenia');
    expect(r.cyklPoprzedni).toBe(1);
    expect(r.komunikat).toContain('Cykl 1 jest zakończony (15.10.2024). Ta wizyta rozpocznie cykl 2.');
  });

  it('po świadomym wyborze wizyta zaczyna cykl bez Włączenia', () => {
    const r = dodaj(CYKL1, P('x', 'continue', 41, 0, 100, '2025-01-10'), { bezWlaczenia: true });
    expect(r.ok).toBe(true);
    expect(r.cykl).toEqual({ numer: 2, stan: 'aktywny' });
  });

  it('pierwszy punkt jako Kontynuacja też wymaga wyboru', () => {
    const r = dodaj([], P('x', 'continue', 41, 0, 100, '2025-01-10'));
    expect(r.wybor).toBe(true);
    expect(r.cyklPoprzedni).toBeNull();
    expect(r.komunikat).toContain('To pierwszy punkt leczenia.');
  });

  it('kolejna wizyta w istniejącym cyklu bez Włączenia nie pyta ponownie', () => {
    const bez = [P('k1', 'continue', 41, 0, 100, '2025-01-10')];
    expect(dodaj(bez, P('k2', 'continue', 41, 3, 97, '2025-04-10')).ok).toBe(true);
  });
});

describe('data przy Włączeniu i Zakończeniu (R7, D4)', () => {
  it('nowe Włączenie i nowe Zakończenie bez daty są odrzucane', () => {
    expect(dodaj([], P('x', 'start', 41, 0, 100, '')).kod).toBe('brak-daty');
    expect(dodaj(CYKL1.slice(0, 2), P('x', 'end', 41, 0, 96, '')).kod).toBe('brak-daty');
  });

  it('Kontynuacja bez daty przechodzi jak dotąd', () => {
    expect(dodaj(CYKL1.slice(0, 2), P('x', 'continue', 40, 5, 98, '')).ok).toBe(true);
  });

  it('stare Włączenie bez daty wolno poprawić bez dopisywania daty, dopóki nie zmienia rodzaju', () => {
    const stary = [P('s', 'start', 40, 0, 104, ''), P('k', 'continue', 40, 3, 99, '')];
    expect(C.sprawdz(stary, { rodzaj: 'edytuj', id: 's', punkt: { ...stary[0], weight: 103 } }).ok).toBe(true);
    expect(C.sprawdz(stary, { rodzaj: 'edytuj', id: 'k', punkt: { ...stary[1], type: 'end' } }).kod).toBe('brak-daty');
  });
});

describe('edycja i usuwanie', () => {
  it('CY-3: Włączenie cyklu 2 da się poprawić jako Włączenie (dotąd odmowa „drugi-start")', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'edytuj', id: 'd', punkt: { ...CYKL2[0], weight: 98 } });
    expect(r.ok).toBe(true);
    expect(r.indeks).toBe(3);
    expect(r.punkty[3].weight).toBe(98);
    // pozostałe punkty to te same obiekty — nic poza edytowanym się nie zmienia
    expect(r.punkty.filter((p, i) => i !== 3).every((p, i) => p === OBA.filter((q, j) => j !== 3)[i])).toBe(true);
  });

  it('zmiana Kontynuacji w drugie Włączenie tego samego cyklu jest odrzucana', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'edytuj', id: 'e', punkt: { ...CYKL2[1], type: 'start' } });
    expect(r.kod).toBe('dwa-wlaczenia');
  });

  it('zmiana daty przenosząca punkt do innego cyklu wymaga potwierdzenia', () => {
    // Rata 4: przenoszona wizyta ma lek cyklu docelowego (Wegovy). Z lekiem cyklu 1 (Saxenda)
    // zmieniałaby substancję czynną w cyklu 2 — to odmowa R6 (test w bloku R6 niżej).
    const r = C.sprawdz(OBA, { rodzaj: 'edytuj', id: 'b', punkt: { ...CYKL1[1], drug: 'Wegovy', dateISO: '2025-03-01', ageYears: 41, ageMonths: 2 } });
    expect(r.ok).toBe(true);
    expect(r.uwaga).toBe('przeniesienie');
    expect(r.potwierdz).toBe('Nowa data przenosi punkt z cyklu 1 do cyklu 2. Zapisać zmiany?');
  });

  it('zamiana Zakończenia między cyklami w Kontynuację jest odrzucana — połączyłaby cykle', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'edytuj', id: 'c', punkt: { ...CYKL1[2], type: 'continue' } });
    expect(r.kod).toBe('polaczenie-cykli');
  });

  it('CY-6: usunięcie Zakończenia między cyklami jest odrzucane', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'usun', id: 'c' });
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('polaczenie-cykli');
    expect(r.komunikat).toBe('Usunięcie tego Zakończenia połączyłoby cykl 1 z cyklem 2. Najpierw usuń albo zmień Włączenie cyklu 2 (12.11.2024).');
  });

  it('usunięcie Zakończenia ostatniego cyklu przechodzi — cykl znów jest aktywny', () => {
    const r = C.sprawdz(CYKL1, { rodzaj: 'usun', id: 'c' });
    expect(r.ok).toBe(true);
    expect(r.punkty.map((p) => p.id).join('')).toBe('ab');
  });

  it('usunięcie Włączenia pyta z podaniem skutku dla Karty pacjenta', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'usun', id: 'd' });
    expect(r.ok).toBe(true);
    expect(r.uwaga).toBe('utrata-wlaczenia');
    expect(r.potwierdz).toContain('Cykl 2 straci punkt odniesienia (Włączenie 12.11.2024).');
  });
});

describe('stary zapis łamiący reguły (D5): nic nie zmienia się samo, poprawka przechodzi', () => {
  const STARY = Object.freeze([...CYKL1.slice(0, 2), P('g', 'start', 40, 4, 99, '2024-05-03'), P('h', 'continue', 40, 8, 96, '2024-09-01')]);

  it('dopisanie wizyty do cyklu z dawną niezgodnością nie jest blokowane', () => {
    expect(dodaj(STARY, P('x', 'continue', 40, 10, 95, '2024-11-01')).ok).toBe(true);
  });

  it('zamiana drugiego Włączenia w Kontynuację usuwa niezgodność', () => {
    const r = C.sprawdz(STARY, { rodzaj: 'edytuj', id: 'g', punkt: { ...STARY[2], type: 'continue' } });
    expect(r.ok).toBe(true);
    expect(C.podziel(r.punkty).niezgodnosci).toEqual([]);
  });

  it('trzecie Włączenie w tym cyklu nadal jest odrzucane', () => {
    expect(dodaj(STARY, P('x', 'start', 40, 10, 95, '2024-11-01')).kod).toBe('dwa-wlaczenia');
  });
});

describe('rata 2: krótkie powody i rozdzielenie starego zapisu', () => {
  const STARY = Object.freeze([...CYKL1.slice(0, 2), P('g', 'start', 40, 4, 99, '2024-05-03'), P('h', 'continue', 40, 8, 96, '2024-09-01')]);

  it('każda odmowa dodania ma krótki powód pod przycisk', () => {
    expect(dodaj(CYKL1.slice(0, 2), P('x', 'start', 40, 5, 98, '2024-06-10')).krotko).toBe('Cykl 1 ma już Włączenie (12.01.2024)');
    expect(dodaj(OBA, P('x', 'continue', 40, 9, 97, '2024-11-01')).krotko).toBe('Data w przerwie między cyklem 1 a 2');
    expect(dodaj(CYKL1.slice(0, 2), P('x', 'end', 40, 2, 100, '2024-03-10')).krotko).toBe('Po tej dacie są jeszcze wizyty cyklu 1');
    expect(dodaj(CYKL1, P('x', 'end', 41, 0, 96, '2024-12-01')).krotko).toBe('Cykl 1 jest już zakończony');
    expect(dodaj(CYKL1, P('x', 'end', 40, 5, 98, '2024-06-01')).krotko).toBe('Cykl 1 ma już Zakończenie (15.10.2024)');
    expect(dodaj(CYKL1, P('x', 'continue', 39, 11, 105, '2023-12-01')).krotko).toBe('Data przed Włączeniem (12.01.2024)');
    expect(dodaj([], P('x', 'start', 41, 0, 100, '')).krotko).toBe('Wymaga daty wizyty');
    expect(C.sprawdz(OBA, { rodzaj: 'usun', id: 'c' }).krotko).toBe('Połączyłoby cykl 1 z cyklem 2');
  });

  it('Zakończenie dopisane między dwa Włączenia starego zapisu rozdziela je na dwa poprawne cykle', () => {
    const r = dodaj(STARY, P('z', 'end', 40, 3, 99, '2024-04-30'));
    expect(r.ok).toBe(true);
    const w = C.podziel(r.punkty);
    expect(w.cykle.map((c) => c.punkty.map((p) => p.id).join(''))).toEqual(['abz', 'gh']);
    expect(w.niezgodnosci).toEqual([]);
  });

  it('Zakończenie w środku poprawnego cyklu nadal jest odrzucane — odcięta część nie zaczyna się od Włączenia', () => {
    const r = dodaj([...CYKL1.slice(0, 2), P('k', 'continue', 40, 6, 97, '2024-07-12')], P('z', 'end', 40, 4, 98, '2024-05-01'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zakonczenie-nie-ostatnie');
  });
});

// ── Rata 4: R6 — zmiana substancji czynnej zaczyna nowy cykl (D3) ────────────────────────────
// Leki zapisane jak w monitorze DocPro: `drug` = tekst opcji listy, `substance` = etykieta
// substancji (z niełamiącym łącznikiem U+2011 w „GLP‑1”). Dane wyłącznie FIKCYJNE.
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP\u20111)' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP\u20111)' };
const MOUNJARO = { drug: 'Mounjaro (tirzepatyd) – s.c. 1×/tydz.', substance: 'Tirzepatyd (agonista receptorów GIP/GLP\u20111)' };
const M = (id, type, lata, mies, masa, data, lek = SAXENDA) => ({
  id, type, ageYears: lata, ageMonths: mies, weight: masa, height: 170, dateISO: data, dose: '', ...lek,
});
const W_SAX = M('a', 'start', 40, 0, 104, '2024-01-12');
const K_SAX = M('b', 'continue', 40, 3, 99, '2024-04-12');
// Stary zapis (sprzed raty 4): W, K Saxenda, potem K, K Wegovy — bez Zakończenia między lekami.
const STARY_R6 = Object.freeze([
  W_SAX,
  K_SAX,
  M('e', 'continue', 41, 1, 95.5, '2025-02-12', WEGOVY),
  M('f', 'continue', 41, 4, 93, '2025-05-10', WEGOVY),
]);
const cykleId = (punkty) => C.podziel(punkty).cykle.map((c) => c.punkty.map((p) => p.id).join(''));
const kody = (punkty) => C.podziel(punkty).niezgodnosci.map((n) => n.kod);

describe('R6: rozpoznanie substancji czynnej i nazwa leku', () => {
  it('substancję rozpoznają kryteria ChPL — z tekstu opcji, z etykiety albo z klucza; dawka i zapis bez znaczenia', () => {
    expect(C.substancja(M('x', 'continue', 40, 0, 1, '', SAXENDA))).toBe('liraglutide');
    expect(C.substancja(M('x', 'continue', 40, 0, 1, '', WEGOVY))).toBe('semaglutide');
    expect(C.substancja({ drug: '', substance: 'Semaglutyd (agonista receptora GLP\u20111)' })).toBe('semaglutide');
    expect(C.substancja({ drug: '', substance: 'semaglutide' })).toBe('semaglutide');
    expect(C.substancja({ drug: 'Semaglutyd (Wegovy) 0,25 mg' })).toBe('semaglutide');
    expect(C.substancja({ drug: 'Semaglutyd (Wegovy) 0,5 mg' })).toBe('semaglutide');
  });

  it('punkt bez leku albo z lekiem nierozpoznanym (Ozempic) jest neutralny', () => {
    expect(C.substancja({ drug: '', substance: '' })).toBeNull();
    expect(C.substancja({})).toBeNull();
    expect(C.substancja(null)).toBeNull();
    expect(C.substancja({ drug: 'Ozempic', substance: '' })).toBeNull();
  });

  it('krótka nazwa leku do komunikatów', () => {
    expect(C.nazwaLeku(SAXENDA)).toBe('Saxenda');
    expect(C.nazwaLeku({ drug: 'Saxenda' })).toBe('Saxenda');
    expect(C.nazwaLeku(WEGOVY)).toBe('Wegovy');
    expect(C.nazwaLeku({ drug: 'Mysimba (naltrekson/bupropion) – p.o.' })).toBe('Mysimba');
    // Separator „ –” bez nawiasu przed nim (np. lek z importu albo z dawnej listy).
    expect(C.nazwaLeku({ drug: 'Saxenda – s.c. 1×/dobę' })).toBe('Saxenda');
    expect(C.nazwaLeku({ drug: '', substance: 'Liraglutyd (agonista receptora GLP\u20111)' })).toBe('Liraglutyd');
    expect(C.nazwaLeku({ drug: '', substance: 'semaglutide' })).toBe('semaglutide');
    expect(C.nazwaLeku({})).toBe('');
  });
});

describe('R6: zmiana substancji w cyklu jest odrzucana przy dodawaniu i edycji', () => {
  it('CY-11: Kontynuacja z Wegovy w cyklu Saxendy jest odrzucana — bez pytania o wybór', () => {
    const r = dodaj([W_SAX], M('x', 'continue', 40, 3, 99, '2024-04-12', WEGOVY));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zmiana-substancji');
    expect(r.komunikat).toBe('Ta wizyta ma inną substancję czynną (Wegovy) niż wcześniejsze wizyty cyklu 1 (Saxenda). Zmiana substancji czynnej zaczyna nowy cykl: zapisz najpierw Zakończenie cyklu 1 z lekiem Saxenda (może mieć tę samą datę), a tę wizytę jako Włączenie nowego cyklu.');
    expect(r.krotko).toBe('Inna substancja niż w cyklu 1 (Saxenda)');
    expect(r.wybor).toBeUndefined();
    expect(r.punkty).toBeUndefined();
    // Kontrola: ta sama wizyta z lekiem cyklu przechodzi.
    expect(dodaj([W_SAX], M('x', 'continue', 40, 3, 99, '2024-04-12')).ok).toBe(true);
  });

  it('Zakończenie z nową substancją jest odrzucane — Zakończenie ma lek swojego cyklu', () => {
    const r = dodaj([W_SAX, K_SAX], M('z', 'end', 40, 9, 97.5, '2024-10-15', WEGOVY));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zmiana-substancji');
    expect(r.komunikat).toBe('Zakończenie zamyka cykl 1 — zapisz je z lekiem tego cyklu (Saxenda). Nowy lek (Wegovy) zapiszesz potem jako Włączenie nowego cyklu, także tego samego dnia.');
    expect(r.krotko).toBe('Zakończenie z lekiem cyklu 1 (Saxenda)');
    // Z lekiem cyklu przechodzi.
    expect(dodaj([W_SAX, K_SAX], M('z', 'end', 40, 9, 97.5, '2024-10-15')).ok).toBe(true);
  });

  it('Włączenie Wegovy dopisane w aktywnym cyklu Saxendy to nadal „dwa Włączenia” (zgłaszane pierwsze)', () => {
    const r = dodaj([W_SAX, K_SAX], M('x', 'start', 40, 5, 98, '2024-06-10', WEGOVY));
    expect(r.kod).toBe('dwa-wlaczenia');
    expect(r.komunikat).toBe('Cykl 1 ma już Włączenie (12.01.2024). Nowy cykl rozpoczniesz po Zakończeniu cyklu 1.');
  });

  it('Kontynuacja bez leku przechodzi — punkt neutralny', () => {
    const r = dodaj([W_SAX, K_SAX], M('x', 'continue', 40, 6, 98, '2024-07-12', { drug: '', substance: '' }));
    expect(r.ok).toBe(true);
    expect(kody(r.punkty)).toEqual([]);
  });

  it('ten sam lek w innym zapisie albo dawce przechodzi; etykieta substancji i klucz to ta sama substancja', () => {
    const w = M('w', 'start', 40, 0, 104, '2024-01-12', { drug: 'Semaglutyd (Wegovy) 0,25 mg', substance: '' });
    expect(dodaj([w], M('x', 'continue', 40, 3, 99, '2024-04-12', { drug: 'Semaglutyd (Wegovy) 0,5 mg', substance: '' })).ok).toBe(true);
    const wEtykieta = M('w', 'start', 40, 0, 104, '2024-01-12', { drug: '', substance: 'Semaglutyd (agonista receptora GLP\u20111)' });
    expect(dodaj([wEtykieta], M('x', 'continue', 40, 3, 99, '2024-04-12', { drug: '', substance: 'semaglutide' })).ok).toBe(true);
    expect(dodaj([wEtykieta], M('x', 'continue', 40, 3, 99, '2024-04-12', WEGOVY)).ok).toBe(true);
  });

  it('lek nierozpoznany (Ozempic) jest neutralny — nie tworzy przejścia i nie jest blokowany', () => {
    const r = dodaj([W_SAX, K_SAX], M('x', 'continue', 40, 6, 98, '2024-07-12', { drug: 'Ozempic', substance: '' }));
    expect(r.ok).toBe(true);
    expect(kody(r.punkty)).toEqual([]);
    // Neutralny punkt między lekami nie zasłania przejścia: Saxenda → (Ozempic) → Wegovy to zmiana substancji.
    expect(dodaj(r.punkty, M('y', 'continue', 40, 9, 97, '2024-10-12', WEGOVY)).kod).toBe('zmiana-substancji');
  });

  it('CY-8 bez zmian: Zakończenie Saxendy i Włączenie Wegovy tego samego dnia to dwa cykle bez niezgodności', () => {
    const r1 = dodaj([W_SAX, K_SAX], M('z', 'end', 40, 9, 97.5, '2024-10-15'));
    expect(r1.ok).toBe(true);
    const r2 = dodaj(r1.punkty, M('w', 'start', 40, 9, 97.5, '2024-10-15', WEGOVY));
    expect(r2.ok).toBe(true);
    expect(r2.cykl).toEqual({ numer: 2, stan: 'aktywny' });
    expect(cykleId(r2.punkty)).toEqual(['abz', 'w']);
    expect(kody(r2.punkty)).toEqual([]);
  });

  it('zmiana leku Włączenia w jednolitym cyklu na inny jest odrzucana — Włączenie ma lek swojego cyklu', () => {
    const r = C.sprawdz([W_SAX, K_SAX], { rodzaj: 'edytuj', id: 'a', punkt: { ...W_SAX, ...WEGOVY } });
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zmiana-substancji');
    expect(r.komunikat).toBe('Wizyty cyklu 1 mają inną substancję czynną (Saxenda) niż to Włączenie (Wegovy). Włączenie musi mieć lek swojego cyklu — popraw lek albo datę.');
    expect(r.krotko).toBe('Inna substancja niż wizyty cyklu 1 (Saxenda)');
    // Cykl, w którym tylko edytowany punkt ma lek, wolno przestawić na inny lek.
    expect(C.sprawdz([W_SAX], { rodzaj: 'edytuj', id: 'a', punkt: { ...W_SAX, ...WEGOVY } }).ok).toBe(true);
  });

  it('zmiana leku Kontynuacji na inny jest odrzucana jak dopisanie takiej wizyty', () => {
    const r = C.sprawdz([W_SAX, K_SAX], { rodzaj: 'edytuj', id: 'b', punkt: { ...K_SAX, ...WEGOVY } });
    expect(r.kod).toBe('zmiana-substancji');
    expect(r.krotko).toBe('Inna substancja niż w cyklu 1 (Saxenda)');
  });

  it('zmiana daty przenosząca wizytę Saxendy do cyklu Wegovy jest odrzucana z opisem ogólnym (R6)', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'edytuj', id: 'b', punkt: { ...CYKL1[1], dateISO: '2025-03-01', ageYears: 41, ageMonths: 2 } });
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zmiana-substancji');
    expect(r.komunikat).toBe('Po tej zmianie w cyklu 2 zmieniałaby się substancja czynna (Wegovy → Saxenda) bez Zakończenia między wizytami. Zmiana substancji czynnej zaczyna nowy cykl — popraw lek albo datę.');
    expect(r.krotko).toBe('Zmiana substancji w cyklu 2');
    expect(r.potwierdz).toBeUndefined();
  });

  it('remis dat: Włączenie Wegovy dopisane wstecz w dniu pierwszej wizyty Saxendy cyklu bez Włączenia — odmowa R6, nie „w trakcie cyklu”', () => {
    const bez = [M('k1', 'continue', 41, 0, 100, '2025-01-10'), M('k2', 'continue', 41, 3, 97, '2025-04-10')];
    const r = dodaj(bez, M('w', 'start', 41, 0, 100, '2025-01-10', WEGOVY));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zmiana-substancji');
    expect(r.komunikat).toBe('Wizyty cyklu 1 mają inną substancję czynną (Saxenda) niż to Włączenie (Wegovy). Włączenie musi mieć lek swojego cyklu — popraw lek albo datę.');
    expect(r.krotko).toBe('Inna substancja niż wizyty cyklu 1 (Saxenda)');
    // Kontrola: to samo Włączenie z lekiem cyklu trafia przed pierwszą wizytę i przechodzi.
    const ok = dodaj(bez, M('w', 'start', 41, 0, 100, '2025-01-10'));
    expect(ok.ok).toBe(true);
    expect(ok.indeks).toBe(0);
  });

  it('remis dat: Kontynuacja Wegovy w dniu Zakończenia Saxendy — pytanie o nowy cykl (D2), nie odmowa R6', () => {
    // Przed Zakończeniem wizyta zmieniałaby substancję w cyklu 1 (R6), ale po nim zaczyna cykl 2 —
    // tam przechodzi po świadomym wyborze („Zapisz jako Włączenie” albo cykl bez Włączenia).
    const cykl1 = [W_SAX, K_SAX, M('c', 'end', 40, 9, 97.5, '2024-10-15')];
    const r = dodaj(cykl1, M('x', 'continue', 40, 9, 97.5, '2024-10-15', WEGOVY));
    expect(r.ok).toBe(false);
    expect(r.wybor).toBe(true);
    expect(r.kod).toBe('nowy-cykl-bez-wlaczenia');
    expect(r.komunikat).toContain('Cykl 1 jest zakończony (15.10.2024). Ta wizyta rozpocznie cykl 2.');
    const bezW = dodaj(cykl1, M('x', 'continue', 40, 9, 97.5, '2024-10-15', WEGOVY), { bezWlaczenia: true });
    expect(bezW.ok).toBe(true);
    expect(cykleId(bezW.punkty)).toEqual(['abc', 'x']);
    // Kontrola: Kontynuacja Saxendy w dniu Zakończenia trafia jak dotąd do cyklu 1, przed Zakończenie.
    const sax = dodaj(cykl1, M('x', 'continue', 40, 9, 97.5, '2024-10-15'));
    expect(sax.ok).toBe(true);
    expect(cykleId(sax.punkty)).toEqual(['abxc']);
  });

  it('rada „zapisz Zakończenie, a tę wizytę jako Włączenie” tylko tam, gdzie da się ją wykonać', () => {
    const OGOLNY_C1 = 'Po tej zmianie w cyklu 1 zmieniałaby się substancja czynna (Saxenda → Wegovy) bez Zakończenia między wizytami. Zmiana substancji czynnej zaczyna nowy cykl — popraw lek albo datę.';
    const cykl1 = [W_SAX, K_SAX, M('c', 'end', 40, 9, 97.5, '2024-10-15')];
    const oba = [...cykl1, M('d', 'start', 40, 10, 98.5, '2024-11-12', WEGOVY), M('e', 'continue', 41, 1, 95.5, '2025-02-12', WEGOVY)];
    // Remis z Zakończeniem cyklu 1, gdy cykl 2 już jest: przed Zakończeniem — R6, po nim — przerwa.
    const remis = dodaj(oba, M('x', 'continue', 40, 9, 97.5, '2024-10-15', WEGOVY));
    expect(remis.ok).toBe(false);
    expect(remis.kod).toBe('zmiana-substancji');
    expect(remis.komunikat).toBe(OGOLNY_C1);
    expect(remis.krotko).toBe('Zmiana substancji w cyklu 1');
    // Rada byłaby tu niewykonalna: drugie Zakończenie cyklu 1 i Włączenie przed Włączeniem cyklu 2 są odrzucane.
    expect(dodaj(oba, M('z', 'end', 40, 9, 97.5, '2024-10-15')).kod).toBe('drugie-zakonczenie');
    expect(dodaj(oba, M('x', 'start', 40, 9, 97.5, '2024-10-15', WEGOVY)).kod).toBe('dwa-wlaczenia');
    // Wizyta w środku cyklu zakończonego i w środku trwającego (dopisana albo zmieniona) — też opis ogólny.
    expect(dodaj(cykl1, M('x', 'continue', 40, 6, 98, '2024-07-12', WEGOVY)).komunikat).toBe(OGOLNY_C1);
    const trwa = [W_SAX, K_SAX, M('k', 'continue', 40, 6, 98, '2024-07-12')];
    expect(dodaj(trwa, M('x', 'continue', 40, 5, 98.5, '2024-06-12', WEGOVY)).komunikat).toBe(OGOLNY_C1);
    expect(C.sprawdz(trwa, { rodzaj: 'edytuj', id: 'b', punkt: { ...K_SAX, ...WEGOVY } }).komunikat).toBe(OGOLNY_C1);
    // Kontrola: wizyta po ostatniej (tu w remisie z nią) w trwającym cyklu — rada zostaje i da się ją wykonać.
    const naKoncu = dodaj(trwa, M('x', 'continue', 40, 6, 98, '2024-07-12', WEGOVY));
    expect(naKoncu.krotko).toBe('Inna substancja niż w cyklu 1 (Saxenda)');
    const z = dodaj(trwa, M('z', 'end', 40, 6, 98, '2024-07-12'));
    expect(z.ok).toBe(true);
    const w = dodaj(z.punkty, M('x', 'start', 40, 6, 98, '2024-07-12', WEGOVY));
    expect(w.ok).toBe(true);
    expect(cykleId(w.punkty)).toEqual(['abkz', 'x']);
    // Remis przy edycji: zmiana leku pierwszej z dwóch wizyt tego samego dnia na końcu cyklu — rada
    // zostaje (Zakończenie stanie po obu), i da się ją wykonać.
    const dwie = [W_SAX, K_SAX, M('k', 'continue', 40, 3, 99, '2024-04-12')];
    expect(C.sprawdz(dwie, { rodzaj: 'edytuj', id: 'b', punkt: { ...K_SAX, ...WEGOVY } }).krotko).toBe('Inna substancja niż w cyklu 1 (Saxenda)');
    const z2 = dodaj(dwie, M('z', 'end', 40, 3, 99, '2024-04-12'));
    expect(z2.ok).toBe(true);
    const w2 = C.sprawdz(z2.punkty, { rodzaj: 'edytuj', id: 'b', punkt: { ...K_SAX, ...WEGOVY, type: 'start' } });
    expect(w2.ok).toBe(true);
    expect(cykleId(w2.punkty)).toEqual(['akz', 'b']);
  });
});

describe('R6: stary zapis ze zmianą substancji w cyklu (D5) — nic nie zmienia się samo, poprawka przechodzi', () => {
  it('podział: jeden cykl z niezgodnością „zmiana-substancji” [ostatni punkt Saxendy, pierwszy Wegovy]', () => {
    const w = C.podziel(STARY_R6);
    expect(w.cykle.map((c) => c.punkty.map((p) => p.id).join(''))).toEqual(['abef']);
    expect(w.niezgodnosci).toHaveLength(1);
    const n = w.niezgodnosci[0];
    expect(n.kod).toBe('zmiana-substancji');
    expect(n.punkty.map((p) => p.id)).toEqual(['b', 'e']);
    expect([n.z, n.na, n.cykl]).toEqual(['liraglutide', 'semaglutide', 1]);
    expect(w.cykle[0].niezgodnosci).toEqual([n]);
  });

  it('niezgodność R6 stoi po kodach sprzed raty 4 (dwa Włączenia zgłaszane pierwsze)', () => {
    const w = C.podziel([W_SAX, K_SAX, M('g', 'start', 40, 6, 98, '2024-07-12', WEGOVY)]);
    expect(w.niezgodnosci.map((n) => n.kod)).toEqual(['dwa-wlaczenia', 'zmiana-substancji']);
  });

  it('dopisanie Kontynuacji Wegovy na końcu przechodzi — to stare przejście, nie nowe', () => {
    const r = dodaj(STARY_R6, M('g', 'continue', 41, 6, 92, '2025-07-10', WEGOVY));
    expect(r.ok).toBe(true);
    expect(kody(r.punkty)).toEqual(['zmiana-substancji']);
  });

  it('dopisanie Kontynuacji Saxendy na końcu jest odrzucane — nowe przejście Wegovy → Saxenda', () => {
    const r = dodaj(STARY_R6, M('g', 'continue', 41, 6, 92, '2025-07-10'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zmiana-substancji');
    expect(r.krotko).toBe('Inna substancja niż w cyklu 1 (Wegovy)');
  });

  it('stare przejście przesunięte na inny punkt nie jest nowe (sygnatura = para substancji, nie punkty)', () => {
    // Saxenda dopisana między ostatnią Saxendą a pierwszą Wegovy — przejście przesuwa się na (g, e).
    const r1 = dodaj(STARY_R6, M('g', 'continue', 40, 8, 98, '2024-09-12'));
    expect(r1.ok).toBe(true);
    expect(C.podziel(r1.punkty).niezgodnosci[0].punkty.map((p) => p.id)).toEqual(['g', 'e']);
    // Poprawa leku pierwszej wizyty Wegovy na Saxendę — przejście przesuwa się na (e, f).
    const r2 = C.sprawdz(STARY_R6, { rodzaj: 'edytuj', id: 'e', punkt: { ...STARY_R6[2], ...SAXENDA } });
    expect(r2.ok).toBe(true);
    expect(C.podziel(r2.punkty).niezgodnosci[0].punkty.map((p) => p.id)).toEqual(['e', 'f']);
  });

  it('nowe przejście wcześniej w liście niż stare: komunikat wskazuje wizytę kandydata i jej cykl', () => {
    // Cykl 1 poprawny (Saxenda), cykl 2 bez Włączenia ze starym przejściem Saxenda → Wegovy.
    const lista = [W_SAX, K_SAX, M('c', 'end', 40, 9, 97.5, '2024-10-15'),
      M('d', 'continue', 41, 0, 97, '2025-01-10'), M('e', 'continue', 41, 3, 95, '2025-04-10', WEGOVY)];
    expect(kody(lista)).toEqual(['zmiana-substancji']);
    const r = dodaj(lista, M('x', 'continue', 40, 1, 102, '2024-02-12', WEGOVY));
    expect(r.ok).toBe(false);
    // Cykl 1 jest zakończony — bez rady o dopisaniu Zakończenia (opis ogólny), ale z cyklem
    // i kierunkiem przejścia kandydata (nie Wegovy → Saxenda za nim, nie stare przejście cyklu 2).
    expect(r.komunikat).toBe('Po tej zmianie w cyklu 1 zmieniałaby się substancja czynna (Saxenda → Wegovy) bez Zakończenia między wizytami. Zmiana substancji czynnej zaczyna nowy cykl — popraw lek albo datę.');
    expect(r.krotko).toBe('Zmiana substancji w cyklu 1');
  });

  it('nowe przejście przed starym w tym samym cyklu: komunikat o przejściu do wizyty kandydata', () => {
    // Wegovy dopisana między Włączenie a Kontynuację Saxendy starego zapisu: przejście Saxenda →
    // Wegovy przed kandydatem jest „#1” (para już była), a numerację przejmuje stare (b, e) jako „#2”.
    const r = dodaj(STARY_R6, M('x', 'continue', 40, 1, 102, '2024-02-12', WEGOVY));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zmiana-substancji');
    expect(r.komunikat).toBe('Po tej zmianie w cyklu 1 zmieniałaby się substancja czynna (Saxenda → Wegovy) bez Zakończenia między wizytami. Zmiana substancji czynnej zaczyna nowy cykl — popraw lek albo datę.');
  });

  it('poprawka w dwóch krokach: Zakończenie Saxendy w dniu pierwszej wizyty Wegovy, potem ta wizyta jako Włączenie', () => {
    const r1 = dodaj(STARY_R6, M('z', 'end', 41, 1, 95.5, '2025-02-12'));
    expect(r1.ok).toBe(true);
    expect(cykleId(r1.punkty)).toEqual(['abz', 'ef']);
    const po1 = C.podziel(r1.punkty);
    expect(po1.cykle[1].wlaczenie).toBeNull();
    expect(po1.niezgodnosci).toEqual([]);
    const r2 = C.sprawdz(r1.punkty, { rodzaj: 'edytuj', id: 'e', punkt: { ...STARY_R6[2], type: 'start' } });
    expect(r2.ok).toBe(true);
    const po2 = C.podziel(r2.punkty);
    expect(po2.cykle.map((c) => c.punkty.map((p) => p.id).join(''))).toEqual(['abz', 'ef']);
    expect(po2.cykle[1].wlaczenie.id).toBe('e');
    expect(po2.niezgodnosci).toEqual([]);
    // Zakończenie Saxendy wcześniej niż pierwsza wizyta Wegovy (po ostatniej Saxendzie) też rozdziela zapis.
    const r3 = dodaj(STARY_R6, M('z', 'end', 40, 10, 98, '2024-11-10'));
    expect(r3.ok).toBe(true);
    expect(cykleId(r3.punkty)).toEqual(['abz', 'ef']);
  });

  it('Zakończenie z lekiem nowej substancji nie jest poprawką starego zapisu — Zakończenie ma lek swojego cyklu', () => {
    const Z_KOMUNIKAT = 'Zakończenie zamyka cykl 1 — zapisz je z lekiem tego cyklu (Saxenda). Nowy lek (Wegovy) zapiszesz potem jako Włączenie nowego cyklu, także tego samego dnia.';
    // Przed pierwszą wizytą Wegovy i w jej dniu (remis) — para Saxenda → Wegovy już była, ale
    // przejście na Zakończenie jest nowe.
    for (const z of [M('z', 'end', 40, 10, 98, '2024-11-10', WEGOVY), M('z', 'end', 41, 1, 95.5, '2025-02-12', WEGOVY)]) {
      const r = dodaj(STARY_R6, z);
      expect(r.ok).toBe(false);
      expect(r.kod).toBe('zmiana-substancji');
      expect(r.komunikat).toBe(Z_KOMUNIKAT);
      expect(r.krotko).toBe('Zakończenie z lekiem cyklu 1 (Saxenda)');
      expect(r.punkty).toBeUndefined();
    }
    // Zakończenie bez leku (punkt neutralny) jest poprawką jak Zakończenie z Saxendą.
    const bezLeku = dodaj(STARY_R6, M('z', 'end', 40, 10, 98, '2024-11-10', { drug: '', substance: '' }));
    expect(bezLeku.ok).toBe(true);
    expect(cykleId(bezLeku.punkty)).toEqual(['abz', 'ef']);
    expect(kody(bezLeku.punkty)).toEqual([]);
  });

  it('stare Zakończenie z lekiem nowej substancji wolno edytować (D5); poprawka leku usuwa niezgodność', () => {
    const lista = [W_SAX, K_SAX, M('z', 'end', 40, 9, 97.5, '2024-10-15', WEGOVY)];
    expect(C.podziel(lista).niezgodnosci.map((n) => n.punkty.map((p) => p.id).join(','))).toEqual(['b,z']);
    const masa = C.sprawdz(lista, { rodzaj: 'edytuj', id: 'z', punkt: { ...lista[2], weight: 97 } });
    expect(masa.ok).toBe(true);
    expect(kody(masa.punkty)).toEqual(['zmiana-substancji']);
    const lek = C.sprawdz(lista, { rodzaj: 'edytuj', id: 'z', punkt: { ...lista[2], ...SAXENDA } });
    expect(lek.ok).toBe(true);
    expect(kody(lek.punkty)).toEqual([]);
  });

  it('stare przejście nie przenosi się zmianą daty do innego cyklu, w którym tej pary nie było', () => {
    // Cykl 1: stary zapis W, K Saxenda, K Wegovy, Z Saxenda; cykl 2: W, K Saxenda — poprawny, oceniany wg ChPL.
    const lista = [W_SAX, K_SAX, M('e', 'continue', 40, 6, 97, '2024-07-12', WEGOVY), M('z', 'end', 40, 9, 97, '2024-10-15'),
      M('d', 'start', 40, 10, 98.5, '2024-11-12'), M('g', 'continue', 41, 1, 95.5, '2025-02-12')];
    expect(C.podziel(lista).niezgodnosci.map((n) => `${n.punkty.map((p) => p.id).join(',')}:${n.cykl}`)).toEqual(['b,e:1', 'e,z:1']);
    // Sygnatura (para + numer wystąpienia) by przepuściła: przed — Saxenda → Wegovy #1, po — też #1 (w cyklu 2).
    const r = C.sprawdz(lista, { rodzaj: 'edytuj', id: 'e', punkt: { ...lista[2], dateISO: '2025-03-01', ageYears: 41, ageMonths: 2 } });
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zmiana-substancji');
    expect(r.komunikat).toBe('Po tej zmianie w cyklu 2 zmieniałaby się substancja czynna (Saxenda → Wegovy) bez Zakończenia między wizytami. Zmiana substancji czynnej zaczyna nowy cykl — popraw lek albo datę.');
    expect(r.potwierdz).toBeUndefined();
    // Kontrola: to samo przeniesienie do cyklu Wegovy porządkuje zapis — pytanie o przeniesienie, bez niezgodności.
    const doWegovy = lista.map((p) => (p.id === 'd' || p.id === 'g' ? { ...p, ...WEGOVY } : p));
    const ok = C.sprawdz(doWegovy, { rodzaj: 'edytuj', id: 'e', punkt: { ...doWegovy[2], dateISO: '2025-03-01', ageYears: 41, ageMonths: 2 } });
    expect(ok.ok).toBe(true);
    expect(ok.uwaga).toBe('przeniesienie');
    expect(kody(ok.punkty)).toEqual([]);
  });

  it('przenumerowanie cykli nie robi ze starego przejścia nowego (cykl rozpoznany po punktach, nie po numerze)', () => {
    // Stary zapis z dwoma Włączeniami: W, K 2023, potem W, K Saxenda i K, K Wegovy — jeden cykl. Zakończenie
    // przed drugim Włączeniem rozdziela go (rata 2), a stare przejście przechodzi z cyklu 1 do cyklu 2.
    const lista = [M('p', 'start', 39, 0, 110, '2023-01-12'), M('q', 'continue', 39, 3, 108, '2023-04-12'), ...STARY_R6];
    expect(kody(lista)).toEqual(['dwa-wlaczenia', 'zmiana-substancji']);
    const r = dodaj(lista, M('z', 'end', 39, 6, 107, '2023-07-12'));
    expect(r.ok).toBe(true);
    expect(cykleId(r.punkty)).toEqual(['pqz', 'abef']);
    expect(C.podziel(r.punkty).niezgodnosci.map((n) => `${n.kod}:${n.cykl}`)).toEqual(['zmiana-substancji:2']);
  });

  it('Zakończenie w środku cyklu, po którym nie zaczyna się nowa substancja, nadal jest odrzucane', () => {
    const r = dodaj(STARY_R6, M('z', 'end', 41, 2, 95, '2025-03-01'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zakonczenie-nie-ostatnie');
  });

  it('usunięcie nie jest blokowane przez R6 — także pierwszego punktu nowej substancji', () => {
    const r = C.sprawdz(STARY_R6, { rodzaj: 'usun', id: 'e' });
    expect(r.ok).toBe(true);
    expect(r.punkty.map((p) => p.id).join('')).toBe('abf');
    // Trzy substancje: usunięcie środkowej tworzy NOWĄ parę (liraglutyd → tirzepatyd) — i tak przechodzi.
    const trzy = [W_SAX, M('b', 'continue', 40, 3, 99, '2024-04-12', WEGOVY), M('c', 'continue', 40, 6, 98, '2024-07-12', MOUNJARO)];
    const r3 = C.sprawdz(trzy, { rodzaj: 'usun', id: 'b' });
    expect(r3.ok).toBe(true);
    expect(C.podziel(r3.punkty).niezgodnosci.map((n) => `${n.z}>${n.na}`)).toEqual(['liraglutide>tirzepatide']);
  });
});

describe('R6: zachowanie bez modułu kryteriów i przy jego awarii', () => {
  it('bez kryteriów ChPL R6 nie działa — zasada sprzed raty 4 (kontrola negatywna)', () => {
    const bez = oknoCykli();
    expect(bez.substancja(W_SAX)).toBeNull();
    const r = bez.sprawdz([W_SAX], { rodzaj: 'dodaj', punkt: M('x', 'continue', 40, 3, 99, '2024-04-12', WEGOVY) });
    expect(r.ok).toBe(true);
    expect(bez.podziel(STARY_R6).niezgodnosci).toEqual([]);
    // Ten sam przypadek z produkcyjnymi kryteriami — odmowa (różnica bierze się wyłącznie z kryteriów).
    expect(dodaj([W_SAX], M('x', 'continue', 40, 3, 99, '2024-04-12', WEGOVY)).kod).toBe('zmiana-substancji');
  });

  it('kryteria czytane w chwili wywołania — moduł kryteriów załadowany po module cykli też działa', () => {
    const win = {};
    new Function('window', 'globalThis', zrodlo('vilda_cykle_leczenia.js'))(win, win);
    expect(win.VildaCykleLeczenia.substancja(W_SAX)).toBeNull();
    new Function('window', 'globalThis', zrodlo('obesity_response_criteria.js'))(win, win);
    expect(win.VildaCykleLeczenia.substancja(W_SAX)).toBe('liraglutide');
  });

  it('wyjątek w rozpoznaniu substancji nie wywraca sprawdzenia — punkt jest neutralny', () => {
    const awaria = oknoCykli({ ObesityResponseCriteria: { resolveDrug() { throw new Error('awaria'); } } });
    expect(awaria.substancja(W_SAX)).toBeNull();
    expect(awaria.nazwaLeku({ substance: '' })).toBe('');
    const r = awaria.sprawdz([W_SAX], { rodzaj: 'dodaj', punkt: M('x', 'continue', 40, 3, 99, '2024-04-12', WEGOVY) });
    expect(r.ok).toBe(true);
  });
});
