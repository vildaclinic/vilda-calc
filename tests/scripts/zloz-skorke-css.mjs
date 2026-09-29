// P-STYLE rata 4b: składa nadpisania skórki .liquid-ios26 do reguł bazowych (bez prefiksu skórki i bez !important)
// tam, gdzie analiza kaskady dowodzi, że żaden zwycięzca porównania się nie zmienia. Reguły i analiza:
// tests/support/skorka-css.mjs. Decyzje o deklaracjach, które zostają nadpisaniami, trzyma
// tests/fixtures/skorka-nadpisania.json (powody: kaskada, grupa, behawioralna, inline, dynamiczna, js).
//
//   node tests/scripts/zloz-skorke-css.mjs --sprawdz              # raport: ile da się złożyć, ile zostaje i dlaczego (kod 1, gdy coś da się złożyć)
//   node tests/scripts/zloz-skorke-css.mjs --raport               # jak --sprawdz, plus każda deklaracja z powodem
//   node tests/scripts/zloz-skorke-css.mjs --dom                  # przebieg w Chromium: style inline na dopasowanych elementach
//                                                                 # i arkusze wstrzykiwane z JS → test-results/skorka-dom.json
//   node tests/scripts/zloz-skorke-css.mjs                        # złożenie w arkuszach (uwzględnia fixture --dom i wykluczenia)
//   node tests/scripts/zloz-skorke-css.mjs --partiale             # to samo w partialach design systemu; potem npm run design-system -- --update
//   node tests/scripts/zloz-skorke-css.mjs --zapisz               # zapisuje tests/fixtures/skorka-nadpisania.json (co zostaje i dlaczego)
//   node tests/scripts/zloz-skorke-css.mjs --js                   # przegląd: miejsca w JS ładowanym na stronach z arkuszem, które ustawiają
//                                                                 # inline własność składanej deklaracji (ryzyko poza analizą: dziś !important
//                                                                 # skórki wygrywa ze stylem inline ustawionym po załadowaniu)
import fs from 'node:fs';
import path from 'node:path';
import { analizaSkorki, korzen, wiedzaDom, zlozArkusz, zrodlaStron } from '../support/skorka-css.mjs';

const argumenty = process.argv.slice(2);
const flaga = (f) => argumenty.includes(f);
const sprawdz = flaga('--sprawdz') || flaga('--raport');
const FIXTURE = path.join(korzen, 'tests/fixtures/skorka-nadpisania.json');
const FIXTURE_NIEOBECNE = path.join(korzen, 'tests/fixtures/skorka-nieobecne.json'); // nazwy z selektorów nieobecne w kodzie (rata 4b bis)
const FIXTURE_DOM = path.join(korzen, 'test-results/skorka-dom.json'); // wynik przebiegu --dom (katalog ignorowany przez git)
const FIXTURE_FAKTY = path.join(korzen, 'tests/fixtures/skorka-fakty.json');
const fakty = fs.existsSync(FIXTURE_FAKTY) ? JSON.parse(fs.readFileSync(FIXTURE_FAKTY, 'utf8')) : null;
const wiedza = wiedzaDom(undefined, undefined, fakty);

/** Wykluczenia z fixture: decyzje spoza analizy statycznej (inline, dynamiczna, js) — analiza ich nie podważa. */
function wykluczeniaZFixture() {
  const w = new Map();
  if (!fs.existsSync(FIXTURE)) return w;
  const f = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const p of f.pozostale || []) if (!['kaskada', 'grupa', 'behawioralna'].includes(p.powod.split(':')[0])) w.set(p.klucz, p.powod);
  return w;
}

/** Źródła dynamiczne z przebiegu --dom: Map strona → [{ pozycja, css }] oraz wykluczenia inline. */
function domZFixture() {
  if (!fs.existsSync(FIXTURE_DOM)) return { dynamiczne: null, inline: new Map() };
  const f = JSON.parse(fs.readFileSync(FIXTURE_DOM, 'utf8'));
  const dynamiczne = new Map(Object.entries(f.dynamiczne || {}));
  const inline = new Map();
  for (const i of f.inline || []) inline.set(i.klucz, `inline: ${i.opis}`);
  return { dynamiczne, inline };
}

if (flaga('--dom')) {
  const { przebiegDom } = await import('../support/skorka-dom.mjs');
  const wynik = await przebiegDom({ zrodla: zrodlaStron(), analiza: analizaSkorki({ wykluczenia: wykluczeniaZFixture(), wiedza }), wiedza });
  fs.mkdirSync(path.dirname(FIXTURE_DOM), { recursive: true });
  fs.writeFileSync(FIXTURE_DOM, `${JSON.stringify(wynik, null, 1)}\n`);
  console.log(`zapisano ${path.relative(korzen, FIXTURE_DOM)}: arkusze dynamiczne na ${Object.keys(wynik.dynamiczne).length} stronach, ${wynik.inline.length} par z konfliktem stylu inline, ${wynik.naruszenia.length} naruszeń wiedzy o DOM`);
  for (const n of wynik.naruszenia) console.log(`  NARUSZENIE: ${n}`);
  process.exit(wynik.naruszenia.length ? 1 : 0);
}

