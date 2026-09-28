// P-STYLE rata 1 (decyzja właściciela 2026-09-28): arkusze aplikacji są w repozytorium w postaci
// SFORMATOWANEJ, nie zminifikowanej, bo zminifikowany plik nie ma czytelnego diffu ani `git blame`.
// To narzędzie formatuje arkusz, zmieniając WYŁĄCZNIE białe znaki poza łańcuchami i komentarzami:
// nie przestawia reguł, nie skraca wartości, nie usuwa ani nie dodaje znaków znaczących.
// Równoważność z oryginałem sprawdza się w przeglądarce: node tests/scripts/porownaj-cssom.mjs.
//
//   node tests/scripts/formatuj-css.mjs                 # formatuje w miejscu arkusze, które wyglądają na
//                                                       # zminifikowane; czytelne (także ręcznie sformatowane) zostawia
//   node tests/scripts/formatuj-css.mjs --sprawdz       # kod 1, gdy któryś arkusz wygląda na zminifikowany
//   node tests/scripts/formatuj-css.mjs plik.css ...    # wskazane pliki formatuje zawsze
//
// Strażnik tests/unit/css-sformatowany.test.mjs pilnuje tą samą regułą, by zminifikowana postać nie wróciła.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Arkusze ładowane przez strony aplikacji (wszystkie pliki .css w korzeniu repozytorium). */
export function arkuszeAplikacji() {
  return fs.readdirSync(korzen).filter((f) => f.endsWith('.css')).sort();
}

/** Najdłuższa linia, jaką dopuszcza strażnik: zminifikowane arkusze mają linie po kilka tysięcy znaków. */
export const MAKSYMALNA_LINIA = 1000;

/** Linie dłuższe niż MAKSYMALNA_LINIA — pusta lista oznacza arkusz w postaci czytelnej. */
export function zaDlugieLinie(tekst) {
  const wynik = [];
  tekst.split('\n').forEach((l, i) => { if (l.length > MAKSYMALNA_LINIA) wynik.push({ linia: i + 1, dlugosc: l.length }); });
  return wynik;
}

const WCIECIE = '  ';

/**
 * Formatuje tekst CSS. Skaner znak po znaku śledzi łańcuchy, komentarze, nawiasy i głębokość bloków.
 * Łańcuchy i komentarze są przepisywane dosłownie; ciąg białych znaków poza nimi staje się jedną
 * spacją. Selektory dostają po jednym w linii, deklaracje po jednej w linii, pierwszy dwukropek
 * deklaracji (poza własnościami `--`) dostaje postać `nazwa: wartość`.
 */
export function formatujCss(zrodlo) {
  const wynik = [];
  let glebokosc = 0;
  let segment = '';
  let spacjaNaKoncu = false; // ostatni znak segmentu to spacja spoza łańcucha (do obcięcia na końcu)
  let nawiasy = 0;
  let i = 0;
  const n = zrodlo.length;

  const wciecie = () => WCIECIE.repeat(glebokosc);
  const dopiszBialy = () => { if (segment && !spacjaNaKoncu) { segment += ' '; spacjaNaKoncu = true; } };
  const dopisz = (t) => { segment += t; spacjaNaKoncu = false; };
  const zdejmijSegment = () => { const t = spacjaNaKoncu ? segment.slice(0, -1) : segment; segment = ''; spacjaNaKoncu = false; return t; };

  const wypiszSegment = (terminator) => {
    const t = zdejmijSegment();
    if (!t) return;
    if (terminator === '{') {
      // prelude reguły: selektory po jednym w linii, prelude @-reguł bez zmian
      const linie = t.startsWith('@') ? [t] : podzielPoPrzecinkach(t).map((s) => s.trim());
      wynik.push(`${wciecie()}${linie.join(`,\n${wciecie()}`)}`);
    } else {
      wynik.push(`${wciecie()}${deklaracja(t)}`);
    }
  };

  while (i < n) {
    const c = zrodlo[i];
    if (c === '/' && zrodlo[i + 1] === '*') {
      const koniec = zrodlo.indexOf('*/', i + 2);
      const tresc = koniec < 0 ? zrodlo.slice(i) : zrodlo.slice(i, koniec + 2);
      i = koniec < 0 ? n : koniec + 2;
      if (nawiasy === 0 && segment === '') wynik.push(`${wciecie()}${tresc}`); // komentarz między regułami: własna linia
      else { dopiszBialy(); dopisz(tresc); dopiszBialy(); }
      continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && zrodlo[k] !== c) { if (zrodlo[k] === '\\') k++; k++; }
      dopisz(zrodlo.slice(i, Math.min(k + 1, n)));
      i = k + 1;
      continue;
    }
    if (c === '\\') { dopisz(zrodlo.slice(i, i + 2)); i += 2; continue; }
    if (/\s/.test(c)) { dopiszBialy(); i++; continue; }
    if (c === '(') { nawiasy++; dopisz(c); i++; continue; }
    if (c === ')') { nawiasy = Math.max(0, nawiasy - 1); dopisz(c); i++; continue; }
    if (nawiasy > 0) { dopisz(c); i++; continue; }
    if (c === '{') {
      wypiszSegment('{');
      const ostatni = wynik.length ? wynik.pop() : wciecie();
      wynik.push(`${ostatni} {`);
      glebokosc++;
      i++;
      continue;
    }
    if (c === ';') {
      wypiszSegment(';');
      const ostatni = wynik.pop();
      wynik.push(`${ostatni};`);
      i++;
      continue;
    }
    if (c === '}') {
      wypiszSegment('}'); // brakujący średnik ostatniej deklaracji nie jest dodawany (to byłby nowy znak)
      glebokosc = Math.max(0, glebokosc - 1);
      wynik.push(`${wciecie()}}`);
      if (glebokosc === 0) wynik.push('');
      i++;
      continue;
    }
    dopisz(c);
    i++;
  }
  wypiszSegment('}');
  return `${wynik.join('\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')}\n`;
}

