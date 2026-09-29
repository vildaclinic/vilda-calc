// P-STYLE krok 6: inwentarz progów @media i fixture strażnika.
//   node tests/scripts/breakpointy-css.mjs --sprawdz   # progi spoza tests/fixtures/breakpointy.json (kod 1, gdy są)
//   node tests/scripts/breakpointy-css.mjs --raport    # tabela progów z liczbą reguł i źródłami
//   node tests/scripts/breakpointy-css.mjs --zapisz    # zapisuje fixture (świadoma decyzja o nowym progu)
import fs from 'node:fs';
import path from 'node:path';
import { korzen } from '../support/szklo-css.mjs';
import { inwentarzBreakpointow } from '../support/breakpointy-css.mjs';

const argumenty = process.argv.slice(2);
const flaga = (f) => argumenty.includes(f);
const FIXTURE = path.join(korzen, 'tests/fixtures/breakpointy.json');
const { progi, zapytania } = inwentarzBreakpointow();
const teraz = [...progi.keys()];
if (flaga('--raport')) {
  for (const [p, e] of progi) console.log(`${p.padEnd(9)} reguł ${String(e.reguly).padStart(4)}  min ${e.min.size}  max ${e.max.size}  ${[...new Set([...e.min, ...e.max])].join(', ')}`);
  console.log('');
  for (const [q, e] of [...zapytania].sort((a, b) => b[1].reguly - a[1].reguly)) console.log(`${String(e.reguly).padStart(4)}  ${q}`);
}
console.log(`progi szerokości: ${teraz.length}; zapytań @media: ${zapytania.size}; reguł w @media z progiem: ${[...progi.values()].reduce((s, e) => s + e.reguly, 0)}`);
if (flaga('--zapisz')) {
  fs.writeFileSync(FIXTURE, `${JSON.stringify({ opis: 'Progi szerokości (min-width/max-width) używane w @media w arkuszach i blokach <style>. Nowa reguła używa progu z tej listy; nowy próg to decyzja (zmiana układu przy części szerokości okna) — po niej: node tests/scripts/breakpointy-css.mjs --zapisz. Krok 6 planu P-STYLE.', progi: teraz }, null, 2)}\n`);
  console.log(`zapisano ${path.relative(korzen, FIXTURE)}: ${teraz.length} progów`);
  process.exit(0);
}
const zapisane = fs.existsSync(FIXTURE) ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).progi : [];
const nowe = teraz.filter((p) => !zapisane.includes(p));
const zbedne = zapisane.filter((p) => !teraz.includes(p));
if (nowe.length) console.log(`progi spoza fixture: ${nowe.join(', ')}`);
if (zbedne.length) console.log(`progi z fixture już nieużywane: ${zbedne.join(', ')}`);
if (flaga('--sprawdz') && (nowe.length || zbedne.length)) process.exit(1);
