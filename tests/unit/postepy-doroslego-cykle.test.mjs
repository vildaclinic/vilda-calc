import { describe, expect, it } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-OTYLOSC-CYKLE rata 4 (decyzja właściciela 2026-09-30: rekomendacje D1–D8 projektu „Cykle leczenia
// otyłości” przyjęte; 2026-10-01: „ruszaj z ratą 4”). Zakładka „Postępy” dorosłego liczy punkt odniesienia,
// lek i stan leczenia z BIEŻĄCEGO cyklu (`VildaCykleLeczenia.podziel`, granica = Zakończenie). Do tej raty
// brała pierwsze Włączenie w kolejności wpisywania i ogłaszała „odstawione” przy jakimkolwiek Zakończeniu.
//
// Testy wołają PRAWDZIWE `scalSerie` → `analizuj` (dokładnie tak, jak Karta pacjenta w vilda_auth_ui.js),
// `buildHtml` i `buildDokument` (AGENTS.md §3 pkt 5). Dane pacjentów wyłącznie FIKCYJNE (§4).

function moduly(win = {}) {
  const g = loadBrowserScript('vilda_postepy_doroslego_wydruk.js', win);
  return { g, P: g.VildaPostepyDoroslego, U: g.VildaPostepyDoroslegoUI, W: g.VildaPostepyDoroslegoWydruk };
}

const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP\u20111)', dose: '3,0 mg / dobę' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP\u20111)', dose: '2,4 mg / tydz.' };

/* Dorosły 170 cm, urodzony 12.01.1984 — wiek w konwencji monitora (lata + RESZTA miesięcy) zgodny z datą. */
const pkt = (type, dateISO, weight, lek, lata, mies) => {
  const p = { id: `${type}-${dateISO}`, type, dateISO, height: 170, ageYears: lata, ageMonths: mies, ...lek };
  if (weight != null) { p.weight = weight; p.bmi = +(weight / 2.89).toFixed(1); }
  return p;
};

/* Przypadek syntetyczny projektu (CY-10): cykl 1 Saxenda zakończony, cykl 2 Wegovy aktywny. */
const CYKL_1 = [
  pkt('start', '2024-01-12', 104, SAXENDA, 40, 0),
  pkt('continue', '2024-04-12', 99, SAXENDA, 40, 3),
  pkt('end', '2024-10-15', 97.5, SAXENDA, 40, 9),
];
const CYKL_2 = [
  pkt('start', '2024-11-12', 98.5, WEGOVY, 40, 10),
  pkt('continue', '2025-02-12', 95.5, WEGOVY, 41, 1),
  pkt('continue', '2025-05-10', 93, WEGOVY, 41, 3),
];
const CY10 = [...CYKL_1, ...CYKL_2];
const WIEK_MIES = 41 * 12 + 3;

/** To samo wywołanie co Karta pacjenta (vilda_auth_ui.js, panel „Postępy”): scalona seria + surowe punkty. */
function zKarty(P, punkty, pomiaryOsi = []) {
  const ser = P.scalSerie({ pomiary: pomiaryOsi, punktyLeczenia: punkty });
  return P.analizuj({
    wiekMies: WIEK_MIES,
    pomiary: ser.pomiary.map((c) => ({ ageMonthsTotal: c.wiekMies, weight: c.masa, height: c.wzrost, dateISO: c.dateISO })),
    punktyLeczenia: punkty,
  });
}

const tekstHtml = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** Cały tekst dokumentu pdfmake, niezależnie od zagnieżdżenia. */
function tekstem(w) {
  if (w == null) return '';
  if (typeof w === 'string' || typeof w === 'number') return String(w);
  if (Array.isArray(w)) return w.map(tekstem).join(' ');
  if (typeof w !== 'object') return '';
  return [w.text, w.stack, w.columns, w.content, w.table && w.table.body, w.ul, w.ol].map(tekstem).join(' ');
}

const OPCJE_DRUKU = { pacjent: 'Testowy Fikcyjny', wiekLat: 41, dataWydruku: '2025-05-12' };

/* Kolejności wpisu: chronologiczna, odwrócona i przemieszana. Wynik ma od nich nie zależeć. */
const KOLEJNOSCI = [
  ['chronologicznie', CY10],
  ['odwrotnie', CY10.slice().reverse()],
  ['cykl 2 przed cyklem 1', [...CYKL_2, ...CYKL_1]],
  ['przemieszane', [CY10[4], CY10[0], CY10[5], CY10[2], CY10[3], CY10[1]]],
];

