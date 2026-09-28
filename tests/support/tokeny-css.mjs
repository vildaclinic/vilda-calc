// P-STYLE rata 2a (decyzja właściciela 2026-09-28): wartości wpisane dotąd na sztywno w arkuszach
// są zastępowane zmiennymi z :root, nazwanymi jak tokeny design systemu
// (design-system/src/project/tokens.json). Ten moduł zna RODZINY tokenów objęte tokenizacją
// (własności, w których dana rodzina występuje, i sposób dzielenia wartości na atomy), buduje
// mapę „wartość → token" i przepisuje deklaracje; korzysta z niego skrypt
// tests/scripts/tokenizuj-css.mjs (zamiana w miejscu, raport) i strażnik tests/unit/css-tokeny.test.mjs
// (żaden literał równy tokenowi objętej rodziny nie wraca do arkuszy).
//
// Zamiana jest równoważna co do pikseli: zmienna dostaje dokładnie tę wartość, którą miał literał,
// jest zadeklarowana w :root (style.css, ładowany na każdej stronie) i nigdzie nie jest nadpisywana.
// Tokeny, które zmieniają wartość między trybami wyglądu (wielowartościowe w tokens.json), są
// celowo POZA mapą: podmiana literału na taką zmienną zmieniłaby wygląd w trybach kontrastu.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PLIK_TOKENOW = path.join(korzen, 'design-system/src/project/tokens.json');

/** Arkusze objęte tokenizacją: wszystkie w korzeniu repozytorium (jak formatuj-css). */
export function arkuszeAplikacji() {
  return fs.readdirSync(korzen).filter((f) => f.endsWith('.css')).sort();
}

const WLASNOSCI_KOLORU = /^(color|background|background-color|border|border-color|border-(top|right|bottom|left)|border-(top|right|bottom|left)-color|border-block|border-inline|outline|outline-color|fill|stroke|box-shadow|text-shadow|text-decoration-color|caret-color|accent-color|column-rule-color|scrollbar-color)$/;

/**
 * Rodziny objęte ratą 2a. `atomy`: 'slowa' — wartość dzielona na elementy po spacjach i przecinkach
 * poza nawiasami i łańcuchami; 'warstwy' — tylko po przecinkach (warstwy cienia); 'calosc' — cała wartość.
 */
export const RODZINY = Object.freeze({
  shadow: { wlasnosci: /^(box-shadow)$/, atomy: 'warstwy' },
  color: { wlasnosci: WLASNOSCI_KOLORU, atomy: 'slowa' },
  zindex: { wlasnosci: /^z-index$/, atomy: 'calosc' },
  opacity: { wlasnosci: /^opacity$/, atomy: 'calosc' },
});

/** Tokeny nazwane od literału (nic nie znaczą jako nazwy) — zostają literałami. */
export const POMIJANE_TOKENY = new Set([
  'white', 'black',
  // tło strony w trybach „profesjonalnym" i „ciemne tło 1" to ta sama szarość; podmiana literału na var(--professional-bg)
  // w regule body.dark-bg-level-1 przypisałaby trybowi ciemnego tła nazwę innego trybu — wartość tła zostaje literałem
  'professional-bg',
  // vilda_professional_module.js czyta --success z getComputedStyle z własnym fallbackiem #007e33; zdefiniowanie
  // zmiennej zmieniłoby kolor komunikatu po eksporcie — token zostaje poza tą ratą
  'success',
  // aliasy i zmienne modułów z dalszych bloków :root style.css: ta sama wartość ma nazwę kanoniczną (primary, bg…)
  'brand', 'brand-light', 'card-bg', 'snake-color',
]);

/** Wartości, które zostają literałami niezależnie od tokenu: biel i czerń nic nie znaczą jako nazwy. */
export const POMIJANE_WARTOSCI = new Set(['#ffffff', '#000000']);

