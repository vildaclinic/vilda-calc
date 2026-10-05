import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-OTYLOSC-CYKLE rata 4, obszar Karty pacjenta (decyzje właściciela 2026-09-30: D3 „zmiana substancji czynnej zaczyna
// nowy cykl” = R6; D5 „stary zapis łamiący reguły nie jest poprawiany sam — werdykt ChPL tego cyklu wstrzymany”).
// Moduł cykli (vilda_cykle_leczenia.js, VERSION 2) oznacza przejście substancji w obrębie cyklu niezgodnością
// `zmiana-substancji` { punkty: [ostatni punkt starej substancji, pierwszy punkt nowej] }. Karta pacjenta:
//  - nota „Zapis … wymaga uporządkowania” opisuje to przejście (lek i data po obu stronach), zamiast ogólnego
//    „zapis nie spełnia reguł cykli leczenia”;
//  - przy wstrzymanym werdykcie zdanie o przyczynie mówi o różnych progach i oknach ChPL dla każdej substancji,
//    a zdjęte są OBA kafelki zależne od kryterium („Redukcja do oceny” i „Próg ChPL”) — kryterium wybrane po leku
//    ostatniego punktu nie jest kryterium tego cyklu.
//
// Testy wołają PRAWDZIWE funkcje Karty wycięte z produkcyjnego vilda_auth_ui.js (konwencja format-sds-zero.test.mjs
// i kursy-otylosci-cykle.test.mjs) z PRAWDZIWYM modułem cykli i PRAWDZIWYMI kryteriami ChPL (loader, `ZALEZNOSCI`).
// Fragment wstrzymania werdyktu (wnętrze `Ob_b`, funkcji zagnieżdżonej w panelu) jest wycinany jako blok kodu
// i wykonywany z podstawionymi zmiennymi — test mierzy zachowanie, nie kształt kodu. Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');
const AUTH = zrodlo('vilda_auth_ui.js');

function fragment(od, doTekstu) {
  const i = AUTH.indexOf(od);
  expect(i, `vilda_auth_ui.js: nie znaleziono ${od}`).toBeGreaterThan(-1);
  expect(AUTH.indexOf(od, i + 1), `vilda_auth_ui.js: ${od} występuje więcej niż raz`).toBe(-1);
  const j = AUTH.indexOf(doTekstu, i + od.length);
  expect(j, `vilda_auth_ui.js: nie znaleziono końca po ${od}`).toBeGreaterThan(i);
  return AUTH.slice(i, j);
}

// Funkcje Karty: daty i kolejność (Ye, Da, _n, Kr), wiek (ra), nazwa leku (Fe, Vr), cykle i niezgodności
// (Ob_ks … Ob_bn). `i` to okno strony — Ob_cy czyta z niego moduł cykli w chwili wywołania.
const FUNKCJE_KARTY = [
  fragment('function Ye(', 'function An('),
  fragment('function ra(', 'function wl('),
  fragment('function Fe(', 'function ui('),
  fragment('function Ob_ks(', 'function Ob_css('),
].join('\n');

function karta(okno) {
  return new Function('i', `${FUNKCJE_KARTY}\nreturn { Kr, Ob_cy, Ob_bd, Ob_bn, Ob_bz, Ob_ln, Ob_md };`)(okno);
}

/** Okno strony: moduł cykli z kryteriami ChPL (jak na stronie); opcje — bez modułu cykli albo bez kryteriów. */
function okno(opcje = {}) {
  const w = {};
  if (opcje.bezKryteriow) {
    new Function('window', 'globalThis', zrodlo('vilda_cykle_leczenia.js'))(w, w);
  } else {
    loadBrowserScript('vilda_cykle_leczenia.js', w);
  }
  if (opcje.bezCykli) delete w.VildaCykleLeczenia;
  return w;
}

// Blok wstrzymania werdyktu (D5) z wnętrza Ob_b — od warunku do komentarza „Zakonczony cykl”.
const BLOK_WSTRZYMANIA = fragment('if(Ob_m.bad&&Ob_m.bad.length){', '/* Zakonczony cykl');

function wstrzymanie(K, Ob_m, { it = { group: {} }, Ob_g = true, ot = ['Redukcja do oceny', 'Próg ChPL'], gt = null } = {}) {
  return new Function('Ob_m', 'it', 'Ob_g', 'ot', 'gt', 'Ob_bd', 'Ob_bz', `${BLOK_WSTRZYMANIA}\nreturn { ot: ot, gt: gt };`)(
    Ob_m, it, Ob_g, ot.slice(), gt, K.Ob_bd, K.Ob_bz);
}

// Leki zapisane jak w monitorze: tekst opcji leku i etykieta substancji (z U+2011).
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)', dose: '3,0 mg / dobę' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)', dose: '2,4 mg / tydz.' };

