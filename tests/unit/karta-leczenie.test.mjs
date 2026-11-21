import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KARTA-LECZENIE, etap 1 (decyzje właściciela 2026-11-19, D1–D5; docs/KARTA_LECZENIE_PLAN.md). Zakładka „Leczenie”
// i pasek leczenia nad zakładkami Karty pacjenta. Testy wołają PRAWDZIWE funkcje Karty wycięte z produkcyjnego
// vilda_auth_ui.js (konwencja karta-otylosc-r6.test.mjs): Kl_leczenie buduje zakładkę z tymi samymi blokami co dotąd
// (wl, kl, Ob_dz → Cl, „Wpisy leczenia”, Ml, jl) i paski z wartości, które te same wywołania oddają obok rysunku.
// Kryteria ChPL i moduł cykli — prawdziwe (loader, zależności). Statystyka wzrostu (hSDS) podstawiona prostą funkcją
// liniową: test porównuje pasek z kafelkiem z tego samego rysunku, a nie liczy hSDS. Lekka atrapa DOM (bez CSS),
// więc dopasowanie szerokości pasków sprawdza e2e. Dane wyłącznie FIKCYJNE.
// P-GH-WZNOWIENIE, część 1 (decyzje właściciela 2026-11-20, W1–W4): kursy GH z vilda_trajectory_analysis.js
// (VildaTrajectoryAnalysis.ghKursy — ładowany na tych samych stronach co Karta, więc i tutaj) — bieżący kurs w wl/kl,
// trend (Pl) i pas na siatkach (prawdziwe Lt wycięte z showPatientCard).
// P-KARTA-LECZENIE, etap 2 (makieta hybrydy 2026-11-19, „zaczynaj etap 2” 2026-11-21): grupa otyłości jako jedna karta
// leczenia z przełącznikiem „Przegląd | Wpisy (N) | Analiza” (Ko_karta) — kafelki i linia oceny z obiektów wyjściowych
// Cl/Ml (te same obliczenia co panel), sekcja „Wpisy leczenia” z prawdziwego vilda_cykle_leczenia.js w układzie „karta”.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUTH = fs.readFileSync(path.join(korzen, 'vilda_auth_ui.js'), 'utf8');

function fragment(od, doTekstu) {
  const i = AUTH.indexOf(od);
  expect(i, `vilda_auth_ui.js: nie znaleziono ${od}`).toBeGreaterThan(-1);
  expect(AUTH.indexOf(od, i + 1), `vilda_auth_ui.js: ${od} występuje więcej niż raz`).toBe(-1);
  const j = AUTH.indexOf(doTekstu, i + od.length);
  expect(j, `vilda_auth_ui.js: nie znaleziono końca po ${od}`).toBeGreaterThan(i);
  return AUTH.slice(i, j);
}

// e() i oe() (budowa elementów), blok Karty od Tt() do Pl() (formatowanie, podsumowania i panele GH i otyłości,
// grupa Ob_dz, karta „wg notatek” jl, blok Gw_* i blok Kl_*), Pl() („Trend leczenia GH”) oraz bi() (nazwa leku
// w karcie „wg notatek”).
const KOD = [
  fragment('function e(t,a,n){', 'function un('),
  fragment('function Tt(', 'function Pl('),
  fragment('function Pl(', '/* P-NOTATKI-3 (G27c)'),
  fragment('function bi(', 'function ro('),
].join('\n');
// Pas leczenia na siatkach Karty (lokalne Lt w showPatientCard; zależy tylko od wieku bieżącego pomiaru I).
const pasLeczenia = (I) => new Function('I', `var ${fragment('Lt=function(pe,Ga,Tn){', ',Yt=')};return Lt;`)(I);

function okno(opcje = {}) {
  const doc = atrapaDokumentu();
  const proto = Object.getPrototypeOf(doc.createElement('div'));
  if (!Object.getOwnPropertyDescriptor(proto, 'firstElementChild')) {
    Object.defineProperty(proto, 'firstElementChild', { get() { return this.children[0] || null; } });
  }
  // przełącznik cykli panelu otyłości (Ob_seg) czyta childNodes
  if (!Object.getOwnPropertyDescriptor(proto, 'childNodes')) {
    Object.defineProperty(proto, 'childNodes', { get() { return this.children; } });
  }
  doc.createTextNode = (t) => { const n = doc.createElement('#text'); n.textContent = t; return n; };
  doc.head = doc.documentElement;
  const w = { document: doc };
  loadBrowserScript('vilda_cykle_leczenia.js', w); // + obesity_response_criteria.js (zależność)
  loadBrowserScript('vilda_tempo_wzrastania.js', w);
  if (opcje.bezTrajektorii !== true) loadBrowserScript('vilda_trajectory_analysis.js', w); // ghKursy (P-GH-WZNOWIENIE)
  if (opcje.odcinki) loadBrowserScript('gh_therapy_segments.js', w); // % dawki zalecanej w trendzie i odcinki leków
  if (opcje.bezKryteriow) delete w.ObesityResponseCriteria; // „Moduł progów ChPL niezaładowany”
  return w;
}

const bledy = [];
function karta(opcje) {
  return new Function('i', 'jt', 'Ot', 'oe', `${KOD}\nreturn { Kl_leczenie, Kl_zakladka, Kl_kolejnosc, Kl_daneOb, Kl_daneGh, wl, kl, Pl,
    Gw_pasy: typeof Gw_pasy == 'function' ? Gw_pasy : null,
    Ko_pierwszeZdanie: typeof Ko_pierwszeZdanie == 'function' ? Ko_pierwszeZdanie : null, Ko_CZESTOSC: typeof Ko_CZESTOSC == 'object' ? Ko_CZESTOSC : null };`)(
    okno(opcje), () => null, (gdzie, blad) => bledy.push(`${gdzie}: ${blad && blad.message}`),
    (t) => { if (!t) return; while (t.firstChild) t.removeChild(t.firstChild); });
}

beforeAll(() => {
  // hSDS z prostej, fikcyjnej funkcji liniowej (ci() → En() → globalne calcPercentileStats strony).
  globalThis.calcPercentileStats = (h, _plec, wiek) => ({ sd: (h - (77 + 6 * wiek)) / 5.5 });
});
afterAll(() => { delete globalThis.calcPercentileStats; });

const tekst = (el) => (el ? el.textContent : null);
/** Karta z rekordu (migawka) i notatek; null — brak zakładki. */
function zbuduj(rekord, notatki = [], opcje) {
  const K = karta(opcje);
  bledy.length = 0;
  const r = K.Kl_leczenie({
    patientId: 'pacjent-fikcyjny', rekord, plec: rekord.plec || 'F', zaawansowane: {}, siatka: null, notatki,
    user: {}, zakladka: '<span class="vilda-patient-tab-lbl">Leczenie</span>',
  });
  expect(bledy, 'Karta nie zgłasza błędów rysunku').toEqual([]);
  if (!r) return null;
  const paski = r.paski.children.map((p) => ({
    id: p.getAttribute('data-leczenie'),
    nazwa: p.getAttribute('aria-label'),
    odznaka: tekst(p.querySelector('.vilda-kl-pasek-odznaka')),
    stan: tekst(p.querySelector('.vilda-kl-pasek-stan')),
    czesci: p._klCzesci,
    wartosci: tekst(p.querySelector('.vilda-kl-pasek-t')),
    pigulka: tekst(p.querySelector('.vilda-kl-pigulka')),
    pigulkaKlasa: (p.querySelector('.vilda-kl-pigulka') || { className: null }).className,
  }));
  const pole = (etykieta) => {
    const k = r.tresc.querySelectorAll('.vilda-gh-summary-k').find((x) => x.textContent === etykieta);
    return k ? k.parentNode.children[1].textContent : null;
  };
  const kafel = (etykieta) => {
    const k = r.tresc.querySelectorAll('.vilda-gha-k').find((x) => x.textContent === etykieta);
    if (!k) return null;
    const t = k.parentNode;
    return { v: tekst(t.querySelector('.vilda-gha-v')), sub: tekst(t.querySelector('.vilda-gha-sub')) };
  };
  return {
    r, paski, pole, kafel, karta: kartaOtylosci(r.tresc),
    tytul: tekst(r.tresc.querySelector('.vilda-oba-vt')),
    bloki: r.tresc.children.map((c) => c.className),
  };
}
/** P-KARTA-LECZENIE, etap 2: karta leczenia otyłości — przełącznik, widoki, kafelki „Przeglądu” i linia oceny. */
function kartaOtylosci(korzen) {
  const el = korzen.querySelector('.vilda-ko-karta');
  if (!el) return null;
  const zakladki = el.querySelectorAll('.vilda-ko-seg button');
  const widok = (id) => el.querySelector(`.vilda-ko-widok--${id}`);
  return {
    el, zakladki,
    przelacznik: zakladki.map(tekst),
    wybrany: (zakladki.find((b) => b.getAttribute('aria-selected') === 'true') || { getAttribute: () => null }).getAttribute('data-widok'),
    widoczne: el.querySelectorAll('.vilda-ko-widok').filter((w) => !w.hidden).map((w) => w.className.replace('vilda-ko-widok vilda-ko-widok--', '')),
    widok,
    naglowek: el.children[0].children.map((c) => c.className),
    kafelki: el.querySelectorAll('.vilda-ko-kafel').map((t) => ({
      k: tekst(t.querySelector('.vilda-ko-k')), v: tekst(t.querySelector('.vilda-ko-v')), sub: tekst(t.querySelector('.vilda-ko-sub')),
      kolor: (t.querySelector('.vilda-ko-cz--good, .vilda-ko-cz--bad') || { className: null }).className,
    })),
    linia: tekst(el.querySelector('.vilda-ko-werdykt')),
    liniaKlasa: (el.querySelector('.vilda-ko-werdykt') || { className: null }).className,
    cicha: tekst(el.querySelector('.vilda-ko-cicha')),
  };
}

// ── fikcyjne punkty ────────────────────────────────────────────────────────────────────────────────
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)' };
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };
const OB = (id, type, dateISO, lata, mies, weight, height, dose, lek = WEGOVY) =>
  ({ id, type, dateISO, ageYears: lata, ageMonths: mies, weight, height, ...lek, dose });
// O1 (makieta): nastolatka, Wegovy od 23.06.2026, 20 tyg. — przed oknem oceny (16 tyg. zwiększania + 12 tyg.).
const O1 = [OB('o1-w', 'start', '2026-06-23', 17, 6, 91.9, 157, '0,25 mg'), OB('o1-k', 'continue', '2026-11-10', 17, 11, 84, 157, '2,4 mg')];
// Okno otwarte (38 tyg.): redukcja BMI ≥ 5% — wystarczająca; −1,5% — niewystarczająca (grupa z twardym progiem).
const O_PASS = [OB('p-w', 'start', '2026-02-17', 17, 2, 91.9, 157, '0,25 mg'), OB('p-k', 'continue', '2026-11-10', 17, 11, 79.4, 157.4, '2,4 mg')];
const O_FAIL = [OB('f-w', 'start', '2026-02-17', 17, 2, 91.9, 157, '0,25 mg'), OB('f-k', 'continue', '2026-11-10', 17, 11, 90.5, 157, '2,4 mg')];
// Okno otwarte, ostatni wpis bez wzrostu, w oknie żadnego wzrostu — „Potrzebny pomiar wzrostu”.
const O_BEZ_WZROSTU = [OB('b-w', 'start', '2026-02-17', 17, 2, 91.9, 157, '0,25 mg'), OB('b-k1', 'continue', '2026-06-09', 17, 6, 85, 157, '2,4 mg'),
  OB('b-k2', 'continue', '2026-11-10', 17, 11, 80, null, '2,4 mg')];