describe('CY-10 — dwa cykle: „Postępy” liczą bieżący cykl', () => {
  it.each(KOLEJNOSCI)('odniesienie, lek i stan z cyklu 2 (Wegovy) — kolejność wpisu: %s', (_, punkty) => {
    const m = zKarty(moduly().P, punkty);
    expect(m.cykl).toEqual({ numer: 2, liczba: 2, stan: 'aktywny', bezWlaczenia: false, niezgodnosci: [] });
    expect(m.punktOdniesienia.zrodlo).toBe('start-leczenia');
    expect(m.punktOdniesienia.masa, 'masa przy Włączeniu Wegovy, nie 104 kg sprzed Saxendy').toBe(98.5);
    expect(m.punktOdniesienia.dateISO).toBe('2024-11-12');
    expect(m.leczenie.stan, 'Zakończenie Saxendy nie odstawia Wegovy').toBe('na-leczeniu');
    expect(m.leczenie.odstawienieTydzien).toBeNull();
    expect(m.leczenie.odstawienieDateISO).toBeNull();
    expect(m.leczenie.lek).toBe(WEGOVY.drug);
    expect(m.leczenie.substancja, 'etykieta substancji zapisana przez monitor').toBe(WEGOVY.substance);
    expect(m.zestaw.id, 'drabinka Wegovy (ogólna), nie liraglutydu').toBe('OGOLNY');
    expect(m.punktDecyzyjny.jest, 'ChPL semaglutydu nie podaje progu ani terminu').toBe(false);
    expect(m.kamienie.filter((k) => k.typ === 'punkt-chpl')).toHaveLength(0);
    expect(m.ostrzezenia).toEqual([]);
  });

  it('pomiary cyklu 1 zostają na wykresie z ujemnymi tygodniami i bez kamieni', () => {
    const m = zKarty(moduly().P, CY10);
    expect(m.seria.map((s) => s.tydzien)).toEqual([-44, -31, -4, 0, 13, 26]);
    expect(m.seria.map((s) => s.przedOdniesieniem)).toEqual([true, true, true, false, false, false]);
    // Jedyny kamień: 5 % od 98,5 kg (10.05.2025). Przejście „Otyłość II → I” z cyklu 1 to kontekst, nie kamień.
    expect(m.kamienie.map((k) => `${k.tydzien}:${k.typ}`)).toEqual(['26:pasmo-osiagniete']);
    expect(m.przekroczenia[0]).toMatchObject({ prog: 5, osiagniety: true, dateISO: '2025-05-10', masa: 93 });
    expect(m.seria[5].zmianaMasyKg).toBeCloseTo(-5.5, 6);
    expect(m.seria[5].zmianaMasyPct).toBeCloseTo(-5.584, 3);
  });

  it('ostatni cykl zakończony → „odstawione”, tydzień od JEGO Włączenia', () => {
    const z = pkt('end', '2025-06-01', 92.5, WEGOVY, 41, 4);
    for (const punkty of [[...CY10, z], [z, ...CY10.slice().reverse()]]) {
      const m = zKarty(moduly().P, punkty);
      expect(m.cykl).toMatchObject({ numer: 2, liczba: 2, stan: 'zakonczony' });
      expect(m.leczenie.stan).toBe('odstawione');
      expect(m.leczenie.odstawienieDateISO).toBe('2025-06-01');
      // 12.11.2024 → 01.06.2025 = 201 dni = 28,7 tyg. Dotąd 72 — od Włączenia Saxendy.
      expect(m.leczenie.odstawienieTydzien).toBe(29);
      expect(m.punktOdniesienia.masa).toBe(98.5);
    }
  });

  it('Zakończenie bez masy (np. z importu) nadal odstawia leczenie', () => {
    // `normPomiar` wyrzuca punkt bez masy, więc dotąd taki punkt znikał i stan brzmiał „na leczeniu”.
    const z = pkt('end', '2025-06-01', null, WEGOVY, 41, 4);
    const m = zKarty(moduly().P, [...CY10, z]);
    expect(m.leczenie.stan).toBe('odstawione');
    expect(m.leczenie.odstawienieDateISO).toBe('2025-06-01');
    expect(m.leczenie.odstawienieTydzien).toBe(29);
    expect(m.seria, 'punkt bez masy nie trafia do serii').toHaveLength(6);
    const h = tekstHtml(moduly().U.buildHtml(m));
    expect(h).toContain('Leczenie odstawione w 29. tygodniu');
  });

  // Recenzja całości raty 4: jedyna w „Postępach” zmiana wyniku u pacjenta z JEDNYM cyklem i jedną substancją
  // (ALGORITHMS.md, wiersz „jeden cykl” tabeli przypadków). Dotąd Zakończenie bez masy wypadało w `normPomiar`,
  // więc stan brzmiał „na leczeniu”; moduł cykli widzi je na surowych punktach.
  it('jeden cykl, Zakończenie bez masy → „odstawione” w 40. tyg. (dotąd „na leczeniu”)', () => {
    const { P, U } = moduly();
    const punkty = [CYKL_1[0], CYKL_1[1], pkt('end', '2024-10-15', null, SAXENDA, 40, 9)];
    for (const kolejnosc of [punkty, punkty.slice().reverse()]) {
      const m = zKarty(P, kolejnosc);
      expect(m.cykl).toEqual({ numer: 1, liczba: 1, stan: 'zakonczony', bezWlaczenia: false, niezgodnosci: [] });
      expect(m.leczenie.stan).toBe('odstawione');
      expect(m.leczenie.odstawienieTydzien).toBe(40);
      expect(m.leczenie.odstawienieDateISO).toBe('2024-10-15');
      expect(m.punktOdniesienia.masa).toBe(104);
      expect(m.seria, 'punkt bez masy nie trafia do serii').toHaveLength(2);
      expect(tekstHtml(U.buildHtml(m))).toContain('Leczenie odstawione w 40. tygodniu');
    }
  });

  it('jeden cykl → wynik.cykl „1 z 1” i ten sam wynik co dotąd', () => {
    const m = zKarty(moduly().P, CYKL_1);
    expect(m.cykl).toEqual({ numer: 1, liczba: 1, stan: 'zakonczony', bezWlaczenia: false, niezgodnosci: [] });
    expect(m.punktOdniesienia.masa).toBe(104);
    expect(m.leczenie.stan).toBe('odstawione');
    expect(m.leczenie.odstawienieTydzien).toBe(40);
    expect(m.zestaw.id).toBe('LIRAGLUTYD');
    expect(m.punktDecyzyjny.tydzienOdOdniesienia).toBe(16);
  });

  it('bez punktów leczenia wynik.cykl jest null, a stan „brak-danych” jak dotąd', () => {
    const { P } = moduly();
    const m = P.analizuj({ wiekLat: 47, pomiary: [
      { dateISO: '2026-01-08', weight: 112.4, height: 167 },
      { dateISO: '2026-05-14', weight: 96.2, height: 167 },
    ] });
    expect(m.cykl).toBeNull();
    expect(m.leczenie.stan).toBe('brak-danych');
    const zamknieta = P.analizuj({ wiekLat: 9, pomiary: [], punktyLeczenia: CY10 });
    expect(zamknieta.dostepne.ok).toBe(false);
    expect(zamknieta.cykl, 'kształt wyniku stały także przy zamkniętej bramie').toMatchObject({ numer: 2, liczba: 2 });
  });
});

