import { expect, test } from '@playwright/test';

// Etap 2b „Walidacji prognoz" (decyzja właściciela 2026-09-15). Karta pokazywała jeden zestaw
// liczb i nie mówiła, czy to wartość z publikacji, czy ta po naszych korektach; na telefonie
// tabela z ośmioma kolumnami wychodziła poza ekran, a tego, co aplikacja dokłada do każdej
// metody, nie dało się sprawdzić nigdzie w interfejsie.
//
// Ten plik mierzy cztery rzeczy, których nie zmierzy test jednostkowy: że przełącznik naprawdę
// PODMIENIA liczby na stronie, że na wąskim ekranie tabela ustępuje kartom punktów, że
// metryczka metod jest w panelu razem ze źródłami i że kafel odmienia „metoda/metody/metod”.
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Widok2b!26aa';

async function otworzPanel(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaGrowthPredictionValidationModel)
    && Boolean(window.VildaGrowthMethodLedger) && Boolean(window.VildaGrowthCardC));

  // Chłopiec z KOWD: wiek kostny ok. 2,5 roku za metrykalnym (korekta BP i bramka Khamis–Roche),
  // wzrost ostateczny 171 cm w 18 l.
  const id = await page.evaluate(async () => {
    const w = await window.VildaVault.savePatient({
      name: 'Testowy Bartek',
      user: { lastName: 'Testowy', firstName: 'Bartek', sex: 'M', age: 18, ageMonths: 0, height: 171, weight: 62 },
      advanced: {
        motherHeight: 158, fatherHeight: 172, boneAgeYears: 18,
        growthExclusion: 'nie', testicularVolume: 'lt4', familyDelayedPuberty: 'yes',
        data: { measurements: [
          { ageMonths: 120, ageYears: 10, height: 125, weight: 25, boneAgeYears: 7.5 },
          { ageMonths: 144, ageYears: 12, height: 137, weight: 32, boneAgeYears: 9.5 },
          { ageMonths: 168, ageYears: 14, height: 148, weight: 40, boneAgeYears: 11.5 },
          { ageMonths: 192, ageYears: 16, height: 163, weight: 54, boneAgeYears: 14 },
        ] },
      },
    }, { dedup: false });
    return w.patientId;
  });
  await page.evaluate((patientId) => window.VildaAuthUI.showPatientCard(patientId), id);
  const kafelek = page.locator('.vgpv-tile');
  await expect(kafelek).toBeVisible({ timeout: 20000 });
  await kafelek.click();
  // Pomocnik czeka na tabelę (jest od dawna), a nie na elementy etapu 2b — inaczej każdy
  // z testów niżej padałby w tym samym miejscu i pomiar czerwieni nic by nie mówił.
  await expect(page.locator('.vgpv-tbl')).toBeVisible({ timeout: 20000 });
  return kafelek;
}

const wartosciTabeli = (page) => page.evaluate(() => Array.from(
  document.querySelectorAll('.vgpv-tbl td .vgpv-pred, .vgpv-tbl td.vgpv-cev'))
  .map((t) => (t.textContent || '').trim()).filter((t) => /\d/.test(t)));