// Dorośli: Saxenda (próg z masy, 4 tyg. zwiększania + 12 tyg.) i Wegovy (ocena kliniczna, bez progu).
const A_SAX = [OB('s-w', 'start', '2026-01-12', 40, 1, 104, 170, '0,6 mg', SAXENDA), OB('s-k', 'continue', '2026-05-12', 40, 5, 97, 170, '3,0 mg', SAXENDA)];
const A_WEG = [OB('a-w', 'start', '2026-01-12', 47, 1, 120, 180, '0,25 mg'), OB('a-k', 'continue', '2026-06-09', 47, 6, 106.2, 180, '2,4 mg')];
const O_BEZ_STARTU = [OB('n-k1', 'continue', '2026-02-17', 17, 2, 91.9, 157, '1 mg'), OB('n-k2', 'continue', '2026-11-10', 17, 11, 79.4, 157.4, '2,4 mg')];
const O_DWA_WLACZENIA = [OB('d-w1', 'start', '2026-02-17', 17, 2, 91.9, 157, '0,25 mg'), OB('d-w2', 'start', '2026-06-09', 17, 6, 85, 157, '0,25 mg'),
  OB('d-k', 'continue', '2026-11-10', 17, 11, 79.4, 157.4, '2,4 mg')];
const O_ZAKONCZONE = [...O_PASS, OB('z-z', 'end', '2026-11-17', 17, 11, 79.6, 157.4, '')];
const O_NIEZNANY_LEK = O1.map((p) => ({ ...p, drug: 'Lek fikcyjny', substance: '' }));

const GHP = (id, type, lata, mies, weight, height, dose, extra = {}) =>
  ({ id, type, ageYears: lata, ageMonths: mies, weight, height, dose, doseUnit: 'mg/kg/d', drug: 'Genotropin 12 mg', program: 'SNP', ...extra });
const G1 = [GHP('g-w', 'start', 7, 0, 18, 110, 0.025), GHP('g-k1', 'continue', 8, 0, 21.3, 118.7, 0.028), GHP('g-k2', 'continue', 10, 0, 29.8, 132.4, 0.033)];
const G_BEZ_STARTU = [GHP('gb-k1', 'continue', 7, 6, 19.6, 114.6, 0.025), GHP('gb-k2', 'continue', 10, 0, 29.8, 132.4, 0.033)];
const G_KROTKI = [GHP('gk-w', 'start', 9, 7, 25, 122, 0.025), GHP('gk-k', 'continue', 10, 0, 27, 127, 0.025)];
const INC = { program: 'IGF-1', drug: 'Increlex 40 mg' };
const G_INCRELEX = [GHP('gi-w', 'start', 7, 6, 19, 108, 1.6 / 19, { ...INC, doseAbs: 1.6 }), GHP('gi-k', 'continue', 8, 0, 20, 112, 0.24, { ...INC, doseAbs: 4.8 })];
const G_ZAKONCZONE = [GHP('x-w', 'start', 9, 0, 24, 121, 0.025), GHP('x-k1', 'continue', 11, 0, 36, 137.5, 0.03), GHP('x-k2', 'continue', 13, 0, 55, 153, 0.03),
  GHP('x-z', 'end', 15, 0, 78, 166.5, 0.025)];

const WAIT = '⏳ oceń po 12 tyg.';
const GOOD = '✓ kontynuować leczenie';
const BAD = '✗ wg ChPL odstawić i ponownie ocenić';

describe('P-KARTA-LECZENIE — warunek zakładki (A.2)', () => {
  it('pacjent bez punktów leczenia i bez notatek o leku → brak zakładki „Leczenie” (null)', () => {
    expect(zbuduj({})).toBeNull();
    expect(zbuduj({ ghTherapyPoints: [], obesityTherapyPoints: [] }, [{ patientId: 'pacjent-fikcyjny', title: 'Notatka', body: 'bez leku' }])).toBeNull();
  });

  it('punkty GH → zakładka „Leczenie” (data-tab="leczenie") z podsumowaniem i „Dane analityczne” GH', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: G1 });
    expect(k.r.zakladka.getAttribute('data-tab')).toBe('leczenie');
    expect(k.r.tresc.getAttribute('data-tab')).toBe('leczenie');
    expect(k.r.tresc.className).toContain('vilda-patient-tab-content--hidden'); // domyślnie „Status”
    expect(k.r.tresc.querySelectorAll('.vilda-gh-summary')).toHaveLength(1);
    expect(k.r.tresc.querySelectorAll('.vilda-gha-btn')).toHaveLength(1);
  });

  // Etap 2: podsumowanie, „Wpisy leczenia” i „Dane analityczne — otyłość” są widokami JEDNEJ karty leczenia
  // (dotąd trzy bloki: ['vilda-gh-summary', 'vdo', ''] z belką „Dane analityczne — otyłość”). Zmiana zamierzona.
  it('punkty otyłości → zakładka z grupą Ob_dz: jedna karta leczenia (podsumowanie) z widokami „Wpisy” (.vdo) i „Analiza” (panel)', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    expect(k.bloki).toEqual(['vilda-ob-dz']);
    const dz = k.r.tresc.children[0];
    expect(dz.children.map((c) => c.className)).toEqual(['vilda-gh-summary vilda-ko-karta']);
    expect(k.karta.widok('wpisy').querySelectorAll('.vdo')).toHaveLength(1);
    expect(k.karta.widok('analiza').querySelectorAll('.vilda-gha-panel')).toHaveLength(1);
  });

  it('tylko notatka z lekiem na otyłość (bez punktów) → zakładka z kartą „wg notatek” i paskiem z ostatnią dawką', () => {
    const notatki = [{ patientId: 'pacjent-fikcyjny', clinicalDateISO: '2026-05-01', medication: { name: 'Wegovy', dose: '0,5 mg', action: 'start' } }];
    const k = zbuduj({}, notatki);
    expect(tekst(k.r.tresc.querySelector('.vilda-gh-summary-badge'))).toBe('Leczenie otyłości — Wegovy (wg notatek)');
    expect(k.paski).toEqual([expect.objectContaining({
      id: 'ob', odznaka: 'Leczenie otyłości — Wegovy (wg notatek)', stan: 'aktywne (wg notatek)', czesci: ['0,5 mg'], pigulka: null,
    })]);
    const przerwane = zbuduj({}, [...notatki, { patientId: 'pacjent-fikcyjny', clinicalDateISO: '2026-08-01', medication: { name: 'Wegovy', dose: '', action: 'stop' } }]);
    expect(przerwane.paski[0]).toEqual(expect.objectContaining({ stan: 'przerwane (wg notatek)', czesci: [] }));
  });
});

describe('P-KARTA-LECZENIE — kolejność (D2): trwające przed zakończonymi, przy równym stanie GH, otyłość', () => {
  it('X1: GH zakończone + otyłość trwa → najpierw otyłość (pasek i blok), potem GH', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: G_ZAKONCZONE, obesityTherapyPoints: O1 });
    expect(k.paski.map((p) => [p.id, p.stan])).toEqual([['ob', 'aktywne'], ['gh', 'leczenie zakończone']]);
    expect(k.bloki).toEqual(['vilda-ob-dz', 'vilda-kl-gh']);
  });

  it('oba trwają → GH, otyłość (jak dotąd)', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: G1, obesityTherapyPoints: O1 });
    expect(k.paski.map((p) => p.id)).toEqual(['gh', 'ob']);
    expect(k.bloki).toEqual(['vilda-kl-gh', 'vilda-ob-dz']);
  });

  it('GH trwa + otyłość zakończona → GH, otyłość; oba zakończone → GH, otyłość', () => {
    expect(zbuduj({ plec: 'M', ghTherapyPoints: G1, obesityTherapyPoints: O_ZAKONCZONE }).paski.map((p) => p.id)).toEqual(['gh', 'ob']);
    const oba = zbuduj({ plec: 'M', ghTherapyPoints: G_ZAKONCZONE, obesityTherapyPoints: O_ZAKONCZONE });
    expect(oba.paski.map((p) => [p.id, p.stan])).toEqual([['gh', 'leczenie zakończone'], ['ob', 'leczenie zakończone']]);
  });

  // P-GH-WZNOWIENIE część 1 (W1): GH „zakończone” = bieżący (ostatni) kurs zamknięty Zakończeniem — dotąd jakikolwiek
  // punkt „Zakończenie” w historii; GH wznowione po Zakończeniu jest aktywne (test „GR1 + O1” niżej). Zmiana zamierzona.
  it('„zakończone” = ten sam warunek co znacznik podsumowania (GH: bieżący kurs zamknięty Zakończeniem; otyłość: ostatni punkt)', () => {
    const K = karta();
    const kol = K.Kl_kolejnosc([{ n: 'gh', dane: { zakonczone: true } }, { n: 'ob', dane: { zakonczone: false } }, { n: 'x', dane: null }]);
    expect(kol.map((x) => x.n)).toEqual(['ob', 'x', 'gh']);
    const k = zbuduj({ plec: 'M', ghTherapyPoints: G_ZAKONCZONE, obesityTherapyPoints: O_ZAKONCZONE });
    for (const p of k.paski) {
      const pods = k.r.tresc.querySelectorAll('.vilda-gh-summary-badge').find((b) => b.textContent === p.odznaka).parentNode;
      expect(tekst(pods.querySelector('.vilda-gh-summary-chip'))).toBe(p.stan);
    }
  });
});

