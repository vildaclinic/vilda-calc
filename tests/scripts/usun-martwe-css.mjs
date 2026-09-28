// P-STYLE rata 4a: usuwa z arkuszy aplikacji deklaracje bazowe martwe pod nadpisaniami skórki .liquid-ios26
// (nadpisanie !important tej samej własności o selektorze pokrywającym bazowy, w tym samym kontekście @-reguł,
// z tego samego arkusza albo z arkusza globalnego — ładowanego na każdej stronie). Reguły i parser:
// tests/support/szklo-css.mjs.
//
//   node tests/scripts/usun-martwe-css.mjs --sprawdz   # tylko raport (kod 1, gdy coś jest do usunięcia)
//   node tests/scripts/usun-martwe-css.mjs --raport    # jak --sprawdz, plus każda martwa deklaracja z selektorami
//   node tests/scripts/usun-martwe-css.mjs             # usunięcie w miejscu + raport
//   node tests/scripts/usun-martwe-css.mjs --partiale [--baza origin/audyt]
//       # partiale design systemu: usuwa reguły, które w bieżących źródłach już nie istnieją, a w rewizji bazowej
//       # istniały (czyli usunięte w całości przez tę ratę); resztę odświeża `npm run design-system -- --update`
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { arkuszeAplikacji, arkuszeZeStronami, korzen, martwePodArkuszami, martweWKaskadzie, parsuj, usunMartwe } from '../support/szklo-css.mjs';
import { canonicalSelectorList } from '../../design-system/lib/css.mjs';

const argumenty = process.argv.slice(2);
const flaga = (f) => argumenty.includes(f);
const opcja = (f, domyslna) => { const i = argumenty.indexOf(f); return i >= 0 && argumenty[i + 1] ? argumenty[i + 1] : domyslna; };
const sprawdz = flaga('--sprawdz') || flaga('--raport');

if (flaga('--partiale')) {
  const baza = opcja('--baza', 'origin/audyt');
  if (!/^[A-Za-z0-9_./~^-]{1,80}$/.test(baza)) { console.error('nieprawidłowa rewizja'); process.exit(2); }
  const klucz = (r) => `${r.kontekst.join('|')}::${canonicalSelectorList(r.prelude).join(',')}`;
  const zbior = (czytaj) => { const s = new Set(); for (const a of arkuszeAplikacji()) { let css; try { css = czytaj(a); } catch { continue; } for (const r of parsuj(css)) s.add(klucz(r)); } return s; };
  const teraz = zbior((a) => fs.readFileSync(path.join(korzen, a), 'utf8'));
  const wBazie = zbior((a) => execFileSync('git', ['show', `${baza}:${a}`], { cwd: korzen, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const katalog = path.join(korzen, 'design-system/src/partials');
  const globalne = arkuszeZeStronami().filter((a) => a.globalny);
  let razem = 0;
  let deklaracjeRazem = 0;
  for (const plik of fs.readdirSync(katalog).filter((f) => f.endsWith('.css')).sort()) {
    const sciezka = path.join(katalog, plik);
    let css = fs.readFileSync(sciezka, 'utf8');
    // 1) reguły, których nie ma już w źródłach, a były w rewizji bazowej — w całości
    const stale = parsuj(css).filter((r) => !teraz.has(klucz(r)) && wBazie.has(klucz(r)));
    if (stale.length) {
      const martwe = stale.flatMap((r) => r.deklaracje.map((d) => ({ regula: r, deklaracja: d, nadpisanie: null })));
      const wynikStale = usunMartwe(css, martwe);
      css = wynikStale.text;
      razem += wynikStale.reguly;
      console.log(`${plik}: usunięto reguł ${wynikStale.reguly}: ${stale.map((r) => r.prelude.slice(0, 60)).join(' | ').slice(0, 300)}`);
    }
    // 2) deklaracje martwe pod nadpisaniami skórki z arkuszy globalnych (partial składa reguły z wielu arkuszy;
    //    to, co usunięte nadmiarowo, przywraca `npm run design-system -- --update` z reguły źródłowej)
    const martwe = martwePodArkuszami(css, globalne);
    if (martwe.length) {
      const wynikDekl = usunMartwe(css, martwe);
      css = wynikDekl.text;
      deklaracjeRazem += wynikDekl.usuniete;
      razem += wynikDekl.reguly;
      console.log(`${plik}: usunięto ${wynikDekl.usuniete} deklaracji martwych pod skórką (w tym ${wynikDekl.reguly} całych reguł)`);
    }
    if (!sprawdz && (stale.length || martwe.length)) fs.writeFileSync(sciezka, css);
  }
  console.log(`partiale: ${sprawdz ? 'do usunięcia' : 'usunięto'} ${razem} całych reguł i ${deklaracjeRazem} deklaracji; potem npm run design-system -- --update`);
  process.exit(0);
}

const arkusze = arkuszeZeStronami();
const wynik = martweWKaskadzie(arkusze);
let razem = 0;
let regulyRazem = 0;
const wiersze = [];
const wlasnosci = new Map();
console.log(`arkusze globalne (na każdej stronie): ${arkusze.filter((a) => a.globalny).map((a) => a.nazwa).join(', ')}`);
for (const a of arkusze) {
  const { martwe } = wynik.get(a.nazwa);
  if (!martwe.length) continue;
  for (const m of martwe) wlasnosci.set(m.deklaracja.prop, (wlasnosci.get(m.deklaracja.prop) || 0) + 1);
  if (flaga('--raport')) {
    console.log(`\n== ${a.nazwa}`);
    for (const m of martwe) console.log(`  ${m.regula.kontekst.length ? `[${m.regula.kontekst.join(' » ')}] ` : ''}${m.regula.prelude.slice(0, 90)} { ${m.deklaracja.prop}: ${m.deklaracja.value}${m.deklaracja.important ? ' !important' : ''} }  ← ${m.nadpisanie.prelude.slice(0, 80)}`);
  }
  const { text, usuniete, reguly } = usunMartwe(a.css, martwe);
  razem += usuniete;
  regulyRazem += reguly;
  wiersze.push(`${a.nazwa}: deklaracji ${usuniete}, całych reguł ${reguly}`);
  if (!sprawdz) fs.writeFileSync(path.join(korzen, a.nazwa), text);
}
console.log(`${sprawdz ? 'do usunięcia' : 'usunięto'}: ${razem} martwych deklaracji (w tym ${regulyRazem} całych reguł)${wiersze.length ? `\n  ${wiersze.join('\n  ')}` : ''}`);
if (wlasnosci.size) console.log(`własności: ${[...wlasnosci].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ×${n}`).join(', ')}`);
if (sprawdz && razem) process.exit(1);
