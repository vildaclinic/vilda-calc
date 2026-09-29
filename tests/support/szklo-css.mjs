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
import { canonicalSelector, canonicalSelectorList, specificity, splitTopLevel } from '../../design-system/lib/css.mjs';
import { mozliweTypy, proste, tokeny, zlozenieSkrajne } from './wiedza-dom.mjs';
import { longhandy } from './longhandy.mjs';

/** Czy własność `skrot` obejmuje wszystkie longhandy własności `prop` (ta sama własność też). */
function obejmuje(skrot, prop) {
  if (skrot === prop) return true;
  const s = new Set(longhandy(skrot));
  const l = longhandy(prop);
  return l.length > 0 && l.every((x) => s.has(x)) && (s.size > l.length || skrot !== prop);
}

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

/** Złożenia selektora (tylko kombinatory potomka; null przy `>`, `+`, `~`). */
function zlozenia(czesc) {
  const t = tokeny(canonicalSelector(czesc));
  return t.some((x) => x === '>' || x === '+' || x === '~') ? null : t;
}

/**
 * Czy część nadpisania P (bez skórki) POKRYWA część bazową B: każdy element pasujący do B pasuje też do P.
 * Tak jest przy równości kanonicznej, a także gdy P i B mają tylko kombinatory potomka, P ma jedno złożenie
 * (porównywane ze skrajnym złożeniem B — przodkowie w B tylko zawężają) albo tyle samo złożeń co B, i każde złożenie
 * B zawiera wszystkie proste selektory odpowiadającego złożenia P. Typ elementu w P może też wynikać z wiedzy o DOM:
 * klasy i id złożenia B występują wyłącznie na elementach tego typu (P-STYLE rata 4b).
 */
export function pokrywaCzesc(P, B, wiedza = null) {
  if (P === B) return true;
  const zp = zlozenia(P);
  const zb = zlozenia(B);
  if (!zp || !zb || (zp.length !== 1 && zp.length !== zb.length)) return false;
  const pary = zp.length === 1 ? [[zp[0], zb[zb.length - 1]]] : zp.map((z, i) => [z, zb[i]]);
  // pseudoelement to inny „element”: reguła bez ::after nie dotyczy ::after (i odwrotnie)
  if ((zlozenieSkrajne(P).pseudoelement || null) !== (zlozenieSkrajne(B).pseudoelement || null)) return false;
  return pary.every(([p, b]) => {
    const wB = new Set(proste(b));
    return proste(p).every((simple) => {
      if (simple === '*' || wB.has(simple)) return true;
      if (!/^[a-zA-Z]/.test(simple) || !wiedza) return false;
      const typy = mozliweTypy(zlozenieSkrajne(b), wiedza);
      return Boolean(typy && typy.size) && [...typy].every((t) => t === simple.toLowerCase());
    });
  });
}

/**
 * Nadpisania skórki w regułach: [{ regula, czesci: [{ bez, spec }], wazne (Set własności z !important),
 * niewazne (Set własności bez !important), kontekst }]; `bez` — część bez skórki w postaci kanonicznej, `spec` —
 * swoistość części ze skórką.
 */
function nadpisaniaSkorki(reguly) {
  return reguly
    .map((r) => {
      const czesci = splitTopLevel(r.prelude, ',').map((p) => p.trim()).filter(Boolean);
      if (!czesci.length || !czesci.every((p) => p.includes(`.${KLASA_SKORKI}`))) return null;
      const bez = czesci.map(bezSkorki);
      if (bez.some((b) => b == null)) return null;
      const wazne = r.deklaracje.filter((d) => d.important);
      const niewazne = r.deklaracje.filter((d) => !d.important);
      if (!wazne.length && !niewazne.length) return null;
      return {
        regula: r,
        czesci: czesci.map((p, i) => ({ bez: canonicalSelector(bez[i]), spec: specificity(p) })),
        wazne: new Set(wazne.map((d) => d.prop)),
        niewazne: new Set(niewazne.map((d) => d.prop)),
        kontekst: r.kontekst.join('|'),
      };
    })
    .filter(Boolean);
}

