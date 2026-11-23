import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { utworzAtrapeMonitoraGh } from '../support/gh-monitor-atrapa.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-PROGRAM-BIEZACY (decyzja właściciela 2026-11-23: „popraw program w formularzu monitora DocPro”;
// docs/clinical/ALGORITHMS.md). Monitor DocPro: pole „Program terapeutyczny” (#therProg, poza edycją punktu) i wiersz
// „Program terapeutyczny: …” nad tabelą punktów biorą PROGRAM BIEŻĄCY bieżącego kursu — tę samą regułę co Karta pacjenta
// (Gp_biezacy w vilda_auth_ui.js, P-GH-PREPARAT-BIEZACY), nie program Włączenia. Lista preparatów karty (#therDrug) idzie
// za programem pola. Edycja punktu, pusta lista, blokada pola i kursy — bez zmian [od P-GH-PROGRAM-EDYCJA (2026-11-23,
// pytanie 17): przy edycji pole i zapis — program edytowanego punktu (tests/unit/gh-program-edycja.test.mjs); dwa testy
// edycji niżej mają zmienione oczekiwanie z powodem w nazwie].
// Testy wołają PRAWDZIWY kod: funkcje czytelnej części gh_therapy_monitor.js i blok Gw_*/Gp_* wycięte z produkcyjnych
// plików (spójność reguł), cały monitor w atrapie DOM (tests/support/gh-monitor-atrapa.mjs). Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');
const MONITOR = zrodlo('gh_therapy_monitor.js');
const AUTH = zrodlo('vilda_auth_ui.js');

function fragment(tekst, plik, od, doTekstu) {
  const i = tekst.indexOf(od);
  expect(i, `${plik}: nie znaleziono ${od}`).toBeGreaterThan(-1);
  expect(tekst.indexOf(od, i + 1), `${plik}: ${od} występuje więcej niż raz`).toBe(-1);
  const j = tekst.indexOf(doTekstu, i + od.length);
  expect(j, `${plik}: nie znaleziono końca po ${od}`).toBeGreaterThan(i);
  return tekst.slice(i, j);
}

// Moduł kursów (ghKursy) z zależnościami — jak na docpro.html i stronach Karty.
function oknoKursow() {
  const w = {};
  loadBrowserScript('vilda_trajectory_analysis.js', w);
  expect(typeof w.VildaTrajectoryAnalysis.ghKursy).toBe('function');
  return w;
}

// Monitor: ghKursyMonitora (kursy i wiersze tabeli) oraz blok P-GH-PROGRAM-BIEZACY (ghRodzajPunktu, ghBiezacy,
// ghProgramBiezacy, ghPunktyBiezacegoKursu) — tekst z gh_therapy_monitor.js bez zmian. Wynik: { lek, program, increlex }.
function regulaMonitora(okno) {
  const kod = [
    fragment(MONITOR, 'gh_therapy_monitor.js', 'function ghKursyMonitora(lista) {', '/** Wiek punktu jako'),
    fragment(MONITOR, 'gh_therapy_monitor.js', 'function ghRodzajPunktu(pk) {', '/** Wiersz „Program terapeutyczny'),
  ].join('\n');
  const f = new Function('window', 'p', `${kod}\nreturn { ghKursyMonitora, ghBiezacy, ghProgramBiezacy, ghPunktyBiezacegoKursu };`)(
    okno, (komunikat, blad) => { throw blad || new Error(komunikat); });
  return (lista) => {
    const punkty = f.ghPunktyBiezacegoKursu(f.ghKursyMonitora(lista), lista);
    const b = f.ghBiezacy(punkty);
    expect(f.ghProgramBiezacy(punkty)).toBe(b.program);
    return b;
  };
}

