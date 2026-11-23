import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { utworzAtrapeMonitoraGh } from '../support/gh-monitor-atrapa.mjs';

// P-GH-PROGRAM-EDYCJA (decyzja właściciela 2026-11-23: „popraw edycję punktu (pytanie 17)”; docs/clinical/ALGORITHMS.md).
// Monitor DocPro: przy edycji istniejącego punktu („Edytuj” w tabeli punktów) pole „Program terapeutyczny” (#therProg),
// a więc program zapisany edycją, to program EDYTOWANEGO punktu; bez programu — program bieżący kursu z chwili punktu
// (ghBiezacy, jak Gp_biezacy Karty, na punktach kursu do edytowanego punktu włącznie, z lekiem edytowanego punktu
// z formularza edycji); bez tego — jak dotąd (program Włączenia kursu). Dotąd (audyt 77cb60dc) F() nadpisywało pole
// programem Włączenia: po Włączeniu Increlex (IGF-1) edycja Kontynuacji Genotropin (SNP), nawet bez zmiany, zapisywała ją
// z programem IGF-1. Poprawki po przeglądzie (2026-11-23): rodzaj punktu bez programu z preparatu formularza edycji
// (i pole od nowa po jego zmianie), pole od nowa po końcu edycji bez F() (zmiana pacjenta w innej ramce, formularz
// wsteczny), formularz wsteczny otwarty w trakcie edycji — program i lek bieżący kursu.
// Testy wołają PRAWDZIWY monitor w atrapie DOM (tests/support/gh-monitor-atrapa.mjs). „Przed” = ten sam monitor z drzewa
// roboczego z cofniętymi wpięciami P-GH-PROGRAM-EDYCJA (ZAMIANY_PRZED: ghProgramPola przy edycji — dawne wyrażenie, bez
// ghPoKoncuEdycji, ghWstecznyZKarty i słuchacza zmiany preparatu) — zachowanie audyt 77cb60dc (sprawdzone na tym pliku
// z commita 77cb60dc poza repozytorium). Spójność reguły z Kartą: Gp_biezacy wycięte z vilda_auth_ui.js. Dane wyłącznie
// FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');
const MONITOR = zrodlo('gh_therapy_monitor.js');
const AUTH = zrodlo('vilda_auth_ui.js');

// Wpięcia P-GH-PROGRAM-EDYCJA w monitorze i ich postać sprzed zmiany (każde dokładnie raz).
const ZAMIANY_PRZED = [
  ['x != null ? ghProgramEdycji(Gwk, dotad) :', 'x != null ? dotad :'],
  ['Gea()||(Gek(),/* P-GH-PROGRAM-EDYCJA */ghPoKoncuEdycji())', 'Gea()||Gek()'],
  ['const Gxe=x!=null;try{D()}catch{}/* P-GH-PROGRAM-EDYCJA */Gxe&&x==null&&ghPoKoncuEdycji();', 'try{D()}catch{}'],
  ['const Gxe=x!=null;D();/* P-GH-PROGRAM-EDYCJA */Gxe&&x==null&&ghPoKoncuEdycji();', 'D();'],
  ['o.value=/* P-GH-PROGRAM-EDYCJA */ghWstecznyZKarty("program",d.value||"")', 'o.value=d.value||""'],
  ['n(o?o.value:"",ghWstecznyZKarty("lek",l?l.value:null))', 'n(o?o.value:"",l?l.value:null)'],
  ['document.addEventListener("change", ghZmianaPreparatuEdycji)', '0'],
];
const MONITOR_PRZED = ZAMIANY_PRZED.reduce((tekst, [z, na]) => {
  expect(tekst.split(z).length - 1, z).toBe(1);
  return tekst.replace(z, na);
}, MONITOR);

// Karta pacjenta: Gp_biezacy (P-GH-PREPARAT-BIEZACY) z bloku Gw_*/Gp_* vilda_auth_ui.js — { lek, program, increlex }.
function gpBiezacy() {
  const od = 'function Gw_kursy(t) {';
  const i = AUTH.indexOf(od);
  expect(i, `vilda_auth_ui.js: nie znaleziono ${od}`).toBeGreaterThan(-1);
  expect(AUTH.indexOf(od, i + 1)).toBe(-1);
  const j = AUTH.indexOf('/* P-KARTA-LECZENIE, etap 1 (decyzje', i);
  expect(j).toBeGreaterThan(i);
  return new Function('i', `${AUTH.slice(i, j)}\nreturn Gp_biezacy;`)({});
}
const GP_BIEZACY = gpBiezacy();