// Dorosły, 170 cm; wieki REALNE wg dat.
const P = (id, type, dateISO, lata, mies, weight, lek) => ({ id, type, dateISO, ageYears: lata, ageMonths: mies, weight, height: 170, ...lek });

// Stary zapis (sprzed R6): Włączenie i Kontynuacja z Saxendą, potem dwie Kontynuacje z Wegovy — bez Zakończenia.
const STARY_ZAPIS = Object.freeze([
  P('w', 'start', '2024-01-12', 40, 1, 104, SAXENDA),
  P('k1', 'continue', '2024-04-12', 40, 4, 99, SAXENDA),
  P('k2', 'continue', '2024-07-12', 40, 7, 97, WEGOVY),
  P('k3', 'continue', '2024-10-12', 40, 10, 95, WEGOVY),
]);

const NOTA_R6 = 'Zapis bieżącego cyklu wymaga uporządkowania: zmiana substancji czynnej w trakcie cyklu (Saxenda do 12.04.2024 → '
  + 'Wegovy od 12.07.2024) bez Zakończenia między nimi. Popraw go w monitorze DocPro — do tego czasu ocena odpowiedzi wg ChPL '
  + 'jest wstrzymana.';
const ZDANIE_R6 = 'Progi i okna oceny wg ChPL są różne dla każdej substancji, więc nie wiadomo, według którego leku i od którego '
  + 'punktu liczyć odpowiedź.';
const ZDANIE_D5 = 'Nie wiadomo, od którego punktu liczyć odpowiedź.';
const ODESLANIE = 'Popraw zapis w monitorze DocPro (baner „Zapis wymaga uporządkowania”).';