// Karta pacjenta: blok Gw_* (kursy GH, P-GH-WZNOWIENIE) i Gp_* (P-GH-PREPARAT-BIEZACY) z vilda_auth_ui.js.
// Stan podsumowania wl: Gp_biezacy(punkty bieżącego kursu albo cała lista wg wieku) — { lek, program, increlex }, jak w wl;
// program trendu Pl: Gp_program(Gw_punktyProgramu(lista)).
function regulaKarty(okno) {
  const kod = fragment(AUTH, 'vilda_auth_ui.js', 'function Gw_kursy(t) {', '/* P-KARTA-LECZENIE, etap 1 (decyzje');
  const f = new Function('i', `${kod}\nreturn { Gw_biezacy, Gw_punktyProgramu, Gp_biezacy, Gp_program };`)(okno);
  return {
    wl(lista) {
      const a = lista.filter((S) => S && (S.type === 'start' || S.type === 'continue' || S.type === 'end'));
      const n = a.slice().sort((S, D) => (S.ageYears || 0) * 12 + (S.ageMonths || 0) - ((D.ageYears || 0) * 12 + (D.ageMonths || 0)));
      const Gw = f.Gw_biezacy(a);
      return f.Gp_biezacy(Gw ? Gw.kurs.punkty : n);
    },
    Pl: (lista) => f.Gp_program(f.Gw_punktyProgramu(lista)),
  };
}

const INC = 'Increlex 40 mg';
const GEN = 'Genotropin 12 mg';
const P = (id, type, lata, mies, drug, program, nadpisania = {}) => ({
  id, type, ageYears: lata, ageMonths: mies, weight: 18 + 2 * (lata - 7), height: 110 + 5 * (lata - 7), boneAge: null,
  dose: drug === INC ? 0.08 : 0.033, doseUnit: 'mg/kg/d', drug, program, igf1: null, igf1Unit: 'ng/mL',
  igf1DaysSinceDose: null, doseAbs: (drug === INC ? 0.08 : 0.033) * (18 + 2 * (lata - 7)), ...nadpisania,
});
// I→G (spec): W Increlex 40 mg IGF-1 7;0 → K Genotropin 12 mg SNP 7;6 → K Genotropin SNP 8;0.
const I_DO_G = [P('ig-w', 'start', 7, 0, INC, 'IGF-1'), P('ig-k1', 'continue', 7, 6, GEN, 'SNP'), P('ig-k2', 'continue', 8, 0, GEN, 'SNP')];
// G→I: W Genotropin SNP 7;0 → K Increlex IGF-1 7;6.
const G_DO_I = [P('gi-w', 'start', 7, 0, GEN, 'SNP'), P('gi-k', 'continue', 7, 6, INC, 'IGF-1')];
const CALY_SNP = [P('s-w', 'start', 7, 0, GEN, 'SNP'), P('s-k1', 'continue', 7, 6, GEN, 'SNP'), P('s-k2', 'continue', 8, 0, GEN, 'SNP')];
const CALY_IGF = [P('i-w', 'start', 7, 0, INC, 'IGF-1'), P('i-k', 'continue', 7, 6, INC, 'IGF-1')];
// Wznowienie: kurs 1 Increlex (W 7;0 → Z 8;0), kurs 2 Genotropin (W 9;0 → K 10;0).
const WZNOWIENIE = [P('r-w1', 'start', 7, 0, INC, 'IGF-1'), P('r-z1', 'end', 8, 0, INC, 'IGF-1'),
  P('r-w2', 'start', 9, 0, GEN, 'SNP'), P('r-k2', 'continue', 10, 0, GEN, 'SNP')];
const bez = (pk, ...pola) => { const k = { ...pk }; pola.forEach((x) => { k[x] = null; }); return k; };