const INC = 'Increlex 40 mg';
const GEN = 'Genotropin 12 mg';
const LEKI_RHGH = ['Omnitrope 5 mg', 'Omnitrope 10 mg', 'Genotropin 5,3 mg', 'Genotropin 12 mg', 'Ngenla 24 mg', 'Ngenla 60 mg'];
const LEKI_WSZYSTKIE = [...LEKI_RHGH, INC];
const P = (id, type, lata, mies, drug, program, nadpisania = {}) => ({
  id, type, ageYears: lata, ageMonths: mies, weight: 18 + 2 * (lata - 7), height: 110 + 5 * (lata - 7), boneAge: null,
  dose: drug === INC ? 0.08 : 0.033, doseUnit: 'mg/kg/d', drug, program, igf1: null, igf1Unit: 'ng/mL',
  igf1DaysSinceDose: null, doseAbs: (drug === INC ? 0.08 : 0.033) * (18 + 2 * (lata - 7)), ...nadpisania,
});
const bez = (pk, ...pola) => { const k = { ...pk }; pola.forEach((x) => { k[x] = null; }); return k; };
// I→G (spec): W Increlex 40 mg IGF-1 7;0 → K Genotropin 12 mg SNP 7;6 → K Genotropin SNP 8;0.
const I_DO_G = [P('ig-w', 'start', 7, 0, INC, 'IGF-1'), P('ig-k1', 'continue', 7, 6, GEN, 'SNP'), P('ig-k2', 'continue', 8, 0, GEN, 'SNP')];
// Punkt niespójny (zapis dawnym błędem edycji): Kontynuacje Genotropin z programem IGF-1.
const S1 = [I_DO_G[0], { ...I_DO_G[1], program: 'IGF-1' }, { ...I_DO_G[2], program: 'IGF-1' }];
// Wznowienie (spec): kurs 1 Increlex (W 7;0 → Z 8;0), kurs 2 Genotropin (W 9;0 → K 10;0).
const WZNOWIENIE = [P('r-w1', 'start', 7, 0, INC, 'IGF-1'), P('r-z1', 'end', 8, 0, INC, 'IGF-1'),
  P('r-w2', 'start', 9, 0, GEN, 'SNP'), P('r-k2', 'continue', 10, 0, GEN, 'SNP')];
// Wznowienie z I→G w kursie 2: kurs 1 Genotropin SNP (W 7;0 → Z 8;0 bez programu), kurs 2 W Increlex IGF-1 9;0 →
// K Genotropin SNP 9;6 → K Genotropin bez programu 10;0.
const WZNOWIENIE_IG = [P('q-w1', 'start', 7, 0, GEN, 'SNP'), bez(P('q-z1', 'end', 8, 0, GEN, 'SNP'), 'program'),
  P('q-w2', 'start', 9, 0, INC, 'IGF-1'), P('q-k1', 'continue', 9, 6, GEN, 'SNP'), bez(P('q-k2', 'continue', 10, 0, GEN, 'SNP'), 'program')];

// Przegląd 2026-11-23, przypadek 1: W Genotropin SNP 7;0 → K Increlex IGF-1 7;6 → K 8;0 bez leku i programu.
const G_DO_I_BEZ = [P('gb-w', 'start', 7, 0, GEN, 'SNP'), P('gb-k1', 'continue', 7, 6, INC, 'IGF-1'),
  bez(P('gb-k2', 'continue', 8, 0, GEN, 'SNP'), 'drug', 'program')];
// Kurs 1 Increlex IGF-1 (W 7;0 → Z 8;0), kurs 2 bez Włączenia: K Genotropin bez programu 9;0 → K Genotropin SNP 9;6.
const W2_BEZ = [P('w2-w1', 'start', 7, 0, INC, 'IGF-1'), P('w2-z1', 'end', 8, 0, INC, 'IGF-1'),
  bez(P('w2-k1', 'continue', 9, 0, GEN, 'SNP'), 'program'), P('w2-k2', 'continue', 9, 6, GEN, 'SNP')];