/**
 * Martwe deklaracje reguł `reguly` (z arkusza `arkusz`; także reguł skórki — pod INNYMI regułami skórki) pod
 * nadpisaniami `nadpisania` (każde z polem `arkusz`). Deklaracja własności P jest martwa, gdy każdą część jej selektora pokrywa (pokrywaCzesc) część
 * jakiegoś nadpisania w tym samym kontekście @-reguł (albo bez kontekstu — obowiązuje zawsze), które deklaruje P i zawsze wygrywa: ważne z nieważną bazą;
 * przy tej samej ważności — wyższa swoistość części, a przy równej swoistości — późniejsza pozycja w TYM SAMYM
 * arkuszu (kolejność między arkuszami zależy od strony, więc nie liczy się). Wynik ma też pole `martweCzesci`:
 * części selektora, dla których KAŻDA deklaracja reguły ma zwycięzcę (część do usunięcia z listy selektorów).
 */
function martwePod(reguly, nadpisania, arkusz = null, wiedza = null) {
  const martwe = [];
  const martweCzesci = [];
  const podzbiory = (wiedza && wiedza.podzbiory) || new Map();
  // część z klasą-podzbiorem (np. `._glass` ⊆ header, .card, …) to tyle części, ile selektorów listy: każdą trzeba pokryć
  const rozwin = (czesc) => {
    const skrajne = zlozenieSkrajne(czesc);
    const klasa = skrajne.klasy.find((k) => podzbiory.has(k));
    if (!klasa) return [czesc];
    const t = tokeny(canonicalSelector(czesc));
    const przedrostek = t.slice(0, -1).join(' ');
    return podzbiory.get(klasa).map((sel) => {
      const ts = tokeny(canonicalSelector(sel));
      const ostatni = ts[ts.length - 1];
      const zlozenie = canonicalSelector(`${t[t.length - 1]}${ostatni.startsWith('.') || ostatni.startsWith('#') || ostatni.startsWith('[') || ostatni.startsWith(':') ? ostatni : ostatni.replace(/^([a-zA-Z*][\w-]*)(.*)$/, (m, typ, reszta) => (skrajne.typ ? reszta : `${typ}${reszta}`))}`);
      const zTypem = !skrajne.typ && /^[a-zA-Z*]/.test(ostatni) ? canonicalSelector(`${ostatni.replace(/^([a-zA-Z*][\w-]*).*$/, '$1')}${t[t.length - 1]}`) : zlozenie;
      return [ts.slice(0, -1).join(' '), przedrostek, zTypem].filter(Boolean).join(' ');
    });
  };
  for (const r of reguly) {
    if (!r.deklaracje.length) continue;
    // część bazowa: kanon bez skórki (do pokrycia), swoistość PEŁNEJ części (reguła skórki jako baza ma klasę skórki w swoistości)
    const czesciBazy = splitTopLevel(r.prelude, ',').map((p, i) => ({ nr: i, pelna: p.trim(), bez: bezSkorki(p) })).filter((p) => p.bez && p.bez.trim()).map((p) => ({ nr: p.nr, kanon: canonicalSelector(p.bez), spec: specificity(p.pelna), rozwiniete: rozwin(p.bez) }));
    if (!czesciBazy.length || czesciBazy.length !== splitTopLevel(r.prelude, ',').length) continue;
    const kontekst = r.kontekst.join('|');
    // nadpisanie w tym samym kontekście @-reguł albo poza wszelkim kontekstem (obowiązuje zawsze, więc i wtedy, gdy baza)
    const wKontekscie = nadpisania.filter((o) => o.regula !== r && (o.kontekst === kontekst || o.kontekst === ''));
    if (!wKontekscie.length) continue;
    // dla każdej części bazowej (i każdego jej rozwinięcia): nadpisania z częścią pokrywającą, z jej swoistością
    const pokrycia = czesciBazy.map((b) => b.rozwiniete.map((kanon) => wKontekscie.flatMap((o) => o.czesci.filter((c) => pokrywaCzesc(c.bez, kanon, wiedza)).map((c) => ({ o, spec: c.spec })))));
    // nadpisanie deklaruje własność P bazy, gdy ma P albo skrót obejmujący wszystkie longhandy P (np. `background`
    // zasłania `background-color`; `border-color` nie zasłania `border`)
    const wygrywa = (d, o, spec, b) => {
      const wazne = o.wazne.has(d.prop) || [...o.wazne].some((p) => obejmuje(p, d.prop));
      const niewazne = o.niewazne.has(d.prop) || [...o.niewazne].some((p) => obejmuje(p, d.prop));
      const ma = d.important ? wazne : (wazne || niewazne);
      if (!ma) return false;
      if (wazne && !d.important) return true;
      if (spec > b.spec) return true;
      return spec === b.spec && o.arkusz === arkusz && o.regula.start > r.start;
    };
    // zwycięzca dla (deklaracja, część): nadpisanie wygrywające na każdym rozwinięciu części
    const zwyciezca = (d, i) => { const w = pokrycia[i].map((lista) => lista.find((p) => wygrywa(d, p.o, p.spec, czesciBazy[i]))); return w.every(Boolean) ? w[0].o : null; };
    const tabela = r.deklaracje.map((d) => czesciBazy.map((b, i) => zwyciezca(d, i)));
    for (let k = 0; k < r.deklaracje.length; k++) {
      if (tabela[k].every(Boolean)) martwe.push({ regula: r, deklaracja: r.deklaracje[k], nadpisanie: tabela[k][0].regula });
    }
    // część martwa: każda deklaracja reguły ma zwycięzcę dla tej części (a nie każda dla wszystkich części)
    const martweDekl = new Set(r.deklaracje.filter((d, k) => tabela[k].every(Boolean)));
    if (martweDekl.size < r.deklaracje.length) {
      for (let i = 0; i < czesciBazy.length; i++) {
        if (r.deklaracje.every((d, k) => tabela[k][i])) martweCzesci.push({ regula: r, nr: i, nadpisanie: tabela[0][i].regula });
      }
    }
  }
  return { martwe, martweCzesci };
}

