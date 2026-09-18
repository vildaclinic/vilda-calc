import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-NOTATKI rata 3, znalezisko G25 — decyzja kliniczna nie może mieszkać wyłącznie w komentarzu testu.
//
// Dziewięć rat audytu sekcji „Pacjenci" (PR #204–#212, SW 1.0.840 → 1.0.848) nie zostawiło
// w docs/clinical/ALGORITHMS.md ani jednej linii. Kosztowało to konkretnie: decyzja z Raty C
// („notatka ogólna JEST widoczna w Historii") była zapisana tylko w komentarzu testu, więc edytor
// przez dwanaście dni obiecywał coś przeciwnego — aż wyszło to jako znalezisko G10 w racie 2.
//
// Reguła jest HIGIENICZNA, nie szczelna: obchodzi się ją, nazywając plik inaczej. Jej zadaniem
// jest złapać typowy przypadek — nowy strażnik Karty pacjenta dopisany bez wpisu w rejestrze.
// Zmierzone przed dopisaniem rozdziału: 7 z 12 plików o tym prefiksie nie było w rejestrze
// cytowanych ani razu.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rejestr = readFileSync(path.join(korzen, 'docs/clinical/ALGORITHMS.md'), 'utf8');

const strazniki = [
  ...readdirSync(path.join(korzen, 'tests/unit')).filter((f) => f.startsWith('karta-pacjenta-')),
  ...readdirSync(path.join(korzen, 'tests/e2e')).filter((f) => f.startsWith('karta-pacjenta-')),
];

describe('G25 — rejestr zna strażników Karty pacjenta', () => {
  it('pliki o tym prefiksie w ogóle istnieją (kontrola samej reguły)', () => {
    expect(strazniki.length).toBeGreaterThanOrEqual(12);
  });

  for (const plik of strazniki) {
    it(`${plik} jest cytowany w ALGORITHMS.md`, () => {
      expect(rejestr, `dopisz decyzję, której pilnuje ${plik}, do docs/clinical/ALGORITHMS.md`)
        .toContain(plik);
    });
  }

  it('rozdział o serii #204–#212 stoi w rejestrze i niesie decyzje, nie tylko numery', () => {
    expect(rejestr).toContain('## Sekcja „Pacjenci" i Karta pacjenta — raty A–D');
    // Trzy decyzje właściciela, które ta seria ustaliła i które kod nadal realizuje.
    expect(rejestr, 'Rata B — centyl w wieku pomiaru').toContain('Centyl liczymy tylko w wieku pomiaru');
    expect(rejestr, 'H3 — progi przerwy w pomiarach wg wieku')
      .toContain('3 miesiące do 2. roku życia, 6 miesięcy od 2 do 5 lat, 12 miesięcy powyżej');
    expect(rejestr, 'P14 — porównujemy treść, nie identyfikator wersji').toContain('baselinePayload');
  });

  it('rozdział mówi wprost, czego nie ustalono', () => {
    expect(rejestr).toContain('Numery **H4 i H5** nie występują nigdzie w repozytorium');
  });
});
