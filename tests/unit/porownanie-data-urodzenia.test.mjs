import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POROWNANIE-DATA (polecenie właściciela 2026-10-13): karta „Porównanie z poprzednim pomiarem” po wczytaniu pacjenta
// nie może wyprzedzić wpisu daty urodzenia. Kartę buduje odczyt z sejfu (vilda_summary_cards.js, Y), a datę z rekordu
// vilda_dob_age.js wpisuje do formularza w osobnym zadaniu. Karta zbudowana przed datą liczyła centyl wzrostu
// „Poprzednio” z pełnych miesięcy, po dacie — z wieku dokładnego (CI #659: 39. zamiast 38. centyla).
//
// Testy wołają prawdziwy kod:
//   1. vilda_dob_age.js na atrapie DOM — restorePending() od zdarzenia wczytania do wpisu daty, potem jedno
//      vilda:dob-restored (licznik przy kilku zdarzeniach, rekord bez daty, nieudane zaplanowanie);
//   2. Sd_poDacie wycięte ze źródła vilda_summary_cards.js — bez oczekiwania budowa od razu, w tym samym zadaniu;
//      przy oczekiwaniu po vilda:dob-restored albo po 1,5 s, zawsze raz; błąd budowy chowa kartę jak .catch(G);
//   3. strażnik źródła: Y buduje kartę przez Sd_poDacie.
// Wpis: docs/clinical/ALGORITHMS.md, P-POROWNANIE-DATA. Dane FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => readFileSync(path.join(korzen, plik), 'utf8');

function atrapa(id) {
  const el = { id, value: '', readOnly: false, hidden: false, textContent: '', dataset: {}, classList: { toggle() {} }, nasluchy: {} };
  el.addEventListener = (n, f) => { (el.nasluchy[n] = el.nasluchy[n] || []).push(f); };
  el.dispatchEvent = (ev) => { (el.nasluchy[ev.type] || []).forEach((f) => f(ev)); return true; };
  el.focus = () => {};
  return el;
}

function modulDaty({ setTimeoutRzuca = false } = {}) {
  const pola = {};
  ['dobInput', 'dobNote', 'dobError', 'dobClear', 'age', 'ageMonths', 'ageWeeks', 'ageWeeksRow', 'ageWeeksNote', 'ageWeeksError', 'restoreStateBtn']
    .forEach((id) => { pola[id] = atrapa(id); });
  pola.restoreStateBtn.style = { display: 'none' };
  const doc = new EventTarget();
  Object.assign(doc, { readyState: 'complete', getElementById: (id) => pola[id] || null });
  const timery = [];
  const ogloszenia = [];
  doc.addEventListener('vilda:dob-restored', (e) => ogloszenia.push(e.detail));
  const win = {
    document: doc,
    CustomEvent,
    hasUserModifiedAfterLoad: false,
    lastLoadedData: null,
    setTimeout: (f) => { if (setTimeoutRzuca) throw new Error('brak timera'); timery.push(f); return timery.length; },
  };
  loadBrowserScript('vilda_dob_age.js', win);
  return {
    win, pola, D: win.VildaDobAge, ogloszenia,
    zdarzenie: (typ) => doc.dispatchEvent(new CustomEvent(typ)),
    nastepnyTimer: () => timery.shift()(),
    timery,
  };
}

// Pierwszy dzień miesiąca nigdy nie pożycza miesiąca (por. data-urodzenia-sesja.test.mjs).
const DATA = () => {
  const d = new Date();
  const u = new Date(d.getFullYear() - 9, d.getMonth() - 1, 1);
  const z = (n) => String(n).padStart(2, '0');
  return { iso: `${u.getFullYear()}-${z(u.getMonth() + 1)}-${z(u.getDate())}`, pole: `${z(u.getDate())}-${z(u.getMonth() + 1)}-${u.getFullYear()}` };
};

describe('vilda_dob_age.js — przyjęcie daty z rekordu jest widoczne dla innych modułów', () => {
  it('od zdarzenia wczytania do wpisu daty restorePending() = true, potem jedno vilda:dob-restored z datą', () => {
    const m = modulDaty();
    const d = DATA();
    expect(m.D.VERSION).toBe('10');
    expect(m.D.restorePending()).toBe(false);
    m.win.lastLoadedData = { user: { dobISO: d.iso } };
    m.zdarzenie('vilda:patient-loaded');
    expect(m.D.restorePending(), 'przyjęcie zaplanowane, data jeszcze nie w polu').toBe(true);
    expect(m.pola.dobInput.value).toBe('');
    expect(m.ogloszenia).toEqual([]);
    m.nastepnyTimer();
    expect(m.pola.dobInput.value).toBe(d.pole);
    expect(m.D.restorePending()).toBe(false);
    expect(m.ogloszenia).toEqual([{ iso: d.iso }]);
  });

  it('dwa zdarzenia tuż po sobie (wczytanie i odtworzenie w powłoce): koniec ogłoszony raz, po drugim przyjęciu', () => {
    const m = modulDaty();
    m.win.lastLoadedData = { user: { dobISO: DATA().iso } };
    m.zdarzenie('vilda:patient-loaded');
    m.zdarzenie('vilda:persist-restored');
    expect(m.timery).toHaveLength(2);
    m.nastepnyTimer();
    expect(m.D.restorePending(), 'drugie przyjęcie wciąż w toku').toBe(true);
    expect(m.ogloszenia).toEqual([]);
    m.nastepnyTimer();
    expect(m.D.restorePending()).toBe(false);
    expect(m.ogloszenia).toHaveLength(1);
  });

  it('rekord bez daty urodzenia: przyjęcie też się kończy i jest ogłoszone (iso null)', () => {
    const m = modulDaty();
    m.win.lastLoadedData = { user: { age: 9, ageMonths: 1 } };
    m.zdarzenie('vilda:patient-loaded');
    expect(m.D.restorePending()).toBe(true);
    m.nastepnyTimer();
    expect(m.D.restorePending()).toBe(false);
    expect(m.ogloszenia).toEqual([{ iso: null }]);
  });

  it('nieudane zaplanowanie przyjęcia nie zostawia modułu w oczekiwaniu', () => {
    const m = modulDaty({ setTimeoutRzuca: true });
    m.win.lastLoadedData = { user: { dobISO: DATA().iso } };
    m.zdarzenie('vilda:patient-loaded');
    expect(m.D.restorePending()).toBe(false);
    expect(m.ogloszenia).toHaveLength(1);
  });
});