const dom = domZFixture();
const wykluczenia = new Map([...wykluczeniaZFixture(), ...dom.inline]);
const analiza = analizaSkorki({ wykluczenia, dynamiczne: dom.dynamiczne, wiedza });
const { kandydaci, zlozone, pozostale } = analiza;

const powody = new Map();
for (const p of pozostale) powody.set(p.powod, (powody.get(p.powod) || 0) + 1);
const dekl = (lista) => new Set(lista.map((k) => k.deklaracja)).size;
console.log(`pary (deklaracja, część) czystych reguł skórki: ${kandydaci.length} (deklaracji ${dekl(kandydaci)}); do złożenia: ${zlozone.length} par (deklaracji w całości ${zlozone.filter((k) => k.regula.czesci.every((c, nr) => zlozone.some((x) => x.deklaracja === k.deklaracja && x.nr === nr))).length / 1 | 0}); zostają: ${pozostale.length} par (${[...powody].map(([k, v]) => `${k} ${v}`).join(', ')})`);
console.log(`nazwy z selektorów nieobecne nigdzie w kodzie (reguły martwe, rozłączność z założenia): ${analiza.nieobecne.length}`);
if (flaga('--raport')) {
  console.log('\n== do złożenia');
  for (const k of zlozone) console.log(`  ${k.arkusz} ${k.regula.kontekst.length ? `[${k.regula.kontekst.join(' » ')}] ` : ''}${k.regula.czesci[k.nr].tekst.slice(0, 90)} { ${k.deklaracja.prop}${k.deklaracja.important ? ' !' : ''} }`);
  console.log('\n== zostają');
  for (const p of pozostale) console.log(`  ${p.arkusz} ${p.regula.czesci[p.nr].tekst.slice(0, 90)} { ${p.deklaracja.prop}${p.deklaracja.important ? ' !' : ''} } — ${p.powod}${p.szczegoly ? `: ${p.szczegoly}` : ''}`);
}

if (flaga('--zapisz')) {
  // powody spoza analizy (js, inline) zachowują pełny opis z decyzją; reszta — samą nazwę powodu
  const lista = pozostale.map((p) => ({ klucz: p.klucz, powod: ['js', 'inline'].includes(p.powod) ? p.szczegoly : p.powod })).sort((a, b) => a.klucz.localeCompare(b.klucz, 'pl'));
  fs.writeFileSync(FIXTURE, `${JSON.stringify({ opis: 'P-STYLE rata 4b: deklaracje czystych reguł skórki .liquid-ios26, które zostają nadpisaniami, z powodem (kaskada: konkurent w kaskadzie strony; grupa: wspólny longhand z deklaracją, która zostaje; behawioralna: własność poza ratą; inline: styl inline na dopasowanym elemencie z przebiegu --dom; dynamiczna: konkurent w arkuszu wstrzykiwanym z JS; js: skrypt ustawia własność inline — przegląd). Odświeżanie: node tests/scripts/zloz-skorke-css.mjs --zapisz', pozostale: lista }, null, 1)}\n`);
  console.log(`zapisano ${path.relative(korzen, FIXTURE)}: ${lista.length} deklaracji`);
  const nieobecne = { opis: 'Nazwy klas i id z selektorów arkuszy i bloków <style>, których nie ma nigdzie w HTML (poza <style>) ani w JS. Analiza złożenia skórki traktuje regułę z taką nazwą jako martwą (niczego nie dopasowuje) — na tym opiera się rozłączność. Nazwa, która pojawi się w kodzie, ożywia reguły złożone bez !important: sprawdź ich kaskadę i odśwież listę: node tests/scripts/zloz-skorke-css.mjs --zapisz', nazwy: analiza.nieobecne };
  fs.writeFileSync(FIXTURE_NIEOBECNE, `${JSON.stringify(nieobecne, null, 2)}\n`);
  console.log(`zapisano ${path.relative(korzen, FIXTURE_NIEOBECNE)}: ${analiza.nieobecne.length} nazw`);
}