// Wspólny zbiór przypadków reguły: lista → program bieżący (Karta i monitor; wartości z kodu).
const PRZYPADKI = {
  'I→G': [I_DO_G, 'SNP'],
  'G→I': [G_DO_I, 'IGF-1'],
  'cały kurs SNP': [CALY_SNP, 'SNP'],
  'cały kurs IGF-1': [CALY_IGF, 'IGF-1'],
  'wznowienie (kurs 1 Increlex, kurs 2 Genotropin)': [WZNOWIENIE, 'SNP'],
  'wznowienie odwrotne (kurs 2 Increlex)': [[P('o-w1', 'start', 7, 0, GEN, 'SNP'), P('o-z1', 'end', 8, 0, GEN, 'SNP'),
    P('o-w2', 'start', 9, 0, INC, 'IGF-1')], 'IGF-1'],
  'I→G, tablica w odwrotnej kolejności': [I_DO_G.slice().reverse(), 'SNP'],
  'I→G, ostatni punkt bez leku i programu': [[...I_DO_G, bez(P('ig-k3', 'continue', 8, 6, GEN, 'SNP'), 'drug', 'program')], 'SNP'],
  'luka A: Kontynuacje bez leku z programem SNP': [[I_DO_G[0], bez(I_DO_G[1], 'drug'), bez(I_DO_G[2], 'drug')], 'SNP'],
  'luka B: Kontynuacje Genotropin bez programu': [[I_DO_G[0], bez(I_DO_G[1], 'program'), bez(I_DO_G[2], 'program')], ''],
  'niespójny punkt (Genotropin z programem IGF-1)': [CALY_SNP.map((x) => ({ ...x, program: 'IGF-1' })), 'IGF-1'],
  'zmiana programu bez zmiany leku (SNP → ZT)': [[CALY_SNP[0], CALY_SNP[1], { ...CALY_SNP[2], program: 'ZT' }], 'ZT'],
  'bez Włączenia': [CALY_SNP.slice(1), 'SNP'],
  'W2: Kontynuacja Increlex po Zakończeniu bez Włączenia': [[P('w2-w', 'start', 7, 0, GEN, 'SNP'), P('w2-z', 'end', 9, 0, GEN, 'SNP'),
    P('w2-k', 'continue', 10, 0, INC, 'IGF-1')], 'IGF-1'],
  'równy wiek (kolejność tablicy)': [[P('rw-k1', 'continue', 8, 0, GEN, 'SNP'), P('rw-k2', 'continue', 8, 0, INC, 'IGF-1')], 'IGF-1'],
  'punkt bez wieku przy jednym kursie': [[P('bw-w', 'start', 0, 0, INC, 'IGF-1'), P('bw-k', 'continue', 8, 0, GEN, 'SNP')], 'SNP'],
  'punkt bez wieku przy dwóch kursach': [[P('bw2-w', 'start', 7, 0, GEN, 'SNP'), P('bw2-z', 'end', 8, 0, GEN, 'SNP'),
    P('bw2-w2', 'start', 9, 0, INC, 'IGF-1'), P('bw2-k', 'continue', 0, 0, GEN, 'SNP')], 'IGF-1'],
  'wpis innego rodzaju na końcu': [[...I_DO_G, { id: 'inny', type: 'gh', ageYears: 9, ageMonths: 0, drug: INC, program: 'IGF-1' }], 'SNP'],
  'pusta lista': [[], ''],
};