describe('P-KARTA-LECZENIE — wartości paska otyłości z tego samego rysunku co bloki (C.4)', () => {
  it('O1 (nastolatka, Wegovy): „2,4 mg · 20 tyg. · BMI −8,6%” — dawka jak „Aktualna dawka”, czas jak „Czas leczenia”, BMI jak „Redukcja do oceny”', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    const [p] = k.paski;
    expect(p).toEqual(expect.objectContaining({
      id: 'ob', nazwa: 'Leczenie otyłości — Wegovy: otwórz zakładkę Leczenie', odznaka: 'Leczenie otyłości — Wegovy', stan: 'aktywne',
      czesci: ['2,4 mg', '20 tyg.', 'BMI −8,6%'], wartosci: '2,4 mg · 20 tyg. · BMI −8,6%',
    }));
    // Etap 2: pola podsumowania zniknęły z góry karty — „Aktualna dawka” jest kafelkiem „Przeglądu” (dotąd pole siatki).
    expect(k.karta.kafelki[0]).toEqual(expect.objectContaining({ k: 'Aktualna dawka', v: p.czesci[0] }));
    expect(k.kafel('Czas leczenia').v).toBe(p.czesci[1]);
    expect(k.kafel('Redukcja do oceny')).toEqual({ v: '−8,6%', sub: 'BMI · okno 12 tyg.' });
  });

  it('dorosły, Saxenda (ocena z masy): „3,0 mg · 17 tyg. · masa −6,7%” — miara „masa” jak „Redukcja do oceny: masa ciała”', () => {
    const k = zbuduj({ obesityTherapyPoints: A_SAX });
    expect(k.paski[0].czesci).toEqual(['3,0 mg', '17 tyg.', 'masa −6,7%']);
    expect(k.kafel('Redukcja do oceny')).toEqual({ v: '−6,7%', sub: 'masa ciała · okno 12 tyg.' });
  });

  it('dorosły, Wegovy (ocena kliniczna, bez progu ChPL): „2,4 mg · 21 tyg. · masa −11,5%”, bez pigułki', () => {
    const k = zbuduj({ obesityTherapyPoints: A_WEG });
    expect(k.paski[0].czesci).toEqual(['2,4 mg', '21 tyg.', 'masa −11,5%']);
    expect(k.kafel('Redukcja do oceny').v).toBe('−11,5%');
    expect(k.tytul).toBe('Ocena kliniczna — brak twardego progu SmPC');
    expect(k.paski[0].pigulka).toBeNull();
  });

  it('dziecko, okno trwa, w oknie brak wzrostu: redukcja do oceny „—” → pominięta (bez „—”), zostaje „2,4 mg · 38 tyg.”', () => {
    const k = zbuduj({ obesityTherapyPoints: O_BEZ_WZROSTU });
    expect(k.kafel('Redukcja do oceny').v).toBe('—');
    expect(k.paski[0].czesci).toEqual(['2,4 mg', '38 tyg.']);
    expect(k.paski[0].wartosci).not.toContain('—');
  });

  it('cykl bez punktu „Włączenie”: bez czasu (kafelek „Czas od 1. punktu”) i bez redukcji (kafelek zdjęty) — sama dawka', () => {
    const k = zbuduj({ obesityTherapyPoints: O_BEZ_STARTU });
    expect(k.kafel('Czas od 1. punktu').v).toBe('38 tyg.');
    expect(k.kafel('Redukcja do oceny')).toBeNull();
    expect(k.paski[0].czesci).toEqual(['2,4 mg']);
  });

  it('leczenie zakończone: stan „leczenie zakończone”, wartości na koniec (dawka punktu „Zakończenie” pusta → pominięta), bez pigułki', () => {
    const k = zbuduj({ obesityTherapyPoints: O_ZAKONCZONE });
    expect(k.paski[0]).toEqual(expect.objectContaining({ stan: 'leczenie zakończone', czesci: ['39 tyg.', 'BMI −13,8%'], pigulka: null }));
    // Etap 2: „Aktualna dawka” — kafelek „Przeglądu” (dotąd pole siatki podsumowania), ta sama wartość „—”.
    expect(k.karta.kafelki[0]).toEqual(expect.objectContaining({ k: 'Aktualna dawka', v: '—', sub: null }));
    expect(k.tytul).toBe('Cykl zakończony — odpowiedź była wystarczająca wg ChPL');
  });
});

describe('P-KARTA-LECZENIE — wartości paska GH z tego samego rysunku co bloki (C.4)', () => {
  it('ze startem: „0,033 mg/kg/d · 36 mies. · tempo 6,9 cm/rok · ΔhSDS +0,80” = „Aktualna dawka”, „przez 36 mies.”, kafelki tempa i ΔhSDS', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: G1 });
    const [p] = k.paski;
    expect(p).toEqual(expect.objectContaining({
      id: 'gh', nazwa: 'Leczony hormonem wzrostu (rhGH): otwórz zakładkę Leczenie', odznaka: 'Leczony hormonem wzrostu (rhGH)', stan: 'aktywne',
      czesci: ['0,033 mg/kg/d', '36 mies.', 'tempo 6,9 cm/rok', 'ΔhSDS +0,80'], pigulka: null,
    }));
    expect(k.pole('Aktualna dawka')).toBe('0,033 mg/kg/d');
    expect(k.kafel('Przyrost całkowity').sub).toBe('przez 36 mies.');
    expect(k.kafel('Tempo wzrastania').v).toBe('6,9 cm/rok');
    expect(k.kafel('Odpowiedź (ΔhSDS)').v).toBe('+0,80');
  });

  it('bez punktu „Włączenie” (P-GH-BEZ-STARTU): bez czasu — pierwszy punkt nie jest startem', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: G_BEZ_STARTU });
    expect(k.kafel('Przyrost od 1. punktu').sub).toBe('przez 30 mies.');
    expect(k.paski[0].czesci).toEqual(['0,033 mg/kg/d', 'tempo 7,1 cm/rok', 'ΔhSDS +0,51']);
    expect(k.kafel('Odpowiedź (ΔhSDS)')).toEqual({ v: '+0,51', sub: 'od 1. punktu (brak punktu włączenia)' });
  });

  it('krótki odstęp (P-TEMPO-6): kafelek pokazuje tempo z oznaczeniem, pasek je pomija', () => {
    const k = zbuduj({ plec: 'F', ghTherapyPoints: G_KROTKI });
    expect(k.kafel('Tempo wzrastania')).toEqual({ v: '12 cm/rok', sub: 'od włączenia (z 5 mies., krótki odstęp)' });
    expect(k.paski[0].czesci).toEqual(['0,025 mg/kg/d', '5 mies.', 'ΔhSDS +0,45']);
    expect(k.kafel('Odpowiedź (ΔhSDS)').v).toBe('+0,45');
  });

  it('Increlex (P-GH-INCRELEX-KARTA): dawka na podanie jak w podsumowaniu, odznaka „Leczony IGF-1 (mekasermina)”', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: G_INCRELEX });
    expect(k.paski[0].odznaka).toBe('Leczony IGF-1 (mekasermina)');
    expect(k.paski[0].czesci[0]).toBe('2 × 2,4 mg na dobę (0,12 mg/kg na podanie)');
    expect(k.pole('Aktualna dawka')).toBe(k.paski[0].czesci[0]);
  });

  it('GH zakończone: wartości z podsumowania i panelu (stan na koniec), stan „leczenie zakończone”, bez pigułki', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: G_ZAKONCZONE });
    expect(k.paski[0]).toEqual(expect.objectContaining({ stan: 'leczenie zakończone', pigulka: null }));
    expect(k.paski[0].czesci.slice(0, 2)).toEqual(['0,025 mg/kg/d', '72 mies.']);
  });
});

describe('P-KARTA-LECZENIE — pigułka oceny (D1): tylko trzy stany, z tytułu pola oceny', () => {
  const przypadki = [
    ['przed oknem oceny (O1)', O1, WAIT, 'wait', 'Przed oknem oceny — oceń po 12 tyg.'],
    ['odpowiedź wystarczająca', O_PASS, GOOD, 'good', 'Odpowiedź wystarczająca — kontynuować leczenie'],
    ['odpowiedź niewystarczająca (twardy próg)', O_FAIL, BAD, 'bad', 'Odpowiedź niewystarczająca — wg ChPL odstawić i ponownie ocenić'],
    ['dorosły, Saxenda, wystarczająca', A_SAX, GOOD, 'good', 'Odpowiedź wystarczająca — kontynuować leczenie'],
  ];
  for (const [opis, punkty, pigulka, klasa, tytul] of przypadki) {
    it(`${opis} → pigułka „${pigulka}”, a pole oceny „${tytul}”`, () => {
      const k = zbuduj({ obesityTherapyPoints: punkty });
      expect(k.tytul).toBe(tytul);
      expect(k.paski[0].pigulka).toBe(pigulka);
      expect(k.paski[0].pigulkaKlasa).toBe(`vilda-kl-pigulka vilda-kl-pigulka--${klasa}`);
      // Pigułka to końcówka tytułu po „ — ” (to samo N tygodni, te same słowa).
      expect(pigulka.slice(2)).toBe(tytul.slice(tytul.indexOf(' — ') + 3));
    });
  }

  const bez = [
    ['ocena kliniczna (dorosły, Wegovy)', A_WEG, 'Ocena kliniczna — brak twardego progu SmPC'],
    ['potrzebny pomiar wzrostu', O_BEZ_WZROSTU, 'Potrzebny pomiar wzrostu do oceny ChPL'],
    ['brak punktu „Włączenie”', O_BEZ_STARTU, 'Brak punktu „Włączenie” — ocena wg ChPL niedostępna'],
    ['zapis cyklu do uporządkowania (dwa Włączenia)', O_DWA_WLACZENIA, 'Zapis cyklu wymaga uporządkowania — ocena wg ChPL wstrzymana'],
    ['cykl zakończony (odpowiedź była wystarczająca)', O_ZAKONCZONE, 'Cykl zakończony — odpowiedź była wystarczająca wg ChPL'],
    ['nierozpoznany lek', O_NIEZNANY_LEK, 'Brak dopasowania do progów ChPL'],
  ];
  for (const [opis, punkty, tytul] of bez) {
    it(`${opis} → bez pigułki (pole oceny „${tytul}”)`, () => {
      const k = zbuduj({ obesityTherapyPoints: punkty });
      expect(k.tytul).toBe(tytul);
      expect(k.paski[0].pigulka).toBeNull();
    });
  }

  it('GH nigdy nie ma pigułki', () => {
    expect(zbuduj({ plec: 'M', ghTherapyPoints: G1 }).paski[0].pigulka).toBeNull();
  });

  it('dwa leczenia (X1): pigułka tylko przy otyłości', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: G_ZAKONCZONE, obesityTherapyPoints: O1 });
    expect(k.paski.map((p) => [p.id, p.pigulka])).toEqual([['ob', WAIT], ['gh', null]]);
  });
});

describe('P-KARTA-LECZENIE — biała lista zakładek i przywracanie (A.3)', () => {
  it('Kl_zakladka: „leczenie” bez zakładki → „antro” (Status); z zakładką i pozostałe — bez zmian', () => {
    const { Kl_zakladka } = karta();
    expect(Kl_zakladka('leczenie', null)).toBe('antro');
    expect(Kl_zakladka('leczenie', { zakladka: {} })).toBe('leczenie');
    for (const tab of ['antro', 'traj', 'notes', 'timeline', 'lab', 'care', undefined]) expect(Kl_zakladka(tab, null)).toBe(tab);
  });

  it('showPatientCard: opcja activeTab, stan nawigacji, xa.restoreTab i przełącznik zakładek znają „leczenie”', () => {
    expect(AUTH).toContain('r.activeTab==="antro"||r.activeTab==="leczenie"&&KlL||r.activeTab==="traj"');
    expect(AUTH).toContain('var Ka={screen:"card",patientId:t,tab:Kl_zakladka(r&&r.activeTab,KlL)||"antro"}');
    expect(AUTH).toMatch(/restoreTab:function\(ct\)\{[^}]*ua\(Kl_zakladka\(ct,KlL\)\|\|"antro"\)\}/);
    expect(AUTH).toContain('function ua(ct){[Et,KlL&&KlL.zakladka,Bt,pt,kt,GdLabTab,CarePatientTab].filter(Boolean)');
    expect(AUTH).toContain('[Nt,KlL&&KlL.tresc,Ct,sa,ca,GdLabHost,CarePatientHost].filter(Boolean)');
    expect(AUTH).toContain('KlL&&KlL.zakladka.addEventListener("click",function(){ua("leczenie");ia({screen:"card",patientId:t,tab:"leczenie"})})');
  });

  it('bloki leczenia nie stoją już nad paskiem zakładek: Karta składa paski, pasek zakładek, Status i „Leczenie”', () => {
    expect(AUTH).toContain('KlL?KlL.paski:null,Ft,Nt,KlL?KlL.tresc:null,Ct,');
    expect(AUTH).not.toContain('function(){try{return wl(s.ghTherapyPoints)}catch{return null}}()');
  });

  it('Notatki: „Wpisy leczenia otyłości (N) — Leczenie →” otwiera zakładkę „Leczenie”', () => {
    expect(AUTH).toContain("karta.querySelector('button[data-tab=\"leczenie\"]')");
  });
});