describe('Cykl nr 2 bez Włączenia — odniesienie z tego cyklu, nie z poprzedniego', () => {
  /* Stary zapis: Kontynuacja po Zakończeniu → `podziel` daje cykl 2 bez Włączenia. */
  const KPOZ = [...CYKL_1, pkt('continue', '2024-11-12', 98.5, WEGOVY, 40, 10), CYKL_2[1], CYKL_2[2]];

  it('procenty od pierwszego pomiaru cyklu 2 (98,5 kg), nie od 104 kg z cyklu 1', () => {
    const m = zKarty(moduly().P, KPOZ);
    expect(m.cykl).toEqual({ numer: 2, liczba: 2, stan: 'aktywny', bezWlaczenia: true, niezgodnosci: [] });
    expect(m.punktOdniesienia.zrodlo).toBe('pierwszy-pomiar-cyklu');
    expect(m.punktOdniesienia.masa).toBe(98.5);
    expect(m.punktOdniesienia.dateISO).toBe('2024-11-12');
    expect(m.punktOdniesienia.opis).toBe('Bieżący cykl leczenia (po Zakończeniu poprzedniego) nie ma punktu „Włączenie” — procenty liczone od pierwszego pomiaru tego cyklu, nie od masy sprzed leczenia.');
    expect(m.leczenie.stan).toBe('na-leczeniu');
    expect(m.leczenie.lek).toBe(WEGOVY.drug);
    expect(m.seria.map((s) => s.tydzien)).toEqual([-44, -31, -4, 0, 13, 26]);
  });

  it('podpis osi i opis odniesienia mówią o pierwszym pomiarze bieżącego cyklu', () => {
    const { P, U } = moduly();
    const h = U.buildHtml(zKarty(P, KPOZ));
    expect(h).toContain('tygodnie od pierwszego pomiaru bieżącego cyklu');
    expect(tekstHtml(h)).toContain('Wszystkie zmiany liczone od pierwszego pomiaru bieżącego cyklu leczenia (cykl 2 z 2; 98,5 kg, 12.11.2024) — ten cykl nie ma punktu „Włączenie”, więc procenty nie liczą się od masy sprzed leczenia, nie od poprzedniej wizyty.');
  });

  it('lek z ChPL w cyklu bez Włączenia: znacznik ChPL znika jak w F1 (bez wspólnego zera)', () => {
    const kpozSax = [...CYKL_1,
      pkt('continue', '2024-11-12', 98.5, SAXENDA, 40, 10), pkt('continue', '2025-02-12', 95.5, SAXENDA, 41, 1)];
    const m = zKarty(moduly().P, kpozSax);
    expect(m.zestaw.id).toBe('LIRAGLUTYD');
    expect(m.punktDecyzyjny.jest).toBe(true);
    expect(m.punktDecyzyjny.tydzienOdOdniesienia).toBeNull();
    expect(m.punktDecyzyjny.bezOsi).toBe('brak-punktu-wlaczenia');
    expect(m.ostrzezenia.join(' ')).toContain('procenty liczą się od pierwszego pomiaru bieżącego cyklu, nie od masy początkowej z ChPL');
  });

  it('remis dat z Zakończeniem poprzedniego cyklu: wygrywa pomiar, który jest punktem bieżącego cyklu', () => {
    // Pierwszy krok poprawki starego zapisu w monitorze: Zakończenie Saxendy z datą pierwszej
    // Kontynuacji Wegovy. Ten sam dzień, inna masa — dwa pomiary w serii o tej samej dacie.
    const punkty = [CYKL_1[0], CYKL_1[1], pkt('end', '2024-11-12', 98.7, SAXENDA, 40, 10),
      pkt('continue', '2024-11-12', 98.5, WEGOVY, 40, 10), CYKL_2[1]];
    const m = zKarty(moduly().P, punkty);
    expect(m.cykl).toMatchObject({ numer: 2, bezWlaczenia: true });
    expect(m.punktOdniesienia.masa, 'masa wizyty cyklu 2, nie Zakończenia cyklu 1').toBe(98.5);
  });

  it('seria bez pomiarów cyklu (same pomiary z osi czasu sprzed cyklu) → pierwszy punkt cyklu', () => {
    const { P } = moduly();
    const m = P.analizuj({
      wiekMies: WIEK_MIES,
      pomiary: [{ dateISO: '2024-01-12', weight: 104, height: 170 }, { dateISO: '2024-04-12', weight: 99, height: 170 }],
      punktyLeczenia: KPOZ,
    });
    expect(m.punktOdniesienia.zrodlo).toBe('pierwszy-pomiar-cyklu');
    expect(m.punktOdniesienia.masa).toBe(98.5);
  });
});

describe('Remis dat z Zakończeniem poprzedniego cyklu — jego pomiar nie jest postępem bieżącego', () => {
  /* Poprawka po recenzji raty 4. Zakończenie cyklu 1 i pierwszy punkt cyklu 2 tego samego dnia (CY-8,
     poprawka dwukrokowa starego zapisu) z RÓŻNĄ masą. Pomiar Zakończenia dostawał tydzień 0, liczył się
     „po odniesieniu”, przy niższej masie zostawał nadirem i silnik ogłaszał „istotny odzysk” (waga
     „alarm”) — w panelu i na kartce pacjenta — z danych poprzedniego leczenia. */

  /** CY-8 przez PRAWDZIWE `VildaCykleLeczenia.sprawdz` — zapis, który monitor przyjmuje. */
  function cy8(g, masaZ) {
    const C = g.VildaCykleLeczenia;
    let pts = [];
    for (const p of [
      pkt('start', '2024-01-12', 104, SAXENDA, 40, 0), pkt('continue', '2024-04-12', 99, SAXENDA, 40, 3),
      pkt('end', '2024-11-12', masaZ, SAXENDA, 40, 10), pkt('start', '2024-11-12', 98.5, WEGOVY, 40, 10),
      pkt('continue', '2025-02-12', 98.2, WEGOVY, 41, 1),
    ]) {
      const r = C.sprawdz(pts, { rodzaj: 'dodaj', punkt: p }, {});
      expect(r.ok, `monitor przyjmuje ${p.type} ${p.dateISO}`).toBe(true);
      pts = r.punkty;
    }
    return pts;
  }
  const wDniu = (m, masa) => m.seria.find((s) => s.dateISO === '2024-11-12' && s.masa === masa);

  it('CY-8, Zakończenie 97,0 kg < Włączenie 98,5 kg: bez nadiru i bez alarmu „istotny odzysk”', () => {
    const { g, P, U, W } = moduly();
    const m = zKarty(P, cy8(g, 97));
    expect(m.cykl).toEqual({ numer: 2, liczba: 2, stan: 'aktywny', bezWlaczenia: false, niezgodnosci: [] });
    expect(m.punktOdniesienia).toMatchObject({ zrodlo: 'start-leczenia', masa: 98.5, dateISO: '2024-11-12' });
    expect(wDniu(m, 97), 'Zakończenie Saxendy: tydzień 0 na wykresie, ale sprzed odniesienia')
      .toMatchObject({ tydzien: 0, przedOdniesieniem: true });
    expect(wDniu(m, 98.5).przedOdniesieniem).toBe(false);
    expect(m.seria.map((s) => s.przedOdniesieniem)).toEqual([true, true, true, false, false]);
    // Dotąd: nadir 97,0 kg w 0. tyg., kamienie [nadir, istotny-odzysk], zdarzenie istotny-odzysk „alarm”.
    expect(m.nadir).toMatchObject({ masa: 98.2, tydzien: 13, ostatni: true });
    expect(m.zdarzenia).toEqual([]);
    expect(m.kamienie).toEqual([]);
    expect(m.odzysk).toMatchObject({ istotny: false, liniaDoPokazania: false });
    const h = tekstHtml(U.buildHtml(m));
    expect(h).not.toContain('Odzyskano');
    expect(h).not.toContain('Najniższa masa ciała');
    const tp = tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'pacjent' }).content);
    expect(tp).not.toContain('Odzyskano');
    expect(tp).toContain('Od włączenia bieżącego leczenia (12.11.2024) masa ciała zmniejszyła się o 0,3 kg');
  });

  it('CY-8, Zakończenie 99,5 kg > Włączenie 98,5 kg: pomiar Zakończenia też sprzed odniesienia', () => {
    const { g, P } = moduly();
    const m = zKarty(P, cy8(g, 99.5));
    expect(m.punktOdniesienia.masa).toBe(98.5);
    expect(wDniu(m, 99.5)).toMatchObject({ tydzien: 0, przedOdniesieniem: true });
    expect(m.nadir).toMatchObject({ masa: 98.2, ostatni: true });
    expect(m.kamienie).toEqual([]);
  });

  it('CY-8 z tą samą masą Zakończenia i Włączenia: jedna wizyta w serii, liczona w bieżącym cyklu', () => {
    const { g, P } = moduly();
    const m = zKarty(P, cy8(g, 98.5));
    expect(m.seria.filter((s) => s.dateISO === '2024-11-12')).toHaveLength(1);
    expect(wDniu(m, 98.5)).toMatchObject({ tydzien: 0, przedOdniesieniem: false });
  });

  it('cykl 2 bez Włączenia (Zakończenie w dniu pierwszej K, krok 1 poprawki): to samo, odniesienie z cyklu 2', () => {
    const punkty = [CYKL_1[0], CYKL_1[1], pkt('end', '2024-11-12', 97, SAXENDA, 40, 10),
      pkt('continue', '2024-11-12', 98.5, WEGOVY, 40, 10), pkt('continue', '2025-02-12', 98.2, WEGOVY, 41, 1)];
    const m = zKarty(moduly().P, punkty);
    expect(m.cykl).toMatchObject({ numer: 2, bezWlaczenia: true });
    expect(m.punktOdniesienia).toMatchObject({ zrodlo: 'pierwszy-pomiar-cyklu', masa: 98.5 });
    expect(wDniu(m, 97)).toMatchObject({ tydzien: 0, przedOdniesieniem: true });
    expect(m.nadir).toMatchObject({ masa: 98.2, ostatni: true });
    expect(m.zdarzenia).toEqual([]);
    expect(m.kamienie).toEqual([]);
  });

  it('pierwszy punkt cyklu 2 bez masy w dniu Zakończenia: odniesieniem następna wizyta cyklu 2, nie Zakończenie', () => {
    const punkty = [CYKL_1[0], CYKL_1[1], pkt('end', '2024-11-12', 97, SAXENDA, 40, 10),
      pkt('continue', '2024-11-12', null, WEGOVY, 40, 10), pkt('continue', '2025-02-12', 95.5, WEGOVY, 41, 1)];
    const m = zKarty(moduly().P, punkty);
    expect(m.cykl).toMatchObject({ numer: 2, bezWlaczenia: true });
    // Dotąd: 97,0 kg z Zakończenia Saxendy (pierwszy pomiar w dniu początku cyklu 2).
    expect(m.punktOdniesienia).toMatchObject({ zrodlo: 'pierwszy-pomiar-cyklu', masa: 95.5, dateISO: '2025-02-12' });
    expect(wDniu(m, 97)).toMatchObject({ tydzien: -13, przedOdniesieniem: true });
  });
});

