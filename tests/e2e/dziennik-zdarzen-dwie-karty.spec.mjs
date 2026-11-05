// P-DZIENNIK-ZDARZEN (E2-PR3a1) — „Usuń konto” przy drugiej karcie z tym samym kontem w prawdziwym Chromium: po
// removeUser nie zostaje baza kolejki zmian konta (vilda_sync_<userId>), identyfikator urządzenia ani znacznik
// ponowienia, także gdy druga karta dopisywała w trakcie (kasowanie czeka na blokadę Web Locks vilda-sync-db:<userId>);
// kasowanie zablokowane obcym połączeniem zostawia znacznik, który znika przy odblokowaniu po dokończeniu kasowania.
// Warunek wstępny pierwszego scenariusza: zapisany już identyfikator urządzenia konta przed „Usuń konto”.
// Bez warunku wstępnego: baza kolejki drugiej karty powstaje w trakcie czekania na blokadę; po removeUser nie ma bazy
// ani znacznika (identyfikator urządzenia sprawdza scenariusz z warunkiem wstępnym).
// Dwie strony w jednym kontekście przeglądarki na https://dwie-karty.invalid/ (route z plików repozytorium, bez serwera
// testów); scenariusze i literały w tests/support/dwie-karty-chromium.mjs (ten sam moduł sprawdza się lokalnie
// z wiersza poleceń). Skrypt startowy karty B zamyka jej połączenia z bazą sejfu przy versionchange (karta B zwalnia
// bazę sejfu) i wstrzymuje crypto.subtle.encrypt na żądanie scenariusza. Dane wyłącznie fikcyjne.
import { expect, test } from '@playwright/test';
import {
  OCZEKIWANE_BAZA_W_TRAKCIE, OCZEKIWANE_ZABLOKOWANA, OCZEKIWANE_Z_BLOKADA, dwieKartyBazaWTrakcie, dwieKartyZBlokada,
  dwieKartyZablokowana, otworz, skryptKartyB, trasyStrony,
} from '../support/dwie-karty-chromium.mjs';

const HASLO = 'Fikcyjne#DwieKarty!2026dk';

async function dwieKarty(context) {
  await trasyStrony(context);
  const a = await context.newPage();
  const b = await context.newPage();
  await b.addInitScript(skryptKartyB);
  await otworz(a);
  await otworz(b);
  return { a, b };
}

test.describe('Dziennik zdarzeń: „Usuń konto” przy drugiej karcie z tym samym kontem', () => {
  test('karta B dopisuje (szyfrowanie wstrzymane), karta A usuwa konto i czeka na blokadę — po końcu brak bazy kolejki, identyfikatora urządzenia i znacznika; dopisanie B ok', async ({ context }) => {
    const { a, b } = await dwieKarty(context);
    expect(await dwieKartyZBlokada(a, b, { haslo: HASLO })).toEqual(OCZEKIWANE_Z_BLOKADA);
  });

  test('bez warunku wstępnego: pierwsze dopisanie karty B (szyfrowanie wstrzymane) zakłada bazę kolejki, gdy karta A czeka na blokadę przy usuwaniu konta — po końcu brak bazy kolejki i znacznika; dopisanie B ok', async ({ context }) => {
    const { a, b } = await dwieKarty(context);
    expect(await dwieKartyBazaWTrakcie(a, b, { haslo: HASLO })).toEqual(OCZEKIWANE_BAZA_W_TRAKCIE);
  });

  test('karta B trzyma połączenie z bazą kolejki bez obsługi versionchange — kasowanie zablokowane zostawia znacznik; po zamknięciu połączenia i odblokowaniu innego konta brak bazy i znacznika', async ({ context }) => {
    const { a, b } = await dwieKarty(context);
    expect(await dwieKartyZablokowana(a, b, { haslo: HASLO })).toEqual(OCZEKIWANE_ZABLOKOWANA);
  });
});