describe('P-KARTA-LECZENIE — blok, który się nie narysował, nie zostawia wartości na pasku', () => {
  // Ob_b wypełnia obiekt wyjściowy paska przed wykresem (Al). Gdy wykres rzuci wyjątek, panel otyłości nie powstaje
  // (Ob_dz łapie błąd), więc pasek nie może pokazać czasu, redukcji ani oceny z tego panelu.
  it('O1: wykres panelu otyłości rzuca wyjątek → bez panelu; pasek tylko z dawką z podsumowania, bez pigułki', () => {
    const KOD_BLAD = KOD.replace('function Al(t,a,n,r){', 'function Al(t,a,n,r){throw new Error("wykres: błąd testowy");');
    expect(KOD_BLAD).not.toBe(KOD);
    const zgloszone = [];
    const K = new Function('i', 'jt', 'Ot', 'oe', `${KOD_BLAD}\nreturn { Kl_leczenie };`)(
      okno(), () => null, (gdzie) => zgloszone.push(gdzie),
      (t) => { if (!t) return; while (t.firstChild) t.removeChild(t.firstChild); });
    const r = K.Kl_leczenie({
      patientId: 'pacjent-fikcyjny', rekord: { plec: 'F', obesityTherapyPoints: O1 }, plec: 'F', zaawansowane: {}, siatka: null,
      notatki: [], user: {}, zakladka: '<span class="vilda-patient-tab-lbl">Leczenie</span>',
    });
    expect(zgloszone).toContain('karta otylosc panel');
    // Etap 2: karta bez widoku „Analiza” (dotąd: podsumowanie i sekcja bez „Dane analityczne — otyłość”); kafelki
    // z panelu — „—”, bez linii oceny.
    const k = kartaOtylosci(r.tresc);
    expect(k.przelacznik).toEqual(['Przegląd', 'Wpisy (2)']);
    expect(k.kafelki.map((x) => [x.k, x.v])).toEqual([['Aktualna dawka', '2,4 mg'], ['Czas leczenia', '—'], ['Masa', '—'], ['BMI', '—']]);
    expect(k.linia).toBeNull();
    const p = r.paski.children[0];
    expect(p._klCzesci).toEqual(['2,4 mg']);
    expect(p.querySelector('.vilda-kl-pigulka')).toBeNull();
  });
});

// ── P-GH-WZNOWIENIE, część 1 (decyzje właściciela 2026-11-20, W1–W4; docs/clinical/ALGORITHMS.md) ────────────────
// Leczenie GH wznowione po Zakończeniu: stan, „Włączenie”, czas, przyrost, tempo i ΔhSDS od bieżącego (ostatniego)
// kursu; granica kursu = samo Zakończenie (VildaTrajectoryAnalysis.ghKursy). Wiek w latach;miesiącach, wzrost w cm.
const GR1 = [GHP('r1-w1', 'start', 7, 0, 18, 110, 0.025), GHP('r1-k1', 'continue', 8, 0, 21, 117, 0.028), GHP('r1-z', 'end', 9, 0, 24, 123, 0.03),
  GHP('r1-w2', 'start', 10, 0, 27, 130, 0.03), GHP('r1-k2', 'continue', 11, 0, 30, 137, 0.033)];
const GR2 = [GHP('r2-w', 'start', 7, 0, 18, 110, 0.025), GHP('r2-z', 'end', 9, 0, 24, 123, 0.03), GHP('r2-k', 'continue', 10, 0, 27, 130, 0.03)];
const GR3 = [GHP('r3-w', 'start', 7, 0, 18, 110, 0.025), GHP('r3-k', 'continue', 8, 0, 21, 117, 0.028), GHP('r3-z', 'end', 9, 0, 24, 123, 0.03)];
const GR_PROGRAM = (p1, p2) => GR1.map((p, j) => ({ ...p, program: j < 3 ? p1 : p2 }));
const znaczniki = (k) => k.r.tresc.querySelector('.vilda-gh-summary-head').querySelectorAll('.vilda-gh-summary-chip').map(tekst);
const informacje = (k) => k.r.tresc.querySelector('.vilda-gh-summary').children.slice(2).map(tekst);
/** Drzewo DOM jako napis (tag, klasa, atrybuty, tekst) — do porównania dwóch rysunków. */
const drzewo = (el) => (!el ? 'null' : `<${el.tagName}.${el.className}[${[...el.atrybuty.entries()].sort().join(';')}]${el.wlasnyTekst}${el.children.map(drzewo).join('')}>`);
const sciezkaDawki = (el) => el.querySelectorAll('path').map((p) => p.getAttribute('d'));

describe('P-GH-WZNOWIENIE — podsumowanie i „Dane analityczne” GH od bieżącego kursu (B.1, B.2)', () => {
  it('GR1 wznowienie: „aktywne”, „kurs 2 z 2”, Włączenie 10 l., „2 w kursie (5 łącznie)”, wartości od Włączenia kursu 2', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: GR1 });
    expect(znaczniki(k)).toEqual(['aktywne', 'kurs 2 z 2']);
    expect(['Program', 'Preparat', 'Włączenie', 'Aktualna dawka', 'Punkty kontrolne', 'Ostatnia kontrola'].map(k.pole))
      .toEqual(['SNP', 'Genotropin 12 mg', 'w wieku 10 l. 0 mies.', '0,033 mg/kg/d', '2 w kursie (5 łącznie)', 'w wieku 11 l. 0 mies.']);
    expect(informacje(k)).toEqual([]);
    expect(tekst(k.r.tresc.querySelector('.vilda-gha-sec'))).toBe('Wzrastanie — kurs 2 z 2A');
    expect(k.kafel('Wzrost przy włączeniu')).toEqual({ v: '130 cm', sub: 'hSDS −1,27 · 10 l. 0 mies.' });
    expect(k.kafel('Przyrost całkowity')).toEqual({ v: '+7,0 cm', sub: 'przez 12 mies.' });
    expect(k.kafel('Tempo wzrastania')).toEqual({ v: '7 cm/rok', sub: 'ost. okres (z 12 mies.)' });
    expect(k.kafel('Odpowiedź (ΔhSDS)')).toEqual({ v: '+0,18', sub: 'catch-up od włączenia' });
    // dotąd: „leczenie zakończone”, Włączenie 7 l. 0 mies., 48 mies., ΔhSDS +0,55 (od pierwszego Włączenia, przerwa liczona)
    expect(k.paski).toEqual([expect.objectContaining({ id: 'gh', stan: 'aktywne', czesci: ['0,033 mg/kg/d', '12 mies.', 'tempo 7 cm/rok', 'ΔhSDS +0,18'] })]);
  });

  it('GR1 + otyłość trwająca (D2): GH wznowione jest aktywne — pasek i blok GH przed otyłością (dotąd po niej)', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: GR1, obesityTherapyPoints: O1 });
    expect(k.paski.map((p) => [p.id, p.stan])).toEqual([['gh', 'aktywne'], ['ob', 'aktywne']]);
    expect(k.bloki).toEqual(['vilda-kl-gh', 'vilda-ob-dz']);
  });

  it('GR4: punkty GR1 w innej kolejności tablicy → ten sam rysunek i ten sam pasek', () => {
    const a = zbuduj({ plec: 'M', ghTherapyPoints: GR1 });
    for (const pts of [[GR1[3], GR1[0], GR1[4], GR1[2], GR1[1]], GR1.slice().reverse()]) {
      const b = zbuduj({ plec: 'M', ghTherapyPoints: pts });
      expect(drzewo(b.r.tresc)).toBe(drzewo(a.r.tresc));
      expect(b.paski).toEqual(a.paski);
    }
  });

  // P-GH-WZNOWIENIE, część 2: ramka W2 prosi o dopisanie Włączenia w DocPro (monitor przyjmuje już Włączenie po
  // Zakończeniu); dotąd (część 1) tylko informowała, że kurs nie ma Włączenia.
  it('GR2 (W2): Kontynuacja po Zakończeniu bez Włączenia — „aktywne”, bez czasu, przyrostu i ΔhSDS, prośba o dopisanie Włączenia w DocPro', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: GR2 });
    expect(znaczniki(k)).toEqual(['aktywne', 'kurs 2 z 2']);
    expect(k.pole('Włączenie')).toBe('brak punktu');
    expect(k.pole('Punkty kontrolne')).toBe('1 w kursie (3 łącznie)');
    expect(informacje(k)).toEqual(['Kontynuacja po Zakończeniu bez nowego Włączenia (Zakończenie w wieku 9 l. 0 mies., pierwszy punkt '
      + 'kursu: w wieku 10 l. 0 mies.). Dopisz punkt „Włączenie leczenia” w DocPro (monitor terapii), by liczyć czas leczenia, '
      + 'przyrost i ΔhSDS od wznowienia.']);
    expect(k.kafel('Wzrost w 1. punkcie').v).toBe('130 cm');
    expect(k.kafel('Przyrost od Włączenia')).toEqual({ v: '—', sub: 'brak Włączenia po Zakończeniu' });
    expect(k.kafel('Odpowiedź (ΔhSDS)')).toEqual({ v: '—', sub: 'brak Włączenia po Zakończeniu' });
    expect(k.paski).toEqual([expect.objectContaining({ id: 'gh', stan: 'aktywne', czesci: ['0,03 mg/kg/d'] })]);
  });

  // P-GH-WZNOWIENIE, część 2, GW5: Włączenie dopisane w DocPro do starego zapisu W2 (w miesiącu pierwszego punktu kursu,
  // 10 l. 0 mies., albo wcześniej — 9 l. 6 mies.) — kurs 2 ma Włączenie: czas, przyrost i ΔhSDS wracają, bez ramki W2.
  it('GW5: stary zapis W2 + Włączenie z DocPro (10 l. 0 mies. albo 9 l. 6 mies.) — kurs 2 z Włączeniem, czas i ΔhSDS wracają, bez ramki W2', () => {
    const w10 = zbuduj({ plec: 'M', ghTherapyPoints: [...GR2, GHP('gw5-w', 'start', 10, 0, 27, 130, 0.03)] });
    expect(znaczniki(w10)).toEqual(['aktywne', 'kurs 2 z 2']);
    expect(w10.pole('Włączenie')).toBe('w wieku 10 l. 0 mies.');
    expect(w10.pole('Punkty kontrolne')).toBe('2 w kursie (4 łącznie)');
    expect(informacje(w10)).toEqual([]);
    expect(w10.kafel('Wzrost przy włączeniu')).toEqual({ v: '130 cm', sub: 'hSDS −1,27 · 10 l. 0 mies.' });
    expect(w10.kafel('Przyrost od Włączenia')).toBeNull();
    const w96 = zbuduj({ plec: 'M', ghTherapyPoints: [...GR2, GHP('gw5-w', 'start', 9, 6, 26, 127, 0.03), GHP('gw5-k', 'continue', 11, 0, 30, 137, 0.033)] });
    expect(w96.pole('Włączenie')).toBe('w wieku 9 l. 6 mies.');
    expect(informacje(w96)).toEqual([]);
    expect(w96.kafel('Przyrost całkowity')).toEqual({ v: '+10,0 cm', sub: 'przez 18 mies.' });
    expect(w96.kafel('Odpowiedź (ΔhSDS)').v).not.toBe('—');
    expect(w96.paski[0].czesci).toEqual(expect.arrayContaining(['18 mies.']));
  });

  it('W2 z dwiema Kontynuacjami po Zakończeniu: tempo z punktów kursu zostaje; pasek bez czasu i ΔhSDS', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: [...GR2, GHP('r2-k2', 'continue', 11, 0, 30, 137, 0.033)] });
    expect(k.kafel('Tempo wzrastania')).toEqual({ v: '7 cm/rok', sub: 'ost. okres (z 12 mies.)' });
    expect(k.kafel('Odpowiedź (ΔhSDS)').v).toBe('—');
    expect(k.paski[0].czesci).toEqual(['0,033 mg/kg/d', 'tempo 7 cm/rok']);
  });

  it('GR3 / GR6: jeden kurs (W → K → Z, bez startu, krótki odstęp, Increlex) — rysunek identyczny jak bez modułu kursów', () => {
    const k = zbuduj({ plec: 'M', ghTherapyPoints: GR3 });
    expect(znaczniki(k)).toEqual(['leczenie zakończone']);
    expect(k.pole('Punkty kontrolne')).toBe('3');
    expect(k.paski[0]).toEqual(expect.objectContaining({ stan: 'leczenie zakończone', czesci: ['0,03 mg/kg/d', '24 mies.', 'tempo 6 cm/rok', 'ΔhSDS +0,18'] }));
    for (const pts of [GR3, GR3.slice().reverse(), G1, G_BEZ_STARTU, G_KROTKI, G_INCRELEX, G_ZAKONCZONE]) {
      const z = zbuduj({ plec: 'M', ghTherapyPoints: pts });
      const bez = zbuduj({ plec: 'M', ghTherapyPoints: pts }, [], { bezTrajektorii: true });
      expect(drzewo(z.r.tresc)).toBe(drzewo(bez.r.tresc));
      expect(z.paski).toEqual(bez.paski);
    }
  });

  it('drugie Włączenie w otwartym kursie (scalone duplikaty, dopisane na koniec tablicy): Włączenie pierwsze wg wieku', () => {
    const pts = [GHP('d-w2', 'start', 7, 6, 19.6, 114.6, 0.025), GHP('d-k', 'continue', 8, 0, 21.3, 118.7, 0.028),
      GHP('d-k2', 'continue', 10, 0, 29.8, 132.4, 0.033), GHP('d-w1', 'start', 7, 0, 18, 110, 0.025)];
    const k = zbuduj({ plec: 'M', ghTherapyPoints: pts });
    expect(znaczniki(k)).toEqual(['aktywne']);
    // dotąd pierwsze Włączenie w kolejności tablicy: 7 l. 6 mies. i 30 mies.
    expect(k.pole('Włączenie')).toBe('w wieku 7 l. 0 mies.');
    expect(k.kafel('Przyrost całkowity').sub).toBe('przez 36 mies.');
  });
});