describe('Cykl nr ≥ 2 bez żadnego pomiaru masy — stan „brak-pomiaru-cyklu”', () => {
  /* Poprawka po recenzji raty 4. Jedyna Kontynuacja nowego cyklu bez masy (np. z importu): silnik wracał
     po cichu do 104 kg z cyklu 1, z kamieniami cyklu 1 i z nieprawdą „w rekordzie nie ma punktu
     „Włączenie”” (cykl 1 je ma). */
  const BEZ_MASY = [...CYKL_1, pkt('continue', '2024-11-12', null, WEGOVY, 40, 10)];
  const OSTRZ = 'Bieżący cykl leczenia nie ma jeszcze pomiaru masy ciała — wykres pokazuje wyłącznie pomiary sprzed tego cyklu, bez kamieni milowych i bez oceny postępu.';

  it('wszystkie pomiary sprzed odniesienia: bez kamieni, nadiru, odzysku i pasm; ostrzeżenie', () => {
    const m = zKarty(moduly().P, BEZ_MASY);
    expect(m.cykl).toEqual({ numer: 2, liczba: 2, stan: 'aktywny', bezWlaczenia: true, niezgodnosci: [] });
    expect(m.punktOdniesienia.zrodlo).toBe('brak-pomiaru-cyklu');
    expect(m.punktOdniesienia.masa, 'arytmetyka od pierwszego pomiaru serii — innej masy nie ma').toBe(104);
    expect(m.punktOdniesienia.opis).toBe('Bieżący cykl leczenia (po Zakończeniu poprzedniego) nie ma jeszcze pomiaru masy ciała — procenty liczone od pierwszego pomiaru w serii, a wszystkie pomiary pochodzą sprzed tego cyklu.');
    expect(m.seria.map((s) => s.przedOdniesieniem)).toEqual([true, true, true]);
    // Dotąd: kamienie [13:zmiana-klasy, 40:pasmo-osiagniete] z cyklu 1.
    expect(m.kamienie).toEqual([]);
    expect(m.nadir).toBeNull();
    expect(m.odzysk).toBeNull();
    expect(m.przekroczenia.some((p) => p.osiagniety)).toBe(false);
    expect(m.wskazniki.zmianaMasy, 'kafelek zmiany bez werdyktu').toBeNull();
    expect(m.ostrzezenia).toContain(OSTRZ);
    expect(m.leczenie.stan).toBe('na-leczeniu');
  });

  it('teksty: panel i kartki nie twierdzą, że w rekordzie nie ma Włączenia', () => {
    const { P, U, W } = moduly();
    const m = zKarty(P, BEZ_MASY);
    const h = U.buildHtml(m);
    const t = tekstHtml(h);
    expect(t).toContain('Wszystkie zmiany liczone od pierwszego zapisanego pomiaru (104,0 kg, 12.01.2024), nie od poprzedniej wizyty. Bieżący cykl leczenia (cykl 2 z 2) nie ma jeszcze pomiaru masy ciała — wykres pokazuje tylko pomiary sprzed tego cyklu.');
    // Zdanie o odniesieniu (pod kafelkami); ogólny opis pasm (`OPIS_PASM`, bez zmian w racie) mówi o tym przypadku warunkowo.
    const odn = (h.match(/<p class="vilda-pd-odn">([\s\S]*?)<\/p>/) || [])[1];
    expect(odn).toBeTruthy();
    expect(odn).not.toContain('w rekordzie nie ma punktu');
    expect(t).toContain(OSTRZ);
    expect(h).toContain('tygodnie od pierwszego pomiaru');
    expect(h).not.toContain('pierwszego pomiaru bieżącego cyklu');
    const tk = tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'kliniczny' }).content);
    expect(tk).toContain('Punkt odniesienia: pierwszy pomiar — bieżący cykl leczenia (cykl 2 z 2) bez pomiaru masy');
    expect(tk).not.toContain('w rekordzie nie ma punktu');
    const tp = tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'pacjent' }).content);
    expect(tp).toContain('Bieżący cykl leczenia (cykl 2 z 2) nie ma jeszcze pomiaru masy ciała');
    expect(tp, 'zdanie prawdziwe: liczby od pierwszego pomiaru serii').toContain('Od początku obserwacji');
  });

  it('zakończony cykl bez pomiaru masy: „odstawione” z datą, bez tygodnia liczonego od cudzego zera', () => {
    const { P, U } = moduly();
    const m = zKarty(P, [...BEZ_MASY, pkt('end', '2025-03-01', null, WEGOVY, 41, 1)]);
    expect(m.punktOdniesienia.zrodlo).toBe('brak-pomiaru-cyklu');
    expect(m.leczenie).toMatchObject({ stan: 'odstawione', odstawienieDateISO: '2025-03-01', odstawienieTydzien: null });
    expect(tekstHtml(U.buildHtml(m))).not.toContain('Leczenie odstawione w');
  });

  it('pomiar z osi czasu po początku cyklu wystarcza — to już pomiar bieżącego cyklu', () => {
    const m = zKarty(moduly().P, BEZ_MASY, [{ dateISO: '2024-12-10', ageMonthsTotal: 40 * 12 + 10, weight: 98, height: 170 }]);
    expect(m.punktOdniesienia).toMatchObject({ zrodlo: 'pierwszy-pomiar-cyklu', masa: 98, dateISO: '2024-12-10' });
    expect(m.ostrzezenia).not.toContain(OSTRZ);
  });
});

