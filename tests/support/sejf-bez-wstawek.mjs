// Źródła sejfu do porównań w testach P-DZIENNIK-ZDARZEN (E2-PR3a2): sejf bez wstawek i kopia sejfu z licznikiem emisji.
//
// Sejf bez wstawek to kopia tekstu vilda_vault.js, w której każde wywołanie identyfikatora Bem_* albo Bob_* poza blokiem
// P-DZIENNIK-ZDARZEN (drzewo składni acorn; blok między znacznikiem początku a znacznikiem końca) jest zastąpione `void 0`,
// a wywołanie Bob_oznacz(…) — `false` (wynik trafia do stałej, którą bierze Bob_odznacz). Dotyczy to także kroków
// operacji złożonych (Bem_krokStart(), Bem_krokKoniec()). Blok i `_eventLog:Bev_EKSPORT` zostają bez zmian, więc eksport
// _eventLog działa, a kod poza blokiem nie woła żadnej funkcji bloku: hooki, zapisy i usuwanie konta jak w sejfie, do
// którego nic z bloku nie wpięto. Kopia z licznikiem emisji ma jako pierwszą instrukcję Bem_zmiana wywołanie funkcji
// testu (parametr wykonania, nie pole okna), więc liczy emisje bez dotykania okna; w repozytorium kodu licznika nie ma.
// Kopia z rejestrem łańcucha (E2-PR3a3, test A ≡ B na prawdziwych emiterach) różni się od sejfu dwoma miejscami części
// emisji: Bem_zmiana bez warunku trybu i IndexedDB (urządzenia uprzęży mają sejf na adapterze w pamięci) i Bem_doLancucha,
// które zamiast dopisania oddaje wpis funkcji testu; emitery, kroki, rangi i pomijanie powtórzeń są te same co w sejfie.
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
//       bez funkcji Bem_zmiana, np. sejf sprzed E2-PR3a2: kopia = źródło). E2-PR3a4: w funkcjach, które czytają pole
//       bramki poza emisją, licznik tuż przed tym odczytem — `__testEmisji.przeglad(sieroty);` na początku ciała
//       Bem_przeglad (przegląd kolejki) i `__testEmisji.scalenie();` w Bem_zChmury przed instrukcją z Bob_bramka() (pary
//       scalania z chmury, po warunku otwartego kroku); źródło bez tych funkcji — bez tych liczników. Samokontrola: odczyt
//       bramki w Bem_zChmury dokładnie raz, jako instrukcja ciała. opakuj: true — dodatkowo funkcje Bem_hak, Bem_zHaka,
//       Bem_zmiana, Bem_krokStart i Bem_krokKoniec (synchroniczne; od E2-PR3a4 także Bem_przeglad i Bem_zChmury, jeśli
//       są) wywoływane przez opakowanie o tej samej nazwie: `__testEmisji.wejscie(nazwa)`, wywołanie, w finally
//       `__testEmisji.wyjscie(nazwa)`.
//   zRejestremLancucha(zrodlo = ZRODLO_SEJFU) → tekst kopii z rejestrem łańcucha: w Bem_zmiana warunek
//       `if (!T() || !Bob_trybPrywatny() || !Bob_idb()) return;` → `if (!T()) return;`, a ciało Bem_doLancucha zaczyna się
//       od `__testEmisji.lancuch(z); return;` (wpis łańcucha — { kind, klucze, s, uid } albo znacznik partii { uid,
//       znacznik } — trafia do rejestru testu; bez bazy kolejki, szyfrowania i Bob_dopiszZ). Bramka zostaje: okno potrzebuje
//       pola VILDA_EVENT_LOG = true. Samokontrola: znacznik części emisji i każda z dwóch kotwic dokładnie raz, kotwice
//       w części emisji (warunek trybu w ciele Bem_zmiana), wynik parsuje się — inaczej wyjątek (np. sejf sprzed E2-PR3a2).
//       Ładowanie: zaladujZrodlo(win, tekst, { lancuch(z) }).
//   zaladujZrodlo(win, zrodlo, test = null) — wykonanie tekstu w oknie; test — obiekt __testEmisji kopii z licznikiem
//       albo kopii z rejestrem łańcucha.
//   licznikEmisji({ zrodlo = ZRODLO_SEJFU, opakuj = false, przy = null } = {}) → l — licznik jednego okna:
//       l.emisje ([{ kind, klucze, sesja }] każdego wywołania Bem_zmiana, sesja: true — podana sesja operacji),
//       l.przeglady ([{ sieroty }] każdego wywołania Bem_przeglad), l.scalenia ([{}] każdego odczytu bramki
//       w Bem_zChmury), l.odczyty() — suma trzech (odczyty pola bramki z tych funkcji),
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
// Opakowane, gdy są w źródle (od E2-PR3a4).
const OPAKOWANE_PRZEGLADU = ['Bem_przeglad', 'Bem_zChmury'];
// Instrukcja ciała funkcji z odczytem bramki: `if (!Bob_bramka()) …`.
function odczytBramki(f) {
  const l = f.body.body.filter((n) => n.type === 'IfStatement' && n.test.type === 'UnaryExpression' && n.test.operator === '!'
    && n.test.argument.type === 'CallExpression' && n.test.argument.callee.type === 'Identifier' && n.test.argument.callee.name === 'Bob_bramka');
  if (l.length !== 1) throw new Error(`kopia z licznikiem: odczyt bramki w ${f.id.name} nie dokładnie raz (${l.length})`);
  return l[0];
}