describe('P-GH-WZNOWIENIE — przypadki z przeglądu: ten sam miesiąc, dwa Włączenia w jednym kursie', () => {
  it('Kontynuacja z miesiąca Zakończenia dopisana po nim: „leczenie zakończone”, bez „kurs 2 z 2” (jak dotąd)', () => {
    const pts = [...GR3, GHP('r3-k2', 'continue', 9, 0, 24, 123, 0.03)];
    const k = zbuduj({ plec: 'M', ghTherapyPoints: pts });
    expect(znaczniki(k)).toEqual(['leczenie zakończone']);
    expect(k.paski[0].stan).toBe('leczenie zakończone');
  });

  it('jeden kurs z dwoma Włączeniami w odwrotnej kolejności tablicy: pas na siatkach od pierwszego Włączenia wg wieku', () => {
    const K = karta();
    const Lt = pasLeczenia(120);
    const gh = (pe) => Lt(pe, 'GH', '#0F6E56');
    const pts = [GHP('d-w8', 'start', 8, 0, 21, 117, 0.03), GHP('d-w7', 'start', 7, 0, 18, 110, 0.025), GHP('d-k9', 'continue', 9, 0, 24, 123, 0.03)];
    expect(K.Gw_pasy(pts, gh)).toEqual({ startAgeM: 84, endAgeM: 120, active: true, label: 'GH', color: '#0F6E56' });
  });
});

describe('P-GH-WZNOWIENIE — trend GH i pas na siatkach (B.4, B.5, GR7)', () => {
  it('GR7 trend (mg/kg/d): linia dawki przerwana między Zakończeniem (9 l.) a ponownym Włączeniem (10 l.)', () => {
    const K = karta();
    const gr1 = sciezkaDawki(K.Pl('pacjent-fikcyjny', GR1));
    expect(gr1).toEqual(['M 56.0 178.3 L 191.0 178.3 L 191.0 138.3 L 326.0 138.3 L 326.0 111.7 M 461.0 111.7 L 596.0 111.7 L 596.0 71.7']);
    // jeden kurs — linia ciągła, jak dotąd
    const g1 = sciezkaDawki(K.Pl('pacjent-fikcyjny', G1));
    expect(g1).toHaveLength(1);
    expect(g1[0]).not.toContain(' M ');
    expect(sciezkaDawki(karta({ bezTrajektorii: true }).Pl('pacjent-fikcyjny', G1))).toEqual(g1);
  });

  it('GR7 trend (% dawki zalecanej): bez odcinka między kursami — 3 odcinki po 2 linie (dotąd 4)', () => {
    const K = karta({ odcinki: true });
    const linieDawki = (pts) => K.Pl('pacjent-fikcyjny', pts).querySelectorAll('line[stroke-width="3.2"]').length;
    expect(linieDawki(GR1)).toBe(6);
    expect(linieDawki(GR3)).toBe(4);
  });

  it('GR7 trend: program (typowy zakres dawki) z bieżącego kursu, nie z pierwszego Włączenia', () => {
    const K = karta();
    const przelacznik = (pts) => tekst(K.Pl('pacjent-fikcyjny', pts)).includes('Pokaż typowy zakres dawki');
    expect(przelacznik(GR_PROGRAM('Inny', 'SNP'))).toBe(true);
    expect(przelacznik(GR_PROGRAM('SNP', 'Inny'))).toBe(false);
  });

  it('GR7 pas na siatkach: jeden pas na kurs (drugi aktywny do bieżącego wieku); jeden kurs — ten sam pas co dotąd', () => {
    const K = karta();
    const Lt = pasLeczenia(133);
    const gh = (pe) => Lt(pe, 'GH', '#0F6E56');
    expect(K.Gw_pasy(GR1, gh)).toEqual([
      { startAgeM: 84, endAgeM: 108, active: false, label: 'GH', color: '#0F6E56' },
      { startAgeM: 120, endAgeM: 133, active: true, label: 'GH', color: '#0F6E56' },
    ]);
    // dotąd: jeden pas od pierwszego Włączenia do Zakończenia, „nieaktywny” — wznowione leczenie bez pasa
    expect(gh(GR1)).toEqual({ startAgeM: 84, endAgeM: 108, active: false, label: 'GH', color: '#0F6E56' });
    expect(K.Gw_pasy(G1, gh)).toEqual(gh(G1));
    expect(K.Gw_pasy(GR3, gh)).toEqual(gh(GR3));
    expect(AUTH).toContain('Yt=Gw_pasy(s.ghTherapyPoints,function(pe){return Lt(pe,"GH","#0F6E56")})');
    expect(AUTH).toContain('Ne=[].concat(Yt||[],ke||[])');
  });
});


// ── P-KARTA-LECZENIE, etap 2 (makieta hybrydy 2026-11-19, „zaczynaj etap 2” 2026-11-21; docs/clinical/ALGORITHMS.md) ──
// Karta leczenia otyłości z przełącznikiem „Przegląd | Wpisy (N) | Analiza”. Kafelki i linia oceny „Przeglądu” z obiektów
// wyjściowych Cl i Ml/Ob_b (te same obliczenia co panel) — testy porównują je z kafelkami i polem oceny panelu z tego
// samego rysunku. Dane wyłącznie FIKCYJNE.
const OB2 = (id, type, dateISO, lata, mies, weight, height, dose) => OB(id, type, dateISO, lata, mies, weight, height, dose);
// Dwa cykle: Wegovy 06–12.2025 zakończony, nowy cykl od 23.06.2026 (jak O1).
const O_DWA_CYKLE = [OB2('c1-w', 'start', '2025-06-10', 16, 6, 95, 156, '0,25 mg'), OB2('c1-k', 'continue', '2025-10-14', 16, 10, 92, 156.5, '1 mg'),
  OB2('c1-z', 'end', '2025-12-09', 17, 0, 92.5, 156.5, ''), ...O1];
// Sześć wpisów (sekcja pokazuje 5, „Pokaż wszystkie wpisy (6)” przebudowuje grupę).
const O_SZESC = [OB2('s6-w', 'start', '2026-02-17', 17, 2, 91.9, 157, '0,25 mg'), OB2('s6-k1', 'continue', '2026-03-17', 17, 3, 90.3, 157, '0,5 mg'),
  OB2('s6-k2', 'continue', '2026-04-14', 17, 4, 88.4, 157, '1 mg'), OB2('s6-k3', 'continue', '2026-06-09', 17, 6, 85.1, 157.2, '2,4 mg'),
  OB2('s6-k4', 'continue', '2026-08-18', 17, 8, 82.2, 157.2, '2,4 mg'), OB2('s6-k5', 'continue', '2026-11-10', 17, 11, 79.4, 157.4, '2,4 mg')];
const opisPola = (k) => tekst(k.karta.widok('analiza').querySelector('.vilda-oba-vd'));
const tytulPola = (k) => tekst(k.karta.widok('analiza').querySelector('.vilda-oba-vt'));
const ikonaPola = (k) => tekst(k.karta.widok('analiza').querySelector('.vilda-oba-vic'));
const kafelPanelu = (k, etykieta) => {
  const t = k.karta.widok('analiza').querySelectorAll('.vilda-gha-k').find((x) => x.textContent === etykieta);
  return t ? { v: tekst(t.parentNode.querySelector('.vilda-gha-v')), sub: tekst(t.parentNode.querySelector('.vilda-gha-sub')) } : null;
};

