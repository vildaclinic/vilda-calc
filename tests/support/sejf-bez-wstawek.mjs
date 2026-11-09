// Źródła sejfu do porównań w testach P-DZIENNIK-ZDARZEN (E2-PR3a2): sejf bez wstawek i kopia sejfu z licznikiem emisji.
//
// Sejf bez wstawek to kopia tekstu vilda_vault.js, w której każde wywołanie identyfikatora Bem_* albo Bob_* poza blokiem
// P-DZIENNIK-ZDARZEN (drzewo składni acorn; blok między znacznikiem początku a znacznikiem końca) jest zastąpione `void 0`,
// a wywołanie Bob_oznacz(…) — `false` (wynik trafia do stałej, którą bierze Bob_odznacz). Dotyczy to także kroków
// operacji złożonych (Bem_krokStart(), Bem_krokKoniec()). Blok i `_eventLog:Bev_EKSPORT` zostają bez zmian, więc eksport
// _eventLog działa, a kod poza blokiem nie woła żadnej funkcji bloku: hooki, zapisy i usuwanie konta jak w sejfie, do
// którego nic z bloku nie wpięto. Kopia z licznikiem emisji ma jako pierwszą instrukcję Bem_zmiana wywołanie funkcji
// testu (parametr wykonania, nie pole okna), więc liczy emisje bez dotykania okna; w repozytorium kodu licznika nie ma.
// Wykonanie tekstu jak w tests/support/load-browser-script.mjs: new Function('window', 'globalThis', …, tekst).
// Uprząż okna (okno() w tests/unit/sesja-zapisu-uprzaz.mjs, oknoMagazynu w tests/support/okno-magazynu.mjs) ładuje taki
// tekst przez opcję zrodla: { 'vilda_vault.js': (win) => zaladujZrodlo(win, tekst) }.
//
// EKSPORTY
//   SEJF, ZRODLO_SEJFU, POCZATEK_BLOKU, KONIEC_BLOKU, ZNACZNIK_EMISJI
//       Nazwa pliku sejfu, jego tekst z repozytorium (z chwili importu) i znaczniki bloku.
//   granicaBloku(zrodlo) → { a, z } — początek znacznika początku i koniec znacznika końca (pozycje w tekście); brak
//       albo powtórzony znacznik — wyjątek.
//   wywolaniaPozaBlokiem(zrodlo) → [{ nazwa, start, end }] — wywołania (CallExpression z gołym identyfikatorem) nazw
//       Bem_* i Bob_* poza blokiem, w kolejności w pliku; zagnieżdżone w argumentach innego takiego wywołania pominięte.
//   bezWstawek(zrodlo = ZRODLO_SEJFU) → tekst sejfu bez wstawek. Samokontrola przy każdym wywołaniu: wynik parsuje się,
//       poza blokiem nie ma tekstu Bem_ ani Bob_, a jedynym Bev_ poza blokiem jest `_eventLog:Bev_EKSPORT` — inaczej wyjątek.
//   zLicznikiem(zrodlo = ZRODLO_SEJFU, { opakuj } = {}) → { zrodlo, jest }
//       Kopia z instrukcją `__testEmisji.zmiana(kind, klucze, s);` na początku ciała Bem_zmiana (jest: false — źródło
//       bez funkcji Bem_zmiana, np. sejf sprzed E2-PR3a2: kopia = źródło). opakuj: true — dodatkowo funkcje Bem_hak,
//       Bem_zHaka, Bem_zmiana, Bem_krokStart i Bem_krokKoniec (synchroniczne) wywoływane przez opakowanie o tej samej
//       nazwie: `__testEmisji.wejscie(nazwa)`, wywołanie, w finally `__testEmisji.wyjscie(nazwa)`.
//   zaladujZrodlo(win, zrodlo, test = null) — wykonanie tekstu w oknie; test — obiekt __testEmisji kopii z licznikiem.
//   licznikEmisji({ zrodlo = ZRODLO_SEJFU, opakuj = false, przy = null } = {}) → l — licznik jednego okna:
//       l.emisje ([{ kind, klucze, sesja }] każdego wywołania Bem_zmiana, sesja: true — podana sesja operacji),
//       l.jest, l.wEmisji() (true w trakcie opakowanej funkcji Bem_*; tylko opakuj), l.zaladuj(win) (do opcji zrodla);
//       przy(nazwa, 'wejscie' | 'wyjscie') — wołane synchronicznie na wejściu i wyjściu opakowanej funkcji.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SEJF = 'vilda_vault.js';
export const ZRODLO_SEJFU = fs.readFileSync(path.join(KORZEN, SEJF), 'utf8');
export const POCZATEK_BLOKU = '/* P-DZIENNIK-ZDARZEN: poczatek bloku */';
export const KONIEC_BLOKU = '/* P-DZIENNIK-ZDARZEN: koniec bloku */';
export const ZNACZNIK_EMISJI = '/* P-DZIENNIK-ZDARZEN: emisja */';
const EKSPORT = '_eventLog:Bev_EKSPORT';
const ile = (tekst, fragment) => tekst.split(fragment).length - 1;
const drzewo = (zrodlo) => parse(zrodlo, { ecmaVersion: 'latest', sourceType: 'script' });

export function granicaBloku(zrodlo) {
  if (ile(zrodlo, POCZATEK_BLOKU) !== 1 || ile(zrodlo, KONIEC_BLOKU) !== 1) throw new Error('znaczniki bloku P-DZIENNIK-ZDARZEN: nie dokładnie raz');
  const a = zrodlo.indexOf(POCZATEK_BLOKU);
  const z = zrodlo.indexOf(KONIEC_BLOKU) + KONIEC_BLOKU.length;
  if (z < a) throw new Error('znacznik końca bloku przed znacznikiem początku');
  return { a, z };
}

