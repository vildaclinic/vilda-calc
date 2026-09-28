// P-STYLE rata 4a (decyzja właściciela 2026-09-28: wygląd bez skórki szkła jest martwy). Skórka .liquid-ios26 jest
// zawsze włączona (ios26-ui.js dodaje klasę na body), a jej reguły nadpisują reguły bazowe z !important. Deklaracja
// bazowa własności P jest MARTWA, gdy istnieje reguła nadpisująca, która (1) po zdjęciu prefiksu skórki dopasowuje
// co najmniej te same elementy (jej lista selektorów bez `.liquid-ios26` zawiera każdą część selektora bazowego),
// (2) stoi w tym samym kontekście @media/@supports i (3) deklaruje P z !important: dla każdego elementu, do którego
// pasuje reguła bazowa, pasuje też nadpisanie, a nadpisanie zawsze wygrywa (ważne przeciw nieważnemu; przy dwóch
// ważnych — wyższa swoistość o klasę skórki). Usunięcie martwej deklaracji nie zmienia żadnego zwycięzcy kaskady.
// Ten moduł: własny parser z pozycjami (prelude, kontekst @-reguł, deklaracje), analiza i usuwanie; korzysta z niego
// skrypt tests/scripts/usun-martwe-css.mjs i strażnik tests/unit/css-szklo.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSelectorList } from '../../design-system/lib/css.mjs';

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const KLASA_SKORKI = 'liquid-ios26';

/** Arkusze objęte analizą: wszystkie w korzeniu repozytorium. */
export function arkuszeAplikacji() {
  return fs.readdirSync(korzen).filter((f) => f.endsWith('.css')).sort();
}

/**
 * Parser z pozycjami. Zwraca listę reguł stylu: { prelude, kontekst: [prelude @-reguł], deklaracje: [{prop, value,
 * important, start, end}], start, end } gdzie start/end obejmują prelude i cały blok (bez otaczających białych znaków),
 * a deklaracje start/end obejmują tekst deklaracji ze średnikiem (jeśli jest). Komentarze i łańcuchy są nietykane.
 */
export function parsuj(css) {
  const reguly = [];
  const stos = []; // otwarte bloki: { prelude, start, jestStyl, deklaracje }
  let i = 0;
  const n = css.length;
  let poczatek = 0; // początek bieżącego segmentu (prelude lub deklaracji)
  let nawiasy = 0;
  const czysty = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
  const dodajDeklaracje = (koniec, zeSrednikiem) => {
    const blok = stos[stos.length - 1];
    if (!blok || !blok.jestStyl) return;
    const segment = css.slice(poczatek, koniec);
    const mm = /^\s*([A-Za-z-][A-Za-z0-9-]*)\s*:\s*([\s\S]*?)(\s*!important)?\s*$/.exec(czysty(segment));
    if (!mm || !mm[2].trim()) return;
    // start = pierwszy znak deklaracji (po białych znakach i komentarzach otwierających segment)
    const start = poczatek + (segment.length - segment.replace(/^(\s|\/\*[\s\S]*?\*\/)+/, '').length);
    blok.deklaracje.push({ prop: mm[1].toLowerCase(), value: mm[2].trim(), important: Boolean(mm[3]), start, end: zeSrednikiem ? koniec + 1 : koniec });
  };
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const k = css.indexOf('*/', i + 2); i = k < 0 ? n : k + 2; continue; }
    if (c === '"' || c === "'") { let k = i + 1; while (k < n && css[k] !== c) { if (css[k] === '\\') k++; k++; } i = k + 1; continue; }
    if (c === '(') { nawiasy++; i++; continue; }
    if (c === ')') { nawiasy = Math.max(0, nawiasy - 1); i++; continue; }
    if (nawiasy > 0) { i++; continue; }
    if (c === '{') {
      const segment = css.slice(poczatek, i);
      const prelude = czysty(segment).replace(/\s+/g, ' ').trim();
      const start = poczatek + (segment.length - segment.replace(/^\s+/, '').length);
      const jestStyl = Boolean(prelude) && !prelude.startsWith('@') && !stos.some((b) => /^@keyframes|^@font-face|^@page/.test(b.prelude));
      stos.push({ prelude, start, jestStyl, deklaracje: [] });
      poczatek = i + 1; i++; continue;
    }
    if (c === ';') { dodajDeklaracje(i, true); poczatek = i + 1; i++; continue; }
    if (c === '}') {
      dodajDeklaracje(i, false);
      const blok = stos.pop();
      if (blok && blok.jestStyl) {
        reguly.push({ prelude: blok.prelude, kontekst: stos.map((b) => b.prelude), deklaracje: blok.deklaracje, start: blok.start, end: i + 1 });
      }
      poczatek = i + 1; i++; continue;
    }
    i++;
  }
  return reguly;
}

/**
 * Selektor bez prefiksu skórki: z pierwszego złożenia znika `.liquid-ios26`; złożenie, które po tym zostaje puste
 * albo jest gołym `body`, znika razem z kombinatorem potomka (każdy element strony jest w body). Zwraca null, gdy klasa
 * skórki występuje gdzie indziej niż w pierwszym złożeniu (nie jest to zwykłe nadpisanie skórki).
 */
