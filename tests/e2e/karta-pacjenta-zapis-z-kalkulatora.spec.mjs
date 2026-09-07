import { expect, test } from '../support/test-czas.mjs';

// P14, druga połowa — pomiar na żywym kalkulatorze.
//
// Główny przycisk „Zapisz dane" wysyłał do sejfu cały formularz bez żadnej informacji
// o tym, na jakiej wersji rekordu lekarz pracuje. Pomiar dopisany w międzyczasie na
// innym urządzeniu (albo wciągnięty przez synchronizację) znikał z bieżącej wersji
// rekordu bez słowa. Teraz sejf porównuje treść wczytanej kopii z głową rekordu i pyta.
//
// Ten plik sprawdza to, czego test jednostkowy sprawdzić nie może: że modal naprawdę
// wstaje na stronie, że jest podpięty do sejfu tej ramki i że jego przyciski robią to,
// co obiecują.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#ZapisKalkulator!26aa';
const TYTUL = 'W rekordzie są pomiary, których nie ma w formularzu';

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(() => Boolean(window.VildaAuthUI));
}

// Rezolwer rejestruje się przy starcie vilda_auth_ui.js — bez niego sejf po cichu scala
// i modal nigdy nie wstanie. Czekamy na to tylko tam, gdzie modal ma się pokazać, żeby
// kontrola negatywna („bez rozjazdu") mierzyła brak modala, a nie brak API.
const czekajNaRezolwer = (page) => page.waitForFunction(
  () => typeof window.VildaVault.setSaveConflictResolver === 'function',
);

const REKORD = {
  name: 'Kowalski Jan',
  user: {
    lastName: 'Kowalski',
    firstName: 'Jan',
    sex: 'M',
    age: 5,
    ageMonths: 6,
    height: 110,
    weight: 19,
  },
  growthBasic: {
    data: {
      measurements: [
        { ageMonths: 60, ageYears: 5, height: 105, weight: 17 },
        { ageMonths: 66, ageYears: 5.5, height: 108, weight: 18 },
      ],
    },
  },
};

// Zakłada pacjenta i wczytuje go do formularza tą samą drogą, którą idzie przycisk
// „Wczytaj" — czyli przez applyLoadedData, które ustawia window.lastLoadedData.
// Pola wieku, wzrostu i masy wypełniamy jak lekarz, bo bez nich przycisk zapisu
// pozostaje wyszarzony.
async function zalozIWczytaj(page) {
  const wynik = await page.evaluate(async (rekord) => {
    const zapis = await window.VildaVault.savePatient(JSON.parse(JSON.stringify(rekord)), { dedup: false });
    window.applyLoadedData(JSON.parse(JSON.stringify(rekord)));
    return { patientId: zapis.patientId, snapshotId: zapis.snapshotId };
  }, REKORD);
  await page.fill('#age', String(REKORD.user.age));
  await page.fill('#ageMonths', String(REKORD.user.ageMonths));
  await page.fill('#height', String(REKORD.user.height));
  await page.fill('#weight', String(REKORD.user.weight));
  await expect(zapisz(page)).toBeEnabled();
  return wynik;
}

// Główny zapis na stronie pacjenta to link „Zapisz dane" w nawigacji bocznej.
const zapisz = (page) => page.locator('#saveDataBtnSidebar');

// Drugie urządzenie dokłada pomiar w 80. miesiącu.
const drugieUrzadzenie = (page, patientId) => page.evaluate(async ({ id, rekord }) => {
  const kopia = JSON.parse(JSON.stringify(rekord));
  kopia.growthBasic.data.measurements.push({ ageMonths: 80, ageYears: 6.67, height: 118, weight: 22 });
  const wynik = await window.VildaVault.savePatient(kopia, { patientId: id, dedup: false });
  return wynik.snapshotId;
}, { id: patientId, rekord: REKORD });

const glowa = (page, patientId) => page.evaluate(async (id) => {
  const rekord = await window.VildaVault.getPatient(id);
  const g = rekord.snapshots[0];
  return {
    snapshotId: g.snapshotId,
    liczbaWersji: rekord.snapshots.length,
    wieki: (((g.payload.growthBasic || {}).data || {}).measurements || [])
      .map((r) => r.ageMonths).sort((a, b) => a - b),
  };
}, patientId);

test.describe('P14b — „Zapisz dane" pyta, zanim skasuje cudzy pomiar', () => {
  test('modal wymienia obcy pomiar, a „Dopisz je do zapisu" go zachowuje', async ({ page }) => {
    await otworzZKontem(page);
    await czekajNaRezolwer(page);
    const { patientId } = await zalozIWczytaj(page);
    await drugieUrzadzenie(page, patientId);

    await zapisz(page).click();

    const modal = page.getByRole('alertdialog', { name: TYTUL });
    await expect(modal).toBeVisible();
    // Pytanie wymienia dokładnie ten pomiar, który przyszedł po wczytaniu.
    await expect(modal.locator('.vilda-auth-conflict-list li')).toHaveCount(1);
    await expect(modal.locator('.vilda-auth-conflict-list li')).toContainText('6 lat 8 mies.');
    await expect(modal.locator('.vilda-auth-conflict-list li')).toContainText('118 cm');

    await modal.getByRole('button', { name: 'Dopisz je do zapisu' }).click();
    await expect(modal).toHaveCount(0);

    await expect.poll(async () => (await glowa(page, patientId)).liczbaWersji).toBe(3);
    const po = await glowa(page, patientId);
    expect(po.wieki, 'pomiar z drugiego urządzenia został w bieżącej wersji').toContain(80);
  });

  test('„Anuluj zapis" nie rusza rekordu', async ({ page }) => {
    await otworzZKontem(page);
    await czekajNaRezolwer(page);
    const { patientId } = await zalozIWczytaj(page);
    const przed = await drugieUrzadzenie(page, patientId);

    await zapisz(page).click();
    const modal = page.getByRole('alertdialog', { name: TYTUL });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Anuluj zapis' }).click();
    await expect(modal).toHaveCount(0);

    // Komunikat mówi wprost, że nic się nie stało — a nie „nie udało się zapisać".
    await expect(zapisz(page)).toBeVisible();
    const po = await glowa(page, patientId);
    expect(po.snapshotId, 'głowa rekordu bez zmian').toBe(przed);
    expect(po.liczbaWersji, 'nie przybyło wersji').toBe(2);
  });

  test('bez rozjazdu zapis idzie bez pytania', async ({ page }) => {
    // Kontrola negatywna: nikt nic nie dopisał, więc modal nie ma prawa się pokazać.
    await otworzZKontem(page);
    const { patientId } = await zalozIWczytaj(page);

    await zapisz(page).click();

    await expect.poll(async () => (await glowa(page, patientId)).liczbaWersji).toBe(2);
    await expect(page.getByRole('alertdialog', { name: TYTUL })).toHaveCount(0);
  });
});
