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
  doc.createTextNode = (t) => { const n = doc.createElement('#text'); n.textContent = t; return n; };
  doc.head = doc.documentElement;
  const w = { document: doc };
  loadBrowserScript('vilda_cykle_leczenia.js', w); // + obesity_response_criteria.js (zależność)
  loadBrowserScript('vilda_tempo_wzrastania.js', w);
  if (opcje.bezTrajektorii !== true) loadBrowserScript('vilda_trajectory_analysis.js', w); // ghKursy (P-GH-WZNOWIENIE)
  if (opcje.odcinki) loadBrowserScript('gh_therapy_segments.js', w); // % dawki zalecanej w trendzie i odcinki leków
  return w;
}

const bledy = [];
function karta(opcje) {
  return new Function('i', 'jt', 'Ot', 'oe', `${KOD}\nreturn { Kl_leczenie, Kl_zakladka, Kl_kolejnosc, Kl_daneOb, Kl_daneGh, wl, kl, Pl,
    Gw_pasy: typeof Gw_pasy == 'function' ? Gw_pasy : null };`)(
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
    r, paski, pole, kafel,
    tytul: tekst(r.tresc.querySelector('.vilda-oba-vt')),
    bloki: r.tresc.children.map((c) => c.className),
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

  it('punkty otyłości → zakładka z grupą Ob_dz: podsumowanie, „Wpisy leczenia” (.vdo), „Dane analityczne — otyłość”', () => {
    const k = zbuduj({ obesityTherapyPoints: O1 });
    expect(k.bloki).toEqual(['vilda-ob-dz']);
    const dz = k.r.tresc.children[0];
    expect(dz.children.map((c) => c.className)).toEqual(['vilda-gh-summary', 'vdo', '']);
    expect(tekst(dz.children[2].querySelector('.vilda-gha-btn'))).toContain('Dane analityczne — otyłość');
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
    expect(k.pole('Aktualna dawka')).toBe(p.czesci[0]);
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
    expect(k.pole('Aktualna dawka')).toBe('—');
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
    const dz = r.tresc.children[0];
    expect(dz.children.map((c) => c.className)).toEqual(['vilda-gh-summary', 'vdo']); // bez „Dane analityczne — otyłość”
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