describe('P-KARTA-LECZENIE, etap 2 — karta leczenia otyłości: nagłówek, przełącznik, widoki', () => {
  it('O1: jedna karta (kontener podsumowania), nagłówek: znacznik, stan i „+ Kontynuacja”; bez pól siatki podsumowania', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    const c = k.karta;
    expect(c.naglowek).toEqual(['vilda-gh-summary-badge', 'vilda-gh-summary-chip', 'vdo-head-actions vdo-zewn']);
    expect(tekst(c.el.querySelector('.vilda-gh-summary-badge'))).toBe('Leczenie otyłości — Wegovy');
    expect(tekst(c.el.querySelector('.vilda-gh-summary-chip'))).toBe('aktywne');
    const dodaj = c.el.children[0].querySelector('.vdo-add');
    expect(tekst(dodaj)).toBe('+ Kontynuacja');
    expect(dodaj.getAttribute('aria-disabled')).toBeNull();
    expect(c.el.querySelectorAll('.vdo-add')).toHaveLength(1); // ten sam przycisk — nie kopia
    expect(c.el.querySelectorAll('.vilda-gh-summary-grid')).toHaveLength(0);
    for (const pole of ['Lek', 'Substancja', 'Włączenie', 'Punkty kontrolne', 'Ostatnia kontrola', 'Aktualna dawka']) expect(k.pole(pole)).toBeNull();
  });

  it('O1: przełącznik „Przegląd | Wpisy (2) | Analiza” (tablist/tab, aria-selected), domyślnie „Przegląd”; klik zmienia widok', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    const c = k.karta;
    expect(c.el.querySelector('.vilda-ko-seg').getAttribute('role')).toBe('tablist');
    expect(c.zakladki.map((b) => b.getAttribute('role'))).toEqual(['tab', 'tab', 'tab']);
    expect(c.przelacznik).toEqual(['Przegląd', 'Wpisy (2)', 'Analiza']);
    expect([c.wybrany, c.widoczne]).toEqual(['przeglad', ['przeglad']]);
    for (const b of c.zakladki) expect(c.el.querySelector(`#${b.getAttribute('aria-controls')}`).getAttribute('aria-labelledby')).toBe(b.id);
    c.zakladki[1].click();
    expect(kartaOtylosci(k.r.tresc)).toEqual(expect.objectContaining({ wybrany: 'wpisy', widoczne: ['wpisy'] }));
    c.zakladki[2].click();
    expect(kartaOtylosci(k.r.tresc)).toEqual(expect.objectContaining({ wybrany: 'analiza', widoczne: ['analiza'] }));
  });

  it('O1 Przegląd: 2,4 mg (1×/tydz. · od 10.11.2026), 20 tyg. (od 23.06.2026 (17 l. 6 mies.)), 84 kg (−7,9 kg (−8,6%) od włączenia), BMI 34,1 (−8,6% od włączenia · próg ChPL ≥5%)', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    expect(k.karta.kafelki).toEqual([
      { k: 'Aktualna dawka', v: '2,4 mg', sub: '1×/tydz. · od 10.11.2026', kolor: null },
      { k: 'Czas leczenia', v: '20 tyg.', sub: 'od 23.06.2026 (17 l. 6 mies.)', kolor: null },
      { k: 'Masa', v: '84 kg', sub: '−7,9 kg (−8,6%) od włączenia', kolor: 'vilda-ko-cz vilda-ko-cz--good' },
      { k: 'BMI', v: '34,1', sub: '−8,6% od włączenia · próg ChPL ≥5%', kolor: null },
    ]);
    // te same obliczenia co kafelki panelu z tego samego rysunku
    expect(kafelPanelu(k, 'Czas leczenia').v).toBe('20 tyg.');
    expect(kafelPanelu(k, 'Masa ostatnia').v).toBe('84 kg');
    expect(kafelPanelu(k, 'Masa ostatnia').sub).toContain('BMI 34,1 kg/m² · 17 l. 11 mies. · 10.11.2026');
    expect(kafelPanelu(k, 'Redukcja masy')).toEqual({ v: '−7,9 kg', sub: '−8,6% od włączenia' });
    expect(kafelPanelu(k, 'Redukcja BMI').sub).toBe('−8,6% od włączenia');
    expect(kafelPanelu(k, 'Próg ChPL')).toEqual({ v: '≥5 %', sub: 'Wegovy 12–17 l.' });
  });

  it('O1 linia oceny: „⏳ Przed oknem oceny — oceń po 12 tyg. Obecnie 4. tydz. stosowania dawki podtrzymującej. Szczegóły oceny” = tytuł i 1. zdanie pola oceny', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    const linia = k.karta.el.querySelector('.vilda-ko-werdykt');
    expect(k.karta.liniaKlasa).toBe('vilda-ko-werdykt vilda-ko-werdykt--wait');
    expect([tekst(linia.children[0]), tekst(linia.children[1].children[0]), tekst(linia.children[1].children[1]), tekst(linia.children[2])])
      .toEqual(['⏳', 'Przed oknem oceny — oceń po 12 tyg.', 'Obecnie 4. tydz. stosowania dawki podtrzymującej.', 'Szczegóły oceny']);
    expect([ikonaPola(k), tytulPola(k)]).toEqual(['⏳', 'Przed oknem oceny — oceń po 12 tyg.']);
    expect(opisPola(k).startsWith('Obecnie 4. tydz. stosowania dawki podtrzymującej. Próg (Wegovy 12–17 l.): ')).toBe(true);
    expect(linia.children[2].tagName).toBe('BUTTON');
  });

  it('„Szczegóły oceny” → widok „Analiza”, fokus na polu oceny (to samo pole, które opisuje linia)', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    k.karta.el.querySelector('.vilda-ko-werdykt-link').click();
    const c = kartaOtylosci(k.r.tresc);
    expect([c.wybrany, c.widoczne]).toEqual(['analiza', ['analiza']]);
    const pole = c.widok('analiza').querySelector('.vilda-oba-verdict');
    expect(pole.ownerDocument.activeElement).toBe(pole);
    expect(pole.getAttribute('tabindex')).toBe('-1');
  });

  it('O1 Wpisy: sekcja bez nagłówka (bez tytułu i przycisków), „Jak działa dziennik leczenia ⌄” rozwija dzisiejsze akapity objaśnień', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    const sekcja = k.karta.widok('wpisy').querySelector('.vdo');
    expect(sekcja.className).toBe('vdo vdo-karta');
    expect(sekcja.getAttribute('aria-label')).toBe('Wpisy leczenia');
    expect(sekcja.querySelectorAll('.vdo-head')).toHaveLength(0);
    expect(sekcja.querySelectorAll('.vdo-title')).toHaveLength(0);
    expect(sekcja.querySelectorAll('.vdo-add')).toHaveLength(0);
    expect(sekcja.querySelectorAll('.vdo-list .vdo-item')).toHaveLength(2);
    const jak = sekcja.querySelector('.vdo-jak');
    const tresc = sekcja.querySelector('.vdo-jak-tresc');
    expect(tekst(jak)).toBe('Jak działa dziennik leczenia⌄');
    expect([jak.getAttribute('aria-expanded'), jak.getAttribute('aria-controls'), tresc.hidden]).toEqual(['false', tresc.id, true]);
    expect(tresc.children.map(tekst)).toEqual([
      'Dziennik leczenia jest oddzielony od wizyt w gabinecie. Wpis z masą od pacjenta nie tworzy wizyty i nie zmienia jej pomiarów.',
      'Włączenie, Zakończenie i zmianę leku edytujesz w monitorze DocPro — „Edytuj w DocPro →” przy wpisie otwiera go od razu na tym wpisie. Tu — Kontynuacje.',
      'Wpisy z dawnych wizyt przeniesione ze źródłem „gabinet”.',
    ]);
    jak.click();
    expect([jak.getAttribute('aria-expanded'), tresc.hidden]).toEqual(['true', false]);
    jak.click();
    expect([jak.getAttribute('aria-expanded'), tresc.hidden]).toEqual(['false', true]);
  });

  it('O1 Analiza: panel „Dane analityczne — otyłość” rozwinięty, bez belki; cicha linia „lek · substancja · 2 punkty kontrolne”', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    const a = k.karta.widok('analiza');
    expect(a.querySelectorAll('.vilda-gha-btn')).toHaveLength(0);
    const panel = a.querySelector('.vilda-gha-panel');
    expect(panel.getAttribute('style')).toBeNull();
    expect(a.children[0].children.map((c) => c.className)).toEqual(['vilda-ko-cicha', 'vilda-gha-panel']);
    expect(k.karta.cicha).toBe('Wegovy (semaglutyd) – s.c. 1×/tydz. · Semaglutyd (agonista receptora GLP‑1) · 2 punkty kontrolne');
    expect(panel.querySelectorAll('.vilda-gha-sec').map(tekst)).toEqual(['Przebieg leczenia otyłościA', 'Odpowiedź na leczenieB', 'Dawka a przebieg leczeniaA']);
    expect(panel.querySelectorAll('.vilda-oba-verdict')).toHaveLength(1);
  });
});