/**
 * Analiza jednego arkusza (nadpisania tylko z tego samego arkusza): zwraca listę martwych deklaracji bazowych
 * [{ regula, deklaracja, nadpisanie }]. Reguła nadpisująca musi zawierać klasę skórki w każdej części selektora,
 * deklarować własność z !important i stać w tym samym kontekście @-reguł co reguła bazowa.
 */
export function martweDeklaracje(css, wiedza = null, arkusz = 'arkusz') {
  const reguly = parsuj(css);
  const { martwe, martweCzesci } = martwePod(reguly, nadpisaniaSkorki(reguly).map((o) => ({ ...o, arkusz })), arkusz, wiedza);
  return { reguly, martwe, martweCzesci };
}

/**
 * Analiza kaskady strony: arkusze = [{ nazwa, css, globalny }]. Nadpisanie z arkusza B zasłania deklarację bazową
 * z arkusza A tylko wtedy, gdy B jest na każdej stronie, na której jest A — czyli gdy B === A albo B jest globalny
 * (ładowany na każdej stronie aplikacji). Kolejność ładowania nie ma znaczenia: ważne wygrywa z nieważnym, a przy
 * dwóch ważnych nadpisanie ma wyższą swoistość. Zwraca Map nazwa → martwe (jak martweDeklaracje).
 */
