// P-STYLE krok 5b: inwentarz stylów ustawianych wprost na elementach (atrybuty style= w HTML, zapisy stylu w JS) i fixture
// strażnika (tests/fixtures/style-elementow.json; moduł tests/support/style-elementow.mjs).
//   node tests/scripts/style-elementow.mjs --sprawdz   # różnice względem fixture (kod 1, gdy przybyło albo ubyło)
//   node tests/scripts/style-elementow.mjs --raport    # liczby per plik, najczęstsze wartości style=, rodzaje miejsc w JS
//   node tests/scripts/style-elementow.mjs --zapisz    # zapisuje fixture (po świadomej decyzji albo po zmniejszeniu liczb)
import fs from 'node:fs';
import path from 'node:path';
import { atrybutyStyle, doFixture, inwentarzStyliElementow, korzen, porownaj } from '../support/style-elementow.mjs';

const argumenty = process.argv.slice(2);
const flaga = (f) => argumenty.includes(f);
const FIXTURE = path.join(korzen, 'tests/fixtures/style-elementow.json');
const inw = inwentarzStyliElementow();
const sumaStron = Object.values(inw.strony).reduce((s, v) => s + v, 0);
const sumaJs = Object.values(inw.js).reduce((s, v) => s + v.razem, 0);
const zminifikowane = Object.keys(inw.js).filter((f) => fs.readFileSync(path.join(korzen, f), 'utf8').split('\n').some((l) => l.length > 2000));
const wZminifikowanych = zminifikowane.reduce((s, f) => s + inw.js[f].razem, 0);
if (flaga('--raport')) {
  console.log('atrybuty style= per strona:');
  for (const [s, n] of Object.entries(inw.strony).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${s}`);
  const wartosci = new Map();
  for (const s of Object.keys(inw.strony)) for (const a of atrybutyStyle(fs.readFileSync(path.join(korzen, s), 'utf8'))) wartosci.set(a.wartosc, (wartosci.get(a.wartosc) || 0) + 1);
  console.log(`najczęstsze wartości (${wartosci.size} unikalnych):`);
  for (const [v, n] of [...wartosci].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(n).padStart(4)}× ${v.slice(0, 110)}`);
  console.log('miejsca w JS per plik (el.style.x = / cssText / setProperty / setAttribute style / style="…" w łańcuchu):');
  for (const [f, m] of Object.entries(inw.js).sort((a, b) => b[1].razem - a[1].razem)) console.log(`  ${String(m.razem).padStart(4)}  ${f}${zminifikowane.includes(f) ? ' [zminifikowany]' : ''}  (${m.wlasnosc}/${m.cssText}/${m.setProperty}/${m.atrybut}/${m.lancuch})`);
}
console.log(`atrybuty style=: ${sumaStron} na ${Object.keys(inw.strony).length} stronach; miejsca zapisu stylu w JS: ${sumaJs} w ${Object.keys(inw.js).length} plikach (w zminifikowanych: ${wZminifikowanych} w ${zminifikowane.length})`);
if (flaga('--zapisz')) {
  const dane = { opis: 'Style ustawiane wprost na elementach: liczba atrybutów style= na stronach i miejsc zapisu stylu elementu w JS (el.style.x =, cssText, setProperty, setAttribute style, style="…" w łańcuchu). Liczby nie mogą rosnąć — nowy styl idzie do klasy w arkuszu; wyjątek to świadoma decyzja, po której: node tests/scripts/style-elementow.mjs --zapisz (także po zmniejszeniu liczb). Krok 5b planu P-STYLE.', ...doFixture(inw) };
  fs.writeFileSync(FIXTURE, `${JSON.stringify(dane, null, 2)}\n`);
  console.log(`zapisano ${path.relative(korzen, FIXTURE)}`);
  process.exit(0);
}
const zapisane = fs.existsSync(FIXTURE) ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) : { strony: {}, js: {} };
const { przybylo, ubylo } = porownaj(inw, zapisane);
if (przybylo.length) console.log(`przybyło:\n  ${przybylo.join('\n  ')}`);
if (ubylo.length) console.log(`ubyło (odśwież fixture):\n  ${ubylo.join('\n  ')}`);
if (flaga('--sprawdz') && (przybylo.length || ubylo.length)) process.exit(1);
