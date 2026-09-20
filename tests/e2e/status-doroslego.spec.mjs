import { expect, test } from '../support/test-czas.mjs';

// P-STATUS-DOROSLY na PRAWDZIWEJ stronie: zakładka „Status" Karty pacjenta u dorosłego.
//
// Testy jednostkowe pilnują silnika i dwóch funkcji widoku. Ten test pilnuje tego, co lekarz
// naprawdę zobaczy — bo zgłoszenie właściciela (2026-09-20) dotyczyło właśnie widoku:
// kafelek wagi 112 kg świecił na turkusowo, czyli „ok".
//
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Status!26a';

async function otworzZKontem(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.VildaBmi)
    && Boolean(window.VildaSdsWzrostu));
}

async function zalozIOtworz(page, dane) {
  const pid = await page.evaluate(async (d) => {
    const wynik = await window.VildaVault.savePatient({
      name: `Testowy ${d.imie}`,
      user: {
        lastName: 'Testowy', firstName: d.imie, sex: d.plec,
        age: d.wiekLat, ageMonths: 0, height: d.wzrost, weight: d.masa,
      },
      zscore: { dataSource: 'OLAF' },
      // UWAGA: wzrost rodziców Karta czyta z `advanced.motherHeight`, NIE z `advanced.data`.
      // Przy `data` kafelek MPH w ogóle się nie liczy, więc kontrola negatywna przechodziłaby
      // z niewłaściwego powodu — MPH nie znikałby, tylko nigdy by się nie pojawił.
      advanced: Object.assign({ data: {} }, d.rodzice || {}),
    }, { dedup: false });
    return wynik.patientId;
  }, dane);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
  await expect(page.locator('.vilda-patient-tab-content[data-tab="antro"]')).toBeVisible();
  return pid;
}

/** Kafelek po etykiecie — etykieta jest pierwszym dzieckiem kafelka. */
const kafelek = (page, etykieta) => page
  .locator('.vilda-patient-stat', { has: page.locator('.vilda-patient-stat-label', { hasText: etykieta }) });

