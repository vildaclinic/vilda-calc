// P-STYLE krok 7: usuwa z arkuszy i bloków <style> stron reguły nieosiągalne (selektor z nazwą klasy/id nieobecną nigdzie
// w kodzie — tests/support/nieosiagalne-css.mjs).
//   node tests/scripts/usun-nieosiagalne-css.mjs --sprawdz   # raport liczb (kod 1, gdy coś jest do usunięcia)
//   node tests/scripts/usun-nieosiagalne-css.mjs --raport    # jak --sprawdz, plus każda reguła z nazwami
//   node tests/scripts/usun-nieosiagalne-css.mjs             # usuwa; potem: node tests/scripts/usun-martwe-css.mjs --partiale,
//                                                            # npm run design-system -- --update, node tests/scripts/zloz-skorke-css.mjs --zapisz
import fs from 'node:fs';
import path from 'node:path';
import { korzen } from '../support/szklo-css.mjs';
import { analizaNieosiagalnych, podmienBlok, usunNieosiagalne } from '../support/nieosiagalne-css.mjs';

const argumenty = process.argv.slice(2);
const flaga = (f) => argumenty.includes(f);
const sprawdz = flaga('--sprawdz') || flaga('--raport');

const { zrodla } = analizaNieosiagalnych();
let reguly = 0;
let deklaracje = 0;
let czesci = 0;
const nazwy = new Set();
const html = new Map(); // strona → tekst (bloki <style> podmieniane po kolei)
for (const z of zrodla) {
  const cale = z.opis.filter((o) => o.cala);
  const czesciowe = z.opis.filter((o) => !o.cala);
  if (!z.opis.length) continue;
  reguly += cale.length; deklaracje += z.martwe.length; czesci += z.martweCzesci.length;
  for (const o of z.opis) for (const n of o.nazwy) nazwy.add(n);
  console.log(`${z.id}: reguł nieosiągalnych ${cale.length} (deklaracji ${z.martwe.length}), części ${z.martweCzesci.length} z ${z.reguly} reguł`);
  if (flaga('--raport')) {
    for (const o of cale) console.log(`  ${o.kontekst.length ? `[${o.kontekst.join(' » ')}] ` : ''}${o.prelude.slice(0, 100)}  ← ${o.nazwy.join(', ')}`);
    for (const o of czesciowe) console.log(`  część: ${o.czesci.join(' | ').slice(0, 100)}  ← ${o.nazwy.join(', ')}`);
  }
  if (sprawdz) continue;
  const wynik = usunNieosiagalne(z);
  if (z.typ === 'style') {
    const strona = z.nazwa;
    const tekst = html.get(strona) || fs.readFileSync(path.join(korzen, strona), 'utf8');
    html.set(strona, podmienBlok(tekst, z.css, wynik.text));
  } else {
    fs.writeFileSync(path.join(korzen, z.nazwa), wynik.text);
  }
}
for (const [strona, tekst] of html) fs.writeFileSync(path.join(korzen, strona), tekst);
console.log(`${sprawdz ? 'do usunięcia' : 'usunięto'}: ${reguly} reguł nieosiągalnych (${deklaracje} deklaracji) i ${czesci} nieosiągalnych części selektorów; nazw nieobecnych w kodzie: ${nazwy.size}`);
if (sprawdz && (reguly || czesci)) process.exit(1);
if (!sprawdz && (reguly || czesci)) console.log('teraz: node tests/scripts/usun-martwe-css.mjs --partiale, npm run design-system -- --update, node tests/scripts/zloz-skorke-css.mjs --zapisz');
