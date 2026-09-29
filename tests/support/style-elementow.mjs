// P-STYLE krok 5b (inwentarz i strażnik): style ustawiane wprost na elementach — atrybuty style= w HTML stron i miejsca
// w JS, które piszą styl elementu (el.style.x = …, style.cssText, style.setProperty, setAttribute('style', …), znacznik
// ze style="…" w łańcuchu). Przeniesienie ich do klas NIE jest zrobione: 94% miejsc w JS leży w plikach zminifikowanych
// (AGENTS.md: bez czytelnego źródła nie ma większej zmiany), a 96% deklaracji w atrybutach style= dotyczy własności, które
// JS też ustawia albo czyta (display, margin-top, …) — przeniesienia nie da się wykazać dowodem stylów w spoczynku, więc
// jest decyzją właściciela. Strażnik pilnuje, by tych miejsc nie przybywało (tests/fixtures/style-elementow.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytajDomyslnie = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

/** Pliki JS aplikacji objęte inwentarzem: korzeń repozytorium bez bibliotek *.min.js i bez service workera. */
export function plikiJs(lista = fs.readdirSync(korzen)) {
  return lista.filter((f) => f.endsWith('.js') && !f.endsWith('.min.js') && !f.startsWith('service-worker')).sort();
}

/** Komentarze HTML zamienione na spacje (te same indeksy). */
const bezKomentarzy = (html) => html.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));

/** Atrybuty style= w znacznikach strony (poza komentarzami i poza <script>): [{ linia, znacznik, wartosc }]. */
export function atrybutyStyle(html) {
  const czysty = bezKomentarzy(html);
  const skrypty = [...czysty.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map((m) => [m.index, m.index + m[0].length]);
  const out = [];
  for (const m of czysty.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*?\sstyle\s*=\s*(["'])([\s\S]*?)\2[^>]*>/gi)) {
    if (skrypty.some(([a, b]) => m.index > a && m.index < b)) continue;
    out.push({ linia: czysty.slice(0, m.index).split('\n').length, znacznik: m[1].toLowerCase(), wartosc: m[3].replace(/\s+/g, ' ').trim() });
  }
  return out;
}

/** Rodzaje miejsc w JS, które piszą styl elementu. */
export const WZORCE_JS = {
  wlasnosc: /\.style\.[a-zA-Z]+\s*=(?!=)/g, // el.style.display = …
  cssText: /\.style\.cssText\s*=(?!=)/g, // liczone też jako wlasnosc — odejmowane niżej
  setProperty: /\.style\.setProperty\(/g,
  atrybut: /setAttribute\(\s*['"]style['"]/g,
  lancuch: /\bstyle=\\?["'`]/g, // znacznik ze style="…" w łańcuchu albo szablonie
};

/** Liczba miejsc każdego rodzaju w tekście pliku JS. */
export function miejscaJs(tekst) {
  const n = (re) => (tekst.match(re) || []).length;
  const cssText = n(WZORCE_JS.cssText);
  const wynik = { wlasnosc: n(WZORCE_JS.wlasnosc) - cssText, cssText, setProperty: n(WZORCE_JS.setProperty), atrybut: n(WZORCE_JS.atrybut), lancuch: n(WZORCE_JS.lancuch) };
  wynik.razem = Object.values(wynik).reduce((s, v) => s + v, 0);
  return wynik;
}

/** Inwentarz: { strony: { strona: liczba atrybutów }, js: { plik: { razem, … } } } — tylko pliki z niezerową liczbą. */
export function inwentarzStyliElementow({ czytaj = czytajDomyslnie, strony = null, js = null } = {}) {
  const listaStron = strony || fs.readdirSync(korzen).filter((f) => f.endsWith('.html')).sort();
  const listaJs = js || plikiJs();
  const wynik = { strony: {}, js: {} };
  for (const s of listaStron) { const n = atrybutyStyle(czytaj(s)).length; if (n) wynik.strony[s] = n; }
  for (const f of listaJs) { const m = miejscaJs(czytaj(f)); if (m.razem) wynik.js[f] = m; }
  return wynik;
}

/** Porównanie z fixture (liczby per plik): { przybylo: [...], ubylo: [...] } z opisami. */
export function porownaj(biezacy, zapisany) {
  const przybylo = [];
  const ubylo = [];
  for (const rodzaj of ['strony', 'js']) {
    const teraz = Object.fromEntries(Object.entries(biezacy[rodzaj]).map(([k, v]) => [k, typeof v === 'number' ? v : v.razem]));
    const bylo = zapisany[rodzaj] || {};
    for (const plik of new Set([...Object.keys(teraz), ...Object.keys(bylo)])) {
      const a = bylo[plik] || 0;
      const b = teraz[plik] || 0;
      if (b > a) przybylo.push(`${plik}: ${a} → ${b}`);
      else if (b < a) ubylo.push(`${plik}: ${a} → ${b}`);
    }
  }
  return { przybylo: przybylo.sort(), ubylo: ubylo.sort() };
}

/** Postać fixture: liczby per plik (JS: razem). */
export function doFixture(inwentarz) {
  return {
    strony: inwentarz.strony,
    js: Object.fromEntries(Object.entries(inwentarz.js).map(([k, v]) => [k, v.razem])),
  };
}