describe('Karta pacjenta — nota cyklu przy zmianie substancji czynnej (Ob_bd, Ob_bn)', () => {
  it('stary zapis W, K Saxenda + K, K Wegovy: jeden cykl z niezgodnością R6 i nota opisująca przejście', () => {
    const K = karta(okno());
    const cykle = K.Ob_cy(K.Kr(STARY_ZAPIS));
    expect(cykle).toHaveLength(1);
    expect(cykle[0].bad.map((b) => b.kod)).toEqual(['zmiana-substancji']);
    expect(cykle[0].bad[0].punkty.map((p) => p.id)).toEqual(['k1', 'k2']);
    expect(K.Ob_bz(cykle[0])).toBe(true);
    // Przed ratą 4 (E): „… wymaga uporządkowania: zapis nie spełnia reguł cykli leczenia. Popraw go …”.
    expect(K.Ob_bn(cykle[0])).toBe(NOTA_R6);
  });

  it('ta sama nota niezależnie od kolejności wpisania punktów w tablicy', () => {
    const K = karta(okno());
    const odwrotnie = STARY_ZAPIS.slice().reverse();
    expect(K.Ob_bn(K.Ob_cy(K.Kr(odwrotnie))[0])).toBe(NOTA_R6);
  });

  it('zapis bez dat (kolejność po wieku): „do wieku … → … od wieku …”, nie „do w wieku”', () => {
    const K = karta(okno());
    const bezDat = STARY_ZAPIS.map((p) => ({ ...p, dateISO: '' }));
    const c = K.Ob_cy(K.Kr(bezDat))[0];
    expect(K.Ob_bd(c)).toBe('zmiana substancji czynnej w trakcie cyklu (Saxenda do wieku 40 l. 4 mies. → Wegovy od wieku 40 l. 7 mies.) bez Zakończenia między nimi.');
  });

  it('nazwa leku: krótka nazwa preparatu jak w Karcie; bez preparatu — etykieta substancji; w ostateczności „inny lek”', () => {
    const K = karta(okno());
    const bezPreparatu = STARY_ZAPIS.map((p) => ({ ...p, drug: '' }));
    const c = K.Ob_cy(K.Kr(bezPreparatu))[0];
    expect(c.bad.map((b) => b.kod)).toEqual(['zmiana-substancji']);
    expect(K.Ob_bd(c)).toBe('zmiana substancji czynnej w trakcie cyklu (Liraglutyd do 12.04.2024 → Semaglutyd od 12.07.2024) bez Zakończenia między nimi.');
    expect(K.Ob_ln({ drug: 'Mounjaro (tirzepatyd) – s.c. 1×/tydz.' })).toBe('Mounjaro');
    expect(K.Ob_ln({ drug: '– wybierz –', substance: '' })).toBe('inny lek');
    expect(K.Ob_ln(undefined)).toBe('inny lek');
    expect(K.Ob_md({ dateISO: '2024-07-12' }, 'od')).toBe('od 12.07.2024');
  });

  it('zakończony cykl ze zmianą substancji i czysty cykl bieżący: nota tylko dla cyklu 1, z jego numerem', () => {
    const K = karta(okno());
    const pts = [
      P('w', 'start', '2024-01-12', 40, 1, 104, SAXENDA), P('k1', 'continue', '2024-04-12', 40, 4, 99, SAXENDA),
      P('k2', 'continue', '2024-07-12', 40, 7, 97, WEGOVY), P('z', 'end', '2024-10-15', 40, 10, 97.5, WEGOVY),
      P('w2', 'start', '2024-11-12', 40, 11, 98.5, WEGOVY), P('k4', 'continue', '2025-02-12', 41, 2, 95.5, WEGOVY),
    ];
    const cykle = K.Ob_cy(K.Kr(pts));
    expect(cykle.map((c) => c.bad.map((b) => b.kod))).toEqual([['zmiana-substancji'], []]);
    expect(K.Ob_bn(cykle[0])).toBe('Zapis cyklu 1 wymaga uporządkowania: zmiana substancji czynnej w trakcie cyklu (Saxenda do '
      + '12.04.2024 → Wegovy od 12.07.2024) bez Zakończenia między nimi. Popraw go w monitorze DocPro — do tego czasu ocena '
      + 'odpowiedzi wg ChPL jest wstrzymana.');
    expect(K.Ob_bz(cykle[1])).toBe(false);
  });

  it('dwa Włączenia z różnymi lekami: nota jak dotąd opisuje pierwszą niezgodność (dwa Włączenia), R6 jest obok', () => {
    const K = karta(okno());
    const pts = [
      P('w', 'start', '2024-01-12', 40, 1, 104, SAXENDA), P('k1', 'continue', '2024-04-12', 40, 4, 99, SAXENDA),
      P('w2', 'start', '2024-07-12', 40, 7, 97, WEGOVY), P('k2', 'continue', '2024-10-12', 40, 10, 95, WEGOVY),
    ];
    const c = K.Ob_cy(K.Kr(pts))[0];
    expect(c.bad.map((b) => b.kod)).toEqual(['dwa-wlaczenia', 'zmiana-substancji']);
    expect(K.Ob_bd(c)).toBe('dwa punkty „Włączenie” (12.01.2024 i 12.07.2024) bez Zakończenia między nimi.');
    expect(K.Ob_bz(c)).toBe(true);
  });

  it('kody sprzed raty 4 i nieznany kod — opisy bez zmian', () => {
    const K = karta(okno());
    const [a, b] = [P('a', 'start', '2024-01-12', 40, 1, 104, SAXENDA), P('b', 'start', '2024-05-03', 40, 4, 99, SAXENDA)];
    expect(K.Ob_bd({ bad: [{ kod: 'dwa-wlaczenia', punkty: [a, b] }] })).toBe('dwa punkty „Włączenie” (12.01.2024 i 03.05.2024) bez Zakończenia między nimi.');
    expect(K.Ob_bd({ bad: [{ kod: 'cos-nowego', punkty: [a] }] })).toBe('zapis nie spełnia reguł cykli leczenia.');
    expect(K.Ob_bd({ bad: [] })).toBe('');
    expect(K.Ob_bz({ bad: [{ kod: 'dwa-wlaczenia', punkty: [a, b] }] })).toBe(false);
    expect(K.Ob_bz({})).toBe(false);
    expect(K.Ob_bz(null)).toBe(false);
  });

  it('kontrola: ten sam zapis z jednym lekiem (Saxenda) — brak niezgodności, brak noty', () => {
    const K = karta(okno());
    const jedenLek = STARY_ZAPIS.map((p) => ({ ...p, ...SAXENDA }));
    const c = K.Ob_cy(K.Kr(jedenLek))[0];
    expect(c.bad).toEqual([]);
    expect(K.Ob_bd(c)).toBe('');
  });

  it('bez modułu cykli albo bez kryteriów ChPL — reguła sprzed raty 4: brak niezgodności R6, brak noty', () => {
    const bezCykli = karta(okno({ bezCykli: true }));
    const c1 = bezCykli.Ob_cy(bezCykli.Kr(STARY_ZAPIS));
    expect(c1).toHaveLength(1);
    expect(c1[0].bad).toEqual([]);
    expect(bezCykli.Ob_bd(c1[0])).toBe('');
    const bezKryteriow = karta(okno({ bezKryteriow: true }));
    const c2 = bezKryteriow.Ob_cy(bezKryteriow.Kr(STARY_ZAPIS));
    expect(c2[0].bad).toEqual([]);
    expect(bezKryteriow.Ob_bz(c2[0])).toBe(false);
  });
});