describe('Włączenie cyklu nr ≥ 2 bez masy — teksty nie twierdzą, że cykl nie ma Włączenia', () => {
  /* Recenzja całości raty 4. Monitor wymusza masę tylko dla nowych punktów; Włączenie z importu albo ze
     starego zapisu bywa bez niej. `normSeria` je odrzuca, więc odniesieniem jest pierwszy pomiar cyklu
     (arytmetyka bez zmian), ale zakładka pisała „ten cykl nie ma punktu „Włączenie”” — choć `cykl.bezWlaczenia`
     jest false, a monitor i Karta pacjenta to Włączenie pokazują. */
  const W_BEZ_MASY = pkt('start', '2024-11-12', null, WEGOVY, 40, 10);
  const CY10_BM = [...CYKL_1, W_BEZ_MASY, CYKL_2[1], CYKL_2[2]];
  const ODN = 'Wszystkie zmiany liczone od pierwszego pomiaru bieżącego cyklu leczenia (cykl 2 z 2; 95,5 kg, 12.02.2025) — punkt „Włączenie” tego cyklu nie ma masy ciała, więc procenty nie liczą się od masy sprzed leczenia, nie od poprzedniej wizyty.';

  it.each([['chronologicznie', CY10_BM], ['odwrotnie', CY10_BM.slice().reverse()]])(
    'CY-10 z Włączeniem Wegovy bez masy (%s): odniesienie 95,5 kg z cyklu 2, flaga `wlaczenieBezMasy`', (_, punkty) => {
      const m = zKarty(moduly().P, punkty);
      expect(m.cykl).toEqual({ numer: 2, liczba: 2, stan: 'aktywny', bezWlaczenia: false, niezgodnosci: [] });
      expect(m.punktOdniesienia).toMatchObject({ zrodlo: 'pierwszy-pomiar-cyklu', masa: 95.5, dateISO: '2025-02-12', wlaczenieBezMasy: true });
      expect(m.punktOdniesienia.opis).toBe('Punkt „Włączenie” bieżącego cyklu leczenia nie ma masy ciała — procenty liczone od pierwszego pomiaru tego cyklu, nie od masy sprzed leczenia.');
      expect(m.leczenie.stan).toBe('na-leczeniu');
      expect(m.seria.map((s) => s.tydzien)).toEqual([-57, -44, -17, 0, 12]);
    });

  it('panel i obie kartki: brak masy we Włączeniu, nie brak Włączenia', () => {
    const { P, U, W } = moduly();
    const m = zKarty(P, CY10_BM);
    const h = U.buildHtml(m);
    expect(tekstHtml(h)).toContain(ODN);
    // Zdanie o odniesieniu (pod kafelkami); ogólny opis pasm (`OPIS_PASM`, bez zmian w racie) mówi o braku Włączenia warunkowo.
    const odn = (h.match(/<p class="vilda-pd-odn">([\s\S]*?)<\/p>/) || [])[1];
    expect(odn).toBeTruthy();
    expect(odn).not.toContain('nie ma punktu „Włączenie”');
    expect(m.ostrzezenia).toEqual([]);
    expect(h, 'podpis osi mówi prawdę i zostaje').toContain('tygodnie od pierwszego pomiaru bieżącego cyklu');
    const tk = tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'kliniczny' }).content);
    expect(tk).toContain(ODN);
    expect(tk).toContain('Punkt odniesienia: pierwszy pomiar bieżącego cyklu leczenia (cykl 2 z 2)');
    expect(tk).not.toContain('nie ma punktu „Włączenie”');
    const tp = tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'pacjent' }).content);
    expect(tp).toContain(ODN);
    expect(tp).toContain('Od pierwszego pomiaru w bieżącym leczeniu (12.02.2025) masa ciała zmniejszyła się o 2,5 kg (2,6 % masy początkowej).');
    expect(tp).not.toContain('nie ma punktu „Włączenie”');
  });

  it('lek z ChPL (Saxenda w cyklu 2): ostrzeżenie mówi o braku masy we Włączeniu', () => {
    const punkty = [...CYKL_1, pkt('start', '2024-11-12', null, SAXENDA, 40, 10),
      pkt('continue', '2025-02-12', 95.5, SAXENDA, 41, 1), pkt('continue', '2025-05-10', 93, SAXENDA, 41, 3)];
    const m = zKarty(moduly().P, punkty);
    expect(m.punktDecyzyjny.bezOsi).toBe('brak-punktu-wlaczenia');
    expect(m.ostrzezenia).toEqual(['Punktu oceny wg ChPL nie postawiono na wykresie: bez masy w punkcie „Włączenie” oś nie ma wspólnego zera z leczeniem, a procenty liczą się od pierwszego pomiaru bieżącego cyklu, nie od masy początkowej z ChPL.']);
  });

  it('cykl nr 2 bez Włączenia (stara Kontynuacja po Zakończeniu): flaga false, brzmienie jak dotąd', () => {
    const kpoz = [...CYKL_1, pkt('continue', '2024-11-12', 98.5, WEGOVY, 40, 10), CYKL_2[1], CYKL_2[2]];
    const m = zKarty(moduly().P, kpoz);
    expect(m.punktOdniesienia.wlaczenieBezMasy).toBe(false);
    expect(tekstHtml(moduly().U.buildHtml(m))).toContain('— ten cykl nie ma punktu „Włączenie”, więc procenty nie liczą się od masy sprzed leczenia');
  });

  it('jeden cykl z Włączeniem bez masy: brzmienia co do litery jak przed ratą 4 (flaga `wlaczenieBezMasy` = false)', () => {
    const { P, U } = moduly();
    const punkty = [pkt('start', '2024-01-12', null, SAXENDA, 40, 0), pkt('continue', '2024-04-12', 99, SAXENDA, 40, 3),
      pkt('continue', '2024-07-12', 97, SAXENDA, 40, 6)];
    const m = zKarty(P, punkty);
    expect(m.cykl).toMatchObject({ numer: 1, liczba: 1, bezWlaczenia: false });
    expect(m.punktOdniesienia).toMatchObject({ zrodlo: 'pierwszy-pomiar', masa: 99, wlaczenieBezMasy: false });
    expect(m.punktOdniesienia.opis).toBe('Brak punktu „Włączenie” — procenty liczone od pierwszego pomiaru w serii.');
    expect(m.ostrzezenia).toEqual(['Punktu oceny wg ChPL nie postawiono na wykresie: bez punktu „Włączenie” oś nie ma wspólnego zera z leczeniem, a procenty liczą się od pierwszego pomiaru, nie od masy początkowej z ChPL.']);
    expect(tekstHtml(U.buildHtml(m))).toContain('Wszystkie zmiany liczone od pierwszego zapisanego pomiaru (99,0 kg, 12.04.2024) — w rekordzie nie ma punktu „Włączenie”, więc procenty nie liczą się od masy sprzed leczenia, nie od poprzedniej wizyty.');
  });
});