/** Zmienne zadeklarowane w bloku :root na początku style.css (arkusz ładowany na każdej stronie). */
export function zmienneGlobalne(styleCss = fs.readFileSync(path.join(korzen, 'style.css'), 'utf8')) {
  // każdy blok :root najwyższego poziomu (w sformatowanym arkuszu zaczyna się od początku linii; bloki w @media są wcięte)
  const nazwy = new Set();
  for (const blok of styleCss.matchAll(/^:root \{\n([\s\S]*?)\n\}/gm)) for (const m of blok[1].matchAll(/^\s*--([A-Za-z0-9_-]+):/gm)) nazwy.add(m[1]);
  return nazwy;
}

/** Gdy kilka tokenów ma tę samą wartość, tę nazwę dostaje literał (reszta to aliasy lub zmienne o zasięgu modułu). */
export const KANONICZNE = Object.freeze({
  '#00838d': 'primary',
  '#5a7274': 'text-muted',
  '#d0dede': 'line',
  '#14393d': 'text-heading',
  '#c62828': 'danger',
});

const OBSERWOWANY = /zaobserwowan|nazwa syntetyczna/i;

/** Postać kanoniczna wartości do porównań: małe litery, #abc → #aabbcc, bez spacji przy przecinkach, .5 zamiast 0.5. */
export function normalizuj(v) {
  let s = String(v).trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  s = s.replace(/(^|[^0-9.])0\.([0-9])/g, '$1.$2');
  s = s.replace(/#([0-9a-f]{3,4})\b/g, (m, h) => `#${[...h].map((c) => c + c).join('')}`);
  return s;
}

/** Tokeny jednowartościowe wybranej rodziny z tokens.json (bez aliasów `{…}`). */
function jednowartosciowe(tokens, rodzina) {
  const body = tokens[rodzina];
  if (!body || !Array.isArray(body.tokens)) return [];
  return body.tokens
    .filter((t) => typeof t.value === 'string' && !t.value.startsWith('{'))
    .map((t) => ({ name: t.name, value: t.value, usage: t.usage || '', obserwowany: OBSERWOWANY.test(t.usage || '') }));
}

/**
 * Mapa rodzina → (wartość znormalizowana → nazwa tokenu). Wchodzą tokeny jednowartościowe, które są
 * albo „zaobserwowane" w tokens.json (dotąd bez zmiennej — tokenizator je zadeklaruje), albo już zadeklarowane
 * w :root style.css (globalne); pomijane: POMIJANE_TOKENY. Zderzenia wartości rozstrzyga KANONICZNE,
 * a bez wpisu tam — pierwszy zaobserwowany, potem istniejący globalny.
 */
export function mapaWartosci(tokens = JSON.parse(fs.readFileSync(PLIK_TOKENOW, 'utf8')), globalne = zmienneGlobalne()) {
  const mapa = {};
  const deklaracje = {}; // rodzina → [{name, value}] do wpisania w :root (tylko zaobserwowane, jeszcze niezadeklarowane)
  for (const rodzina of Object.keys(RODZINY)) {
    const m = new Map();
    const kandydaci = jednowartosciowe(tokens, rodzina).filter((t) => (t.obserwowany || globalne.has(t.name)) && !POMIJANE_TOKENY.has(t.name));
    for (const t of kandydaci) {
      const klucz = normalizuj(t.value);
      if (POMIJANE_WARTOSCI.has(klucz)) continue;
      const kanon = KANONICZNE[klucz];
      if (kanon) { if (t.name === kanon) m.set(klucz, t.name); continue; }
      const dotychczas = kandydaci.find((x) => x.name === m.get(klucz));
      if (!dotychczas || (t.obserwowany && !dotychczas.obserwowany)) m.set(klucz, t.name);
    }
    mapa[rodzina] = m;
    deklaracje[rodzina] = kandydaci.filter((t) => t.obserwowany && m.get(normalizuj(t.value)) === t.name).map((t) => ({ name: t.name, value: t.value }));
  }
  return { mapa, deklaracje };
}

/** Dzieli wartość na atomy najwyższego poziomu, zachowując separatory: [{tekst, atom:boolean}]. */
export function podzielAtomy(wartosc, tryb) {
  if (tryb === 'calosc') return [{ tekst: wartosc, atom: true }];
  const czesci = [];
  let biezacy = '';
  let nawiasy = 0;
  let cudzyslow = null;
  const zamknij = () => { if (biezacy) czesci.push({ tekst: biezacy, atom: true }); biezacy = ''; };
  // separator: przecinek zawsze, biały znak tylko w trybie 'slowa'; w trybie 'warstwy' biały znak należy do atomu
  const jestSeparatorem = (c) => c === ',' || (tryb === 'slowa' && /\s/.test(c));
  const nalezyDoSeparatora = (c) => jestSeparatorem(c) || (tryb === 'warstwy' && /\s/.test(c));
  for (let i = 0; i < wartosc.length; i++) {
    const c = wartosc[i];
    if (cudzyslow) { biezacy += c; if (c === '\\') { biezacy += wartosc[i + 1] || ''; i++; } else if (c === cudzyslow) cudzyslow = null; continue; }
    if (c === '"' || c === "'") { cudzyslow = c; biezacy += c; continue; }
    if (c === '(') nawiasy++;
    if (c === ')') nawiasy = Math.max(0, nawiasy - 1);
    if (nawiasy === 0 && jestSeparatorem(c)) {
      zamknij();
      // ciąg separatorów (np. ", ") trafia do jednego elementu; w trybie 'warstwy' spacje po przecinku też
      let sep = c;
      while (i + 1 < wartosc.length && nalezyDoSeparatora(wartosc[i + 1])) { i++; sep += wartosc[i]; }
      czesci.push({ tekst: sep, atom: false });
      continue;
    }
    biezacy += c;
  }
  zamknij();
  return czesci;
}

/**
 * Przepisuje deklaracje arkusza. `fn(prop, wartosc)` dostaje nazwę własności i wartość bez `!important`
 * i zwraca nową wartość albo null (bez zmiany). Własności `--nazwa`, prelude reguł, łańcuchy i komentarze
 * są nietykane; układ białych znaków zostaje.
 */
export function przepiszDeklaracje(css, fn) {
  let wynik = '';
  let i = 0;
  const n = css.length;
  let glebokosc = 0;
  let poczatek = 0; // początek bieżącego segmentu
  let nawiasy = 0;
  const wypisz = (koniec, terminator) => {
    const segment = css.slice(poczatek, koniec);
    if (terminator !== '{' && glebokosc > 0) {
      const m = /^(\s*)([A-Za-z-][A-Za-z0-9-]*)(\s*:\s*)([\s\S]*?)(\s*!important)?(\s*)$/.exec(segment);
      if (m && !m[2].startsWith('--') && m[4].trim()) {
        const nowa = fn(m[2].toLowerCase(), m[4]);
        if (nowa != null && nowa !== m[4]) { wynik += `${m[1]}${m[2]}${m[3]}${nowa}${m[5] || ''}${m[6]}`; return; }
      }
    }
    wynik += segment;
  };
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const k = css.indexOf('*/', i + 2); i = k < 0 ? n : k + 2; continue; }
    if (c === '"' || c === "'") { let k = i + 1; while (k < n && css[k] !== c) { if (css[k] === '\\') k++; k++; } i = k + 1; continue; }
    if (c === '(') { nawiasy++; i++; continue; }
    if (c === ')') { nawiasy = Math.max(0, nawiasy - 1); i++; continue; }
    if (nawiasy > 0) { i++; continue; }
    if (c === '{') { wypisz(i, '{'); wynik += c; glebokosc++; poczatek = i + 1; i++; continue; }
    if (c === ';') { wypisz(i, ';'); wynik += c; poczatek = i + 1; i++; continue; }
    if (c === '}') { wypisz(i, '}'); wynik += c; glebokosc = Math.max(0, glebokosc - 1); poczatek = i + 1; i++; continue; }
    i++;
  }
  wypisz(n, '}');
  return wynik;
}

