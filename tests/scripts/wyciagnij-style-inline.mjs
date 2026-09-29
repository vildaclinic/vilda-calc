// P-STYLE krok 5a: wyciąga bloki <style> ze stron do arkuszy linkowanych w tym samym miejscu dokumentu
// (tests/support/style-inline.mjs). Nowy arkusz dostaje ?v=1; wersje PWA (precache, SW_VERSION) i formatowanie
// (npm run css:formatuj) to kolejne kroki.
//   node tests/scripts/wyciagnij-style-inline.mjs --sprawdz   # strony z blokami <style> (kod 1, gdy jakaś jest)
//   node tests/scripts/wyciagnij-style-inline.mjs --raport    # plan: segmenty, powody podziału, arkusze
//   node tests/scripts/wyciagnij-style-inline.mjs             # zapisuje arkusze i strony
import fs from 'node:fs';
import path from 'node:path';
import { ARKUSZ_WSPOLNY, BLOK_WSPOLNY, korzen, planRepozytorium, zastosuj } from '../support/style-inline.mjs';

const argumenty = process.argv.slice(2);
const flaga = (f) => argumenty.includes(f);
const sprawdz = flaga('--sprawdz') || flaga('--raport');

const plany = planRepozytorium();
let bloki = 0;
let arkusze = 0;
const pliki = new Map();
for (const [strona, { html, plan }] of plany) {
  const n = plan.reduce((s, p) => s + p.bloki.length, 0);
  bloki += n;
  console.log(`${strona}: ${n} bloków <style> → ${plan.map((p) => p.linki.join(' + ')).join(', ')}`);
  for (const p of plan) {
    for (const [nazwa, css] of Object.entries(p.pliki)) {
      if (pliki.has(nazwa) && pliki.get(nazwa) !== css) throw new Error(`${nazwa}: dwie różne treści`);
      pliki.set(nazwa, css);
    }
    if (flaga('--raport')) {
      const reguly = p.bloki.reduce((s, b) => s + (b.css.match(/\{/g) || []).length, 0);
      console.log(`  linia ${p.bloki[0].linia}${p.bloki.length > 1 ? `–${p.bloki[p.bloki.length - 1].linia} (${p.bloki.length} bloki)` : ''} ${p.bloki[0].wHead ? '<head>' : '<body>'}: ${reguly} reguł → ${p.linki.join(' + ')} [${p.powod}]`);
    }
  }
  if (sprawdz) continue;
  fs.writeFileSync(path.join(korzen, strona), zastosuj(html, plan));
}
if (plany.size && [...plany.values()].some(({ plan }) => plan.some((p) => p.linki.includes(ARKUSZ_WSPOLNY)))) pliki.set(ARKUSZ_WSPOLNY, `${BLOK_WSPOLNY}\n`);
if (!sprawdz) {
  for (const [nazwa, css] of pliki) {
    const p = path.join(korzen, nazwa);
    if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') !== css) throw new Error(`${nazwa}: istnieje z inną treścią`);
    fs.writeFileSync(p, css);
    arkusze++;
  }
}
console.log(`${sprawdz ? 'do wyciągnięcia' : 'wyciągnięto'}: ${bloki} bloków <style> z ${plany.size} stron do ${pliki.size} arkuszy${sprawdz ? '' : ` (zapisano ${arkusze})`}`);
if (sprawdz && bloki) process.exit(1);
if (!sprawdz && bloki) console.log('teraz: npm run css:formatuj, precache i SW_VERSION w service-worker-kalorii.js (+ pin klirens-ui-model), node tests/scripts/wersje-zasobow.mjs --zapisz, npm run design-system -- --update');