test.describe('Walidacja prognoz — widok etapu 2b', () => {
  test('przełącznik podmienia liczby: „Z publikacji" ≠ „W konsensusie"', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPanel(page);

    const zPublikacji = page.locator('.vgpv-swbtn', { hasText: 'Z publikacji' });
    const wKonsensusie = page.locator('.vgpv-swbtn', { hasText: 'W konsensusie' });
    // Domyślnie karta pokazuje to samo, co karty kliniczne — wartość z publikacji.
    await expect(zPublikacji).toHaveAttribute('aria-pressed', 'true');
    await expect(wKonsensusie).toHaveAttribute('aria-pressed', 'false');

    const przed = await wartosciTabeli(page);
    expect(przed.length, 'tabela ma liczby do porównania').toBeGreaterThan(3);

    await wKonsensusie.click();
    await expect(wKonsensusie).toHaveAttribute('aria-pressed', 'true');
    await expect(zPublikacji).toHaveAttribute('aria-pressed', 'false');

    const po = await wartosciTabeli(page);
    expect(po.length).toBe(przed.length);
    expect(po.join('|'), 'korekty aplikacji muszą być widać w liczbach').not.toBe(przed.join('|'));
    await expect(page.locator('.vgpv-swnote')).toContainText('po naszych korektach');

    // Powrót przywraca dokładnie wartości z publikacji — przełącznik nie jest jednokierunkowy.
    await zPublikacji.click();
    expect((await wartosciTabeli(page)).join('|')).toBe(przed.join('|'));
  });

  test('znacznik korekty zapowiada dokładnie tę liczbę, którą pokaże tryb konsensusu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPanel(page);

    // W trybie „Z publikacji" komórka niesie wartość autorów, a znacznik mówi, co z niej
    // zostało w konsensusie — to jedyne miejsce, gdzie obie liczby stoją obok siebie.
    const znacznik = page.locator('.vgpv-biastag').first();
    await expect(znacznik).toBeVisible();
    const zapowiedz = await znacznik.getAttribute('title');
    expect(zapowiedz, `title znacznika: ${zapowiedz}`).toMatch(/w konsensusie\s+[\d,]+\s*cm/);
    const zapowiedziana = zapowiedz.match(/([\d]+,[\d]+|[\d]+)\s*cm/)[1].replace(',', '.');

    // Współrzędne komórki, nie locator: po przełączeniu znacznika już w niej nie ma,
    // więc filtr `has` przestałby cokolwiek znajdować.
    const gdzie = await page.evaluate(() => {
      const td = document.querySelector('.vgpv-tbl td .vgpv-biastag').closest('td');
      const tr = td.closest('tr');
      return { wiersz: Array.from(tr.parentNode.children).indexOf(tr), kolumna: Array.from(tr.children).indexOf(td) };
    });
    const wartosc = () => page.evaluate(({ wiersz, kolumna }) => {
      const tr = document.querySelectorAll('.vgpv-tbl tbody tr')[wiersz];
      const el = tr.children[kolumna].querySelector('.vgpv-pred');
      return el ? (el.textContent || '').trim() : '';
    }, gdzie);
    const przed = await wartosc();

    await page.locator('.vgpv-swbtn', { hasText: 'W konsensusie' }).click();
    await expect(page.locator('.vgpv-biastag')).toHaveCount(0);
    const po = await wartosc();
    expect(po, `z publikacji ${przed} → w konsensusie ${po}`).not.toBe(przed);
    // W trybie konsensusu znacznik znika (sprawdzone wyżej) — liczba JEST już po korekcie.
    expect(po.replace(',', '.')).toBe(zapowiedziana);
  });

  test('na telefonie tabela ustępuje kartom punktów, na desktopie odwrotnie', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPanel(page);

    await expect(page.locator('.vgpv-tblwrap')).toBeVisible();
    await expect(page.locator('.vgpv-cards')).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.vgpv-cards')).toBeVisible();
    await expect(page.locator('.vgpv-tblwrap')).toBeHidden();

    // Karta punktu niesie wiek, wzrost i wiersze metod — nie samą datę.
    const karta = page.locator('.vgpv-pcard').first();
    await expect(karta).toBeVisible();
    await expect(karta).toContainText('cm');
    expect(await karta.locator('.vgpv-prow').count()).toBeGreaterThan(2);

    // Nic nie wystaje poza ekran telefonu.
    const szerokosc = await page.evaluate(() => {
      const el = document.querySelector('.vgpv-panel');
      return el ? { scroll: el.scrollWidth, client: el.clientWidth } : null;
    });
    expect(szerokosc.scroll, JSON.stringify(szerokosc)).toBeLessThanOrEqual(szerokosc.client + 1);
  });

  test('metryczka metod jest w panelu, nazywa źródła i opisuje ograniczenie raz', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPanel(page);

    const metryczka = page.locator('details.vgpv-ledger');
    await expect(metryczka).toBeVisible();
    await expect(metryczka.locator('summary')).toContainText('aplikacja dokłada');

    await metryczka.locator('summary').click();
    await expect(metryczka.locator('.vgml-blok').first()).toBeVisible();
    const tresc = (await metryczka.textContent()) || '';
    expect(tresc).toContain('Bayley');
    expect(tresc).toContain('Khamis');
    expect(tresc.split('Ograniczenie do zmierzonego wzrostu').length - 1,
      'ograniczenie opisane raz, nie przy każdej metodzie').toBe(1);
    // Każdy blok metryczki ma nazwane źródło — inaczej to opinia, nie dokumentacja.
    const zrodla = await metryczka.locator('.vgml-zrodlo').count();
    const bloki = await metryczka.locator('.vgml-blok').count();
    expect(bloki).toBeGreaterThan(2);
    expect(zrodla).toBe(bloki);
  });

  test('kafel odmienia liczbę metod po polsku', async ({ page }) => {
    test.setTimeout(120_000);
    const kafelek = await otworzPanel(page);
    const tekst = ((await kafelek.textContent()) || '').replace(/\s+/g, ' ');
    const m = tekst.match(/(\d+)\s+(metoda|metody|metod)\b/);
    expect(m, `kafel: ${tekst}`).not.toBeNull();
    const n = Number(m[1]);
    const d = n % 10, s = n % 100;
    const oczekiwane = n === 1 ? 'metoda' : (d >= 2 && d <= 4 && !(s >= 12 && s <= 14) ? 'metody' : 'metod');
    expect(m[2], `${n} ${m[2]} — poprawnie: ${n} ${oczekiwane}`).toBe(oczekiwane);
  });
});
