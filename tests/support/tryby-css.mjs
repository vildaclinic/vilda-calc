// P-STYLE rata 3 (decyzja właściciela 2026-09-28): warstwa trybów wyglądu. Wysoki kontrast ma trzy poziomy
// (klasy body high-contrast-level-1/2/3 z ios26-ui.js), a reguły stylów powtarzały każdy selektor trzy razy —
// raz na poziom — z tymi samymi deklaracjami (wartości różnią się przez zmienne --hc-*, ustawiane osobno na poziom).
// Ten moduł zwija taki triplet do jednego selektora z :is(.high-contrast-level-1, .high-contrast-level-2,
// .high-contrast-level-3): dopasowanie jest sumą trzech części, a swoistość :is() to maksimum argumentów,
// czyli dokładnie swoistość jednej klasy — reguła wygrywa i przegrywa z tymi samymi regułami co dotąd.
// :is() jest już używane w arkuszach aplikacji (style.css, clcr_ui_workflow.css, vilda_auth_ui.css, vilda_chrome.css).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const POZIOMY_KONTRASTU = Object.freeze(['1', '2', '3']);
export const ZWINIETY = ':is(.high-contrast-level-1, .high-contrast-level-2, .high-contrast-level-3)';
const KLASA_POZIOMU = /\.high-contrast-level-([123])(?![\w-])/g;
const ZNACZNIK = '§POZIOM§'; // zastępuje klasę poziomu w szablonie części (znak nieobecny w selektorach)

/** Arkusze objęte zwijaniem: wszystkie w korzeniu repozytorium. */
export function arkuszeAplikacji() {
  return fs.readdirSync(korzen).filter((f) => f.endsWith('.css')).sort();
}

/** Dzieli tekst po separatorze poza nawiasami, nawiasami kwadratowymi i łańcuchami. */
export function podzielNajwyzszy(tekst, separator = ',') {
  const czesci = [];
  let biezacy = '';
  let nawiasy = 0;
  let cudzyslow = null;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (cudzyslow) { biezacy += c; if (c === '\\') { biezacy += tekst[i + 1] || ''; i++; } else if (c === cudzyslow) cudzyslow = null; continue; }
    if (c === '"' || c === "'") { cudzyslow = c; biezacy += c; continue; }
    if (c === '(' || c === '[') nawiasy++;
    if (c === ')' || c === ']') nawiasy = Math.max(0, nawiasy - 1);
    if (nawiasy === 0 && c === separator) { czesci.push(biezacy); biezacy = ''; continue; }
    biezacy += c;
  }
  czesci.push(biezacy);
  return czesci;
}

/**
 * Zwija listę selektorów: części różniące się WYŁĄCZNIE numerem poziomu kontrastu (1, 2, 3 — wszystkie trzy obecne,
 * ta sama liczba wystąpień klasy) stają się jedną częścią z :is(...). Części bez klasy poziomu, z niepełnym
 * kompletem poziomów albo z dwoma różnymi poziomami w jednej części zostają. Kolejność części: pierwsze wystąpienie.
 * Zwraca { lista, zwiniete } — liczba zwiniętych tripletów.
 */
export function zwinSelektory(lista) {
  const czesci = podzielNajwyzszy(lista).map((p) => p.trim()).filter(Boolean);
  const wynik = [];
  const grupy = new Map(); // szablon → { poziomy: Set, indeks w wyniku }
  let zwiniete = 0;
  for (const czesc of czesci) {
    const poziomy = [...czesc.matchAll(KLASA_POZIOMU)].map((m) => m[1]);
    if (!poziomy.length || new Set(poziomy).size !== 1) { wynik.push({ tekst: czesc }); continue; }
    const szablon = czesc.replace(KLASA_POZIOMU, ZNACZNIK);
    if (!grupy.has(szablon)) { grupy.set(szablon, { poziomy: new Set(), indeks: wynik.length, pierwszy: czesc }); wynik.push({ tekst: czesc, szablon }); }
    else wynik.push({ tekst: czesc, szablon, duplikat: true });
    grupy.get(szablon).poziomy.add(poziomy[0]);
  }
  const zwiniemy = new Set([...grupy].filter(([, g]) => POZIOMY_KONTRASTU.every((p) => g.poziomy.has(p))).map(([s]) => s));
  const koncowe = [];
  for (const w of wynik) {
    if (w.szablon && zwiniemy.has(w.szablon)) {
      if (w.duplikat) continue;
      koncowe.push(w.szablon.split(ZNACZNIK).join(ZWINIETY));
      zwiniete++;
      continue;
    }
    koncowe.push(w.tekst);
  }
  return { lista: koncowe.join(',\n'), zwiniete };
}

/** Rozwija zwiniętą postać do trzech części (do porównań i dla producenta design systemu). */
export function rozwinSelektory(lista) {
  const czesci = podzielNajwyzszy(lista).map((p) => p.trim()).filter(Boolean);
  const wynik = [];
  const wzorzec = /:is\(\s*\.high-contrast-level-1\s*,\s*\.high-contrast-level-2\s*,\s*\.high-contrast-level-3\s*\)/g;
  for (const czesc of czesci) {
    if (!wzorzec.test(czesc)) { wynik.push(czesc); wzorzec.lastIndex = 0; continue; }
    wzorzec.lastIndex = 0;
    for (const p of POZIOMY_KONTRASTU) wynik.push(czesc.replace(wzorzec, `.high-contrast-level-${p}`));
  }
  return wynik;
}

/**
 * Przepisuje prelude reguł stylu w arkuszu funkcją `fn(prelude, wciecie)` → nowe prelude albo null. Prelude @-reguł,
 * treści deklaracji, łańcuchy i komentarze są nietykane. Zachowuje wcięcie pierwszej linii prelude.
 */
export function przepiszPreludia(css, fn) {
  let wynik = '';
  let i = 0;
  const n = css.length;
  let poczatek = 0;
  let nawiasy = 0;
  const wypisz = (koniec, terminator) => {
    const segment = css.slice(poczatek, koniec);
    if (terminator === '{') {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(segment);
      const prelude = m[2];
      if (prelude && !prelude.startsWith('@') && !/^\d+%|^from\b|^to\b/.test(prelude)) {
        const wciecie = (m[1].split('\n').pop() || '');
        const nowe = fn(prelude, wciecie);
        if (nowe != null && nowe !== prelude) { wynik += `${m[1]}${nowe}${m[3]}`; return; }
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
    if (c === '{') { wypisz(i, '{'); wynik += c; poczatek = i + 1; i++; continue; }
    if (c === ';' || c === '}') { wypisz(i, c); wynik += c; poczatek = i + 1; i++; continue; }
    i++;
  }
  wypisz(n, '}');
  return wynik;
}

/** Zwija triplety w całym arkuszu; zwraca { text, zwiniete, reguly }. Wcięcie kolejnych linii prelude jak pierwszej. */
export function zwinArkusz(css) {
  let zwiniete = 0;
  let reguly = 0;
  const text = przepiszPreludia(css, (prelude, wciecie) => {
    if (!/high-contrast-level-[123]/.test(prelude)) return null;
    const r = zwinSelektory(prelude);
    if (!r.zwiniete) return null;
    zwiniete += r.zwiniete;
    reguly++;
    return r.lista.split('\n').join(`\n${wciecie}`);
  });
  return { text, zwiniete, reguly };
}