describe('Zdublowane Zakończenie (stary zapis albo import) — samotne Zakończenie jest bieżącym cyklem', () => {
  /* Recenzja całości raty 4. Zapis W, K, Z, Z (bez wizyty między Zakończeniami) moduł cykli dzieli na cykl 1
     i cykl 2 złożony wyłącznie z drugiego Zakończenia (niezgodność `zakonczenie-bez-wizyt`). „Postępy” biorą
     ostatni cykl jako bieżący (jak Karta pacjenta od raty 3), więc cały cykl 1 trafia do części „sprzed
     odniesienia”. Monitor od raty 1 nie przyjmie drugiego Zakończenia (`drugie-zakonczenie`); zapis bywa
     tylko w imporcie i w starych danych, a baner monitora podpowiada „Usuń to Zakończenie”.
     STAN RATY 4 przypięty; wariant „cykl złożony wyłącznie z Zakończenia nie jest bieżącym cyklem” (wspólny dla
     Karty, „Postępów” i trajektorii) — do decyzji właściciela (ALGORITHMS.md). Przed ratą (893e7262): 104 kg,
     −7,0 kg (−6,7 %), kamienie 13/16/40, znacznik ChPL w 16. tyg., „odstawione w 44. tygodniu”. */
  const Z2 = pkt('end', '2024-11-15', 97, SAXENDA, 40, 10);
  const DUPZ = [...CYKL_1, Z2];

  it('monitor takiego zapisu nie przyjmie — drugie Zakończenie pochodzi z importu albo ze starych danych', () => {
    const { g } = moduly();
    const r = g.VildaCykleLeczenia.sprawdz(CYKL_1, { rodzaj: 'dodaj', punkt: Z2 }, {});
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('drugie-zakonczenie');
    expect(g.VildaCykleLeczenia.podziel(DUPZ).cykle.map((c) => [c.numer, c.punkty.length, c.niezgodnosci.map((n) => n.kod)]))
      .toEqual([[1, 3, []], [2, 1, ['zakonczenie-bez-wizyt']]]);
  });

  it('odniesienie z drugiego Zakończenia, cały cykl 1 „sprzed odniesienia”, „odstawione w 0. tygodniu” (stan raty 4 — do decyzji właściciela)', () => {
    const { P, U, W } = moduly();
    for (const punkty of [DUPZ, DUPZ.slice().reverse()]) {
      const m = zKarty(P, punkty);
      expect(m.cykl).toEqual({ numer: 2, liczba: 2, stan: 'zakonczony', bezWlaczenia: true, niezgodnosci: ['zakonczenie-bez-wizyt'] });
      expect(m.punktOdniesienia).toMatchObject({ zrodlo: 'pierwszy-pomiar-cyklu', masa: 97, dateISO: '2024-11-15' });
      expect(m.seria.map((s) => [s.tydzien, s.przedOdniesieniem])).toEqual([[-44, true], [-31, true], [-4, true], [0, false]]);
      expect(m.kamienie).toEqual([]);
      expect(m.nadir).toMatchObject({ masa: 97, tydzien: 0 });
      expect(m.leczenie).toMatchObject({ stan: 'odstawione', odstawienieTydzien: 0, odstawienieDateISO: '2024-11-15' });
      expect(m.punktDecyzyjny.bezOsi, 'znacznik ChPL zdjęty jak przy każdej niezgodności').toBe('niezgodny-zapis-cyklu');
    }
    const m = zKarty(P, DUPZ);
    const h = tekstHtml(U.buildHtml(m));
    expect(h).toContain('Leczenie odstawione w 0. tygodniu');
    expect(h).toContain('Zapis bieżącego cyklu leczenia wymaga uporządkowania w monitorze DocPro');
    // Kartka pacjenta nie niesie ostrzeżeń — pacjent, który schudł 7 kg, czyta „0,0 kg”.
    const tp = tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'pacjent' }).content);
    expect(tp).toContain('Od pierwszego pomiaru w bieżącym leczeniu (15.11.2024) masa ciała zwiększyła się o 0,0 kg.');
    expect(tp).not.toContain('wymaga uporządkowania');
  });

  it('drugie Zakończenie bez masy → `brak-pomiaru-cyklu`, „odstawione” bez tygodnia, drabinka ogólna (stan raty 4 — do decyzji właściciela)', () => {
    const m = zKarty(moduly().P, [...CYKL_1, pkt('end', '2024-11-15', null, SAXENDA, 40, 10)]);
    expect(m.cykl).toMatchObject({ numer: 2, liczba: 2, bezWlaczenia: true, niezgodnosci: ['zakonczenie-bez-wizyt'] });
    expect(m.punktOdniesienia).toMatchObject({ zrodlo: 'brak-pomiaru-cyklu', masa: 104 });
    expect(m.seria.map((s) => s.przedOdniesieniem)).toEqual([true, true, true]);
    expect(m.kamienie).toEqual([]);
    expect(m.leczenie).toMatchObject({ stan: 'odstawione', odstawienieTydzien: null, odstawienieDateISO: '2024-11-15' });
    // Lek szukany wyłącznie w bieżącym cyklu, a jego jedyny punkt (bez masy) odpada w normalizacji.
    expect(m.zestaw.id).toBe('OGOLNY');
  });
});