export function martweWKaskadzie(arkusze, wiedza = null) {
  const sparsowane = arkusze.map((a) => ({ ...a, reguly: parsuj(a.css), nadpisania: null }));
  for (const a of sparsowane) a.nadpisania = nadpisaniaSkorki(a.reguly).map((o) => ({ ...o, arkusz: a.nazwa }));
  const wynik = new Map();
  for (const a of sparsowane) {
    const dostepne = sparsowane.filter((b) => b.nazwa === a.nazwa || b.globalny).flatMap((b) => b.nadpisania);
    const { martwe, martweCzesci } = martwePod(a.reguly, dostepne, a.nazwa, wiedza);
    wynik.set(a.nazwa, { reguly: a.reguly, martwe, martweCzesci });
  }
  return wynik;
}

/**
 * Usuwa martwe deklaracje (domyślnie z analizy jednego arkusza; `martweGotowe` i `martweCzesci` — np. z martweWKaskadzie);
 * reguła, która zostaje bez deklaracji, znika w całości (z otaczającym pustym wierszem), martwa część selektora znika
 * z listy, pusty blok @media/@supports znika. Zwraca { text, usuniete, reguly, usunieteReguly, czesci }.
 */
export function usunMartwe(css, martweGotowe = null, martweCzesci = null) {
  const analiza = martweGotowe ? null : martweDeklaracje(css);
  const martwe = martweGotowe || analiza.martwe;
  const czesci = martweCzesci || (analiza ? analiza.martweCzesci : []);
  const usunieteReguly = [];
  if (!martwe.length && !czesci.length) return { text: css, usuniete: 0, reguly: 0, usunieteReguly, czesci: 0 };
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
  // martwe części selektora: część znika z listy razem z przecinkiem i swoim wierszem (sformatowany arkusz: część w wierszu)
  const wgRegulyCzesci = new Map();
  for (const c of czesci) { if (wgReguly.has(c.regula) && wgReguly.get(c.regula).length === c.regula.deklaracje.length) continue; if (!wgRegulyCzesci.has(c.regula)) wgRegulyCzesci.set(c.regula, new Set()); wgRegulyCzesci.get(c.regula).add(c.nr); }
  let usunieteCzesci = 0;
  for (const [regula, numery] of wgRegulyCzesci) {
    const klamra = css.indexOf('{', regula.start);
    const surowe = css.slice(regula.start, klamra);
    const czesciTekst = splitTopLevel(surowe, ',');
    if (numery.size >= czesciTekst.length) continue;
    const zostaja = czesciTekst.filter((_, i) => !numery.has(i)).map((t) => t.trim());
    const wciecie = /^\s*/.exec(css.slice(css.lastIndexOf('\n', regula.start - 1) + 1, regula.start))[0];
    const ogon = /\s*$/.exec(surowe)[0];
    doUsuniecia.push([regula.start, klamra, `${zostaja.join(`,\n${wciecie}`)}${ogon}`]);
    usunieteCzesci += numery.size;
  }
  doUsuniecia.sort((a, b) => a[0] - b[0]);
  let text = '';
  let poz = 0;
  for (const [s, e, zamiast] of doUsuniecia) { text += css.slice(poz, s) + (zamiast || ''); poz = e; }
  text += css.slice(poz);
  // blok @media/@supports, który został pusty, znika w całości
  for (let i = 0; i < 3; i++) text = text.replace(/^[ \t]*@(?:media|supports)[^{}]*\{\s*\}\n?(\n)?/gm, '');
  return { text, usuniete: martwe.length, reguly, usunieteReguly, czesci: usunieteCzesci };
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
export function martwePodArkuszami(css, arkuszeNadpisujace, wiedza = null) {
  const nadpisania = arkuszeNadpisujace.flatMap((a) => nadpisaniaSkorki(parsuj(a.css)).map((o) => ({ ...o, arkusz: a.nazwa })));
  return martwePod(parsuj(css), nadpisania, null, wiedza).martwe;
}