describe('P-KARTA-LECZENIE, etap 2 — przypadki „Przeglądu” (wartości z tych samych obliczeń co panel)', () => {
  it('O2 (wystarczająca): linia „✓ Odpowiedź wystarczająca — kontynuować leczenie” + 1. zdanie pola oceny; 38 tyg., BMI −14,0%', () => {
    const k = zbuduj({ obesityTherapyPoints: O_PASS });
    expect(k.karta.liniaKlasa).toBe('vilda-ko-werdykt vilda-ko-werdykt--good');
    expect(k.karta.linia).toBe('✓Odpowiedź wystarczająca — kontynuować leczenie'
      + 'Osiągnięto −14,0% (BMI) po 22 tyg. stosowania dawki podtrzymującej · próg ChPL: redukcja BMI ≥5% po 12 tyg. dawki 2,4 mg/tydz. (lub maks. tolerowanej) — inaczej odstawić i ponownie ocenić.'
      + 'Szczegóły oceny');
    expect(k.karta.kafelki.map((x) => [x.v, x.sub])).toEqual([['2,4 mg', '1×/tydz. · od 10.11.2026'], ['38 tyg.', 'od 17.02.2026 (17 l. 2 mies.)'],
      ['79,4 kg', '−12,5 kg (−13,6%) od włączenia'], ['32', '−14,0% od włączenia · próg ChPL ≥5%']]);
  });

  it('niewystarczająca: linia czerwona „✗ Odpowiedź niewystarczająca — wg ChPL odstawić i ponownie ocenić”', () => {
    const k = zbuduj({ obesityTherapyPoints: O_FAIL });
    expect(k.karta.liniaKlasa).toBe('vilda-ko-werdykt vilda-ko-werdykt--bad');
    expect(k.karta.linia.startsWith('✗Odpowiedź niewystarczająca — wg ChPL odstawić i ponownie ocenićOsiągnięto −1,5% (BMI) po 22 tyg.')).toBe(true);
  });

  it('dorosły, Saxenda (ocena z masy): „próg ChPL ≥5%” w kafelku Masa, nie BMI; 3,0 mg (1×/dobę · od 12.05.2026)', () => {
    const k = zbuduj({ obesityTherapyPoints: A_SAX });
    expect(k.karta.kafelki).toEqual([
      { k: 'Aktualna dawka', v: '3,0 mg', sub: '1×/dobę · od 12.05.2026', kolor: null },
      { k: 'Czas leczenia', v: '17 tyg.', sub: 'od 12.01.2026 (40 l. 1 mies.)', kolor: null },
      { k: 'Masa', v: '97 kg', sub: '−7,0 kg (−6,7%) od włączenia · próg ChPL ≥5%', kolor: 'vilda-ko-cz vilda-ko-cz--good' },
      { k: 'BMI', v: '33,6', sub: '−6,7% od włączenia', kolor: null },
    ]);
    expect(kafelPanelu(k, 'Redukcja do oceny').sub).toBe('masa ciała · okno 12 tyg.');
  });

  it('dorosły, Wegovy (ocena kliniczna, „Próg ChPL: —”): bez progu w kafelkach; linia „ℹ️ Ocena kliniczna — brak twardego progu SmPC” + 1. zdanie', () => {
    const k = zbuduj({ obesityTherapyPoints: A_WEG });
    expect(kafelPanelu(k, 'Próg ChPL').v).toBe('—');
    expect(k.karta.kafelki.map((x) => x.sub).join(' ')).not.toContain('próg');
    expect(k.karta.linia).toBe('ℹ️Ocena kliniczna — brak twardego progu SmPC'
      + 'ChPL nie podaje dla dorosłych progu skuteczności ani terminu oceny — o kontynuacji decyduje ocena kliniczna.Szczegóły oceny');
  });

  it('bez punktu „Włączenie”: kafelek „Czas od 1. punktu” (jak panel, bez podpisu z Włączenia), redukcje „od 1. punktu”, linia jak pole oceny', () => {
    const k = zbuduj({ obesityTherapyPoints: O_BEZ_STARTU });
    expect(k.karta.kafelki[1]).toEqual({ k: 'Czas od 1. punktu', v: '38 tyg.', sub: null, kolor: null });
    expect(kafelPanelu(k, 'Czas od 1. punktu').v).toBe('38 tyg.');
    expect(k.karta.kafelki[2].sub).toBe('−12,5 kg (−13,6%) od 1. punktu');
    expect(k.karta.kafelki[3].sub).toBe('−14,0% od 1. punktu · próg ChPL ≥5%');
    expect(k.karta.linia).toBe(`ℹ️${tytulPola(k)}ChPL ocenia odpowiedź od początkowej masy ciała i od włączenia leczenia (albo od osiągnięcia dawki `
      + 'podtrzymującej); pierwszy zapisany punkt tego nie zastępuje.Szczegóły oceny');
    // ostrzeżenie „Brak punktu „Włączenie”…” z podsumowania zostaje widoczne nad przełącznikiem (w każdym widoku)
    const ostrzezenie = k.karta.el.children.find((c) => tekst(c).startsWith('Brak punktu „Włączenie” (pierwszy zapisany punkt'));
    expect(k.karta.el.children.indexOf(ostrzezenie)).toBeLessThan(k.karta.el.children.indexOf(k.karta.el.querySelector('.vilda-ko-seg')));
  });

  it('zakończone: ta sama karta i przełącznik; „+ Kontynuacja” (aria-disabled) z wyjaśnieniem DZ-5 nad przełącznikiem — w każdym widoku', () => {
    const k = zbuduj({ obesityTherapyPoints: O_ZAKONCZONE });
    const c = k.karta;
    expect(tekst(c.el.querySelector('.vilda-gh-summary-chip'))).toBe('leczenie zakończone');
    expect(c.przelacznik).toEqual(['Przegląd', 'Wpisy (3)', 'Analiza']);
    const glowa = c.el.children[0];
    const dodaj = glowa.querySelector('.vdo-add');
    expect(dodaj.getAttribute('aria-disabled')).toBe('true');
    expect(dodaj.getAttribute('aria-describedby')).toBe('vdoAddWhy');
    expect(tekst(glowa.querySelector('#vdoAddWhy'))).toBe('Brak aktywnego cyklu — nowy cykl zaczyna się od Włączenia przy wizycie.');
    expect(glowa.querySelectorAll('.vdo-btn-docpro').map(tekst)).toEqual(['Włączenie w DocPro →']);
    const komunikat = c.el.children[1];
    expect([komunikat.className, komunikat.getAttribute('hidden')]).toEqual(['vdo-msg', '']);
    dodaj.click(); // w „Przeglądzie”
    expect([komunikat.className, komunikat.hidden]).toEqual(['vdo-msg vdo-msg-warn', false]);
    expect(tekst(komunikat)).toBe('Brak aktywnego cyklu leczenia — nowy cykl zaczyna się od Włączenia, które dodajesz w DocPro przy wizycie („Włączenie w DocPro →”).');
    expect(k.r.tresc.ownerDocument.body.querySelectorAll('.vdo-dialog')).toHaveLength(0);
    expect(c.widok('wpisy').querySelector('.vdo-msg-warn')).toBeNull(); // nie w ukrytym widoku „Wpisy”
    expect(c.kafelki[0]).toEqual({ k: 'Aktualna dawka', v: '—', sub: null, kolor: null });
    expect(c.linia).toBe('✓Cykl zakończony — odpowiedź była wystarczająca wg ChPLCykl zakończony 17.11.2026 — ocena na dzień Zakończenia, bez zaleceń na dziś.Szczegóły oceny');
  });

  it('dwa cykle: Przegląd z bieżącego cyklu (jak O1), „cykl 2 z 2” w nagłówku, przełącznik cykli w „Analizie”, „2 punkty kontrolne w cyklu (5 łącznie)”', () => {
    const k = zbuduj({ obesityTherapyPoints: O_DWA_CYKLE });
    const jeden = zbuduj({ obesityTherapyPoints: O1 });
    expect(k.karta.kafelki).toEqual(jeden.karta.kafelki);
    expect(k.karta.linia).toBe(jeden.karta.linia);
    expect(k.karta.el.children[0].querySelectorAll('.vilda-gh-summary-chip').map(tekst)).toEqual(['aktywne', 'cykl 2 z 2']);
    expect(k.karta.widok('analiza').querySelectorAll('.vilda-ob-seg button').map(tekst)).toEqual(['Cykl 2 · Wegovy · bieżący', 'Cykl 1 · Wegovy']);
    expect(k.karta.widok('przeglad').querySelectorAll('.vilda-ob-seg')).toHaveLength(0);
    expect(k.karta.cicha).toBe('Wegovy (semaglutyd) – s.c. 1×/tydz. · Semaglutyd (agonista receptora GLP‑1) · 2 punkty kontrolne w cyklu (5 łącznie)');
    expect(tekst(k.karta.el.querySelector('.vilda-ob-hist'))).toContain('Poprzednie cykle');
  });

  it('dawka „od”: najwcześniejszy punkt cyklu z tą samą dawką ciągle do ostatniego (2,4 mg od 09.06.2026 przy 3 wpisach z 2,4 mg)', () => {
    const k = zbuduj({ obesityTherapyPoints: O_SZESC });
    expect(k.karta.kafelki[0]).toEqual(expect.objectContaining({ v: '2,4 mg', sub: '1×/tydz. · od 09.06.2026' }));
  });

  it('linia oceny dla każdego stanu = ikona, tytuł pola oceny i jego 1. zdanie (bez zmiany tekstu); kolor jak pole oceny', () => {
    const stany = [
      [O_BEZ_WZROSTU, 'Potrzebny pomiar wzrostu do oceny ChPL', 'Wegovy 12–17 l. ocenia odpowiedź z BMI.'],
      [O_DWA_WLACZENIA, 'Zapis cyklu wymaga uporządkowania — ocena wg ChPL wstrzymana', null],
      [O_NIEZNANY_LEK, 'Brak dopasowania do progów ChPL', 'Nie rozpoznano leku (Wegovy/Saxenda/Mysimba/Mounjaro) albo wiek przy włączeniu jest poza wskazaniem — ocena automatyczna niedostępna.'],
    ];
    for (const pts of [O1, O_PASS, O_FAIL, A_SAX, A_WEG, O_BEZ_STARTU, O_ZAKONCZONE, O_DWA_CYKLE, ...stany.map((x) => x[0])]) {
      const k = zbuduj({ obesityTherapyPoints: pts });
      const pole = k.karta.widok('analiza').querySelector('.vilda-oba-verdict');
      const linia = k.karta.el.querySelector('.vilda-ko-werdykt');
      const zdanie = tekst(linia.querySelector('.vilda-ko-werdykt-d'));
      expect(tekst(linia.querySelector('.vilda-ko-werdykt-t'))).toBe(tytulPola(k));
      expect(tekst(linia.querySelector('.vilda-ko-werdykt-ic'))).toBe(ikonaPola(k));
      expect(linia.className.replace('vilda-ko-werdykt vilda-ko-werdykt--', '')).toBe(pole.className.replace('vilda-oba-verdict ', ''));
      expect(opisPola(k).startsWith(zdanie)).toBe(true);
      expect(/[.!?]\)?$/.test(zdanie)).toBe(true);
    }
    for (const [pts, tytul, zdanie] of stany) {
      const k = zbuduj({ obesityTherapyPoints: pts });
      expect(tytulPola(k)).toBe(tytul);
      if (zdanie) expect(tekst(k.karta.el.querySelector('.vilda-ko-werdykt-d'))).toBe(zdanie);
    }
  });

  it('Ko_pierwszeZdanie: skróty („4.”, „tyg.”, „l.”, „~mies.)”) nie kończą zdania przed małą literą; kończą przed wielką', () => {
    const { Ko_pierwszeZdanie: z } = karta();
    expect(z('Obecnie 4. tydz. stosowania dawki podtrzymującej. Próg (Wegovy 12–17 l.): redukcja.')).toBe('Obecnie 4. tydz. stosowania dawki podtrzymującej.');
    expect(z('Obecnie 18. tydz. (z delty wieku, dokładność ~mies.) Próg (X): r.')).toBe('Obecnie 18. tydz. (z delty wieku, dokładność ~mies.)');
    expect(z('Obecnie 14. tydz. Próg (Mysimba): r.')).toBe('Obecnie 14. tydz.');
    expect(z('Cykl zakończony 17.11.2026 — ocena na dzień Zakończenia, bez zaleceń na dziś. Osiągnięto')).toBe('Cykl zakończony 17.11.2026 — ocena na dzień Zakończenia, bez zaleceń na dziś.');
    expect(z('brak dat wizyt (tygodnie od włączenia nieznane). Uzupełnij daty.')).toBe('brak dat wizyt (tygodnie od włączenia nieznane).');
    expect(z('Jedno zdanie bez końca')).toBe('Jedno zdanie bez końca');
    expect(z('')).toBe('');
  });

  it('moduł progów ChPL niezaładowany: pole oceny w „Analizie” zostaje, w „Przeglądzie” bez linii i bez częstości', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 }, [], { bezKryteriow: true });
    expect(tytulPola(k)).toBe('Moduł progów ChPL niezaładowany');
    expect(k.karta.linia).toBeNull();
    expect(k.karta.kafelki[0]).toEqual(expect.objectContaining({ v: '2,4 mg', sub: 'od 10.11.2026' }));
    expect(k.karta.kafelki[3].sub).toBe('−8,6% od włączenia');
  });

  it('częstość podania: lek rozpoznany jak w ocenie ChPL, wartości jak products[…].frequency w katalogu obesity_therapy.js', () => {
    const { Ko_CZESTOSC } = karta();
    const katalog = fs.readFileSync(path.join(korzen, 'obesity_therapy.js'), 'utf8');
    const czestosc = (klucz) => {
      const m = new RegExp(`${klucz}:\\{key:"${klucz}",label:"[^"]*",route:"[^"]*",frequency:("[^"]*")`).exec(katalog);
      return m ? JSON.parse(m[1].replace(/\\x([0-9A-Fa-f]{2})/g, '\\u00$1')) : null;
    };
    expect(Object.keys(Ko_CZESTOSC).sort()).toEqual(['mounjaro', 'saxenda', 'wegovy']);
    for (const lek of Object.keys(Ko_CZESTOSC)) expect(Ko_CZESTOSC[lek]).toBe(czestosc(lek));
    expect(czestosc('mysimba')).toBe('wg titracji'); // bez jednej częstości — bez części w podpisie
  });
});

