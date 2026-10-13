import { expect, test } from '../support/test-czas.mjs';
import {
  etykietyKontrolne, etykietyRozne, kontoPro, medianyWDobie, wczytajNowyPomiar, wlaczProbnik, zapiszPacjenta, zatrzymajProbnik,
} from '../support/wiek-pomiaru-z-rekordu.mjs';

// P-WIEK-POMIARU (polecenie właściciela 2026-10-13): pomiar zapisany liczy się w SWOIM wieku.
//
// Ustalenie 1 — karta porównania: chłopiec urodzony 2026-06-02, pomiar zapisany 2026-06-07 (5. doba)
// na medianie WHO, wczytany 2026-06-17 (15. doba, ten sam miesiąc życia). Dotąd kolumna „Poprzednio"
// liczyła tamten pomiar w dzisiejszej dobie dziecka z formularza (≈ 20. centyl długości).
//
// Ustalenie 2 — Karta Pacjenta: w formularzu dziecko w 25. dobie (pacjent A), a Karta pokazuje
// innego chłopca (B) zmierzonego w 3. dobie na medianie. Dotąd kafelki B liczyły się w dobie A
// (≈ 4. centyl długości).
//
// Telefon: wiek-pomiaru-z-rekordu-mobile.spec.mjs. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#WiekPomiaru!26a';

test('karta porównania: „Poprzednio" w wieku pomiaru z rekordu, w każdej klatce, niezależnie od daty w formularzu', async ({ page }) => {
  test.setTimeout(150_000);
  await kontoPro(page, HASLO);
  const { dlugosc, masa } = await medianyWDobie(page, 5);
  const pid = await zapiszPacjenta(page, { nazwisko: 'Wczesny', dobISO: '2026-06-02', dataPomiaru: '2026-06-07', dlugosc, masa });
  const k = await etykietyKontrolne(page, { dlugosc, masa, dobaPomiaru: 5, dobaFormularza: 15 });
  etykietyRozne(k, 'karta porównania');
  expect(k.wzrost.wlasny, 'mediana 5. doby').toBe('50 centyl');

  await wlaczProbnik(page);
  await wczytajNowyPomiar(page, pid);
  await expect(page.locator('#dobInput')).toHaveValue('02-06-2026', { timeout: 15000 });
  const wiersz = (klucz) => page.locator(`#prevSummaryContent tr[data-klucz="${klucz}"] .pt-kol-poprzednio .pt-s`);
  await expect(wiersz('wzrost')).toHaveText(k.wzrost.wlasny, { timeout: 15000 });
  await expect(wiersz('masa')).toHaveText(k.masa.wlasny);
  await page.waitForFunction(() => window.__wiekProbnik.klatki.filter((x) => x.data).length >= 3, null, { timeout: 15000 });
  const P = await zatrzymajProbnik(page);

  expect(P.klatki.length).toBeGreaterThan(0);
  const inne = P.klatki.map((x, i) => ({ klatka: i, ...x }))
    .filter((x) => x.wzrost !== k.wzrost.wlasny || x.masa !== k.masa.wlasny);
  expect(inne.slice(0, 3), 'w każdej klatce z kartą — także przed wpisem daty urodzenia do formularza').toEqual([]);
});

test('Karta Pacjenta innego chłopca: kafelki w jego wieku pomiaru, nie w dobie dziecka z formularza', async ({ page }) => {
  test.setTimeout(150_000);
  await kontoPro(page, HASLO);
  const { dlugosc, masa } = await medianyWDobie(page, 3);
  const pidB = await zapiszPacjenta(page, { nazwisko: 'Drugi', dobISO: '2026-06-14', dataPomiaru: '2026-06-17', dlugosc, masa });
  const k = await etykietyKontrolne(page, { dlugosc, masa, dobaPomiaru: 3, dobaFormularza: 25 });
  etykietyRozne(k, 'Karta Pacjenta');

  // Pacjent A w formularzu: chłopiec urodzony 2026-05-23 (25. doba), wpisany ręcznie.
  await page.evaluate(() => {
    const ustaw = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ustaw('sex', 'M');
    ustaw('dobInput', '23-05-2026');
  });
  await page.waitForFunction(() => {
    const w = window.VildaDobAge.readExactAge();
    return w && w.totalMonths === 0 && w.days === 25;
  }, null, { timeout: 15000 });

  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pidB);
  const kafelek = (etykieta) => page.locator('.vilda-patient-stat')
    .filter({ has: page.locator('.vilda-patient-stat-label', { hasText: etykieta }) });
  const centyl = (etykieta) => `${parseInt(k[etykieta === 'Wzrost' ? 'wzrost' : 'masa'].wlasny, 10)}. centyl`;
  await expect(kafelek('Wzrost'), 'długość B w 3. dobie (jego pomiar)').toContainText(centyl('Wzrost'), { timeout: 20000 });
  await expect(kafelek('Wzrost')).not.toContainText(`${parseInt(k.wzrost.formularz, 10)}. centyl`);
  await expect(kafelek('Waga'), 'masa B w 3. dobie').toContainText(centyl('Waga'));
  await expect(kafelek('Waga')).not.toContainText(`${parseInt(k.masa.formularz, 10)}. centyl`);
  await expect(kafelek('Wzrost'), 'mediana nie jest alarmem').not.toHaveClass(/vilda-patient-stat--alert/);
});