// Przegląd 2026-11-23, przypadek 2: I→G z ostatnią Kontynuacją Genotropin bez programu.
const I_DO_G_BEZ = [I_DO_G[0], I_DO_G[1], bez(I_DO_G[2], 'program')];
// Stare pole po końcu edycji (przegląd): W Increlex IGF-1 7;0 → K Genotropin SNP 7;6 → K Increlex IGF-1 8;0.
const POWROT = [I_DO_G[0], I_DO_G[1], P('pw-k2', 'continue', 8, 0, INC, 'IGF-1')];

function atrapa(punkty, opcje = {}) {
  const a = utworzAtrapeMonitoraGh({ punkty: structuredClone(punkty), ...opcje });
  a.zdarzeniaKarty = [];
  for (const id of ['therProg', 'therDrug']) a.pole(id).addEventListener('change', () => a.zdarzeniaKarty.push([id, a.pole(id).value]));
  return a;
}
const przed = (punkty, opcje = {}) => atrapa(punkty, { ...opcje, zrodla: { 'gh_therapy_monitor.js': MONITOR_PRZED } });
const PRZYCISK = { start: 'btnGhStart', continue: 'btnGhContinue', end: 'btnGhEnd' };
const punktOId = (a, id) => a.stan().okno.find((q) => String(q.id) === String(id));
const polePodczas = (a) => ({
  program: a.pole('therProg').value, zablokowane: a.pole('therProg').disabled,
  leki: a.pole('ghEditDrug').options.map((o) => o.value), lek: a.pole('ghEditDrug').value,
});
// Edycja bez zmian: „Edytuj” w wierszu, „Rozumiem”, odczyt pól, zapis przyciskiem rodzaju punktu (albo `typ`).
function edycjaBezZmian(a, id, typ = null) {
  a.edytuj(id);
  const podczas = polePodczas(a);
  a.kliknij(PRZYCISK[typ || punktOId(a, id).type]);
  const s = a.stan();
  return { podczas, komunikat: s.komunikat, edycja: s.edycjaWidoczna, zapisany: punktOId(a, id), po: a.pole('therProg').value };
}
const wiersz = (a) => {
  const tr = a.pole('ghTherapyTbody').querySelectorAll('tr').find((x) => x.classList.contains('gh-program-row'));
  return tr ? tr.textContent : null;
};
const karta = (lata, mies) => ({ age: String(lata), ageMonths: String(mies), weight: String(18 + 2 * (lata - 7)), height: String(110 + 5 * (lata - 7)) });