test.describe('P-STATUS-DOROSLY — Status dorosłego w Karcie pacjenta', () => {
  test('STATUS-1: waga i BMI niosą kolor, wzrost jest neutralny', async ({ page }) => {
    await otworzZKontem(page);
    // BMI 40,3 — otyłość III stopnia. Wzrost 167 cm u mężczyzny to ok. 3. centyla
    // na siatce 18-latków, czyli dokładnie przypadek, w którym kolor byłby fałszywym alarmem.
    await zalozIOtworz(page, { imie: 'Status-A', plec: 'M', wiekLat: 47, wzrost: 167, masa: 112.4 });

    const waga = kafelek(page, 'Waga');
    await expect(waga, 'waga przy otyłości nie może być turkusowa („ok")')
      .not.toHaveClass(/vilda-patient-stat--ok/);
    await expect(waga, 'waga dziedziczy alarm po kategorii BMI')
      .toHaveClass(/vilda-patient-stat--alert/);
    await expect(waga).toContainText('ocena wg BMI');

    const bmi = kafelek(page, 'BMI');
    await expect(bmi).toHaveClass(/vilda-patient-stat--alert/);
    await expect(bmi, 'stopień otyłości wprost w kafelku').toContainText('Otyłość III stopnia');

    const wzrost = kafelek(page, 'Wzrost');
    await expect(wzrost, 'wzrost dorosłego bez werdyktu').not.toHaveClass(/vilda-patient-stat--/);
    await expect(wzrost, 'centyl podany').toContainText('centyl');
    await expect(wzrost, 'z nazwaną populacją odniesienia').toContainText('18-latkowie, OLAF');
  });

  test('STATUS-2: masa ciała docelowa z różnicą i progiem pośrednim', async ({ page }) => {
    await otworzZKontem(page);
    await zalozIOtworz(page, { imie: 'Status-B', plec: 'M', wiekLat: 47, wzrost: 167, masa: 112.4 });

    const cel = kafelek(page, 'Masa ciała docelowa');
    await expect(cel).toBeVisible();
    await expect(cel, 'masa przy górnej granicy normy (BMI 24,9)').toContainText('69,4 kg');
    await expect(cel, 'różnica ze znakiem — ile ubytku').toContainText('−43,0 kg');
    await expect(cel, 'granica nazwana').toContainText('górnej granicy normy');
    await expect(cel, 'próg pośredni jako bliższy słupek').toContainText('−28,7 kg do BMI 30');
    await expect(cel, 'cel to plan, nie werdykt').not.toHaveClass(/vilda-patient-stat--/);
  });

  test('STATUS-3: „Skale odniesienia" zamiast siatek, bez sekcji o wzrastaniu', async ({ page }) => {
    await otworzZKontem(page);
    await zalozIOtworz(page, {
      imie: 'Status-C', plec: 'M', wiekLat: 47, wzrost: 167, masa: 112.4,
      // Wzrost rodziców w rekordzie dorosłego: do tej wersji wywoływał kafelek MPH
      // i cały nagłówek „Wzrastanie i genetyka rodzinna".
      rodzice: { motherHeight: 162, fatherHeight: 178 },
    });

    const panel = page.locator('.vilda-patient-tab-content[data-tab="antro"]');
    await expect(kafelek(page, 'Skale odniesienia')).toBeVisible();
    await expect(kafelek(page, 'Skale odniesienia')).toContainText('standardy BMI dla dorosłych');
    await expect(panel, 'siatki pediatryczne nie dotyczą dorosłego')
      .not.toContainText('Siatki centylowe');
    await expect(panel, 'nagłówek o wzrastaniu znika razem z zawartością')
      .not.toContainText('Wzrastanie i genetyka rodzinna');
    await expect(panel, 'MPH to pojęcie o rosnącym dziecku').not.toContainText('MPH');
  });

  test('STATUS-5: na wąskim ekranie kafelki się zawijają, bez poziomego przewijania', async ({ page }) => {
    // AGENTS.md §6: po zmianie UI sprawdzamy widok mobilny. Nowe etykiety są dłuższe
    // („Masa ciała docelowa", „Skale odniesienia"), a trzeci wiersz kafelka dokłada
    // wysokości — oba mogą rozepchnąć siatkę w poziomie.
    await otworzZKontem(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await zalozIOtworz(page, { imie: 'Status-E', plec: 'K', wiekLat: 58, wzrost: 155, masa: 91.5 });

    for (const etykieta of ['Wzrost', 'Waga', 'BMI', 'Masa ciała docelowa', 'Skale odniesienia']) {
      await expect(kafelek(page, etykieta), `${etykieta} widoczny na telefonie`).toBeVisible();
    }
    const przewija = await page.evaluate(() => {
      const d = document.documentElement;
      return d.scrollWidth - d.clientWidth;
    });
    expect(przewija, 'brak poziomego przewijania').toBeLessThanOrEqual(1);
  });

  test('STATUS-4: kontrola negatywna — u dziecka Status bez zmian', async ({ page }) => {
    await otworzZKontem(page);
    await zalozIOtworz(page, {
      imie: 'Status-D', plec: 'M', wiekLat: 9, wzrost: 128, masa: 40,
      rodzice: { motherHeight: 162, fatherHeight: 178 },
    });

    const panel = page.locator('.vilda-patient-tab-content[data-tab="antro"]');
    await expect(kafelek(page, 'Siatki centylowe'), 'dziecko nadal ma kafelek siatek').toBeVisible();
    await expect(panel).toContainText('Wzrastanie i genetyka rodzinna');
    await expect(kafelek(page, 'MPH'), 'MPH zostaje dzieciom').toBeVisible();
    await expect(kafelek(page, 'Masa ciała docelowa'), 'cel masy tylko u dorosłego').toHaveCount(0);
    await expect(kafelek(page, 'Skale odniesienia')).toHaveCount(0);
    // Mocna kontrola: pomiar dobrany tak, by centyl MASY i kategoria BMI dały RÓŻNE
    // kolory — 40 kg przy 128 cm to 87. centyl masy (bez koloru), a BMI 24,4 to nadwaga
    // (ostrzeżenie). Gdyby dziecko złapało nową regułę dorosłego („waga wg BMI"), oba
    // kafelki byłyby żółte i test by to zobaczył.
    await expect(kafelek(page, 'Waga'), 'waga dziecka nadal z centyla masy, nie z BMI')
      .toHaveClass(/vilda-patient-stat--ok/);
    await expect(kafelek(page, 'BMI'), 'BMI dziecka z własnej kategorii')
      .toHaveClass(/vilda-patient-stat--improve/);
  });
});
