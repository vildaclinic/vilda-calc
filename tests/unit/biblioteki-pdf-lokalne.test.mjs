import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-RAPORT rata 5 (2026-09-22): jsPDF i html2canvas leżą w repozytorium, żeby raporty PDF działały
// offline i z ekranu głównego. Strażnik pilnuje trzech rzeczy: (1) ładowarka bierze plik lokalny
// PRZED CDN-em, (2) suma sha384 pliku lokalnego to dokładnie podpis SRI z ładowarki (ten sam, który
// weryfikował kopię z cdnjs — czyli plik jest bajt w bajt tym, co przychodziło z sieci),
// (3) oba pliki są w precache service workera i w notach licencyjnych.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');
const deps = czytaj('vilda_deps.js');

function biblioteka(nazwa) {
  const re = new RegExp(nazwa + ':\\{test:function\\(\\)\\{[^}]*\\},src:"\\/([^"?]+)\\?v=(\\d+)",fallback:"(https:\\/\\/cdnjs\\.cloudflare\\.com\\/[^"]+)",integrity:"(sha384-[^"]+)"\\}');
  const m = re.exec(deps);
  expect(m, 'wpis ładowarki dla ' + nazwa).toBeTruthy();
  return { plik: m[1], token: m[1] + '?v=' + m[2], cdn: m[3], sri: m[4] };
}

const sha384 = (p) => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(korzen, p))).digest('base64');

describe('Biblioteki PDF lokalnie (jsPDF, html2canvas)', () => {
  const libs = ['jspdf', 'html2canvas'].map(biblioteka);

  it('ładowarka wskazuje pliki lokalne, a CDN zostaje zapasem', () => {
    expect(libs.map((l) => l.plik)).toEqual(['jspdf.umd.min.js', 'html2canvas.min.js']);
    expect(libs[0].cdn).toContain('/jspdf/2.5.1/');
    expect(libs[1].cdn).toContain('/html2canvas/1.4.1/');
    // kolejność prób: najpierw local, potem cdn
    const i = deps.indexOf('skad:"local"'); const j = deps.indexOf('skad:"cdn"');
    expect(i).toBeGreaterThan(0); expect(j).toBeGreaterThan(i);
  });

  it('suma sha384 pliku lokalnego to podpis SRI z ładowarki', () => {
    for (const l of libs) {
      expect(fs.existsSync(path.join(korzen, l.plik)), l.plik).toBe(true);
      expect(sha384(l.plik), 'SRI ' + l.plik).toBe(l.sri);
    }
  });

  it('oba pliki są w precache service workera (append-only) i w notach licencyjnych', () => {
    const sw = czytaj('service-worker-kalorii.js');
    const noty = czytaj('THIRD_PARTY_NOTICES.md');
    for (const l of libs) {
      expect(sw, 'precache ' + l.token).toContain("'/" + l.token + "'");
      expect(noty, 'nota ' + l.plik).toContain('`' + l.plik + '`');
    }
    expect(noty).toContain('## jsPDF — MIT');
    expect(noty).toContain('## html2canvas — MIT');
  });
});
