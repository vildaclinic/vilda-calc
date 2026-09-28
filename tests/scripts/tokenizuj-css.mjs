// P-STYLE raty 2a/2b: zamienia w arkuszach aplikacji literały równe tokenom design systemu na var(--token)
// i dopisuje brakujące zmienne do :root w style.css. Rodziny, zasięg własności i reguły: tests/support/tokeny-css.mjs.
//
//   node tests/scripts/tokenizuj-css.mjs --sprawdz   # tylko raport: co zostałoby zamienione (kod 1, gdy coś jest)
//   node tests/scripts/tokenizuj-css.mjs             # zamiana w miejscu + zmienne w :root + raport
//   node tests/scripts/tokenizuj-css.mjs --raport    # jak --sprawdz, plus dla każdego tokenu selektory reguł z literałem
//   node tests/scripts/tokenizuj-css.mjs --kandydaci # literały objętych własności bez tokenu (do nazwania ręcznie), per rodzina
//   --rata=2b   nagłówek komentarza nad nowymi zmiennymi w :root (domyślnie 2b)
import fs from 'node:fs';
import path from 'node:path';
import { RODZINY, arkuszeAplikacji, korzen, literalyBezTokenu, mapaWartosci, normalizujFallbacki, odwolaniaBezDeklaracji, tokenizuj } from '../support/tokeny-css.mjs';

const argumenty = new Set(process.argv.slice(2));
const sprawdz = argumenty.has('--sprawdz') || argumenty.has('--raport');
const rata = ([...argumenty].find((a) => a.startsWith('--rata=')) || '--rata=2b').slice(7);
const { mapa, deklaracje } = mapaWartosci();
const podsumowanie = new Map(); // rodzina/token → liczba
const selektory = new Map(); // rodzina/token → Map(plik » selektor → liczba)
const perPlik = [];
const kandydaci = new Map(); // rodzina → Map(literał → liczba)
// nazwy, które ta rata dopiero deklaruje (nie ma ich jeszcze w :root style.css)
const rootTeraz = (/^:root \{\n([\s\S]*?)\n\}/.exec(fs.readFileSync(path.join(korzen, 'style.css'), 'utf8')) || ['', ''])[1];
const noweNazwy = new Set(Object.values(deklaracje).flat().map((t) => t.name).filter((n) => !new RegExp(`^\\s*--${n}:`, 'm').test(rootTeraz)));
const fallbacki = [];
const nierozwiazywalne = [];
const kolizje = [];
// nowa zmienna nie może mieć nazwy, którą coś już deklaruje (arkusz, strona, skrypt przez setProperty): var(--x) czytałoby inną wartość
const zrodla = fs.readdirSync(korzen).filter((f) => /\.(css|html|js)$/.test(f)).sort();
for (const n of noweNazwy) {
  const wzorzec = new RegExp(`(^|[^A-Za-z0-9_-])--${n}\\s*:|setProperty\\((['"])--${n}\\2`, 'm');
  for (const f of zrodla) if (wzorzec.test(fs.readFileSync(path.join(korzen, f), 'utf8'))) kolizje.push(`${f}: --${n}`);
}
if (kolizje.length) { console.error(`STOP — nazwy nowych zmiennych są już deklarowane:\n  ${kolizje.join('\n  ')}`); process.exit(2); }
for (const plik of arkuszeAplikacji()) {
  const sciezka = path.join(korzen, plik);
  const css = fs.readFileSync(sciezka, 'utf8');
  if (argumenty.has('--kandydaci')) {
    for (const rodzina of Object.keys(RODZINY)) {
      if (!kandydaci.has(rodzina)) kandydaci.set(rodzina, new Map());
      const k = kandydaci.get(rodzina);
      for (const [lit, n] of literalyBezTokenu(css, mapa, rodzina)) k.set(lit, (k.get(lit) || 0) + n);
    }
    continue;
  }
  for (const n of odwolaniaBezDeklaracji(css, noweNazwy)) nierozwiazywalne.push(`${plik}: var(--${n})`);
  const f = normalizujFallbacki(css, mapa, noweNazwy);
  for (const z of f.zmiany) fallbacki.push(`${plik}: ${z.z} → ${z.na}`);
  const { text, zamiany } = tokenizuj(f.text, mapa);
  if (!zamiany.length && !f.zmiany.length) continue;
  if (zamiany.length) perPlik.push(`${plik}: ${zamiany.length}`);
  for (const z of zamiany) {
    const klucz = `${z.rodzina}/${z.token}`;
    podsumowanie.set(klucz, (podsumowanie.get(klucz) || 0) + 1);
    if (!selektory.has(klucz)) selektory.set(klucz, new Map());
    const s = selektory.get(klucz);
    const gdzie = `${plik} » ${z.selektor}`;
    s.set(gdzie, (s.get(gdzie) || 0) + 1);
  }
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
  for (const [rodzina, k] of kandydaci) {
    if (!k.size) continue;
    console.log(`== ${rodzina}: ${k.size} literałów bez tokenu`);
    console.log([...k].sort((a, b) => b[1] - a[1]).map(([lit, n]) => `  ${lit} ×${n}`).join('\n'));
  }
  process.exit(0);
}
const razem = [...podsumowanie.values()].reduce((a, b) => a + b, 0);
console.log(`${sprawdz ? 'do zamiany' : 'zamieniono'}: ${razem} literałów w ${perPlik.length} arkuszach${perPlik.length ? ` (${perPlik.join(', ')})` : ''}`);
console.log([...podsumowanie].sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k} ×${v}`).join('\n'));
if (argumenty.has('--raport')) {
  for (const [klucz, s] of [...selektory].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`\n## ${klucz} (${podsumowanie.get(klucz)})`);
    console.log([...s].sort((a, b) => b[1] - a[1]).map(([gdzie, n]) => `  ${n > 1 ? `×${n} ` : ''}${gdzie}`).join('\n'));
  }
}
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
    const naglowek = `  /* P-STYLE rata ${rata}: tokeny dotąd wpisywane na sztywno (nazwy i opisy: design-system/src/project/tokens.json) */`;
    const m = /^:root \{\n([\s\S]*?)\n\}/.exec(css);
    if (!m) { console.error('style.css: brak bloku :root na początku'); process.exit(2); }
    const stare = m[1].replace(/\n$/, '');
    css = css.replace(m[0], `:root {\n${stare.endsWith(';') ? stare : `${stare};`}\n${naglowek}\n${linie.join('\n')}\n}`);
    fs.writeFileSync(sciezka, css);
    console.log(`style.css :root: dopisano ${linie.filter((l) => l.startsWith('  --')).length} zmiennych`);
  }
}
if (sprawdz && razem) process.exit(1);