describe('P-GH-PROGRAM-BIEZACY — jedna reguła programu bieżącego: monitor DocPro = Karta pacjenta', () => {
  const okno = oknoKursow();
  const monitor = regulaMonitora(okno);
  const karta = regulaKarty(okno);
  it.each(Object.entries(PRZYPADKI))('%s', (_n, [lista, oczekiwany]) => {
    // Program, lek bieżący i rodzaj (Increlex czy rhGH) — monitor = Karta (wl); program trendu (Pl) — ten sam.
    expect(monitor(lista).program).toBe(oczekiwany);
    expect(monitor(lista)).toEqual(karta.wl(lista));
    expect(karta.Pl(lista)).toBe(oczekiwany);
  });
  it('lek bieżący i rodzaj (wartości z kodu): I→G, G→I, niespójny punkt, luki A i B, cały kurs IGF-1, wznowienie', () => {
    const m = (n) => monitor(PRZYPADKI[n][0]);
    expect(m('I→G')).toEqual({ lek: GEN, program: 'SNP', increlex: false });
    expect(m('G→I')).toEqual({ lek: INC, program: 'IGF-1', increlex: true });
    expect(m('niespójny punkt (Genotropin z programem IGF-1)')).toEqual({ lek: GEN, program: 'IGF-1', increlex: false });
    expect(m('luka A: Kontynuacje bez leku z programem SNP')).toEqual({ lek: '', program: 'SNP', increlex: false });
    expect(m('luka B: Kontynuacje Genotropin bez programu')).toEqual({ lek: GEN, program: '', increlex: false });
    expect(m('cały kurs IGF-1')).toEqual({ lek: INC, program: 'IGF-1', increlex: true });
    expect(m('wznowienie (kurs 1 Increlex, kurs 2 Genotropin)')).toEqual({ lek: GEN, program: 'SNP', increlex: false });
  });
  it('bez modułu kursów: monitor bierze całą listę wg wieku, jak Karta (Gw_kursy bez modułu)', () => {
    const goly = {};
    const m = regulaMonitora(goly);
    const k = regulaKarty(goly);
    for (const [lista] of Object.values(PRZYPADKI)) expect(m(lista)).toEqual(k.wl(lista));
    expect(m(WZNOWIENIE).program).toBe('SNP');
    expect(m(I_DO_G).program).toBe('SNP');
  });
});

/* ---------- Monitor w atrapie ---------- */

// Monitor z drzewa roboczego bez wywołań programu bieżącego (wiersz, #therProg, lista preparatów) — „jak dotąd” dla
// porównań: reszta kodu identyczna, czytelne funkcje tylko niewołane.
const WYWOLANIA = ['/* P-GH-PROGRAM-BIEZACY */o=ghProgramWiersza(Gwk,o);', '/* P-GH-PROGRAM-BIEZACY */l=ghProgramPola(Gwk,l),',
  ',ghPreparatyKarty(o,l,Gwk)'];
const MONITOR_DOTAD = WYWOLANIA.reduce((t, w) => {
  expect(t.split(w).length - 1, w).toBe(1);
  return t.replace(w, '');
}, MONITOR);

function atrapa(punkty, opcje = {}) {
  const a = utworzAtrapeMonitoraGh({ punkty, ...opcje });
  a.zdarzeniaKarty = [];
  for (const id of ['therProg', 'therDrug']) a.pole(id).addEventListener('change', () => a.zdarzeniaKarty.push([id, a.pole(id).value]));
  return a;
}
const dotad = (punkty, opcje = {}) => atrapa(punkty, { ...opcje, zrodla: { 'gh_therapy_monitor.js': MONITOR_DOTAD } });
// Pole przy edycji sprzed P-GH-PROGRAM-EDYCJA (audyt 77cb60dc): ghProgramPola przy edycji — dawne wyrażenie (program
// Włączenia kursu edytowanego punktu); reszta kodu identyczna (pozostałe wpięcia P-GH-PROGRAM-EDYCJA nie biorą udziału w tych
// testach — pełny wariant „przed”: tests/unit/gh-program-edycja.test.mjs).
const POLE_EDYCJI = 'x != null ? ghProgramEdycji(Gwk, dotad) :';
expect(MONITOR.split(POLE_EDYCJI).length - 1, POLE_EDYCJI).toBe(1);
const MONITOR_PRZED_EDYCJA = MONITOR.replace(POLE_EDYCJI, 'x != null ? dotad :');
const przedEdycja = (punkty, opcje = {}) => atrapa(punkty, { ...opcje, zrodla: { 'gh_therapy_monitor.js': MONITOR_PRZED_EDYCJA } });
const wierszProgramu = (a) => {
  const tr = a.pole('ghTherapyTbody').querySelectorAll('tr').find((x) => x.classList.contains('gh-program-row'));
  return tr ? tr.textContent : null;
};
const pole = (a) => ({ program: a.pole('therProg').value, zablokowane: a.pole('therProg').disabled, wiersz: wierszProgramu(a) });
// Karta: preparat, lista preparatów i pola dawki (atrapa nie ma skryptu karty — zmienia je tylko monitor).
const kartaGh = (a) => ({ lek: a.pole('therDrug').value, leki: a.pole('therDrug').options.map((o) => o.value),
  dawka: a.pole('therDailyDose').value, podawana: a.pole('therDailyDoseAbs').value });
