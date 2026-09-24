// P-SW rata 1: odświeża tests/fixtures/wersje-zasobow.json (plik → najwyższe ?v= i SHA-256 treści).
// Uruchom PO podbiciu ?v= zmienionych plików. Bez --zapisz tylko wypisuje różnice.
import fs from 'node:fs';
import { biezaceWersje, PLIK_STANU, zapisaneWersje } from '../support/wersje-zasobow.mjs';

const teraz = biezaceWersje();
if (process.argv.includes('--zapisz')) {
  fs.writeFileSync(PLIK_STANU, `${JSON.stringify(teraz, null, 1)}\n`);
  console.log(`zapisano ${Object.keys(teraz).length} plików`);
} else {
  const dawniej = fs.existsSync(PLIK_STANU) ? zapisaneWersje() : {};
  for (const [plik, w] of Object.entries(teraz)) {
    const d = dawniej[plik];
    if (!d) console.log(`nowy: ${plik}?v=${w.v}`);
    else if (d.v === w.v && d.sha256 !== w.sha256) console.log(`BEZ PODBICIA: ${plik}?v=${w.v} — treść zmieniona`);
    else if (d.v !== w.v) console.log(`podbity: ${plik} ${d.v} → ${w.v}`);
  }
}