export function zLicznikiem(zrodlo = ZRODLO_SEJFU, { opakuj = false } = {}) {
  const ast = drzewo(zrodlo);
  const zmiana = deklaracja(ast, 'Bem_zmiana');
  if (!zmiana) return { zrodlo, jest: false };
  // Zmiany od końca tekstu: [pozycja, usunięte znaki, wstawka].
  const zmiany = [[zmiana.body.start + 1, 0, ' __testEmisji.zmiana(kind, klucze, s);']];
  const przeglad = deklaracja(ast, 'Bem_przeglad');
  if (przeglad) zmiany.push([przeglad.body.start + 1, 0, ` __testEmisji.przeglad(${przeglad.params[0] ? przeglad.params[0].name : 'undefined'});`]);
  const zChmury = deklaracja(ast, 'Bem_zChmury');
  if (zChmury) zmiany.push([odczytBramki(zChmury).start, 0, '__testEmisji.scalenie(); ']);
  if (opakuj) {
    for (const nazwa of [...OPAKOWANE, ...OPAKOWANE_PRZEGLADU.filter((n) => deklaracja(ast, n))]) {
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

const KOTWICA_TRYBU = 'if (!T() || !Bob_trybPrywatny() || !Bob_idb()) return;';
const KOTWICA_LANCUCHA = 'function Bem_doLancucha(z) {';
export function zRejestremLancucha(zrodlo = ZRODLO_SEJFU) {
  if (ile(zrodlo, ZNACZNIK_EMISJI) !== 1) throw new Error('kopia z rejestrem łańcucha: znacznik części emisji nie dokładnie raz');
  for (const k of [KOTWICA_TRYBU, KOTWICA_LANCUCHA]) {
    if (ile(zrodlo, k) !== 1) throw new Error(`kopia z rejestrem łańcucha: kotwica nie dokładnie raz: ${k}`);
  }
  const { z } = granicaBloku(zrodlo);
  const emisja = zrodlo.indexOf(ZNACZNIK_EMISJI);
  const zmiana = deklaracja(drzewo(zrodlo), 'Bem_zmiana');
  const iTrybu = zrodlo.indexOf(KOTWICA_TRYBU), iLancucha = zrodlo.indexOf(KOTWICA_LANCUCHA);
  if (!zmiana || iTrybu < zmiana.body.start || iTrybu > zmiana.body.end) throw new Error('kopia z rejestrem łańcucha: warunek trybu poza ciałem Bem_zmiana');
  if (iLancucha < emisja || iLancucha > z) throw new Error('kopia z rejestrem łańcucha: Bem_doLancucha poza częścią emisji');
  const wynik = zrodlo.replace(KOTWICA_TRYBU, 'if (!T()) return;')
    .replace(KOTWICA_LANCUCHA, `${KOTWICA_LANCUCHA} __testEmisji.lancuch(z); return;`);
  drzewo(wynik);
  return wynik;
}

export function zaladujZrodlo(win, zrodlo, test = null) {
  // Kopia bez licznika nie odwołuje się do __testEmisji; kopia z licznikiem bez obiektu testu — wyjątek przy emisji.
  new Function('window', 'globalThis', '__testEmisji', zrodlo)(win, win, test);
  return win;
}

export function licznikEmisji({ zrodlo = ZRODLO_SEJFU, opakuj = false, przy = null } = {}) {
  const kopia = zLicznikiem(zrodlo, { opakuj });
  const emisje = [];
  const przeglady = [];
  const scalenia = [];
  let glebokosc = 0;
  const test = {
    zmiana(kind, klucze, s) { emisje.push({ kind, klucze, sesja: !!(s && typeof s === 'object') }); },
    przeglad(sieroty) { przeglady.push({ sieroty: sieroty === true }); },
    scalenie() { scalenia.push({}); },
    wejscie(nazwa) { glebokosc += 1; if (przy) przy(nazwa, 'wejscie'); },
    wyjscie(nazwa) { glebokosc -= 1; if (przy) przy(nazwa, 'wyjscie'); },
  };
  return {
    emisje,
    przeglady,
    scalenia,
    odczyty: () => emisje.length + przeglady.length + scalenia.length,
    jest: kopia.jest,
    wEmisji: () => glebokosc > 0,
    zaladuj: (win) => zaladujZrodlo(win, kopia.zrodlo, test),
  };
}