describe('Karta pacjenta — wstrzymanie werdyktu ChPL (D5) przy zmianie substancji (blok z Ob_b)', () => {
  it('R6: zdanie o progach i oknach różnych dla każdej substancji; zdjęte OBA kafelki kryterium', () => {
    const K = karta(okno());
    const c = K.Ob_cy(K.Kr(STARY_ZAPIS))[0];
    const r = wstrzymanie(K, c);
    expect(r.ot).toEqual([]);
    expect(r.gt.cls).toBe('wait');
    expect(r.gt.title).toBe('Zapis cyklu wymaga uporządkowania — ocena wg ChPL wstrzymana');
    expect(r.gt.desc).toBe('W tym cyklu: zmiana substancji czynnej w trakcie cyklu (Saxenda do 12.04.2024 → Wegovy od 12.07.2024) '
      + `bez Zakończenia między nimi. ${ZDANIE_R6} ${ODESLANIE}`);
    expect(r.gt.desc).not.toContain(ZDANIE_D5);
  });

  it('R6 w cyklu bez Włączenia (kafelek „Redukcja do oceny” zdjęty już wcześniej): zdjęty także „Próg ChPL”', () => {
    const K = karta(okno());
    const c = K.Ob_cy(K.Kr(STARY_ZAPIS.slice(1)))[0];
    expect(c.start).toBe(null);
    expect(K.Ob_bz(c)).toBe(true);
    expect(wstrzymanie(K, c, { Ob_g: false, ot: ['Próg ChPL'] }).ot).toEqual([]);
  });

  it('R6 obok dwóch Włączeń: zdanie R6 i bez kafelków, nota opisuje dwa Włączenia', () => {
    const K = karta(okno());
    const c = K.Ob_cy(K.Kr([
      P('w', 'start', '2024-01-12', 40, 1, 104, SAXENDA), P('k1', 'continue', '2024-04-12', 40, 4, 99, SAXENDA),
      P('w2', 'start', '2024-07-12', 40, 7, 97, WEGOVY), P('k2', 'continue', '2024-10-12', 40, 10, 95, WEGOVY),
    ]))[0];
    const r = wstrzymanie(K, c);
    expect(r.ot).toEqual([]);
    expect(r.gt.desc).toBe(`W tym cyklu: dwa punkty „Włączenie” (12.01.2024 i 12.07.2024) bez Zakończenia między nimi. ${ZDANIE_R6} ${ODESLANIE}`);
  });

  it('inne kody (dwa Włączenia z tym samym lekiem) — bez zmian: zdanie D5 i zdjęty tylko kafelek „Redukcja do oceny”', () => {
    const K = karta(okno());
    const c = K.Ob_cy(K.Kr([
      P('w', 'start', '2024-01-12', 40, 1, 104, SAXENDA), P('k1', 'continue', '2024-04-12', 40, 4, 99, SAXENDA),
      P('w2', 'start', '2024-05-03', 40, 4, 99, SAXENDA), P('k2', 'continue', '2024-09-01', 40, 8, 96, SAXENDA),
    ]))[0];
    expect(c.bad.map((b) => b.kod)).toEqual(['dwa-wlaczenia']);
    const r = wstrzymanie(K, c);
    expect(r.ot).toEqual(['Próg ChPL']);
    expect(r.gt.desc).toBe(`W tym cyklu: dwa punkty „Włączenie” (12.01.2024 i 03.05.2024) bez Zakończenia między nimi. ${ZDANIE_D5} ${ODESLANIE}`);
    // Bez Włączenia (kafelek „Redukcja do oceny” zdjęty wcześniej) — „Próg ChPL” zostaje, jak dotąd.
    expect(wstrzymanie(K, c, { Ob_g: false, ot: ['Próg ChPL'] }).ot).toEqual(['Próg ChPL']);
  });

  it('zapis bez niezgodności — blok nie zmienia ani kafelków, ani werdyktu', () => {
    const K = karta(okno());
    const c = K.Ob_cy(K.Kr(STARY_ZAPIS.map((p) => ({ ...p, ...SAXENDA }))))[0];
    const gt = { cls: 'good', title: 'Odpowiedź wystarczająca — kontynuować leczenie', desc: '' };
    const r = wstrzymanie(K, c, { gt });
    expect(r.ot).toEqual(['Redukcja do oceny', 'Próg ChPL']);
    expect(r.gt).toBe(gt);
  });
});

