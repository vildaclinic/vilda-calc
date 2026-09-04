import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Strażnik KLASY usterek, nie pojedynczego miejsca.
//
// `new Date(...).toISOString().slice(0, 10)` zwraca dzień W STREFIE UTC. W Polsce (UTC+1/+2)
// znaczy to, że między północą a 1:00/2:00 kod widzi dzień WCZORAJSZY, a data zbudowana lokalnie
// (np. `new Date(2020, 2, 15)` z pola „data urodzenia") cofa się o dobę ZAWSZE, o dowolnej porze.
//
// Przegląd 2026-09-04 znalazł tę formułę w czterech miejscach produkcyjnych:
//   • vilda_professional_module.js — data urodzenia wpisywana z powrotem do eksportu XLSX
//     (import „15.03.2020" wychodził jako „2020-03-14" — usterka danych, nie kosmetyka);
//   • clcr_ui_workflow.js — awaryjna ścieżka todayISO() w panelu „nowy pomiar: dziś …";
//   • vilda_epicrisis_ui.js, vilda_file_export.js — data w nazwie pobieranego pliku.
//
// Poprawna postać to idiom obecny już w cukrzyca.js: przesunięcie o offset strefy przed
// serializacją, czyli `new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString()`.
// Ten test wymaga, żeby KAŻDE wystąpienie formuły miało tuż przed sobą tę korektę.

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FORMULA = /toISOString\(\)\s*\.?\s*slice\(\s*0\s*,\s*10\s*\)/g;
const OKNO = 120; // znaków wstecz, w których musi stać korekta offsetu

function plikiProdukcyjne() {
  return execFileSync('git', ['ls-files', '*.js'], { cwd: KORZEN, encoding: 'utf8' })
    .split('\n')
    .filter((p) => p && !p.startsWith('tests/'));
}

describe('Lokalna doba — żaden plik produkcyjny nie formatuje dnia po UTC', () => {
  it('każde toISOString().slice(0, 10) jest poprzedzone korektą getTimezoneOffset()', () => {
    const winne = [];

    for (const wzgledna of plikiProdukcyjne()) {
      const tresc = fs.readFileSync(path.join(KORZEN, wzgledna), 'utf8');
      FORMULA.lastIndex = 0;
      let trafienie;
      while ((trafienie = FORMULA.exec(tresc)) !== null) {
        const przed = tresc.slice(Math.max(0, trafienie.index - OKNO), trafienie.index);
        if (!przed.includes('getTimezoneOffset')) {
          const wiersz = tresc.slice(0, trafienie.index).split('\n').length;
          winne.push(`${wzgledna}:${wiersz}  …${przed.slice(-70)}${trafienie[0]}`);
        }
      }
    }

    expect(winne, `dzień UTC zamiast lokalnego:\n${winne.join('\n')}`).toEqual([]);
  });

  it('strażnik nie jest pusty — formuła faktycznie występuje w kodzie produkcyjnym', () => {
    // Bez tej asercji test przechodziłby też wtedy, gdyby regex przestał cokolwiek dopasowywać.
    const liczba = plikiProdukcyjne().reduce((suma, wzgledna) => {
      const tresc = fs.readFileSync(path.join(KORZEN, wzgledna), 'utf8');
      return suma + (tresc.match(FORMULA) || []).length;
    }, 0);

    expect(liczba).toBeGreaterThanOrEqual(6);
  });
});