// lista, edytowany punkt, oczekiwane [pole podczas edycji = zapisany program, pole po zapisie], przed (77cb60dc),
// punkty kursu do edytowanego punktu włącznie (reguła pkt 2 — tylko punkt bez programu).
const PRZYPADKI = {
  'I→G, Kontynuacja Genotropin 7;6 (pkt 1)': [I_DO_G, 'ig-k1', ['SNP', 'SNP'], ['IGF-1', 'SNP']],
  'I→G, ostatnia Kontynuacja Genotropin 8;0 (pkt 1)': [I_DO_G, 'ig-k2', ['SNP', 'SNP'], ['IGF-1', 'IGF-1']],
  'I→G, Włączenie Increlex (pkt 1)': [I_DO_G, 'ig-w', ['IGF-1', 'SNP'], ['IGF-1', 'SNP']],
  'bez programu: K Genotropin po W Genotropin SNP (pkt 2)': [[P('a-w', 'start', 7, 0, GEN, 'SNP'), bez(P('a-k', 'continue', 7, 6, GEN, 'SNP'), 'program')],
    'a-k', ['SNP', 'SNP'], ['SNP', 'SNP'], ['a-w', 'a-k']],
  'bez programu: K Genotropin po W Increlex, bez wcześniejszego programu rhGH (pkt 3 — jak dotąd)': [[I_DO_G[0], bez(I_DO_G[1], 'program')],
    'ig-k1', ['IGF-1', 'IGF-1'], ['IGF-1', 'IGF-1'], ['ig-w', 'ig-k1']],
  'bez programu: ostatnia K Genotropin po K Genotropin SNP, I→G (pkt 2)': [[I_DO_G[0], I_DO_G[1], bez(I_DO_G[2], 'program')],
    'ig-k2', ['SNP', 'SNP'], ['IGF-1', 'IGF-1'], ['ig-w', 'ig-k1', 'ig-k2']],
  'bez leku i programu: K 8;6 po I→G (pkt 2 — rodzaj z Kontynuacji Genotropin)': [[...I_DO_G, bez(P('ig-k3', 'continue', 8, 6, GEN, 'SNP'), 'drug', 'program')],
    'ig-k3', ['SNP', 'SNP'], ['IGF-1', 'IGF-1'], ['ig-w', 'ig-k1', 'ig-k2', 'ig-k3']],
  'bez programu: K Genotropin 7;6 przed K Genotropin SNP 8;0 — z chwili punktu, bez późniejszych (pkt 3)': [[I_DO_G[0], bez(I_DO_G[1], 'program'), I_DO_G[2]],
    'ig-k1', ['IGF-1', 'SNP'], ['IGF-1', 'SNP'], ['ig-w', 'ig-k1']],
  'wznowienie: Zakończenie kursu 1 Increlex (pkt 1)': [WZNOWIENIE, 'r-z1', ['IGF-1', 'SNP'], ['IGF-1', 'SNP']],
  'wznowienie: Kontynuacja kursu 2 Genotropin (pkt 1)': [WZNOWIENIE, 'r-k2', ['SNP', 'SNP'], ['SNP', 'SNP']],
  'wznowienie, I→G w kursie 2: Kontynuacja Genotropin SNP (pkt 1)': [WZNOWIENIE_IG, 'q-k1', ['SNP', 'SNP'], ['IGF-1', 'IGF-1']],
  'wznowienie, I→G w kursie 2: Kontynuacja Genotropin bez programu (pkt 2, kurs 2)': [WZNOWIENIE_IG, 'q-k2', ['SNP', 'SNP'], ['IGF-1', 'IGF-1'],
    ['q-w2', 'q-k1', 'q-k2']],
  'wznowienie: Zakończenie kursu 1 bez programu (pkt 2, kurs 1 — nie kurs 2 Increlex)': [WZNOWIENIE_IG, 'q-z1', ['SNP', 'SNP'], ['SNP', 'SNP'],
    ['q-w1', 'q-z1']],
  // Przegląd 2026-11-23, przypadek 1: rodzaj z preparatu formularza (bez leku — pierwszy z listy, Omnitrope 5 mg), nie
  // z Kontynuacji Increlex przed punktem (bez tego zapis Omnitrope 5 mg + IGF-1).
  'G→I, potem K bez leku i programu (pkt 2 — rodzaj z preparatu formularza, Omnitrope 5 mg)': [G_DO_I_BEZ,
    'gb-k2', ['SNP', 'SNP'], ['SNP', 'SNP'], ['gb-w', 'gb-k1', 'gb-k2']],
  // Zapas (pkt 3) może wziąć program z innego kursu — jak dotąd (przegląd 2026-11-23, opis w ALGORITHMS).
  'W2: kurs 2 bez Włączenia, pierwszy punkt bez programu — pkt 3 bierze program Włączenia kursu 1 (IGF-1), jak dotąd': [W2_BEZ,
    'w2-k1', ['IGF-1', 'SNP'], ['IGF-1', 'SNP'], ['w2-k1']],
};