function wezly(ast) {
  const lista = [];
  const idz = (n) => {
    if (!n || typeof n.type !== 'string') return;
    lista.push(n);
    for (const k of Object.keys(n)) {
      const x = n[k];
      if (Array.isArray(x)) x.forEach(idz);
      else if (x && typeof x.type === 'string') idz(x);
    }
  };
  idz(ast);
  return lista;
}

export function wywolaniaPozaBlokiem(zrodlo) {
  const { a, z } = granicaBloku(zrodlo);
  const wywolania = wezly(drzewo(zrodlo))
    .filter((n) => n.type === 'CallExpression' && n.callee.type === 'Identifier' && /^B(?:em|ob)_/.test(n.callee.name))
    .filter((n) => n.end <= a || n.start >= z)
    .map((n) => ({ nazwa: n.callee.name, start: n.start, end: n.end }))
    .sort((x, y) => x.start - y.start);
  const zewnetrzne = [];
  for (const w of wywolania) if (!zewnetrzne.some((x) => x.start <= w.start && w.end <= x.end)) zewnetrzne.push(w);
  return zewnetrzne;
}

// Tekst poza blokiem (blok wycięty) — do samokontroli.
function pozaBlokiem(zrodlo) {
  const { a, z } = granicaBloku(zrodlo);
  return zrodlo.slice(0, a) + zrodlo.slice(z);
}

export function bezWstawek(zrodlo = ZRODLO_SEJFU) {
  let wynik = zrodlo;
  for (const w of wywolaniaPozaBlokiem(zrodlo).reverse()) {
    wynik = wynik.slice(0, w.start) + (w.nazwa === 'Bob_oznacz' ? 'false' : 'void 0') + wynik.slice(w.end);
  }
  drzewo(wynik);
  const poza = pozaBlokiem(wynik);
  const zostalo = poza.match(/(?<![A-Za-z0-9_$])B(?:em|ob)_[A-Za-z0-9_$]*/g);
  if (zostalo) throw new Error(`sejf bez wstawek: poza blokiem zostało ${zostalo.join(', ')}`);
  const bev = poza.match(/(?<![A-Za-z0-9_$])Bev_[A-Za-z0-9_$]*/g) || [];
  if (bev.length !== 1 || ile(poza, EKSPORT) !== 1) throw new Error('sejf bez wstawek: Bev_ poza blokiem inne niż jedno _eventLog:Bev_EKSPORT');
  return wynik;
}

// Deklaracje funkcji najwyższego poziomu części emisji o danej nazwie (dokładnie jedna albo brak).
function deklaracja(ast, nazwa) {
  const d = wezly(ast).filter((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === nazwa);
  if (d.length > 1) throw new Error(`kopia z licznikiem: ${nazwa} zadeklarowana ${d.length} razy`);
  return d[0] || null;
}
const OPAKOWANE = ['Bem_hak', 'Bem_zHaka', 'Bem_zmiana', 'Bem_krokStart', 'Bem_krokKoniec'];

export function zLicznikiem(zrodlo = ZRODLO_SEJFU, { opakuj = false } = {}) {
  const ast = drzewo(zrodlo);
  const zmiana = deklaracja(ast, 'Bem_zmiana');
  if (!zmiana) return { zrodlo, jest: false };
  // Zmiany od końca tekstu: [pozycja, usunięte znaki, wstawka].
  const zmiany = [[zmiana.body.start + 1, 0, ' __testEmisji.zmiana(kind, klucze, s);']];
  if (opakuj) {
    for (const nazwa of OPAKOWANE) {
      const f = deklaracja(ast, nazwa);
      if (!f) throw new Error(`kopia z licznikiem: brak ${nazwa}`);
      if (f.async || f.generator) throw new Error(`kopia z licznikiem: ${nazwa} nie jest zwykłą funkcją`);
      zmiany.push([f.id.start, f.id.end - f.id.start, `${nazwa}__wlasciwa`]);
      zmiany.push([f.end, 0, `\nfunction ${nazwa}() { __testEmisji.wejscie('${nazwa}'); try { return ${nazwa}__wlasciwa.apply(this, arguments); } finally { __testEmisji.wyjscie('${nazwa}'); } }`]);
    }
  }
  let wynik = zrodlo;
  for (const [i, n, tekst] of zmiany.sort((x, y) => y[0] - x[0])) wynik = wynik.slice(0, i) + tekst + wynik.slice(i + n);
  drzewo(wynik);
  return { zrodlo: wynik, jest: true };
}

export function zaladujZrodlo(win, zrodlo, test = null) {
  // Kopia bez licznika nie odwołuje się do __testEmisji; kopia z licznikiem bez obiektu testu — wyjątek przy emisji.
  new Function('window', 'globalThis', '__testEmisji', zrodlo)(win, win, test);
  return win;
}

export function licznikEmisji({ zrodlo = ZRODLO_SEJFU, opakuj = false, przy = null } = {}) {
  const kopia = zLicznikiem(zrodlo, { opakuj });
  const emisje = [];
  let glebokosc = 0;
  const test = {
    zmiana(kind, klucze, s) { emisje.push({ kind, klucze, sesja: !!(s && typeof s === 'object') }); },
    wejscie(nazwa) { glebokosc += 1; if (przy) przy(nazwa, 'wejscie'); },
    wyjscie(nazwa) { glebokosc -= 1; if (przy) przy(nazwa, 'wyjscie'); },
  };
  return {
    emisje,
    jest: kopia.jest,
    wEmisji: () => glebokosc > 0,
    zaladuj: (win) => zaladujZrodlo(win, kopia.zrodlo, test),
  };
}