if (flaga('--js')) {
  // skrypty ładowane przez strony (z <script src>), per strona
  const skrypty = new Map();
  for (const strona of zrodlaStron().keys()) skrypty.set(strona, [...fs.readFileSync(path.join(korzen, strona), 'utf8').matchAll(/<script\b[^>]*\bsrc=["']([a-z0-9_.-]+\.js)(?:\?[^"']*)?["']/gi)].map((m) => m[1]));
  const camel = (p) => p.replace(/^-webkit-/, 'webkit-').replace(/-([a-z])/g, (m, c) => c.toUpperCase());
  const { longhandy } = await import('../support/longhandy.mjs');
  const wgWlasnosci = new Map(); // własność → { pary: n, pliki: Map plik → [fragmenty] }
  const pamiecPlik = new Map();
  const czytajJs = (f) => { if (!pamiecPlik.has(f)) { try { pamiecPlik.set(f, fs.readFileSync(path.join(korzen, f), 'utf8')); } catch { pamiecPlik.set(f, ''); } } return pamiecPlik.get(f); };
  for (const k of zlozone) {
    const strony = [...analiza.obecnosc.get(k.arkusz).keys()];
    const pliki = new Set(strony.flatMap((s) => skrypty.get(s) || []));
    const prop = k.deklaracja.prop;
    if (prop.startsWith('--')) continue;
    if (!wgWlasnosci.has(prop)) wgWlasnosci.set(prop, { pary: 0, pliki: new Map() });
    const w = wgWlasnosci.get(prop);
    w.pary++;
    const nazwy = [...new Set([prop, ...longhandy(prop)])];
    const wzorce = nazwy.flatMap((n) => [new RegExp(`\\.style\\.${camel(n).replace(/[$]/g, '\\$&')}\\s*=`, 'g'), new RegExp(`setProperty\\(\\s*["']${n}["']`, 'g'), new RegExp(`cssText\\s*[+]?=\\s*[^;]*\\b${n}\\s*:`, 'g')]);
    for (const f of pliki) {
      if (w.pliki.has(f)) continue;
      const js = czytajJs(f);
      const trafienia = [];
      for (const re of wzorce) for (const m of js.matchAll(re)) trafienia.push(js.slice(Math.max(0, m.index - 70), m.index + 40).replace(/\s+/g, ' '));
      if (trafienia.length) w.pliki.set(f, trafienia);
    }
  }
  console.log('\n== przegląd JS: własności składane i miejsca, które ustawiają je inline (plik: liczba miejsc)');
  for (const [prop, w] of [...wgWlasnosci].sort((a, b) => b[1].pary - a[1].pary)) {
    const pliki = [...w.pliki].filter(([, t]) => t.length);
    console.log(`  ${prop} (${w.pary} par): ${pliki.length ? pliki.map(([f, t]) => `${f}: ${t.length}`).join(', ') : 'brak'}`);
    if (flaga('--raport')) for (const [f, t] of pliki) for (const x of t.slice(0, 3)) console.log(`      ${f} …${x}…`);
  }
  process.exit(0);
}

if (sprawdz) process.exit(zlozone.length ? 1 : 0);
if (flaga('--zapisz') && !zlozone.length) process.exit(0);

if (flaga('--partiale')) {
  // Partiale design systemu doganiają arkusze: reguła skórki partiala, której złożona postać (selektory bez skórki,
  // deklaracje bez !important) istnieje w bieżącym arkuszu, jest składana tak samo — niezależnie od tego, czy arkusze
  // złożono w tym samym przebiegu, czy wcześniej.
  const { synchronizujPartial } = await import('../support/skorka-css.mjs');
  const katalog = path.join(korzen, 'design-system/src/partials');
  let reguly = 0;
  let deklaracje = 0;
  for (const plik of fs.readdirSync(katalog).filter((f) => f.endsWith('.css')).sort()) {
    const sciezka = path.join(katalog, plik);
    const wynik = synchronizujPartial(fs.readFileSync(sciezka, 'utf8'), analiza.arkusze);
    if (!wynik.reguly) continue;
    fs.writeFileSync(sciezka, wynik.text);
    reguly += wynik.reguly; deklaracje += wynik.deklaracje;
    console.log(`${plik}: złożono ${wynik.deklaracje} deklaracji w ${wynik.reguly} regułach`);
  }
  console.log(`partiale: złożono ${deklaracje} deklaracji w ${reguly} regułach; potem npm run design-system -- --update`);
  process.exit(0);
}

// złożenie w arkuszach
const wgArkusza = new Map();
for (const k of zlozone) { if (!wgArkusza.has(k.arkusz)) wgArkusza.set(k.arkusz, new Map()); const m = wgArkusza.get(k.arkusz); if (!m.has(k.regula)) m.set(k.regula, []); m.get(k.regula).push({ deklaracja: k.deklaracja, nr: k.nr }); }
let razem = 0;
for (const [arkusz, mapa] of wgArkusza) {
  const sciezka = path.join(korzen, arkusz);
  const wynik = zlozArkusz(fs.readFileSync(sciezka, 'utf8'), [...mapa].map(([regula, pary]) => ({ regula, pary })));
  fs.writeFileSync(sciezka, wynik.text);
  razem += wynik.deklaracje;
  console.log(`${arkusz}: złożono ${wynik.deklaracje} deklaracji w ${wynik.reguly} regułach`);
}
console.log(`złożono ${razem} deklaracji; teraz: node tests/scripts/zloz-skorke-css.mjs --partiale, npm run design-system -- --update, node tests/scripts/zloz-skorke-css.mjs --zapisz`);