const karta = (lata, mies) => ({ age: String(lata), ageMonths: String(mies), weight: String(18 + 2 * (lata - 7)), height: String(110 + 5 * (lata - 7)) });
const ostatni = (a) => a.stan().okno.at(-1);
const odswiez = (a) => { a.zdarzeniaKarty.length = 0; a.win.refreshGHTherapyMonitor(); };

describe('P-GH-PROGRAM-BIEZACY — monitor DocPro: pole, wiersz programu, nowy punkt z karty, formularz wsteczny', () => {
  it('I→G: #therProg = SNP (zablokowane), wiersz „Program terapeutyczny: SNP”, nowa Kontynuacja z karty i formularz wsteczny — SNP; dotąd IGF-1', () => {
    const a = atrapa(I_DO_G);
    expect(pole(a)).toEqual({ program: 'SNP', zablokowane: true, wiersz: 'Program terapeutyczny: SNP' });
    // Preparat karty (Omnitrope 10 mg) należy do programu SNP — lista bez przeliczania, bez zdarzeń.
    odswiez(a);
    expect(a.zdarzeniaKarty).toEqual([]);
    a.ustaw('therDrug', GEN);
    a.dodajZKarty('continue', karta(8, 6));
    expect(a.stan().komunikat).toBeNull();
    expect(ostatni(a)).toMatchObject({ type: 'continue', ageYears: 8, ageMonths: 6, drug: GEN, program: 'SNP' });
    expect(pole(a)).toEqual({ program: 'SNP', zablokowane: true, wiersz: 'Program terapeutyczny: SNP' });
    a.kliknij('btnGhRetro');
    expect(a.pole('ghRetroProg').value).toBe('SNP');
    expect(a.pole('ghRetroDrug').value).toBe(GEN);
    a.win.ghCancelRetroForm();

    const b = dotad(I_DO_G);
    expect(pole(b)).toEqual({ program: 'IGF-1', zablokowane: true, wiersz: 'Program terapeutyczny: IGF-1' });
    b.dodajZKarty('continue', karta(8, 6));
    expect(ostatni(b).program).toBe('IGF-1');
  });

  it('G→I: #therProg = IGF-1, lista preparatów za programem — preparat bieżący kursu Increlex 40 mg (zdarzenia change pola, potem preparatu); nowy punkt z karty IGF-1 + Increlex', () => {
    const a = atrapa(G_DO_I);
    expect(pole(a)).toEqual({ program: 'IGF-1', zablokowane: true, wiersz: 'Program terapeutyczny: IGF-1' });
    expect(a.pole('therDrug').value).toBe(INC);
    odswiez(a);
    expect(a.zdarzeniaKarty).toEqual([]); // preparat już z programu — bez ponownego przeliczania
    a.ustaw('therDrug', 'Omnitrope 10 mg'); // np. lista innego programu po wczytaniu pacjenta
    odswiez(a);
    expect(a.zdarzeniaKarty).toEqual([['therProg', 'IGF-1'], ['therDrug', INC]]);
    a.dodajZKarty('continue', karta(8, 0));
    expect(ostatni(a)).toMatchObject({ type: 'continue', ageYears: 8, ageMonths: 0, drug: INC, program: 'IGF-1' });

    const b = dotad(G_DO_I);
    expect(pole(b)).toEqual({ program: 'SNP', zablokowane: true, wiersz: 'Program terapeutyczny: SNP' });
    expect(b.pole('therDrug').value).toBe('Omnitrope 10 mg');
  });

  it('kurs jednym programem (SNP, IGF-1), wznowienie, luka B, bez Włączenia: pole, wiersz i tabela identyczne jak dotąd; karta (preparat, lista, dawka) — jak dotąd poza listą rhGH przy programie IGF-1', () => {
    const listy = { CALY_SNP, CALY_IGF, WZNOWIENIE, lukaB: PRZYPADKI['luka B: Kontynuacje Genotropin bez programu'][0],
      bezWlaczenia: CALY_SNP.slice(1), wznowienieOdwrotne: PRZYPADKI['wznowienie odwrotne (kurs 2 Increlex)'][0] };
    const oczekiwane = { CALY_SNP: 'SNP', CALY_IGF: 'IGF-1', WZNOWIENIE: 'SNP', lukaB: 'IGF-1', bezWlaczenia: 'SNP', wznowienieOdwrotne: 'IGF-1' };
    // Przy programie IGF-1 i bieżącym Increlexie karta z preparatem rhGH (domyślnie Omnitrope 10 mg) przechodzi na Increlex.
    const lekTeraz = { CALY_IGF: INC, wznowienieOdwrotne: INC };
    for (const [n, lista] of Object.entries(listy)) {
      const a = atrapa(lista);
      const b = dotad(lista);
      expect(pole(a), n).toEqual(pole(b));
      expect(pole(a).program, n).toBe(oczekiwane[n]);
      // Tabela (wiersze, separatory kursów, zmiana preparatu) bez zmian.
      expect(a.pole('ghTherapyTbody').textContent, n).toBe(b.pole('ghTherapyTbody').textContent);
      // Karta: lista i dawka bez zmian (atrapa); preparat — jak dotąd albo Increlex przy programie IGF-1.
      expect(kartaGh(a), n).toEqual({ ...kartaGh(b), lek: lekTeraz[n] || kartaGh(b).lek });
      expect(kartaGh(b).lek, n).toBe('Omnitrope 10 mg');
      // Kolejne odświeżenie: bez zdarzeń karty po obu stronach.
      odswiez(a);
      odswiez(b);
      expect(a.zdarzeniaKarty, n).toEqual([]);
      expect(b.zdarzeniaKarty, n).toEqual([]);
      // Luka B przy karcie z Genotropinem (lek bieżący): bez zdarzeń i bez zmiany karty (program pola IGF-1 — zapas).
      if (n === 'lukaB') {
        a.ustaw('therDrug', GEN);
        b.ustaw('therDrug', GEN);
        odswiez(a);
        odswiez(b);
        expect(a.zdarzeniaKarty).toEqual([]);
        expect(kartaGh(a)).toEqual(kartaGh(b));
        expect(kartaGh(a).lek).toBe(GEN);
      }
    }
  });

  // S1–S3 (przegląd 2026-11-23): bieżący preparat rhGH, a program pola IGF-1 — z zapisu z programem IGF-1 przy Genotropinie
  // (S1, np. sprzed tej zmiany), z edycji ostatniej Kontynuacji (S2, pytanie 17 — od P-GH-PROGRAM-EDYCJA edycja tego stanu
  // już nie tworzy, test S2 niżej) albo z zapasu przy luce w programie (S3).
  // Program pola i rodzaj preparatu sobie przeczą: lista preparatów karty bez przeliczania i bez zdarzeń — jak dotąd.
  const S1 = [P('s1-w', 'start', 7, 0, INC, 'IGF-1'), P('s1-k1', 'continue', 7, 6, GEN, 'IGF-1'), P('s1-k2', 'continue', 8, 0, GEN, 'IGF-1')];
  const S3 = PRZYPADKI['luka B: Kontynuacje Genotropin bez programu'][0];
  it.each([['S1 Genotropin z programem IGF-1', S1, 'IGF-1'], ['S3 luka B (Genotropin bez programu)', S3, 'IGF-1']])(
    '%s, karta na Genotropin 12 mg: pole IGF-1, karta zostaje przy Genotropin (bez zdarzeń), Kontynuacja z karty jak dotąd', (_n, lista, program) => {
      const a = atrapa(lista);
      const b = dotad(lista);
      for (const m of [a, b]) {
        m.ustaw('therDrug', GEN);
        odswiez(m);
        expect(m.zdarzeniaKarty).toEqual([]);
      }
      expect(pole(a)).toEqual({ program, zablokowane: true, wiersz: `Program terapeutyczny: ${program}` });
      expect(pole(a)).toEqual(pole(b));
      expect(kartaGh(a)).toEqual(kartaGh(b));
      expect(kartaGh(a).lek).toBe(GEN);
      a.dodajZKarty('continue', karta(8, 6));
      b.dodajZKarty('continue', karta(8, 6));
      expect(a.zdarzeniaKarty).toEqual([]);
      expect(ostatni(a)).toEqual(ostatni(b));
      expect(ostatni(a)).toMatchObject({ type: 'continue', ageYears: 8, ageMonths: 6, drug: GEN, program });
      expect(kartaGh(a).lek).toBe(GEN);
    });

  // S2 — zmienione oczekiwanie od P-GH-PROGRAM-EDYCJA (decyzja właściciela 2026-11-23, pytanie 17): edycja ostatniej
  // Kontynuacji Genotropin bez zmian zapisuje jej program (SNP), więc stanu „Genotropin z programem IGF-1” edycja już nie
  // tworzy. Dotąd (audyt 77cb60dc, monitor przedEdycja) zapisywała IGF-1 z Włączenia: pole IGF-1, następna Kontynuacja
  // z karty — IGF-1. Karta w obu wersjach zostaje przy Genotropinie, bez zdarzeń.
  it('S2 I→G, karta na Genotropin 12 mg: edycja ostatniej Kontynuacji bez zmian zapisuje SNP (od P-GH-PROGRAM-EDYCJA; dotąd IGF-1 — pytanie 17) — pole SNP, karta zostaje przy Genotropin bez zdarzeń, Kontynuacja z karty SNP', () => {
    const a = atrapa(I_DO_G);
    const c = przedEdycja(I_DO_G);
    for (const m of [a, c]) {
      m.ustaw('therDrug', GEN);
      odswiez(m);
      m.edytuj('ig-k2', {}, 'continue');
      expect(m.stan().komunikat).toBeNull();
      expect(m.zdarzeniaKarty).toEqual([]);
    }
    expect(a.stan().okno[2]).toMatchObject({ id: 'ig-k2', drug: GEN, program: 'SNP' });
    expect(c.stan().okno[2]).toMatchObject({ id: 'ig-k2', drug: GEN, program: 'IGF-1' });
    expect(a.stan().okno[2]).toEqual({ ...c.stan().okno[2], program: 'SNP' });
    expect(pole(a)).toEqual({ program: 'SNP', zablokowane: true, wiersz: 'Program terapeutyczny: SNP' });
    expect(pole(c)).toEqual({ program: 'IGF-1', zablokowane: true, wiersz: 'Program terapeutyczny: IGF-1' });
    expect(kartaGh(a)).toEqual(kartaGh(c));
    expect(kartaGh(a).lek).toBe(GEN);
    a.dodajZKarty('continue', karta(8, 6));
    c.dodajZKarty('continue', karta(8, 6));
    expect(a.zdarzeniaKarty).toEqual([]);
    expect(ostatni(a)).toMatchObject({ type: 'continue', ageYears: 8, ageMonths: 6, drug: GEN, program: 'SNP' });
    expect(ostatni(c)).toMatchObject({ drug: GEN, program: 'IGF-1' });
    expect(ostatni(a)).toEqual({ ...ostatni(c), program: 'SNP' });
    expect(kartaGh(a).lek).toBe(GEN);
  });

  it('bez modułu kursów: I→G — SNP (cała lista wg wieku)', () => {
    expect(pole(atrapa(I_DO_G, { modulKursow: false }))).toEqual({ program: 'SNP', zablokowane: true, wiersz: 'Program terapeutyczny: SNP' });
  });

  it('wznowienie: dwa kursy, program z kursu 2, separator „Kurs 2 — …” — jak dotąd', () => {
    const a = atrapa(WZNOWIENIE);
    expect(pole(a)).toEqual({ program: 'SNP', zablokowane: true, wiersz: 'Program terapeutyczny: SNP' });
    expect(a.pole('ghTherapyTbody').querySelectorAll('tr.gh-kurs-row').map((tr) => tr.textContent))
      .toEqual(['Kurs 2 — wznowienie w wieku 9 l. 0 mies.']);
  });
});

