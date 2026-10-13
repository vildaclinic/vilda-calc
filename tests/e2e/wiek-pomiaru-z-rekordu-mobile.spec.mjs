import { expect, test } from '../support/test-czas.mjs';
import {
  etykietyKontrolne, etykietyRozne, kontoPro, medianyWDobie, wczytajNowyPomiar, wlaczProbnik, zapiszPacjenta, zatrzymajProbnik,
} from '../support/wiek-pomiaru-z-rekordu.mjs';

// P-WIEK-POMIARU na widoku telefonu (projekt mobile-chromium): kolumna „Poprzednio" jest tu ukryta,
// a centyl poprzedniego pomiaru stoi w dopisku „było …" kolumny „Dziś". Ten sam przypadek co na
// desktopie (wiek-pomiaru-z-rekordu.spec.mjs): pomiar z 5. doby, wczytany w 15. dobie. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#WiekPomiaruMobile!26';

test('telefon: dopisek „było …" z centylem pomiaru w jego wieku, bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(150_000);
  await kontoPro(page, HASLO);
  const { dlugosc, masa } = await medianyWDobie(page, 5);
  const pid = await zapiszPacjenta(page, { nazwisko: 'Wczesny', dobISO: '2026-06-02', dataPomiaru: '2026-06-07', dlugosc, masa });
  const k = await etykietyKontrolne(page, { dlugosc, masa, dobaPomiaru: 5, dobaFormularza: 15 });
  etykietyRozne(k, 'telefon');

  await wlaczProbnik(page);
  await wczytajNowyPomiar(page, pid);
  await expect(page.locator('#dobInput')).toHaveValue('02-06-2026', { timeout: 15000 });
  // Dopisek „było …" wypełnia się, gdy formularz ma bieżący pomiar; tu wystarczy wartość z wczytania.
  await expect(page.locator('#prevSummaryContent tr[data-klucz="wzrost"] .pt-kol-poprzednio .pt-s'))
    .toHaveText(k.wzrost.wlasny, { timeout: 15000 });
  await page.waitForFunction(() => window.__wiekProbnik.klatki.filter((x) => x.data).length >= 3, null, { timeout: 15000 });
  const P = await zatrzymajProbnik(page);
  const zle = P.klatki.filter((x) => x.wzrost !== k.wzrost.wlasny
    || (x.byloWzrost && !x.byloWzrost.endsWith(k.wzrost.wlasny)));
  expect(zle.slice(0, 3), '„Poprzednio" i „było …" w wieku pomiaru, w każdej klatce').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'bez poziomego przewijania').toBe(true);
});
