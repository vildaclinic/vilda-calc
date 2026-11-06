// P-DZIENNIK-ZDARZEN (E2-PR3a1), P-USUN-KONTO-KARTY (E2-PR3a1b) — „Usuń konto” przy drugiej karcie z tym samym kontem
// w prawdziwym Chromium: po removeUser nie zostaje baza kolejki zmian konta (vilda_sync_<userId>), identyfikator
// urządzenia ani znacznik ponowienia, także gdy druga karta dopisywała w trakcie (kasowanie czeka na blokadę Web Locks
// vilda-sync-db:<userId>; druga karta po kasowaniu bazy sejfu jest zablokowana); kasowanie zablokowane obcym połączeniem
// zostawia znacznik, który znika przy odblokowaniu po dokończeniu kasowania. Druga karta zamyka połączenie z bazą sejfu
// konta sama: „Usuń konto” nie czeka na kartę zalogowaną, logowanie w toku kończy się odmową ACCOUNT_REMOVED, nowsza
// wersja bazy w innej karcie daje APP_UPDATED, okno pytania w drugiej karcie opóźnia usunięcie do odpowiedzi,
// a kasowanie bazy narzędziami przeglądarki blokuje drugą kartę.
// Dwie strony w jednym kontekście przeglądarki na https://dwie-karty.invalid/ (route z plików repozytorium, bez serwera
// testów); scenariusze KA1–KA7 i literały w tests/support/dwie-karty-chromium.mjs (lista SCENARIUSZE; ten sam moduł
// sprawdza się lokalnie z wiersza poleceń). Skrypt startowy karty B wstrzymuje crypto.subtle.encrypt i decrypt na
// żądanie scenariusza i liczy zamknięcia połączeń z bazą sejfu konta (sam ich nie zamyka). Dane wyłącznie fikcyjne.
import { expect, test } from '@playwright/test';
import { SCENARIUSZE, otworz, skryptKartyB, trasyStrony } from '../support/dwie-karty-chromium.mjs';

const HASLO = 'Fikcyjne#DwieKarty!2026dk';
const OPISY = {
  KA1: 'karta B dopisuje (szyfrowanie wstrzymane), karta A usuwa konto i czeka na blokadę — po końcu brak bazy kolejki, identyfikatora urządzenia i znacznika w obu kartach; dopisanie B → zablokowany',
  KA2: 'bez warunku wstępnego: pierwsze dopisanie karty B (szyfrowanie wstrzymane) zakłada bazę kolejki, gdy karta A czeka na blokadę przy usuwaniu konta — po końcu brak bazy kolejki, identyfikatora urządzenia i znacznika w obu kartach; dopisanie B → zablokowany',
  KA3: 'karta B trzyma połączenie z bazą kolejki bez obsługi versionchange — kasowanie zablokowane zostawia znacznik; po zamknięciu połączenia i odblokowaniu innego konta brak bazy i znacznika',
  KA4: 'karta B zalogowana bez operacji — „Usuń konto” w karcie A kończy w < 2 s, karta B zablokowana (user-removed-elsewhere); na liście baz tylko bazy wspólne strony',
  KA5: 'logowanie w karcie B w toku (odszyfrowanie wstrzymane), karta A usuwa konto — ACCOUNT_REMOVED z tekstem, blokada user-removed, bez sesji',
  KA6: 'nowsza wersja bazy sejfu konta otwarta w innej karcie — bez blocked w < 2 s; karta B → APP_UPDATED; nowa karta: logowanie → APP_UPDATED',
  KA7: 'okno pytania w karcie B — „Usuń konto” czeka do odpowiedzi, potem kończy; kasowanie bazy sejfu narzędziami przeglądarki — karta B zablokowana w < 2 s, baza nie wraca',
};

async function dwieKarty(context) {
  await trasyStrony(context);
  const a = await context.newPage();
  const b = await context.newPage();
  await b.addInitScript(skryptKartyB);
  await otworz(a);
  await otworz(b);
  return { a, b };
}

test.describe('Dziennik zdarzeń i sejf: „Usuń konto” przy drugiej karcie z tym samym kontem', () => {
  for (const [nazwa, scenariusz, oczekiwane] of SCENARIUSZE) {
    test(`${nazwa}: ${OPISY[nazwa]}`, async ({ context }) => {
      const { a, b } = await dwieKarty(context);
      expect(await scenariusz(a, b, { haslo: HASLO })).toEqual(oczekiwane);
    });
  }
});
