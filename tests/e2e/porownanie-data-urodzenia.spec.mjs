import { test } from '../support/test-czas.mjs';
import { kartaPoWczytaniu, sprawdzKarte } from '../support/porownanie-data-urodzenia.mjs';

// P-POROWNANIE-DATA (polecenie właściciela 2026-10-13): po wczytaniu pacjenta karta „Porównanie z poprzednim
// pomiarem” liczy centyl wzrostu „Poprzednio” z wieku dokładnego od pierwszej klatki, niezależnie od tego, czy odczyt
// z sejfu wyprzedzi wpis daty urodzenia. Zmierzone przed zmianą (CI #659, desktop): karta z wczytania pokazywała
// 39. centyl (pełne miesiące), a dopiero pierwsza synchronizacja 38. (wiek dokładny). Telefon:
// porownanie-data-urodzenia-mobile.spec.mjs. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PorownanieData!26';

test('wyścig wymuszony (data urodzenia 400 ms po odczycie z sejfu): „Poprzednio” z wieku dokładnego w każdej klatce, od pierwszej', async ({ page }) => {
  test.setTimeout(150_000);
  sprawdzKarte(await kartaPoWczytaniu(page, HASLO, { wymusWyscig: true }), 'wyścig wymuszony');
});

test('zwykłe tempo: karta z wczytania taka sama jak po przyjęciu daty', async ({ page }) => {
  test.setTimeout(150_000);
  sprawdzKarte(await kartaPoWczytaniu(page, HASLO, { wymusWyscig: false }), 'zwykłe tempo');
});