describe('P-GH-PROGRAM-EDYCJA — pole „Program terapeutyczny” przy edycji punktu i program zapisany edycją', () => {
  it.each(Object.entries(PRZYPADKI))('%s', (_n, [lista, id, [program, po], [programPrzed, poPrzed], prefiks]) => {
    const a = atrapa(lista);
    const c = przed(lista);
    const teraz = edycjaBezZmian(a, id);
    const dotad = edycjaBezZmian(c, id);
    for (const w of [teraz, dotad]) {
      expect(w.komunikat).toBeNull();
      expect(w.edycja).toBe(false);
      expect(w.podczas.zablokowane).toBe(true);
    }
    // Pole podczas edycji = program zapisany edycją; po zapisie (F() bez edycji) — program bieżący kursu.
    expect([teraz.podczas.program, teraz.zapisany.program, teraz.po]).toEqual([program, program, po]);
    expect([dotad.podczas.program, dotad.zapisany.program, dotad.po]).toEqual([programPrzed, programPrzed, poPrzed]);
    // Zapis edycji bez zmian różni się od dotychczasowego tylko programem; lista preparatów formularza edycji — bez zmian.
    expect(teraz.zapisany).toEqual({ ...dotad.zapisany, program });
    expect(teraz.podczas.leki).toEqual(dotad.podczas.leki);
    expect(teraz.podczas.lek).toBe(dotad.podczas.lek);
    // Karta terapii: podczas edycji bez zdarzeń (ghPreparatyKarty nic nie robi przy edycji); po zapisie — jak dotąd (np. po
    // edycji Włączenia Increlex lista preparatów karty wraca za programem bieżącym SNP).
    expect(a.zdarzeniaKarty).toEqual(c.zdarzeniaKarty);
    // Pkt 2: ta sama reguła co Karta pacjenta (Gp_biezacy) na punktach kursu do edytowanego punktu, edytowany punkt z lekiem
    // z formularza edycji (bez leku — pierwszy preparat listy); pusty — pkt 3 (zapas).
    if (prefiks) {
      const punkty = prefiks.map((x) => lista.find((q) => q.id === x));
      punkty[punkty.length - 1] = { ...punkty.at(-1), drug: teraz.podczas.lek || punkty.at(-1).drug };
      const karta = GP_BIEZACY(punkty).program;
      expect(karta || programPrzed).toBe(program);
    }
  });

  it('I→G, edycja Kontynuacji Genotropin 7;6 bez zmian: pole SNP (zablokowane), lista preparatów rhGH z Genotropin 12 mg; punkt jak przed edycją (poza zapisem doseAbs z formularza, jak dotąd); karta po zapisie — SNP, Genotropin 12 mg, bez zdarzeń', () => {
    const a = atrapa(I_DO_G);
    a.edytuj('ig-k1');
    expect(a.zdarzeniaKarty).toEqual([]);
    a.win.refreshGHTherapyMonitor(); // odświeżenie w trakcie edycji (ta sama lista): pole dalej SNP, bez zdarzeń
    expect([a.stan().edycjaWidoczna, a.pole('therProg').value, a.zdarzeniaKarty]).toEqual([true, 'SNP', []]);
    const w = edycjaBezZmian(a, 'ig-k1');
    expect(w.podczas).toEqual({ program: 'SNP', zablokowane: true, leki: LEKI_RHGH, lek: GEN });
    // Dawka podawana w formularzu (0,594 mg/d) wraca jako doseAbs z zapisu dziesiętnego — różnica tylko w ostatnim bicie.
    expect(w.zapisany).toEqual({ ...I_DO_G[1], doseAbs: w.zapisany.doseAbs });
    expect(Math.abs(w.zapisany.doseAbs - I_DO_G[1].doseAbs)).toBeLessThan(1e-12);
    expect({ program: a.pole('therProg').value, wiersz: wiersz(a), lek: a.pole('therDrug').value })
      .toEqual({ program: 'SNP', wiersz: 'Program terapeutyczny: SNP', lek: GEN });
    expect(a.zdarzeniaKarty).toEqual([]);
    // Kontynuacja z karty po edycji — SNP (dotąd po edycji 8;0 — IGF-1, test S2 w gh-program-biezacy).
    a.dodajZKarty('continue', karta(8, 6));
    expect(a.stan().okno.at(-1)).toMatchObject({ type: 'continue', ageYears: 8, ageMonths: 6, drug: GEN, program: 'SNP' });
  });

  it('punkt bez programu: lista preparatów formularza edycji — wszystkie (jak dotąd), wybrany lek punktu, spójny z programem pola; punkt bez leku — pierwszy preparat listy (jak dotąd)', () => {
    const lukaB = PRZYPADKI['bez programu: ostatnia K Genotropin po K Genotropin SNP, I→G (pkt 2)'][0];
    const a = atrapa(lukaB);
    a.edytuj('ig-k2');
    expect(polePodczas(a)).toEqual({ program: 'SNP', zablokowane: true, leki: LEKI_WSZYSTKIE, lek: GEN });
    const bezLeku = PRZYPADKI['bez leku i programu: K 8;6 po I→G (pkt 2 — rodzaj z Kontynuacji Genotropin)'][0];
    const b = atrapa(bezLeku);
    const c = przed(bezLeku);
    const wb = edycjaBezZmian(b, 'ig-k3');
    const wc = edycjaBezZmian(c, 'ig-k3');
    expect(wb.podczas).toEqual({ program: 'SNP', zablokowane: true, leki: LEKI_WSZYSTKIE, lek: 'Omnitrope 5 mg' });
    expect(wb.zapisany).toMatchObject({ drug: 'Omnitrope 5 mg', program: 'SNP' });
    expect(wc.zapisany).toMatchObject({ drug: 'Omnitrope 5 mg', program: 'IGF-1' });
  });

  it('punkt niespójny (Genotropin z programem IGF-1, zapis dawnym błędem): pole IGF-1 (pkt 1 — bez cichej poprawki); lista preparatów edycji programu IGF-1 bez Genotropinu — zapis bez zmian odmawia jak dotąd; karta nie przestawia się', () => {
    for (const m of [atrapa(S1), przed(S1)]) {
      m.ustaw('therDrug', GEN);
      m.zdarzeniaKarty.length = 0;
      m.edytuj('ig-k2');
      expect(polePodczas(m)).toEqual({ program: 'IGF-1', zablokowane: true, leki: [INC], lek: '' });
      m.kliknij('btnGhContinue');
      expect(m.stan().komunikat).toBe('Wybierz program i preparat w karcie „Leczenie hormonem wzrostu / IGF-1”.');
      expect(m.stan().edycjaWidoczna).toBe(true);
      expect(m.stan().okno).toEqual(S1);
      expect(m.pole('therDrug').value).toBe(GEN);
      expect(m.zdarzeniaKarty).toEqual([]);
    }
    // Program pola po wczytaniu (poza edycją) — program bieżący IGF-1 (P-GH-PROGRAM-BIEZACY, S1), karta przy Genotropinie.
    const b = atrapa(S1);
    b.ustaw('therDrug', GEN);
    b.zdarzeniaKarty.length = 0;
    b.win.refreshGHTherapyMonitor();
    expect({ program: b.pole('therProg').value, lek: b.pole('therDrug').value, zdarzenia: b.zdarzeniaKarty }).toEqual({ program: 'IGF-1', lek: GEN, zdarzenia: [] });
  });

  it('zmiana rodzaju punktu przyciskiem w edycji (Kontynuacja 8;0 → Zakończenie): program punktu SNP (dotąd IGF-1)', () => {
    const teraz = edycjaBezZmian(atrapa(I_DO_G), 'ig-k2', 'end');
    const dotad = edycjaBezZmian(przed(I_DO_G), 'ig-k2', 'end');
    expect(teraz.zapisany).toMatchObject({ id: 'ig-k2', type: 'end', drug: GEN, program: 'SNP' });
    expect(dotad.zapisany).toMatchObject({ id: 'ig-k2', type: 'end', drug: GEN, program: 'IGF-1' });
    expect(teraz.zapisany).toEqual({ ...dotad.zapisany, program: 'SNP' });
  });

  it('bez modułu kursów: program punktu; punkt bez programu — program bieżący całej listy wg wieku do punktu', () => {
    expect(edycjaBezZmian(atrapa(I_DO_G, { modulKursow: false }), 'ig-k1', 'continue').podczas.program).toBe('SNP');
    const lukaB = PRZYPADKI['bez programu: ostatnia K Genotropin po K Genotropin SNP, I→G (pkt 2)'][0];
    const a = atrapa(lukaB, { modulKursow: false });
    a.edytuj('ig-k2');
    expect(a.pole('therProg').value).toBe('SNP');
  });

  // Poprawka po przeglądzie (2026-11-23): formularz wsteczny dodaje NOWY punkt, więc w trakcie edycji kopiuje program i lek
  // bieżący kursu (jak pole poza edycją), nie program edytowanego punktu (wersja przed przeglądem: edycja Włączenia
  // Increlex → IGF-1 i Increlex 40 mg; dotąd — 77cb60dc — program Włączenia: IGF-1 i Increlex 40 mg także przy edycji K).
  it('formularz wstecznego punktu otwarty w trakcie edycji: program i lek bieżący kursu (I→G — SNP, Genotropin 12 mg przy edycji Włączenia Increlex i Kontynuacji; dotąd IGF-1, Increlex 40 mg); pole edycji bez zmian', () => {
    for (const id of ['ig-w', 'ig-k1']) {
      const a = atrapa(I_DO_G);
      const c = przed(I_DO_G);
      for (const m of [a, c]) {
        m.edytuj(id);
        m.kliknij('btnGhRetro');
        expect(m.stan().edycjaWidoczna, id).toBe(true);
      }
      expect([a.pole('ghRetroProg').value, a.pole('ghRetroDrug').value], id).toEqual(['SNP', GEN]);
      expect([c.pole('ghRetroProg').value, c.pole('ghRetroDrug').value], id).toEqual(['IGF-1', INC]);
      expect(a.pole('therProg').value, id).toBe(id === 'ig-w' ? 'IGF-1' : 'SNP');
    }
  });

  it('przypadek 2 (przegląd): K Genotropin bez programu po I→G — lekarz wybiera w formularzu edycji Increlex 40 mg: pole od razu IGF-1, zapis Increlex 40 mg + IGF-1 (wersja przed przeglądem: SNP — Increlex z SNP); powrót do Genotropinu — SNP', () => {
    const a = atrapa(I_DO_G_BEZ);
    a.edytuj('ig-k2');
    expect(polePodczas(a)).toEqual({ program: 'SNP', zablokowane: true, leki: LEKI_WSZYSTKIE, lek: GEN });
    a.ustaw('ghEditDrug', INC);
    expect(a.pole('therProg').value).toBe('IGF-1');
    a.ustaw('ghEditDrug', GEN);
    expect(a.pole('therProg').value).toBe('SNP');
    a.ustaw('ghEditDrug', INC);
    a.ustaw('ghEditDose', '0.8');
    a.kliknij('btnGhContinue');
    expect(a.stan().komunikat).toBeNull();
    expect(punktOId(a, 'ig-k2')).toMatchObject({ drug: INC, program: 'IGF-1' });
    // Dotąd (77cb60dc): pole IGF-1 z Włączenia przez całą edycję — ten sam zapis Increlex + IGF-1.
    const c = przed(I_DO_G_BEZ);
    c.edytuj('ig-k2');
    expect(c.pole('therProg').value).toBe('IGF-1');
    c.ustaw('ghEditDrug', GEN);
    expect(c.pole('therProg').value).toBe('IGF-1');
  });

  it('pkt 3 przy wybranym preparacie: K Genotropin bez programu po W Genotropin SNP — wybór Increlex 40 mg zostawia SNP (w kursie przed punktem brak programu IGF-1), zapis Increlex 40 mg + SNP — jak dotąd, do decyzji właściciela', () => {
    const lista = PRZYPADKI['bez programu: K Genotropin po W Genotropin SNP (pkt 2)'][0];
    for (const m of [atrapa(lista), przed(lista)]) {
      m.edytuj('a-k');
      m.ustaw('ghEditDrug', INC);
      expect(m.pole('therProg').value).toBe('SNP');
      m.ustaw('ghEditDose', '0.8');
      m.kliknij('btnGhContinue');
      expect(punktOId(m, 'a-k')).toMatchObject({ drug: INC, program: 'SNP' });
    }
  });

  it('punkt z programem: zmiana preparatu w formularzu edycji nie zmienia pola (pkt 1)', () => {
    const a = atrapa(I_DO_G);
    a.edytuj('ig-k1');
    a.ustaw('ghEditDrug', 'Omnitrope 10 mg');
    expect(a.pole('therProg').value).toBe('SNP');
    a.kliknij('btnGhContinue');
    expect(punktOId(a, 'ig-k1')).toMatchObject({ drug: 'Omnitrope 10 mg', program: 'SNP' });
  });
});