describe('P-KARTA-LECZENIE, etap 2 — stan widoku i przebudowa grupy', () => {
  function otworzKarte(K, rekord, opcje = {}) {
    bledy.length = 0;
    const r = K.Kl_leczenie({ patientId: 'pacjent-fikcyjny', rekord, plec: 'F', zaawansowane: {}, siatka: null, notatki: [], user: {},
      zakladka: '<span class="vilda-patient-tab-lbl">Leczenie</span>', ...opcje });
    expect(bledy).toEqual([]);
    return r;
  }

  it('przebudowa grupy („Pokaż wszystkie wpisy (6)”) zostawia „Wpisy”; nowe otwarcie Karty — „Przegląd”; odświeżenie po synchronizacji (tlo) — „Wpisy”', () => {
    const K = karta();
    const r = otworzKarte(K, { obesityTherapyPoints: O_SZESC });
    let c = kartaOtylosci(r.tresc);
    expect(c.przelacznik).toEqual(['Przegląd', 'Wpisy (6)', 'Analiza']);
    c.zakladki[1].click();
    const stara = c.el;
    const wiecej = c.widok('wpisy').querySelector('.vdo-more');
    expect(tekst(wiecej)).toBe('Pokaż wszystkie wpisy (6) ▾');
    wiecej.click();
    c = kartaOtylosci(r.tresc);
    expect(c.el).not.toBe(stara); // grupa przebudowana
    expect([c.wybrany, c.widoczne]).toEqual(['wpisy', ['wpisy']]);
    expect(c.widok('wpisy').querySelectorAll('.vdo-list .vdo-item')).toHaveLength(6);
    // odświeżenie Karty po synchronizacji (ta sama Karta) — widok zostaje
    expect(kartaOtylosci(otworzKarte(K, { obesityTherapyPoints: O_SZESC }, { tlo: true }).tresc).wybrany).toBe('wpisy');
    // nowe otwarcie Karty — „Przegląd”
    expect(kartaOtylosci(otworzKarte(K, { obesityTherapyPoints: O_SZESC }).tresc).wybrany).toBe('przeglad');
    expect(kartaOtylosci(otworzKarte(K, { obesityTherapyPoints: O_SZESC }, { tlo: true }).tresc).wybrany).toBe('przeglad');
  });

  it('„Jak działa dziennik leczenia” rozwinięte zostaje rozwinięte po przebudowie grupy', () => {
    const K = karta();
    const r = otworzKarte(K, { obesityTherapyPoints: O_SZESC });
    let c = kartaOtylosci(r.tresc);
    c.widok('wpisy').querySelector('.vdo-jak').click();
    c.widok('wpisy').querySelector('.vdo-more').click();
    c = kartaOtylosci(r.tresc);
    expect(c.widok('wpisy').querySelector('.vdo-jak').getAttribute('aria-expanded')).toBe('true');
    expect(c.widok('wpisy').querySelector('.vdo-jak-tresc').hidden).toBe(false);
  });

  it('karta się nie składa (wyjątek Ko_karta) → grupa jak w etapie 1: podsumowanie z polami, sekcja z nagłówkiem, panel z belką', () => {
    const KOD_BLAD = KOD.replace('function Ko_karta(o) {', 'function Ko_karta(o) {throw new Error("karta: błąd testowy");');
    expect(KOD_BLAD).not.toBe(KOD);
    const zgloszone = [];
    const K = new Function('i', 'jt', 'Ot', 'oe', `${KOD_BLAD}\nreturn { Kl_leczenie };`)(
      okno(), () => null, (gdzie) => zgloszone.push(gdzie),
      (t) => { if (!t) return; while (t.firstChild) t.removeChild(t.firstChild); });
    const r = K.Kl_leczenie({ patientId: 'pacjent-fikcyjny', rekord: { obesityTherapyPoints: O1 }, plec: 'F', zaawansowane: {}, siatka: null,
      notatki: [], user: {}, zakladka: '<span class="vilda-patient-tab-lbl">Leczenie</span>' });
    expect(zgloszone).toEqual(['karta leczenie karta']);
    const dz = r.tresc.children[0];
    expect(dz.children.map((c) => c.className)).toEqual(['vilda-gh-summary', 'vdo', '']);
    expect(dz.querySelectorAll('.vilda-gh-summary-grid')).toHaveLength(1);
    expect(tekst(dz.querySelector('.vdo-title'))).toBe('Wpisy leczenia');
    expect(tekst(dz.querySelector('.vilda-gha-btn'))).toContain('Dane analityczne — otyłość');
    expect(dz.querySelector('.vilda-gha-panel').getAttribute('style')).toBe('display:none;');
    expect(r.paski.children[0]._klCzesci).toEqual(['2,4 mg', '20 tyg.', 'BMI −8,6%']);
  });

  it('pasek leczenia (etap 1) liczony z tego samego rysunku co karta — bez zmian treści', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    expect(k.paski[0]).toEqual(expect.objectContaining({ wartosci: '2,4 mg · 20 tyg. · BMI −8,6%', pigulka: WAIT }));
    expect(k.karta.kafelki[0].v).toBe(k.paski[0].czesci[0]);
    expect(k.karta.kafelki[1].v).toBe(k.paski[0].czesci[1]);
  });

  it('GH i karta „wg notatek” — bez karty z przełącznikiem (bez zmian)', () => {
    const gh = zbuduj({ plec: 'M', ghTherapyPoints: G1 });
    expect(gh.karta).toBeNull();
    expect(gh.r.tresc.querySelectorAll('.vilda-ko-seg')).toHaveLength(0);
    const wg = zbuduj({}, [{ patientId: 'pacjent-fikcyjny', clinicalDateISO: '2026-05-01', medication: { name: 'Wegovy', dose: '0,5 mg', action: 'start' } }]);
    expect(wg.karta).toBeNull();
    expect(wg.r.tresc.querySelectorAll('.vilda-gh-summary-grid')).toHaveLength(1);
  });

  it('showPatientCard przekazuje „tlo” (odświeżenie po synchronizacji tej samej Karty); Notatki przełączają kartę na „Wpisy”', () => {
    expect(AUTH).toContain('zakladka:at(Kl_IKONA,"Leczenie"),tlo:GdTlo})');
    expect(AUTH).toContain("karta.querySelector('.vilda-ko-seg [data-widok=\"wpisy\"]')");
  });
});

describe('P-KARTA-LECZENIE, etap 2 — sekcja „Wpisy leczenia” bez opcji układu: jak dotąd', () => {
  it('sekcja bez uklad: nagłówek z tytułem, wstępem i „+ Kontynuacja”, podpowiedź DocPro pod nagłówkiem; wyjscie nietknięte', () => {
    const w = okno();
    const D = w.VildaDziennikOtylosci;
    const stan = D.zloz([], O1);
    const wyjscie = {};
    const s = w.VildaDziennikOtylosciUI.sekcja({ patientId: 'pacjent-fikcyjny', stan, migawka: O1, wyjscie });
    expect(s.className).toBe('vdo');
    expect(s.getAttribute('aria-labelledby')).toBe('vdoTytul-pacjent-fikcyjny');
    expect(s.children.map((c) => c.className)).toEqual(['vdo-head', 'vdo-hint', 'vdo-msg', 'vdo-list', 'vdo-hint']);
    const glowa = s.children[0];
    expect(glowa.children[0].children.map((c) => c.className)).toEqual(['vdo-title', 'vdo-intro']);
    expect(glowa.children[1].className).toBe('vdo-head-actions');
    expect(tekst(glowa.querySelector('.vdo-add'))).toBe('+ Kontynuacja');
    expect(s.querySelectorAll('.vdo-jak')).toHaveLength(0);
    expect(wyjscie).toEqual({});
  });
});

// ── P-KARTA-LECZENIE, etap 2 — poprawki po przeglądzie (2026-11-21) ──────────────────────────────────────────────
// Nastolatka, Wegovy: ostatni wpis bez wzrostu (masa od pacjentki) — ocena wg ChPL z ostatniego wpisu ze wzrostem.
const O_OSTATNI_BEZ_WZROSTU = [OB('t-w', 'start', '2026-01-05', 17, 0, 95, 160, '0,25 mg'), OB('t-k1', 'continue', '2026-08-01', 17, 7, 88, 160, '2,4 mg'),
  OB('t-k2', 'continue', '2026-11-10', 17, 10, 85, null, '2,4 mg')];

describe('P-KARTA-LECZENIE, etap 2 — poprawki po przeglądzie', () => {
  it('„Szczegóły oceny” po wyborze cyklu 1 w „Analizie” → panel wraca do bieżącego cyklu (tego, który opisuje linia)', () => {
    const k = zbuduj({ obesityTherapyPoints: O_DWA_CYKLE });
    const c = k.karta;
    c.zakladki[2].click();
    const cykle = () => c.widok('analiza').querySelectorAll('.vilda-ob-seg button');
    expect(cykle().map((b) => [b.textContent, b.getAttribute('data-biezacy')])).toEqual([['Cykl 2 · Wegovy · bieżący', 'true'], ['Cykl 1 · Wegovy', 'false']]);
    cykle()[1].click();
    expect(tytulPola(k)).toMatch(/^Cykl zakończony/);
    c.zakladki[0].click();
    expect(tekst(c.el.querySelector('.vilda-ko-werdykt-t'))).toBe('Przed oknem oceny — oceń po 12 tyg.');
    c.el.querySelector('.vilda-ko-werdykt-link').click();
    expect(kartaOtylosci(k.r.tresc).wybrany).toBe('analiza');
    expect(tytulPola(k)).toBe('Przed oknem oceny — oceń po 12 tyg.');
    expect(cykle().map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    const pole = c.widok('analiza').querySelector('.vilda-oba-verdict');
    expect(pole.ownerDocument.activeElement).toBe(pole);
  });

  it('ostatni wpis bez wzrostu, ocena z BMI: kafelek BMI „—” z „brak wzrostu w ostatnim wpisie · ocena: −7,4% (z wpisu 01.08.2026) · próg ChPL ≥5%”', () => {
    const k = zbuduj({ obesityTherapyPoints: O_OSTATNI_BEZ_WZROSTU });
    expect(k.karta.kafelki[3]).toEqual({ k: 'BMI', v: '—', sub: 'brak wzrostu w ostatnim wpisie · ocena: −7,4% (z wpisu 01.08.2026) · próg ChPL ≥5%', kolor: null });
    // te same liczby co pasek leczenia i panel („Redukcja do oceny”, „Wzrost do oceny”)
    expect(k.paski[0].czesci).toContain('BMI −7,4%');
    expect(kafelPanelu(k, 'Redukcja do oceny').v).toBe('−7,4%');
    expect(kafelPanelu(k, 'Wzrost do oceny').sub).toBe('pomiar z 01.08.2026 · ostatni wpis bez wzrostu');
    expect(k.karta.kafelki[2]).toEqual(expect.objectContaining({ k: 'Masa', v: '85 kg' }));
  });

  it('ostatni wpis bez wzrostu i bez wzrostu w oknie (ocena wstrzymana): „brak wzrostu w ostatnim wpisie · próg ChPL ≥5%”, bez wartości oceny', () => {
    const k = zbuduj({ obesityTherapyPoints: O_BEZ_WZROSTU });
    expect(k.karta.kafelki[3]).toEqual({ k: 'BMI', v: '—', sub: 'brak wzrostu w ostatnim wpisie · próg ChPL ≥5%', kolor: null });
    expect(kafelPanelu(k, 'Redukcja do oceny').v).toBe('—');
  });

  it('ostatni wpis ze wzrostem albo ocena z masy — kafelek BMI bez zmian', () => {
    expect(zbuduj({ obesityTherapyPoints: O1 }).karta.kafelki[3].sub).toBe('−8,6% od włączenia · próg ChPL ≥5%');
    const dorosly = zbuduj({ obesityTherapyPoints: [...A_SAX, OB('s-k2', 'continue', '2026-06-09', 40, 6, 96, null, '3,0 mg', SAXENDA)] });
    expect(dorosly.karta.kafelki[3]).toEqual(expect.objectContaining({ k: 'BMI', v: '—', sub: null }));
    expect(dorosly.karta.kafelki[2].sub).toContain('próg ChPL ≥5%');
  });
});