/** Zamienia literały na var(--token) w arkuszu; zwraca nowy tekst i listę zamian. */
export function tokenizuj(css, mapa) {
  const zamiany = [];
  const text = przepiszDeklaracje(css, (prop, wartosc) => {
    let biezaca = wartosc;
    for (const [rodzina, opis] of Object.entries(RODZINY)) {
      if (!opis.wlasnosci.test(prop)) continue;
      const m = mapa[rodzina];
      if (!m || !m.size) continue;
      const czesci = podzielAtomy(biezaca, opis.atomy);
      let zmienione = false;
      for (const cz of czesci) {
        if (!cz.atom) continue;
        const token = m.get(normalizuj(cz.tekst));
        if (!token) continue;
        zamiany.push({ prop, rodzina, literal: cz.tekst, token });
        cz.tekst = `var(--${token})`;
        zmienione = true;
      }
      if (zmienione) biezaca = czesci.map((cz) => cz.tekst).join('');
    }
    return biezaca === wartosc ? null : biezaca;
  });
  return { text, zamiany };
}

/** Literały w objętych własnościach, które NIE mają tokenu (kandydaci do nazwania) — tylko kolory hex/rgb. */
export function literalyBezTokenu(css, mapa) {
  const wynik = new Map();
  przepiszDeklaracje(css, (prop, wartosc) => {
    if (!RODZINY.color.wlasnosci.test(prop)) return null;
    for (const cz of podzielAtomy(wartosc, 'slowa')) {
      if (!cz.atom) continue;
      const k = normalizuj(cz.tekst);
      if (/^(#[0-9a-f]{6,8}|rgba?\([^)]*\))$/.test(k) && !mapa.color.get(k)) wynik.set(k, (wynik.get(k) || 0) + 1);
    }
    return null;
  });
  return wynik;
}

/**
 * Odwołania var(--T, F) istniejące w bazie, gdzie T jest tokenem dopiero teraz definiowanym: dotąd --T nie
 * istniało i działał fallback F. Żeby zdefiniowanie --T nic nie zmieniło: F równe wartości T → var(--T);
 * F równe innemu tokenowi tej raty → var(--inny); inne F → literał F. `noweNazwy` to tokeny, które ta rata
 * dopiero deklaruje (istniejące globalne, np. --primary, miały wartość już w bazie i ich fallbacki nigdy nie działały).
 */
export function normalizujFallbacki(text, mapa, noweNazwy) {
  const wartosc = new Map(); // nazwa → wartość znormalizowana
  const tokenDlaWartosci = new Map(); // wartość znormalizowana → nazwa (wszystkie rodziny)
  for (const m of Object.values(mapa)) for (const [v, n] of m) { wartosc.set(n, v); if (!tokenDlaWartosci.has(v)) tokenDlaWartosci.set(v, n); }
  const zmiany = [];
  const wynik = text.replace(/var\(--([A-Za-z0-9_-]+)\s*,\s*([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (calosc, nazwa, fallback) => {
    if (!noweNazwy.has(nazwa) || !wartosc.has(nazwa)) return calosc;
    const f = normalizuj(fallback);
    let nowy;
    if (f === wartosc.get(nazwa)) nowy = `var(--${nazwa})`;
    else if (tokenDlaWartosci.has(f) && !POMIJANE_TOKENY.has(tokenDlaWartosci.get(f))) nowy = `var(--${tokenDlaWartosci.get(f)})`;
    else nowy = fallback.trim();
    zmiany.push({ z: calosc, na: nowy });
    return nowy;
  });
  return { text: wynik, zmiany };
}

/** Odwołania var(--T) bez fallbacku do nazw, które w tym tekście nie są nigdzie zadeklarowane (dotąd nierozwiązywalne). */
export function odwolaniaBezDeklaracji(text, noweNazwy) {
  const wynik = [];
  for (const m of text.matchAll(/var\(--([A-Za-z0-9_-]+)\)/g)) if (noweNazwy.has(m[1])) wynik.push(m[1]);
  return wynik;
}