describe('P-GH-PROGRAM-BIEZACY — edycja punktu (od P-GH-PROGRAM-EDYCJA: program edytowanego punktu) i pusta lista', () => {
  it('I→G, edycja Włączenia Increlex: pole IGF-1 podczas edycji (lista preparatów karty nietknięta); po zapisie edycji — SNP, Włączenie dalej IGF-1', () => {
    const a = atrapa(I_DO_G);
    a.zdarzeniaKarty.length = 0;
    a.edytuj('ig-w');
    expect(a.stan().edycjaWidoczna).toBe(true);
    expect(pole(a)).toEqual({ program: 'IGF-1', zablokowane: true, wiersz: 'Program terapeutyczny: SNP' });
    expect(a.zdarzeniaKarty).toEqual([]);
    a.kliknij('btnGhStart');
    expect(a.stan().komunikat).toBeNull();
    expect(a.stan().edycjaWidoczna).toBe(false);
    expect(a.stan().okno[0]).toMatchObject({ id: 'ig-w', type: 'start', drug: INC, program: 'IGF-1' });
    expect(pole(a)).toEqual({ program: 'SNP', zablokowane: true, wiersz: 'Program terapeutyczny: SNP' });
  });

  // Zmienione oczekiwanie od P-GH-PROGRAM-EDYCJA (decyzja właściciela 2026-11-23, pytanie 17): pole podczas edycji i zapis —
  // program edytowanego punktu (SNP); dotąd (audyt 77cb60dc i przed P-GH-PROGRAM-BIEZACY) program Włączenia kursu (IGF-1).
  // Pozostałe przypadki edycji: tests/unit/gh-program-edycja.test.mjs.
  it('edycja Kontynuacji Genotropin w I→G: pole i zapis — program punktu SNP (od P-GH-PROGRAM-EDYCJA; dotąd program Włączenia kursu IGF-1 — pytanie 17)', () => {
    const a = atrapa(I_DO_G);
    const b = dotad(I_DO_G);
    const c = przedEdycja(I_DO_G);
    for (const m of [a, b, c]) m.edytuj('ig-k1');
    expect(a.pole('therProg').value).toBe('SNP');
    expect(b.pole('therProg').value).toBe('IGF-1');
    expect(c.pole('therProg').value).toBe('IGF-1');
    for (const m of [a, b, c]) m.kliknij('btnGhContinue');
    expect(a.stan().okno[1]).toEqual({ ...b.stan().okno[1], program: 'SNP' });
    expect(b.stan().okno[1].program).toBe('IGF-1');
    expect(c.stan().okno[1]).toEqual(b.stan().okno[1]);
  });

  it('pusta lista: pole odblokowane (P-GH-PROGRAM-ODBLOKUJ), bez wiersza programu i bez przeliczania listy preparatów', () => {
    const a = atrapa([]);
    expect(pole(a)).toEqual({ program: 'SNP', zablokowane: false, wiersz: null });
    a.ustaw('therProg', 'IGF-1');
    a.ustaw('therDrug', 'Omnitrope 10 mg');
    odswiez(a);
    expect(a.zdarzeniaKarty).toEqual([]);
    expect(a.pole('therProg').disabled).toBe(false);
  });
});
