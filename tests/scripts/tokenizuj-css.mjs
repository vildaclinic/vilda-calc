// P-STYLE rata 2a: zamienia w arkuszach aplikacji literały równe tokenom design systemu na var(--token)
// i dopisuje brakujące zmienne do :root w style.css. Rodziny i reguły: tests/support/tokeny-css.mjs.
//
//   node tests/scripts/tokenizuj-css.mjs --sprawdz   # tylko raport: co zostałoby zamienione (kod 1, gdy coś jest)
//   node tests/scripts/tokenizuj-css.mjs             # zamiana w miejscu + zmienne w :root + raport
//   node tests/scripts/tokenizuj-css.mjs --kandydaci # literały koloru bez tokenu (do nazwania ręcznie)
import fs from 'node:fs';
import path from 'node:path';
import { arkuszeAplikacji, korzen, literalyBezTokenu, mapaWartosci, normalizujFallbacki, odwolaniaBezDeklaracji, tokenizuj } from '../support/tokeny-css.mjs';

const argumenty = new Set(process.argv.slice(2));
const sprawdz = argumenty.has('--sprawdz');
const { mapa, deklaracje } = mapaWartosci();
const podsumowanie = new Map(); // token → liczba
const perPlik = [];
const kandydaci = new Map();
// nazwy, które ta rata dopiero deklaruje (nie ma ich jeszcze w :root style.css)
const rootTeraz = (/^:root \{\n([\s\S]*?)\n\}/.exec(fs.readFileSync(path.join(korzen, 'style.css'), 'utf8')) || ['', ''])[1];
const noweNazwy = new Set(Object.values(deklaracje).flat().map((t) => t.name).filter((n) => !new RegExp(`^\\s*--${n}:`, 'm').test(rootTeraz)));
const fallbacki = [];
const nierozwiazywalne = [];
for (const plik of arkuszeAplikacji()) {
  const sciezka = path.join(korzen, plik);
  const css = fs.readFileSync(sciezka, 'utf8');
  if (argumenty.has('--kandydaci')) { for (const [k, v] of literalyBezTokenu(css, mapa)) kandydaci.set(k, (kandydaci.get(k) || 0) + v); continue; }
  for (const n of odwolaniaBezDeklaracji(css, noweNazwy)) nierozwiazywalne.push(`${plik}: var(--${n})`);
  const f = normalizujFallbacki(css, mapa, noweNazwy);
  for (const z of f.zmiany) fallbacki.push(`${plik}: ${z.z} → ${z.na}`);
  const { text, zamiany } = tokenizuj(f.text, mapa);
  if (!zamiany.length && !f.zmiany.length) continue;
  if (zamiany.length) perPlik.push(`${plik}: ${zamiany.length}`);
  for (const z of zamiany) podsumowanie.set(`${z.rodzina}/${z.token}`, (podsumowanie.get(`${z.rodzina}/${z.token}`) || 0) + 1);
  if (!sprawdz) fs.writeFileSync(sciezka, text);
}
// style inline stron: tylko fallbacki (literały w stronach zostają — to zakres osobnej raty)
if (!argumenty.has('--kandydaci')) {
  for (const strona of fs.readdirSync(korzen).filter((f) => f.endsWith('.html')).sort()) {
    const sciezka = path.join(korzen, strona);
    const html = fs.readFileSync(sciezka, 'utf8');
    for (const n of odwolaniaBezDeklaracji(html, noweNazwy)) nierozwiazywalne.push(`${strona}: var(--${n})`);
    const f = normalizujFallbacki(html, mapa, noweNazwy);
    if (!f.zmiany.length) continue;
    for (const z of f.zmiany) fallbacki.push(`${strona}: ${z.z} → ${z.na}`);
    if (!sprawdz) fs.writeFileSync(sciezka, f.text);
  }
}
if (argumenty.has('--kandydaci')) {
  console.log([...kandydaci].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join('\n'));
  process.exit(0);
}
const razem = [...podsumowanie.values()].reduce((a, b) => a + b, 0);
console.log(`${sprawdz ? 'do zamiany' : 'zamieniono'}: ${razem} literałów w ${perPlik.length} arkuszach${perPlik.length ? ` (${perPlik.join(', ')})` : ''}`);
console.log([...podsumowanie].sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k} ×${v}`).join('\n'));
if (fallbacki.length) console.log(`fallbacki odwołań z bazy do nowych zmiennych (${fallbacki.length}), żeby nic się nie zmieniło:\n  ${fallbacki.join('\n  ')}`);
if (nierozwiazywalne.length) console.log(`UWAGA — odwołania bez fallbacku do nazw dotąd niezadeklarowanych (w bazie nierozwiązywalne; do ręcznej decyzji):\n  ${[...new Set(nierozwiazywalne)].join('\n  ')}`);
if (!sprawdz && razem) {
  // zmienne dla tokenów zaobserwowanych (dotąd bez zmiennej) trafiają do :root w style.css, po istniejących
  const sciezka = path.join(korzen, 'style.css');
  let css = fs.readFileSync(sciezka, 'utf8');
  const uzyte = new Set([...podsumowanie.keys()].map((k) => k.split('/')[1]));
  const linie = [];
  for (const [rodzina, lista] of Object.entries(deklaracje)) {
    const doWpisania = lista.filter((t) => uzyte.has(t.name) && !new RegExp(`--${t.name}\\s*:`).test(css));
    if (doWpisania.length) linie.push(`  /* ${rodzina} */`, ...doWpisania.map((t) => `  --${t.name}:${t.value};`));
  }
  if (linie.length) {
    const naglowek = '  /* P-STYLE rata 2a: tokeny dotąd wpisywane na sztywno (nazwy i opisy: design-system/src/project/tokens.json) */';
    const m = /^:root \{\n([\s\S]*?)\n\}/.exec(css);
    if (!m) { console.error('style.css: brak bloku :root na początku'); process.exit(2); }
    const stare = m[1].replace(/\n$/, '');
    css = css.replace(m[0], `:root {\n${stare.endsWith(';') ? stare : `${stare};`}\n${naglowek}\n${linie.join('\n')}\n}`);
    fs.writeFileSync(sciezka, css);
    console.log(`style.css :root: dopisano ${linie.filter((l) => l.startsWith('  --')).length} zmiennych`);
  }
}
if (sprawdz && razem) process.exit(1);
