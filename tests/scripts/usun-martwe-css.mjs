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
import { wiedzaDom } from '../support/wiedza-dom.mjs';
import { zrodlaStron } from '../support/skorka-css.mjs';
import { canonicalSelectorList } from '../../design-system/lib/css.mjs';

const argumenty = process.argv.slice(2);
const flaga = (f) => argumenty.includes(f);
const opcja = (f, domyslna) => { const i = argumenty.indexOf(f); return i >= 0 && argumenty[i + 1] ? argumenty[i + 1] : domyslna; };
const sprawdz = flaga('--sprawdz') || flaga('--raport');
const wiedza = wiedzaDom();

if (flaga('--partiale')) {
  const baza = opcja('--baza', 'origin/audyt');
  if (!/^[A-Za-z0-9_./~^-]{1,80}$/.test(baza)) { console.error('nieprawidłowa rewizja'); process.exit(2); }
  // reguła partiala odpowiada regule arkusza, gdy jej kanoniczne części są podzbiorem części reguły arkusza w tym samym
  // kontekście (tak dopasowuje producent; partial bywa wycinkiem listy selektorów)
  // źródła: arkusze aplikacji i bloki <style> stron (partiale producenta powstają z obu; krok 7 usuwa reguły także z bloków)
  const lista = (czytaj) => {
    const s = [];
    const dodaj = (css) => { for (const r of parsuj(css)) s.push({ kontekst: r.kontekst.join('|'), czesci: new Set(canonicalSelectorList(r.prelude)) }); };
    for (const a of arkuszeAplikacji()) { let css; try { css = czytaj(a); } catch { continue; } dodaj(css); }
    let strony; try { strony = zrodlaStron(czytaj); } catch { strony = new Map(); }
    for (const zr of strony.values()) for (const z of zr) if (z.typ === 'style') dodaj(z.css);
    return s;
  };
  const zawiera = (lista, r) => { const k = r.kontekst.join('|'); const cz = canonicalSelectorList(r.prelude); return cz.length > 0 && lista.some((x) => x.kontekst === k && cz.every((c) => x.czesci.has(c))); };
  const terazLista = lista((a) => fs.readFileSync(path.join(korzen, a), 'utf8'));
  const wBazieLista = lista((a) => execFileSync('git', ['show', `${baza}:${a}`], { cwd: korzen, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const teraz = { has: (r) => zawiera(terazLista, r) };
  const wBazie = { has: (r) => zawiera(wBazieLista, r) };
  const klucz = (r) => r;
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
    // 2) deklaracje martwe pod nadpisaniami skórki z arkuszy globalnych — tylko w regułach pochodzących z arkuszy
    //    (reguły z bloków <style> i z JS zostają: ich źródła nie były czyszczone; to, co usunięte nadmiarowo, przywraca
    //    `npm run design-system -- --update` z reguły źródłowej)
    const martwe = martwePodArkuszami(css, globalne, wiedza).filter((m) => teraz.has(m.regula));
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
const wynik = martweWKaskadzie(arkusze, wiedza);
let razem = 0;
let regulyRazem = 0;
let czesciRazem = 0;
const wiersze = [];
const wlasnosci = new Map();
console.log(`arkusze globalne (na każdej stronie): ${arkusze.filter((a) => a.globalny).map((a) => a.nazwa).join(', ')}`);
for (const a of arkusze) {
  const { martwe, martweCzesci } = wynik.get(a.nazwa);
  if (!martwe.length && !martweCzesci.length) continue;
  for (const m of martwe) wlasnosci.set(m.deklaracja.prop, (wlasnosci.get(m.deklaracja.prop) || 0) + 1);
  if (flaga('--raport')) {
    console.log(`\n== ${a.nazwa}`);
    for (const m of martwe) console.log(`  ${m.regula.kontekst.length ? `[${m.regula.kontekst.join(' » ')}] ` : ''}${m.regula.prelude.slice(0, 90)} { ${m.deklaracja.prop}: ${m.deklaracja.value}${m.deklaracja.important ? ' !important' : ''} }  ← ${m.nadpisanie.prelude.slice(0, 80)}`);
    for (const c of martweCzesci) console.log(`  część #${c.nr} ${c.regula.prelude.slice(0, 90)}  ← ${c.nadpisanie.prelude.slice(0, 80)}`);
  }
  const { text, usuniete, reguly, czesci } = usunMartwe(a.css, martwe, martweCzesci);
  razem += usuniete;
  regulyRazem += reguly;
  czesciRazem += czesci;
  wiersze.push(`${a.nazwa}: deklaracji ${usuniete}, całych reguł ${reguly}, martwych części selektorów ${czesci}`);
  if (!sprawdz) fs.writeFileSync(path.join(korzen, a.nazwa), text);
}
console.log(`${sprawdz ? 'do usunięcia' : 'usunięto'}: ${razem} martwych deklaracji (w tym ${regulyRazem} całych reguł) i ${czesciRazem} martwych części selektorów${wiersze.length ? `\n  ${wiersze.join('\n  ')}` : ''}`);
if (wlasnosci.size) console.log(`własności: ${[...wlasnosci].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ×${n}`).join(', ')}`);
if (sprawdz && (razem || czesciRazem)) process.exit(1);