export function bezSkorki(czesc) {
  const s = czesc.trim();
  if (!s.includes(`.${KLASA_SKORKI}`)) return s.replace(/^body\s+(?=[.#[a-zA-Z*:])/, '');
  const m = /^([^\s>+~]+)(.*)$/s.exec(s);
  if (!m) return null;
  const pierwsze = m[1];
  const reszta = m[2];
  if (reszta.includes(`.${KLASA_SKORKI}`)) return null;
  if (!pierwsze.includes(`.${KLASA_SKORKI}`)) return null;
  const zdjete = pierwsze.split(`.${KLASA_SKORKI}`).join('');
  if (zdjete === '' || zdjete === 'body') {
    // musi zostać co najmniej jedno złożenie za kombinatorem potomka (nie `>`/`+`/`~`, bo `body > .x` ≠ `.x`)
    const r = /^\s+(?![>+~])(.+)$/s.exec(reszta);
    return r ? r[1].trim() : null;
  }
  return `${zdjete}${reszta}`;
}

/** Czy lista selektorów nadpisania (bez skórki) zawiera każdą część selektora bazowego. */
function pokrywa(czesciNadpisania, czesciBazy) {
  const zbior = new Set(czesciNadpisania);
  return czesciBazy.every((c) => zbior.has(c));
}

/** Nadpisania skórki w regułach: [{ regula, czesci (Set kanoniczny bez skórki), wazne (Set własności), kontekst }]. */
function nadpisaniaSkorki(reguly) {
  return reguly
    .map((r) => {
      const czesci = r.prelude.split(',').map((p) => p.trim()).filter(Boolean);
      if (!czesci.every((p) => p.includes(`.${KLASA_SKORKI}`))) return null;
      const bez = czesci.map(bezSkorki);
      if (bez.some((b) => b == null)) return null;
      const wazne = r.deklaracje.filter((d) => d.important);
      if (!wazne.length) return null;
      return { regula: r, czesci: new Set(canonicalSelectorList(bez.join(', '))), wazne: new Set(wazne.map((d) => d.prop)), kontekst: r.kontekst.join('|') };
    })
    .filter(Boolean);
}

/** Martwe deklaracje reguł bazowych `reguly` pod nadpisaniami `nadpisania` (dowolnego pochodzenia). */
function martwePod(reguly, nadpisania) {
  const martwe = [];
  for (const r of reguly) {
    if (r.prelude.includes(`.${KLASA_SKORKI}`)) continue;
    if (!r.deklaracje.length) continue;
    const czesciBazy = canonicalSelectorList(r.prelude.split(',').map((p) => bezSkorki(p)).join(', '));
    if (!czesciBazy.length) continue;
    const kontekst = r.kontekst.join('|');
    const pasujace = nadpisania.filter((o) => o.kontekst === kontekst && pokrywa(o.czesci, czesciBazy));
    if (!pasujace.length) continue;
    for (const d of r.deklaracje) {
      const o = pasujace.find((x) => x.wazne.has(d.prop));
      if (o) martwe.push({ regula: r, deklaracja: d, nadpisanie: o.regula });
    }
  }
  return martwe;
}

/**
 * Analiza jednego arkusza (nadpisania tylko z tego samego arkusza): zwraca listę martwych deklaracji bazowych
 * [{ regula, deklaracja, nadpisanie }]. Reguła nadpisująca musi zawierać klasę skórki w każdej części selektora,
 * deklarować własność z !important i stać w tym samym kontekście @-reguł co reguła bazowa.
 */
export function martweDeklaracje(css) {
  const reguly = parsuj(css);
  return { reguly, martwe: martwePod(reguly, nadpisaniaSkorki(reguly)) };
}

/**
 * Analiza kaskady strony: arkusze = [{ nazwa, css, globalny }]. Nadpisanie z arkusza B zasłania deklarację bazową
 * z arkusza A tylko wtedy, gdy B jest na każdej stronie, na której jest A — czyli gdy B === A albo B jest globalny
 * (ładowany na każdej stronie aplikacji). Kolejność ładowania nie ma znaczenia: ważne wygrywa z nieważnym, a przy
 * dwóch ważnych nadpisanie ma wyższą swoistość. Zwraca Map nazwa → martwe (jak martweDeklaracje).
 */
export function martweWKaskadzie(arkusze) {
  const sparsowane = arkusze.map((a) => ({ ...a, reguly: parsuj(a.css), nadpisania: null }));
  for (const a of sparsowane) a.nadpisania = nadpisaniaSkorki(a.reguly).map((o) => ({ ...o, arkusz: a.nazwa }));
  const wynik = new Map();
  for (const a of sparsowane) {
    const dostepne = sparsowane.filter((b) => b.nazwa === a.nazwa || b.globalny).flatMap((b) => b.nadpisania);
    wynik.set(a.nazwa, { reguly: a.reguly, martwe: martwePod(a.reguly, dostepne) });
  }
  return wynik;
}

/**
 * Usuwa martwe deklaracje (domyślnie z analizy jednego arkusza; `martweGotowe` — np. z martweWKaskadzie); reguła, która
 * zostaje bez deklaracji, znika w całości (z otaczającym pustym wierszem). Zwraca { text, usuniete, reguly, usunieteReguly }.
 */
export function usunMartwe(css, martweGotowe = null) {
  const martwe = martweGotowe || martweDeklaracje(css).martwe;
  const usunieteReguly = [];
  if (!martwe.length) return { text: css, usuniete: 0, reguly: 0, usunieteReguly };
  const doUsuniecia = []; // [start, end]
  let reguly = 0;
  const wgReguly = new Map();
  for (const m of martwe) { if (!wgReguly.has(m.regula)) wgReguly.set(m.regula, []); wgReguly.get(m.regula).push(m.deklaracja); }
  for (const [regula, deklaracje] of wgReguly) {
    if (deklaracje.length === regula.deklaracje.length) {
      // cała reguła: od początku prelude do klamry zamykającej, plus jeden pusty wiersz po niej
      let end = regula.end;
      const dalej = /^\n\n/.exec(css.slice(end, end + 2));
      if (dalej) end += 1;
      let start = regula.start;
      // wcięcie w linii prelude (reguła w @media) — usuwamy od początku linii
      const liniaStart = css.lastIndexOf('\n', start - 1) + 1;
      if (!css.slice(liniaStart, start).trim()) start = liniaStart;
      doUsuniecia.push([start, end + (css[end] === '\n' ? 1 : 0)]);
      reguly++;
      usunieteReguly.push({ prelude: regula.prelude, kontekst: regula.kontekst });
      continue;
    }
    const usuwane = new Set(deklaracje);
    for (const d of deklaracje) {
      // deklaracja z jej wierszem (formatowany arkusz: jedna deklaracja w wierszu)
      const liniaStart = css.lastIndexOf('\n', d.start - 1) + 1;
      const start = css.slice(liniaStart, d.start).trim() ? d.start : liniaStart;
      let end = d.end;
      if (start === liniaStart && css[end] === '\n') end += 1;
      doUsuniecia.push([start, end]);
    }
    // gdy znika ostatnia deklaracja reguły, poprzednia zachowana traci średnik — jak w sformatowanym arkuszu (ostatnia bez średnika)
    const ostatnia = regula.deklaracje[regula.deklaracje.length - 1];
    if (usuwane.has(ostatnia)) {
      const zachowane = regula.deklaracje.filter((d) => !usuwane.has(d));
      const nowaOstatnia = zachowane[zachowane.length - 1];
      if (nowaOstatnia && css[nowaOstatnia.end - 1] === ';') doUsuniecia.push([nowaOstatnia.end - 1, nowaOstatnia.end]);
    }
  }
  doUsuniecia.sort((a, b) => a[0] - b[0]);
  let text = '';
  let poz = 0;
  for (const [s, e] of doUsuniecia) { text += css.slice(poz, s); poz = e; }
  text += css.slice(poz);
  return { text, usuniete: martwe.length, reguly, usunieteReguly };
}

/**
 * Arkusze aplikacji z informacją, które są globalne: arkusz jest globalny, gdy każda strona HTML w korzeniu, która ładuje
 * jakikolwiek arkusz przez <link rel="stylesheet">, ładuje także jego (adres bez ?v=). Zwraca [{ nazwa, css, globalny, strony }].
 */
export function arkuszeZeStronami(czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8')) {
  const strony = fs.readdirSync(korzen).filter((f) => f.endsWith('.html')).sort();
  const naStronie = new Map(); // arkusz → Set stron
  let stronZArkuszami = 0;
  for (const strona of strony) {
    const html = czytaj(strona);
    const linki = [...html.matchAll(/<link\b[^>]*\bhref=["']([a-z0-9_-]+\.css)(?:\?[^"']*)?["'][^>]*>/gi)].map((m) => m[1]);
    if (!linki.length) continue;
    stronZArkuszami++;
    for (const l of new Set(linki)) { if (!naStronie.has(l)) naStronie.set(l, new Set()); naStronie.get(l).add(strona); }
  }
  return arkuszeAplikacji().map((nazwa) => {
    const s = naStronie.get(nazwa) || new Set();
    return { nazwa, css: czytaj(nazwa), globalny: stronZArkuszami > 0 && s.size === stronZArkuszami, strony: [...s] };
  });
}

/**
 * Martwe deklaracje w tekście `css` (np. partialu design systemu, który składa reguły z wielu arkuszy) pod nadpisaniami
 * skórki z podanych arkuszy źródłowych — używane z arkuszami globalnymi, bo pochodzenie reguł partialu nie jest znane.
 */
export function martwePodArkuszami(css, arkuszeNadpisujace) {
  const nadpisania = arkuszeNadpisujace.flatMap((a) => nadpisaniaSkorki(parsuj(a.css)));
  return martwePod(parsuj(css), nadpisania);
}