describe('Karta pacjenta — strażnicy źródła R6', () => {
  const kod = AUTH.replace(/\/\*[\s\S]*?\*\//g, ' ');

  it('Ob_bd ma gałąź „zmiana-substancji” przed ogólnym zapasem (napisy tej funkcji w UTF-8)', () => {
    expect(kod).toContain(':b.kod==="zmiana-substancji"?Ob_bs(b):"zapis nie spełnia reguł cykli leczenia."}');
    expect(kod).toContain('return"zmiana substancji czynnej w trakcie cyklu ("+Ob_ln(q[0])+" "+Ob_md(q[0],"do")+" → "+Ob_ln(q[1])+" "+Ob_md(q[1],"od")+") bez Zakończenia między nimi."');
  });

  it('Ob_b: przy R6 zdjęte oba kafelki, inne kody jak dotąd; zdanie R6 w sekwencjach \\uXXXX jak reszta miejsca', () => {
    expect(kod).toContain('var Ob_r6=Ob_bz(Ob_m);Ob_r6?ot=[]:it&&Ob_g&&(ot=ot.slice(1));');
    expect(kod).toContain('" Progi i okna oceny wg ChPL s\\u0105 r\\u00F3\\u017Cne dla ka\\u017Cdej substancji, wi\\u0119c nie wiadomo, wed\\u0142ug kt\\u00F3rego leku i od kt\\u00F3rego punktu liczy\\u0107 odpowied\\u017A."');
    expect(kod).toContain('" Nie wiadomo, od kt\\u00F3rego punktu liczy\\u0107 odpowied\\u017A."');
    // Kafelki zależne od kryterium: dokładnie dwa (gdyby doszedł trzeci, `ot=[]` zdejmowałby i jego — do przeglądu).
    expect(kod.match(/ot\.push\(fe\(/g)).toHaveLength(2);
    expect(kod).toContain('ot.push(fe(z(K),"Redukcja do oceny",');
    expect(kod).toContain('ot.push(fe("","Pr\\xF3g ChPL",');
  });
});