describe('Niezgodny zapis bieżącego cyklu — znacznik ChPL wstrzymany jak w Karcie (D5)', () => {
  /* CK-5 / CY-7: dwa Włączenia Saxendy bez Zakończenia między nimi. */
  const DWA_W = [
    pkt('start', '2024-01-12', 104, SAXENDA, 40, 0), pkt('continue', '2024-04-12', 99, SAXENDA, 40, 3),
    pkt('start', '2024-05-03', 99, SAXENDA, 40, 3), pkt('continue', '2024-09-01', 96, SAXENDA, 40, 7),
  ];
  const OSTRZ = 'Zapis bieżącego cyklu leczenia wymaga uporządkowania w monitorze DocPro — punktu oceny wg ChPL nie postawiono (ocena wg ChPL tego cyklu jest wstrzymana, jak w Karcie pacjenta).';

  it('dwa Włączenia: bezOsi, ostrzeżenie, brak kamienia ChPL; pasma zostają', () => {
    const m = zKarty(moduly().P, DWA_W);
    expect(m.cykl).toEqual({ numer: 1, liczba: 1, stan: 'aktywny', bezWlaczenia: false, niezgodnosci: ['dwa-wlaczenia'] });
    expect(m.punktDecyzyjny.jest, 'reguła ChPL zostaje w wyniku').toBe(true);
    expect(m.punktDecyzyjny.tygodnie).toBe(12);
    expect(m.punktDecyzyjny.tydzienOdOdniesienia, 'dotąd 16. tydzień od pierwszego Włączenia').toBeNull();
    expect(m.punktDecyzyjny.nominalna).toBe(false);
    expect(m.punktDecyzyjny.bezOsi).toBe('niezgodny-zapis-cyklu');
    expect(m.kamienie.filter((k) => k.typ === 'punkt-chpl')).toHaveLength(0);
    expect(m.ostrzezenia).toContain(OSTRZ);
    expect(m.ostrzezenia.join(' '), 'jedno zdanie o znaczniku, nie dwa').not.toContain('wspólnego zera');
    expect(m.zestaw.id, 'drabinka liraglutydu zostaje').toBe('LIRAGLUTYD');
    expect(m.punktOdniesienia.masa).toBe(104);
  });

  it('widok: bez znacznika i pasa zwiększania dawki, ostrzeżenie widoczne', () => {
    const { P, U } = moduly();
    const m = zKarty(P, DWA_W);
    const h = U.buildHtml(m);
    expect(h).not.toContain('nominalnym czasie zwiększania dawki');
    expect(U.legendaMasy(m).map((l) => l.tekst).join(' ')).not.toMatch(/zwiększanie dawki|ocena wg ChPL/);
    expect(tekstHtml(h)).toContain(OSTRZ);
    expect(tekstHtml(h)).toContain('−5 %');
  });

  it('wydruk do dokumentacji niesie to samo ostrzeżenie', () => {
    const { P, W } = moduly();
    const d = W.buildDokument(zKarty(P, DWA_W), { ...OPCJE_DRUKU, wariant: 'kliniczny' });
    expect(tekstem(d.content)).toContain(OSTRZ);
  });

  it('dowolny kod niezgodności wstrzymuje znacznik (np. zmiana substancji po R6)', () => {
    // Atrapa modułu cykli z kodem, którego „Postępy” nie znają — kod ma być ogólny, nie lista przypadków.
    const win = {};
    const { P } = moduly(win);
    const prawdziwy = win.VildaCykleLeczenia;
    win.VildaCykleLeczenia = {
      podziel(lista) {
        const r = prawdziwy.podziel(lista);
        const c = r.cykle[r.cykle.length - 1];
        c.niezgodnosci.push({ kod: 'zmiana-substancji', punkty: [c.punkty[0], c.punkty[1]], cykl: c.numer });
        return r;
      },
    };
    const m = zKarty(P, CYKL_1.slice(0, 2));
    expect(m.cykl.niezgodnosci).toEqual(['zmiana-substancji']);
    expect(m.punktDecyzyjny.bezOsi).toBe('niezgodny-zapis-cyklu');
    expect(m.ostrzezenia).toContain(OSTRZ);
  });

  it('niezgodność w POPRZEDNIM cyklu nie wstrzymuje oceny bieżącego', () => {
    const punkty = [...DWA_W, pkt('end', '2024-10-15', 95, SAXENDA, 40, 9),
      pkt('start', '2024-11-12', 95, SAXENDA, 40, 10), pkt('continue', '2025-02-12', 90, SAXENDA, 41, 1)];
    const m = zKarty(moduly().P, punkty);
    expect(m.cykl).toMatchObject({ numer: 2, liczba: 2, niezgodnosci: [] });
    expect(m.punktDecyzyjny.tydzienOdOdniesienia).toBe(16);
    expect(m.punktDecyzyjny.bezOsi).toBeUndefined();
    expect(m.ostrzezenia.join(' ')).not.toContain('wymaga uporządkowania');
  });
});