describe('P-GH-PROGRAM-EDYCJA — koniec edycji bez zapisu: pole wraca do programu bieżącego', () => {
  // Poprawka po przeglądzie (2026-11-23): zmiana pacjenta sesji karty w innej ramce kończy edycję bez F() — dotąd pole
  // zostawało z chwili edycji, a z nim program następnego punktu z karty (wersja przed przeglądem: Genotropin + SNP przy
  // programie bieżącym IGF-1; 77cb60dc: Genotropin 12 mg + IGF-1).
  it('zmiana pacjenta w innej ramce w trakcie edycji (W Increlex IGF-1, K Genotropin SNP 7;6, K Increlex IGF-1 8;0; edycja 7;6): edycja zamknięta, pole IGF-1 — program bieżący; Kontynuacja z karty — Increlex 40 mg, IGF-1', () => {
    const wynik = (m) => {
      m.win.sessionStorage.setItem('vildaCurrentPatientId', 'fikc-pacjent-A');
      m.edytuj('ig-k1');
      const podczas = m.pole('therProg').value;
      m.win.sessionStorage.setItem('vildaCurrentPatientId', 'fikc-pacjent-B');
      m.zdarzenieOkna('storage', { key: 'vildaCurrentPatientId' });
      const po = [m.stan().edycjaWidoczna, m.pole('therProg').value];
      m.dodajZKarty('continue', karta(8, 6));
      const nowy = m.stan().okno.at(-1);
      return { podczas, po, nowy: [m.stan().okno.length, nowy.drug, nowy.program] };
    };
    expect(wynik(atrapa(POWROT))).toEqual({ podczas: 'SNP', po: [false, 'IGF-1'], nowy: [4, INC, 'IGF-1'] });
    expect(wynik(przed(POWROT))).toEqual({ podczas: 'IGF-1', po: [false, 'IGF-1'], nowy: [4, GEN, 'IGF-1'] });
  });

  it('formularz wsteczny otwarty w trakcie edycji, gdy edytowanego punktu nie ma już na liście: kopiuje program i lek bieżący (IGF-1, Increlex 40 mg), edycja zamknięta, pole IGF-1; Kontynuacja z karty — Increlex 40 mg, IGF-1', () => {
    const wynik = (m) => {
      m.edytuj('ig-k1');
      m.ustawModul(structuredClone([POWROT[0], POWROT[2]]));
      m.kliknij('btnGhRetro');
      const r = [m.pole('ghRetroProg').value, m.pole('ghRetroDrug').value, m.stan().edycjaWidoczna, m.pole('therProg').value];
      m.win.ghCancelRetroForm();
      m.dodajZKarty('continue', karta(8, 6));
      const nowy = m.stan().okno.at(-1);
      return [...r, nowy.drug, nowy.program];
    };
    expect(wynik(atrapa(POWROT))).toEqual(['IGF-1', INC, false, 'IGF-1', INC, 'IGF-1']);
    expect(wynik(przed(POWROT))).toEqual(['IGF-1', INC, false, 'IGF-1', GEN, 'IGF-1']);
  });

  it('usunięcie edytowanego punktu (I→G, Kontynuacja 8;0): edycja zamknięta, pole SNP — program bieżący; Kontynuacja z karty SNP (dotąd pole IGF-1 z Włączenia i Kontynuacja z karty IGF-1)', () => {
    const a = atrapa(I_DO_G);
    const c = przed(I_DO_G);
    for (const m of [a, c]) {
      m.edytuj('ig-k2');
      m.usun('ig-k2');
      expect(m.stan().edycjaWidoczna).toBe(false);
      expect(m.stan().okno.map((q) => q.id)).toEqual(['ig-w', 'ig-k1']);
      m.dodajZKarty('continue', karta(8, 6));
      expect(m.stan().komunikat).toBeNull();
    }
    // Preparat karty — lek edytowanego punktu (O() wpisuje go do karty, jak dotąd).
    expect(a.stan().okno.at(-1)).toMatchObject({ drug: GEN, program: 'SNP' });
    expect(c.stan().okno.at(-1)).toMatchObject({ drug: GEN, program: 'IGF-1' });
    expect(a.pole('therProg').value).toBe('SNP');
  });

  it('lista bez edytowanego punktu (inna ramka, P-GH-EDYCJA-LISTA): edycja zamknięta, pole = program bieżący (jak dotąd); odświeżenie tej samej listy — edycja trwa z programem punktu', () => {
    for (const [m, wTrakcie] of [[atrapa(I_DO_G), 'SNP'], [przed(I_DO_G), 'IGF-1']]) {
      m.edytuj('ig-k2');
      m.win.refreshGHTherapyMonitor();
      expect([m.stan().edycjaWidoczna, m.pole('therProg').value]).toEqual([true, wTrakcie]);
      m.ustawModul(structuredClone(I_DO_G.slice(0, 2)));
      m.win.refreshGHTherapyMonitor();
      expect([m.stan().edycjaWidoczna, m.pole('therProg').value]).toEqual([false, 'SNP']);
    }
    // Edycja Włączenia Increlex, potem lista bez niego: pole SNP (program bieżący Kontynuacji Genotropin).
    const b = atrapa(I_DO_G);
    b.edytuj('ig-w');
    expect(b.pole('therProg').value).toBe('IGF-1');
    b.ustawModul(structuredClone(I_DO_G.slice(1)));
    b.win.refreshGHTherapyMonitor();
    expect([b.stan().edycjaWidoczna, b.pole('therProg').value]).toEqual([false, 'SNP']);
  });

  it('usunięcie innego punktu w trakcie edycji: edycja trwa, pole — program edytowanego punktu', () => {
    const a = atrapa([...I_DO_G, P('ig-k3', 'continue', 8, 6, GEN, 'SNP')]);
    a.edytuj('ig-w');
    a.usun('ig-k3');
    expect([a.stan().edycjaWidoczna, a.pole('therProg').value]).toEqual([true, 'IGF-1']);
  });
});
