// P-STYLE rata 1: dowód, że sformatowany arkusz jest dla przeglądarki TYM SAMYM arkuszem.
// Obie wersje pliku są parsowane przez Chromium (CSSStyleSheet.replaceSync), a listy reguł
// są serializowane (cssText, rekurencyjnie przez reguły zagnieżdżone) i porównywane 1:1.
// Porównanie nie polega na własnym parserze — wyrocznią jest silnik przeglądarki.
//
//   node tests/scripts/porownaj-cssom.mjs --baza <ref-gita> [plik.css ...]
//     porównuje pliki robocze z ich wersją z podanej rewizji (domyślnie wszystkie arkusze aplikacji)
//   node tests/scripts/porownaj-cssom.mjs a.css b.css
//     porównuje dwa pliki
// Kod wyjścia 1 przy jakiejkolwiek różnicy. Wymaga Chromium Playwrighta.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { arkuszeAplikacji, korzen } from './formatuj-css.mjs';

const require = createRequire(path.join(korzen, 'package.json'));
const { chromium } = require('playwright');

const argumenty = process.argv.slice(2);
const iBaza = argumenty.indexOf('--baza');
const baza = iBaza >= 0 ? argumenty[iBaza + 1] : null;
const pliki = argumenty.filter((a, i) => !a.startsWith('--') && (iBaza < 0 || i !== iBaza + 1));
if (baza && !/^[A-Za-z0-9_./~^-]{1,80}$/.test(baza)) { console.error('nieprawidłowa rewizja'); process.exit(2); }

function wRepo(p) {
  const s = path.resolve(korzen, p);
  if (!s.startsWith(`${korzen}${path.sep}`)) { console.error(`poza repozytorium: ${p}`); process.exit(2); }
  return s;
}

/** Pary [nazwa, tekstA, tekstB] do porównania. */
function pary() {
  if (baza) {
    const lista = pliki.length ? pliki : arkuszeAplikacji();
    return lista.map((p) => {
      const rel = path.relative(korzen, wRepo(p)).split(path.sep).join('/');
      const dawny = execFileSync('git', ['show', `${baza}:${rel}`], { cwd: korzen, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      return [rel, dawny, fs.readFileSync(wRepo(p), 'utf8')];
    });
  }
  if (pliki.length !== 2) { console.error('podaj --baza <ref> albo dokładnie dwa pliki'); process.exit(2); }
  return [[`${pliki[0]} ↔ ${pliki[1]}`, fs.readFileSync(wRepo(pliki[0]), 'utf8'), fs.readFileSync(wRepo(pliki[1]), 'utf8')]];
}

const opcje = { args: ['--no-sandbox'] };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) opcje.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const przegladarka = await chromium.launch(opcje);
const strona = await przegladarka.newPage();
await strona.setContent('<!doctype html><html lang="pl"><head><meta charset="utf-8"></head><body></body></html>');

let roznice = 0;
for (const [nazwa, a, b] of pary()) {
  const wynik = await strona.evaluate(([ta, tb]) => {
    const splaszcz = (reguly, out) => {
      for (const r of reguly) {
        out.push(r.cssText);
        if (r.cssRules) splaszcz(r.cssRules, out);
      }
      return out;
    };
    const parsuj = (tekst) => { const s = new CSSStyleSheet(); s.replaceSync(tekst); return splaszcz(s.cssRules, []); };
    const ra = parsuj(ta);
    const rb = parsuj(tb);
    let pierwsza = -1;
    for (let i = 0; i < Math.max(ra.length, rb.length); i++) if (ra[i] !== rb[i]) { pierwsza = i; break; }
    return { a: ra.length, b: rb.length, pierwsza, fragmentA: pierwsza >= 0 ? String(ra[pierwsza]).slice(0, 300) : '', fragmentB: pierwsza >= 0 ? String(rb[pierwsza]).slice(0, 300) : '' };
  }, [a, b]);
  const rowne = wynik.pierwsza < 0 && wynik.a === wynik.b;
  if (!rowne) roznice++;
  console.log(`${rowne ? 'OK ' : 'RÓŻNICA'} ${nazwa}: ${wynik.a} reguł ↔ ${wynik.b} reguł${rowne ? '' : `\n  pierwsza różnica przy regule ${wynik.pierwsza}:\n  A: ${wynik.fragmentA}\n  B: ${wynik.fragmentB}`}`);
}
await przegladarka.close();
console.log(roznice ? `${roznice} arkuszy różni się w CSSOM` : 'CSSOM identyczny dla wszystkich porównań');
process.exit(roznice ? 1 : 0);