/** Dzieli prelude po przecinkach poza nawiasami i łańcuchami (selektory, procenty @keyframes). */
function podzielPoPrzecinkach(t) {
  const czesci = [];
  let biezaca = '';
  let nawiasy = 0;
  let cudzyslow = null;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (cudzyslow) { biezaca += c; if (c === '\\') { biezaca += t[i + 1] || ''; i++; } else if (c === cudzyslow) cudzyslow = null; continue; }
    if (c === '"' || c === "'") { cudzyslow = c; biezaca += c; continue; }
    if (c === '(') nawiasy++;
    if (c === ')') nawiasy = Math.max(0, nawiasy - 1);
    if (c === ',' && nawiasy === 0) { czesci.push(biezaca); biezaca = ''; continue; }
    biezaca += c;
  }
  czesci.push(biezaca);
  return czesci;
}

/** `nazwa:wartość` → `nazwa: wartość` dla zwykłych własności; `--własne` i @-reguły bez zmian. */
function deklaracja(t) {
  if (t.startsWith('@') || t.startsWith('--')) return t;
  const m = /^([A-Za-z-]+)\s*:\s*/.exec(t);
  return m ? `${m[1]}: ${t.slice(m[0].length)}` : t;
}

const uruchomionyBezposrednio = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (uruchomionyBezposrednio) {
  const argumenty = process.argv.slice(2);
  const sprawdz = argumenty.includes('--sprawdz');
  const wskazane = argumenty.filter((a) => !a.startsWith('--'));
  const pliki = wskazane.length ? wskazane : arkuszeAplikacji();
  const problemy = [];
  const zmienione = [];
  for (const plik of pliki) {
    // ścieżka jest ograniczana do korzenia repozytorium: skrypt nie czyta ani nie pisze poza nim
    const sciezka = path.resolve(korzen, plik);
    if (!sciezka.startsWith(`${korzen}${path.sep}`)) { console.error(`poza repozytorium: ${plik}`); process.exit(2); }
    const wzgledna = path.relative(korzen, sciezka);
    const tekst = fs.readFileSync(sciezka, 'utf8');
    if (sprawdz) {
      const dlugie = zaDlugieLinie(tekst);
      if (dlugie.length) problemy.push(`${wzgledna}: linia ${dlugie[0].linia} ma ${dlugie[0].dlugosc} znaków (limit ${MAKSYMALNA_LINIA})`);
      continue;
    }
    // bez listy plików: tylko arkusze zminifikowane; ręcznie sformatowane (clcr_ui_workflow.css,
    // vilda_status_bar.css) zachowują swój układ, dopóki ktoś nie wskaże ich wprost
    if (!wskazane.length && !zaDlugieLinie(tekst).length) continue;
    const sformatowany = formatujCss(tekst);
    if (sformatowany === tekst) continue;
    fs.writeFileSync(sciezka, sformatowany);
    zmienione.push(wzgledna);
  }
  if (sprawdz) {
    if (problemy.length) { console.error(`arkusze wyglądają na zminifikowane (uruchom node tests/scripts/formatuj-css.mjs):\n${problemy.join('\n')}`); process.exit(1); }
    console.log(`czytelne: ${pliki.length} arkuszy`);
  } else {
    console.log(zmienione.length ? `sformatowano: ${zmienione.join(', ')}` : 'bez zmian');
  }
}