describe('CY-10 — teksty widoku i wydruku', () => {
  it('panel: odniesienie z numerem cyklu, podpis osi, lek, bez „Leczenie odstawione”', () => {
    const { P, U } = moduly();
    const h = U.buildHtml(zKarty(P, CY10));
    const t = tekstHtml(h);
    expect(t).toContain('Wszystkie zmiany liczone od masy ciała przy włączeniu bieżącego cyklu leczenia (cykl 2 z 2; 98,5 kg, 12.11.2024), nie od poprzedniej wizyty.');
    expect(h).toContain('tygodnie od włączenia leczenia');
    expect(h).toContain('Lek: <b>Wegovy (semaglutyd) – s.c. 1×/tydz.</b>');
    expect(t).not.toContain('Leczenie odstawione');
    expect(t).toContain('98,5');
    expect(t).toContain('93,0');
  });

  it('jeden cykl: brzmienie panelu bez zmian, bez „cykl 1 z 1”', () => {
    const { P, U } = moduly();
    const t = tekstHtml(U.buildHtml(zKarty(P, CYKL_2)));
    expect(t).toContain('Wszystkie zmiany liczone od masy ciała przy włączeniu leczenia (98,5 kg, 12.11.2024), nie od poprzedniej wizyty.');
    expect(t).not.toContain('cykl 1 z 1');
    expect(t).not.toContain('bieżącego cyklu');
  });

  it('kartka pacjenta: „Od włączenia bieżącego leczenia (data)” zamiast „Od początku obserwacji”', () => {
    const { P, W } = moduly();
    const t = tekstem(W.buildDokument(zKarty(P, CY10), { ...OPCJE_DRUKU, wariant: 'pacjent' }).content);
    expect(t).toContain('Od włączenia bieżącego leczenia (12.11.2024) masa ciała zmniejszyła się o 5,5 kg (5,6 % masy początkowej).');
    expect(t).not.toContain('Od początku obserwacji');
    expect(t).toContain('Wszystkie zmiany liczone od masy ciała przy włączeniu bieżącego cyklu leczenia (cykl 2 z 2; 98,5 kg, 12.11.2024), nie od poprzedniej wizyty.');
  });

  it('kartka pacjenta przy przyroście masy w bieżącym cyklu: to samo „od włączenia bieżącego leczenia”', () => {
    const { P, W } = moduly();
    const punkty = [...CYKL_1, CYKL_2[0], pkt('continue', '2025-02-12', 100, WEGOVY, 41, 1)];
    const t = tekstem(W.buildDokument(zKarty(P, punkty), { ...OPCJE_DRUKU, wariant: 'pacjent' }).content);
    expect(t).toContain('Od włączenia bieżącego leczenia (12.11.2024) masa ciała zwiększyła się o 1,5 kg.');
  });

  it('kartka do dokumentacji: punkt odniesienia z numerem cyklu i lek bieżącego cyklu', () => {
    const { P, W } = moduly();
    const t = tekstem(W.buildDokument(zKarty(P, CY10), { ...OPCJE_DRUKU, wariant: 'kliniczny' }).content);
    expect(t).toContain('Punkt odniesienia: włączenie bieżącego cyklu leczenia (cykl 2 z 2)');
    expect(t).toContain('lek: Wegovy (semaglutyd) – s.c. 1×/tydz.');
    expect(t).not.toContain('Saxenda');
  });

  it('jeden cykl: kartki brzmią jak dotąd', () => {
    const { P, W } = moduly();
    const m = zKarty(P, CYKL_2);
    expect(tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'pacjent' }).content))
      .toContain('Od początku obserwacji masa ciała zmniejszyła się o 5,5 kg');
    expect(tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'kliniczny' }).content))
      .toContain('Punkt odniesienia: włączenie leczenia ');
  });

  it('cykl 2 bez Włączenia: kartki nazywają pierwszy pomiar bieżącego cyklu', () => {
    const { P, W } = moduly();
    const kpoz = [...CYKL_1, pkt('continue', '2024-11-12', 98.5, WEGOVY, 40, 10), CYKL_2[1], CYKL_2[2]];
    const m = zKarty(P, kpoz);
    expect(tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'pacjent' }).content))
      .toContain('Od pierwszego pomiaru w bieżącym leczeniu (12.11.2024) masa ciała zmniejszyła się o 5,5 kg');
    expect(tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'kliniczny' }).content))
      .toContain('Punkt odniesienia: pierwszy pomiar bieżącego cyklu leczenia (cykl 2 z 2)');
  });
});

describe('Bez modułu cykli — reguła sprzed raty 4 (test negatywny)', () => {
  function bezModulu(podmiana) {
    const win = {};
    const m = moduly(win);
    if (podmiana === undefined) delete win.VildaCykleLeczenia;
    else win.VildaCykleLeczenia = podmiana;
    return m;
  }

  it.each([
    ['brak modułu', undefined],
    ['podziel rzuca', { podziel() { throw new Error('awaria'); } }],
    ['podziel oddaje śmieci', { podziel() { return { cykle: 'nie-tablica' }; } }],
  ])('%s → pierwsze Włączenie w kolejności wpisu i „odstawione” przy jakimkolwiek Zakończeniu', (_, podmiana) => {
    const { P, U, W } = bezModulu(podmiana);
    const m = zKarty(P, CY10);
    expect(m.cykl).toBeNull();
    expect(m.punktOdniesienia.masa, 'dawna reguła: Włączenie Saxendy').toBe(104);
    expect(m.punktOdniesienia.dateISO).toBe('2024-01-12');
    expect(m.leczenie.stan).toBe('odstawione');
    expect(m.leczenie.odstawienieTydzien).toBe(40);
    expect(m.zestaw.id).toBe('LIRAGLUTYD');
    expect(m.punktDecyzyjny.tydzienOdOdniesienia).toBe(16);
    const t = tekstHtml(U.buildHtml(m));
    expect(t).toContain('przy włączeniu leczenia (104,0 kg, 12.01.2024)');
    expect(t).toContain('Leczenie odstawione w 40. tygodniu');
    expect(tekstem(W.buildDokument(m, { ...OPCJE_DRUKU, wariant: 'kliniczny' }).content))
      .toContain('Punkt odniesienia: włączenie leczenia ');
  });

  it('brak modułu, jeden cykl z Zakończeniem bez masy → „na leczeniu” (reguła sprzed raty 4)', () => {
    const { P, U } = bezModulu(undefined);
    const m = zKarty(P, [CYKL_1[0], CYKL_1[1], pkt('end', '2024-10-15', null, SAXENDA, 40, 9)]);
    expect(m.cykl).toBeNull();
    expect(m.leczenie.stan).toBe('na-leczeniu');
    expect(m.leczenie.odstawienieTydzien).toBeNull();
    expect(m.leczenie.odstawienieDateISO).toBeNull();
    expect(tekstHtml(U.buildHtml(m))).not.toContain('Leczenie odstawione');
  });

  it('moduł czytany w chwili wywołania — działa, gdy ładuje się PO silniku (kolejność na stronach)', () => {
    // Na wszystkich 8 stronach `vilda_cykle_leczenia.js` stoi za modułami „Postępów” (na 6 z 8 także za trajektorią).
    const win = {};
    win.window = win;
    const wykonaj = (plik) => new Function('window', 'globalThis', zrodlo(plik))(win, win);
    ['vilda_bmi.js', 'obesity_response_criteria.js', 'vilda_postepy_doroslego_dane.js'].forEach((p) => loadBrowserScript(p, win));
    wykonaj('vilda_postepy_doroslego.js');
    expect(win.VildaCykleLeczenia, 'jeszcze nie załadowany').toBeUndefined();
    expect(zKarty(win.VildaPostepyDoroslego, CY10).cykl, 'na razie dawna reguła').toBeNull();
    wykonaj('vilda_cykle_leczenia.js');
    const m = zKarty(win.VildaPostepyDoroslego, CY10);
    expect(m.cykl).toMatchObject({ numer: 2, liczba: 2 });
    expect(m.punktOdniesienia.masa).toBe(98.5);
  });
});
