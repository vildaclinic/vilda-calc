// P-STYLE rata 4b: wiedza o DOM na potrzeby analiz kaskady — skrajne złożenie selektora, dowodliwa rozłączność dwóch
// selektorów i statyczna mapa „na jakich typach elementów występuje klasa albo id” (HTML, szablony HTML w JS, fabryki
// elementów w JS). Korzystają z niej tests/support/szklo-css.mjs (martwe deklaracje pod pokrywającym nadpisaniem)
// i tests/support/skorka-css.mjs (złożenie nadpisań skórki).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSelector, splitTopLevel } from '../../design-system/lib/css.mjs';

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FAKTY = path.join(korzen, 'tests/fixtures/skorka-fakty.json');

/** Fakty o DOM z fixture (tests/fixtures/skorka-fakty.json) albo null, gdy pliku nie ma. */
export function faktyDom() {
  return fs.existsSync(FAKTY) ? JSON.parse(fs.readFileSync(FAKTY, 'utf8')) : null;
}

/** Złożenia i kombinatory selektora (białe znaki poza nawiasami). */
export function tokeny(selektor) {
  const out = [];
  let cur = '';
  let glebokosc = 0;
  for (const c of selektor) {
    if (c === '(' || c === '[') glebokosc++;
    if (c === ')' || c === ']') glebokosc = Math.max(0, glebokosc - 1);
    if (glebokosc === 0 && /\s/.test(c)) { if (cur) out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/** Proste selektory złożenia: element, #id, .klasa, [atrybut], :pseudo(...), ::pseudo. */
export function proste(zlozenie) {
  const out = [];
  let cur = '';
  let glebokosc = 0;
  for (const c of zlozenie) {
    if (glebokosc === 0 && (c === '.' || c === '#' || c === '[' || c === ':') && cur && !cur.endsWith(':')) { out.push(cur); cur = c; if (c === '[') glebokosc++; continue; }
    if (c === '(' || c === '[') glebokosc++;
    if (c === ')' || c === ']') glebokosc--;
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

const PSEUDOELEMENTY_STARE = new Set(['before', 'after', 'first-line', 'first-letter', 'placeholder', 'selection', 'marker', 'backdrop']);

/**
 * Skrajne (ostatnie) złożenie selektora: { typ, id, klasy, pseudoelement, atrybuty: Map(nazwa → wartość dokładna | null),
 * proste: Set prostych selektorów, przedrostek: reszta selektora przed skrajnym złożeniem (postać kanoniczna) }.
 * Tylko to, co pozwala dowieść rozłączności dwóch selektorów; pseudoklasy nie dowodzą niczego.
 */
export function zlozenieSkrajne(czesc) {
  const kanon = canonicalSelector(czesc);
  const t = tokeny(kanon);
  const wynik = { typ: null, id: null, klasy: [], pseudoelement: null, atrybuty: new Map(), proste: new Set(), przedrostek: t.slice(0, -1).join(' ') };
  const ostatnie = t[t.length - 1];
  if (!ostatnie || ostatnie === '>' || ostatnie === '+' || ostatnie === '~') return wynik;
  for (const s of proste(ostatnie)) {
    wynik.proste.add(s);
    if (s.startsWith('::')) wynik.pseudoelement = s.slice(2).toLowerCase();
    else if (s.startsWith(':')) { const m = /^:([a-zA-Z-]+)$/.exec(s); if (m && PSEUDOELEMENTY_STARE.has(m[1].toLowerCase())) wynik.pseudoelement = m[1].toLowerCase(); }
    else if (s.startsWith('#')) wynik.id = s.slice(1);
    else if (s.startsWith('.')) wynik.klasy.push(s.slice(1));
    else if (s.startsWith('[')) {
      const m = /^\[\s*([^\s=~|^$*\]]+)\s*(?:(=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*[is]?\s*\]$/.exec(s);
      if (m) { const nazwa = m[1].toLowerCase(); const wartosc = m[2] ? (m[3] ?? m[4] ?? m[5]) : null; if (!wynik.atrybuty.has(nazwa) || wartosc != null) wynik.atrybuty.set(nazwa, wartosc); }
    } else if (s !== '*') wynik.typ = s.toLowerCase();
  }
  return wynik;
}

/** Typy elementów, do których może pasować złożenie (null = dowolny; pusty zbiór = do żadnego) wg wiedzy o DOM. */
export function mozliweTypy(z, wiedza) {
  let typy = z.typ ? new Set([z.typ]) : null;
  const zawez = (wpis) => {
    if (!wpis) { typy = new Set(); return; }
    if (wpis.wolna) return;
    typy = typy ? new Set([...typy].filter((t) => wpis.tagi.has(t))) : new Set(wpis.tagi);
  };
  if (wiedza) {
    for (const k of z.klasy) zawez(wiedza.klasy.get(k));
    if (z.id) zawez(wiedza.idy.get(z.id));
  }
  return typy;
}

/** Czy dwa skrajne złożenia są dowodliwie rozłączne (żaden element nie pasuje do obu); `wiedza` z wiedzaDom(). */
export function rozlaczne(a, b, wiedza = null) {
  if (a.typ && b.typ && a.typ !== b.typ) return true;
  if (a.id && b.id && a.id !== b.id) return true;
  if ((a.pseudoelement || null) !== (b.pseudoelement || null)) return true;
  for (const [nazwa, wartosc] of a.atrybuty) {
    if (wartosc == null) continue;
    const inna = b.atrybuty.get(nazwa);
    if (inna != null && inna !== wartosc) return true;
  }
  if (wiedza) {
    const ta = mozliweTypy(a, wiedza);
    const tb = mozliweTypy(b, wiedza);
    if ((ta && !ta.size) || (tb && !tb.size)) return true;
    if (ta && tb && ![...ta].some((t) => tb.has(t))) return true;
  }
  return false;
}

/**
 * Wiedza o DOM: na jakich typach elementów występuje klasa albo id. Źródła: znaczniki w HTML, szablony HTML
 * w łańcuchach JS (`<tag class="…">`) i fabryki elementów w JS (`x = createElement("tag")` … `x.className = "…"` /
 * `x.classList.add("…")` / `x.id = "…"` w tym samym wyrażeniu). Nazwa zapisywana inaczej (zmienna, konkatenacja,
 * element spoza fabryki) jest WOLNA — może być na dowolnym elemencie. Nazwy budowane dynamicznie nie są widoczne.
 * Zwraca { klasy: Map nazwa → { tagi: Set, wolna }, idy: Map nazwa → { tagi: Set, wolna } }.
 */
export function wiedzaDom(czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8'), pliki = null, fakty = faktyDom()) {
  const lista = pliki || fs.readdirSync(korzen).filter((f) => (f.endsWith('.html') || f.endsWith('.js')) && !f.startsWith('service-worker')).sort();
  const klasy = new Map();
  const idy = new Map();
  const slady = new Map(); // nazwa → [fragment kodu z zapisem, którego odbiorcy nie dało się ustalić]
  const wpis = (mapa, nazwa) => { if (!mapa.has(nazwa)) mapa.set(nazwa, { tagi: new Set(), wolna: false }); return mapa.get(nazwa); };
  const nazwyKlas = (tekst) => tekst.split(/\s+/).filter((k) => /^[A-Za-z_-][\w-]*$/.test(k));
  const teksty = [];
  for (const plik of lista) { try { teksty.push({ plik, tekst: czytaj(plik) }); } catch { /* brak pliku */ } }
  // 1. znaczniki (HTML i szablony w JS; cudzysłowy w łańcuchach JS bywają poprzedzone \)
  for (const { tekst } of teksty) {
    for (const m of tekst.matchAll(/<([a-zA-Z][\w-]*)\b([^<>]*)>/g)) {
      // element-zastępnik ikony lucide (data-lucide) jest podmieniany przez lucide.createIcons() na <svg> z tymi samymi
      // klasami i id — nazwy występują więc także na svg
      const tagi = /\bdata-lucide=/.test(m[2]) ? [m[1].toLowerCase(), 'svg'] : [m[1].toLowerCase()];
      for (const k of m[2].matchAll(/\bclass=\\?["']([^"'\\]*)/g)) for (const n of nazwyKlas(k[1])) for (const tag of tagi) wpis(klasy, n).tagi.add(tag);
      for (const k of m[2].matchAll(/\bid=\\?["']([^"'\\]*)/g)) if (/^[\w-]+$/.test(k[1])) for (const tag of tagi) wpis(idy, k[1]).tagi.add(tag);
    }
  }
  // 2. zapisy w JS: odbiorca to zmienna z createElement / getElementById / querySelector(All) w tym samym wyrażeniu,
  //    albo parametr forEach po querySelectorAll; inaczej nazwa jest wolna
  const typySelektora = (sel) => {
    let wynik = new Set();
    for (const czesc of splitTopLevel(sel, ',').map((x) => x.trim()).filter(Boolean)) {
      const t = mozliweTypy(zlozenieSkrajne(czesc), { klasy, idy });
      if (!t) return null;
      for (const x of t) wynik.add(x);
    }
    return wynik;
  };
  const tagiReceivera = (tekst, poz, zmienna) => {
    const okno = tekst.slice(Math.max(0, poz - 500), poz);
    const z = zmienna.replace(/\$/g, '\\$');
    const kandydaci = [];
    for (const m of okno.matchAll(new RegExp(`(?:^|[^\\w$.])${z}\\s*=\\s*(?:[\\w$.]+\\.)?createElement\\(\\s*["'\`]([a-zA-Z][\\w-]*)["'\`]`, 'g'))) kandydaci.push({ koniec: m.index + m[0].length, tagi: new Set([m[1].toLowerCase()]) });
    for (const m of okno.matchAll(new RegExp(`(?:^|[^\\w$.])${z}\\s*=\\s*(?:[\\w$.]+\\.)?getElementById\\(\\s*["'\`]([\\w-]+)["'\`]`, 'g'))) { const w = idy.get(m[1]); kandydaci.push({ koniec: m.index + m[0].length, tagi: w && !w.wolna ? new Set(w.tagi) : null }); }
    for (const m of okno.matchAll(new RegExp(`(?:^|[^\\w$.])${z}\\s*=\\s*(?:[\\w$.]+\\.)?querySelector\\(\\s*["'\`]([^"'\`]+)["'\`]`, 'g'))) kandydaci.push({ koniec: m.index + m[0].length, tagi: typySelektora(m[1]) });
    for (const m of okno.matchAll(new RegExp(`querySelectorAll\\(\\s*["'\`]([^"'\`]+)["'\`]\\s*\\)\\s*\\.forEach\\(\\s*(?:function\\s*\\(\\s*${z}\\b|\\(?\\s*${z}\\s*\\)?\\s*=>)`, 'g'))) kandydaci.push({ koniec: m.index + m[0].length, tagi: typySelektora(m[1]) });
    // `["a","#b"].forEach(v => { … x = getElementById(v) / querySelector(v) … })` — tablica literałów id albo selektorów
    for (const m of okno.matchAll(new RegExp(`(?:^|[^\\w$.])${z}\\s*=\\s*(?:[\\w$.]+\\.)?(getElementById|querySelector)\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)`, 'g'))) {
      const param = m[2].replace(/\$/g, '\\$');
      const przed = okno.slice(0, m.index);
      const tablice = [...przed.matchAll(new RegExp(`\\[((?:\\s*["'\`][^"'\`]*["'\`]\\s*,?)+)\\]\\s*\\.forEach\\(\\s*(?:function\\s*\\(\\s*${param}\\b|\\(?\\s*${param}\\s*\\)?\\s*=>)`, 'g'))];
      const ostatnia = tablice.pop();
      if (!ostatnia) { kandydaci.push({ koniec: m.index + m[0].length, tagi: null }); continue; }
      const wartosci = [...ostatnia[1].matchAll(/["'`]([^"'`]*)["'`]/g)].map((x) => x[1]);
      const tagi = new Set();
      let znane = true;
      for (const v of wartosci) {
        const t = m[1] === 'getElementById' ? (idy.get(v) && !idy.get(v).wolna ? new Set(idy.get(v).tagi) : null) : typySelektora(v);
        if (!t) { znane = false; break; }
        for (const x of t) tagi.add(x);
      }
      kandydaci.push({ koniec: m.index + m[0].length, tagi: znane ? tagi : null });
    }
    if (!kandydaci.length) return null;
    const ostatni = kandydaci.sort((a, b) => a.koniec - b.koniec).pop();
    if (new RegExp(`[^\\w$.]${z}\\s*=[^=]`).test(okno.slice(ostatni.koniec))) return null; // zmienna przypisana ponownie
    return ostatni.tagi;
  };
  // fabryka elementów: `f("tag", …, { class: "…", id: "…" })` — tag to pierwszy argument wywołania, w którym stoi obiekt
  const tagFabryki = (tekst, poz) => {
    let n = { '(': 0, '[': 0, '{': 0 };
    for (let i = poz - 1; i >= Math.max(0, poz - 400); i--) {
      const c = tekst[i];
      if (c === ')') n['(']++; else if (c === ']') n['[']++; else if (c === '}') n['{']++;
      else if (c === '[' || c === '{') { if (n[c] > 0) n[c]--; }
      else if (c === '(') {
        if (n['('] > 0) { n['(']--; continue; }
        const przed = tekst.slice(Math.max(0, i - 40), i);
        // `Object.assign({…}, …)` wokół obiektu atrybutów nie jest fabryką — szukamy dalej na zewnątrz
        if (/(?:^|[^\w$])(?:Object\.)?assign$/.test(przed)) continue;
        const m = /([\w$]+)\(\s*["'`]([a-zA-Z][\w-]*)["'`]\s*,/.exec(tekst.slice(Math.max(0, i - 40), i + 30).slice(przed.search(/[\w$]+$/)));
        return m && m.index === 0 ? m[2].toLowerCase() : null;
      }
    }
    return null;
  };
  const literaly = (args) => { const out = []; let reszta = args; for (const m of args.matchAll(/["'`]([^"'`]*)["'`]/g)) { out.push(m[1]); reszta = reszta.replace(m[0], ''); } return out.flatMap((t) => nazwyKlas(t)); };
  const zapisz = (mapa, nazwa, tagi, plik, tekst, poz) => {
    const w = wpis(mapa, nazwa);
    if (tagi) { for (const t of tagi) w.tagi.add(t); return; }
    w.wolna = true;
    if (!slady.has(nazwa)) slady.set(nazwa, []);
    if (slady.get(nazwa).length < 6) slady.get(nazwa).push(`${plik}: …${tekst.slice(Math.max(0, poz - 140), poz + 60).replace(/\s+/g, ' ')}…`);
  };
  for (const { plik, tekst } of teksty) {
    if (!plik.endsWith('.js') && !/<script\b/.test(tekst)) continue;
    for (const m of tekst.matchAll(/([\w$]+)\.id\s*=\s*["'`]([\w-]+)["'`]/g)) zapisz(idy, m[2], tagiReceivera(tekst, m.index, m[1]), plik, tekst, m.index);
    for (const m of tekst.matchAll(/([\w$]+)\.setAttribute\(\s*["']id["']\s*,\s*["'`]([\w-]+)["'`]/g)) zapisz(idy, m[2], tagiReceivera(tekst, m.index, m[1]), plik, tekst, m.index);
    for (const m of tekst.matchAll(/\bid\s*:\s*["'`]([\w-]+)["'`]/g)) { const tag = tagFabryki(tekst, m.index); if (tag) zapisz(idy, m[1], new Set([tag]), plik, tekst, m.index); }
  }
  for (const { plik, tekst } of teksty) {
    if (!plik.endsWith('.js') && !/<script\b/.test(tekst)) continue;
    for (const m of tekst.matchAll(/([\w$]+)\.className\s*\+?=\s*(["'`][^"'`;]*["'`])/g)) { const tagi = tagiReceivera(tekst, m.index, m[1]); for (const n of literaly(m[2])) zapisz(klasy, n, tagi, plik, tekst, m.index); }
    for (const m of tekst.matchAll(/([\w$]+)\.classList\.(?:add|toggle|replace)\(([^)]*)\)/g)) { const tagi = tagiReceivera(tekst, m.index, m[1]); for (const n of literaly(m[2])) zapisz(klasy, n, tagi, plik, tekst, m.index); }
    for (const m of tekst.matchAll(/([\w$]+)\.setAttribute\(\s*["']class["']\s*,\s*(["'`][^"'`]*["'`])/g)) { const tagi = tagiReceivera(tekst, m.index, m[1]); for (const n of literaly(m[2])) zapisz(klasy, n, tagi, plik, tekst, m.index); }
    for (const m of tekst.matchAll(/\bclass\s*:\s*["'`]([^"'`]*)["'`]/g)) { const tag = tagFabryki(tekst, m.index); const lucide = /["']data-lucide["']\s*:/.test(tekst.slice(m.index, m.index + 300)) || /["']data-lucide["']\s*:/.test(tekst.slice(Math.max(0, m.index - 300), m.index)); for (const n of nazwyKlas(m[1])) zapisz(klasy, n, tag ? new Set(lucide ? [tag, 'svg'] : [tag]) : null, plik, tekst, m.index); }
  }
  // 3. fakty spoza analizy (tests/fixtures/skorka-fakty.json): nazwa wolna dostaje jawny zbiór typów z uzasadnieniem;
  //    `podzbiory`: klasa dodawana wyłącznie elementom pasującym do listy selektorów
  for (const [rodzaj, mapa] of [['klasy', klasy], ['idy', idy]]) {
    for (const [nazwa, f] of Object.entries((fakty && fakty[rodzaj]) || {})) { const w = wpis(mapa, nazwa); w.wolna = false; w.tagi = new Set(f.tagi); w.fakt = f.zrodlo; }
  }
  const podzbiory = new Map(Object.entries((fakty && fakty.podzbiory) || {}).map(([k, f]) => [k, f.selektory]));
  for (const [k, sel] of podzbiory) {
    // typy elementów klasy-podzbioru wynikają z listy: suma typów jej części
    const w = wpis(klasy, k);
    if (w.wolna || !w.tagi.size) {
      const tagi = new Set();
      let znane = true;
      for (const s of sel) { const t = mozliweTypy(zlozenieSkrajne(s), { klasy, idy }); if (!t) { znane = false; break; } for (const x of t) tagi.add(x); }
      if (znane) { w.wolna = false; w.tagi = tagi; w.fakt = w.fakt || `podzbiór: ${sel.join(', ')}`; }
    }
  }
  return { klasy, idy, slady, podzbiory };
}