/* Sd_poDacie z prawdziwego źródła karty, na atrapie okna i dokumentu ze sterowanymi timerami. */
function poDacie({ czeka }) {
  const src = czytaj('vilda_summary_cards.js');
  const fn = src.match(/function Sd_poDacie\(f\)\{[\s\S]*?t=setTimeout\(dalej,1500\)\}/);
  expect(fn, 'Sd_poDacie w vilda_summary_cards.js').not.toBeNull();
  const doc = new EventTarget();
  const timery = [];
  const schowane = [];
  const a = { VildaDobAge: { restorePending: () => czeka } };
  const setTimeoutAtrapa = (f, ms) => { timery.push({ f, ms, aktywny: true }); return timery.length; };
  const clearTimeoutAtrapa = (id) => { if (timery[id - 1]) timery[id - 1].aktywny = false; };
  const G = () => schowane.push('G');
  const Sd = new Function('a', 'document', 'G', 'setTimeout', 'clearTimeout', `${fn[0]}\nreturn Sd_poDacie;`)(
    a, doc, G, setTimeoutAtrapa, clearTimeoutAtrapa);
  return {
    Sd, timery, schowane,
    oglos: () => doc.dispatchEvent(new CustomEvent('vilda:dob-restored', { detail: { iso: null } })),
    uplyw: () => timery.filter((t) => t.aktywny).forEach((t) => { t.aktywny = false; t.f(); }),
  };
}

describe('vilda_summary_cards.js — karta czeka na datę urodzenia (Sd_poDacie)', () => {
  it('bez przyjęcia daty w toku: budowa od razu, w tym samym zadaniu, bez timera', () => {
    const t = poDacie({ czeka: false });
    const budowy = [];
    t.Sd(() => budowy.push('karta'));
    expect(budowy).toEqual(['karta']);
    expect(t.timery).toHaveLength(0);
  });

  it('przyjęcie daty w toku: budowa dopiero po vilda:dob-restored, raz; bezpiecznik 1,5 s potem nic nie robi', () => {
    const t = poDacie({ czeka: true });
    const budowy = [];
    t.Sd(() => budowy.push('karta'));
    expect(budowy, 'karta czeka na datę').toEqual([]);
    expect(t.timery.map((x) => x.ms)).toEqual([1500]);
    t.oglos();
    expect(budowy).toEqual(['karta']);
    t.oglos();
    t.uplyw();
    expect(budowy, 'kolejne zdarzenie i bezpiecznik nie budują drugi raz').toEqual(['karta']);
  });

  it('data nie przychodzi: budowa po 1,5 s, raz — karta nie zostaje bez treści', () => {
    const t = poDacie({ czeka: true });
    const budowy = [];
    t.Sd(() => budowy.push('karta'));
    t.uplyw();
    expect(budowy).toEqual(['karta']);
    t.oglos();
    expect(budowy).toEqual(['karta']);
  });

  it('błąd budowy po oczekiwaniu chowa kartę (G), jak .catch odczytu z sejfu', () => {
    const t = poDacie({ czeka: true });
    t.Sd(() => { throw new Error('błąd budowy'); });
    t.oglos();
    expect(t.schowane).toEqual(['G']);
  });

  it('strażnik źródła: Y buduje kartę po odczycie z sejfu przez Sd_poDacie, z kontrolą epoki i .catch jak dotąd', () => {
    const src = czytaj('vilda_summary_cards.js');
    expect(src).toContain('m.getPatient(n).then(function(l){Sd_poDacie(function(){if(Gp_ep()!==Gp_e0)return;');
    expect(src).toContain('try{typeof a.updatePrevSummaryDiff=="function"&&a.updatePrevSummaryDiff()}catch{}summaryComparisonFinish(comparisonRequest,"ready");');
    expect(src).toContain('.catch(function(){if(!summaryComparisonCurrent(comparisonRequest))return;G();summaryComparisonFinish(comparisonRequest,"error");})}');
    expect(src).toContain('czeka=!!(V&&typeof V.restorePending=="function"&&V.restorePending())');
    expect(src).toContain('document.addEventListener("vilda:dob-restored",dalej)');
  });
});
