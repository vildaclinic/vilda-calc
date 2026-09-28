// P-STYLE rata 3: zwija w arkuszach aplikacji (i partialach design systemu) triplety selektorów wysokiego kontrastu
// — body.high-contrast-level-1 X, body.high-contrast-level-2 X, body.high-contrast-level-3 X — do jednego selektora
// z :is(.high-contrast-level-1, .high-contrast-level-2, .high-contrast-level-3). Reguły: tests/support/tryby-css.mjs.
//
//   node tests/scripts/zwin-tryby-css.mjs --sprawdz   # tylko raport (kod 1, gdy coś jest do zwinięcia)
//   node tests/scripts/zwin-tryby-css.mjs             # zwinięcie w miejscu + raport
import fs from 'node:fs';
import path from 'node:path';
import { arkuszeAplikacji, korzen, zwinArkusz } from '../support/tryby-css.mjs';

const sprawdz = process.argv.includes('--sprawdz');
const partiale = path.join(korzen, 'design-system/src/partials');
const pliki = [
  ...arkuszeAplikacji().map((f) => path.join(korzen, f)),
  ...(fs.existsSync(partiale) ? fs.readdirSync(partiale).filter((f) => f.endsWith('.css')).sort().map((f) => path.join(partiale, f)) : []),
];
let razem = 0;
const wiersze = [];
for (const sciezka of pliki) {
  const css = fs.readFileSync(sciezka, 'utf8');
  const { text, zwiniete, reguly } = zwinArkusz(css);
  if (!zwiniete) continue;
  razem += zwiniete;
  wiersze.push(`${path.relative(korzen, sciezka)}: reguł ${reguly}, tripletów ${zwiniete}`);
  if (!sprawdz) fs.writeFileSync(sciezka, text);
}
console.log(`${sprawdz ? 'do zwinięcia' : 'zwinięto'}: ${razem} tripletów${wiersze.length ? `\n  ${wiersze.join('\n  ')}` : ''}`);
if (sprawdz && razem) process.exit(1);
