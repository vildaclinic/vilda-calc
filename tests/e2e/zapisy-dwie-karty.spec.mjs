import { expect, test } from '@playwright/test';

// P-ZAPISY-DWIE-KARTY (decyzja właściciela 2026-09-30: „czekaj z limitem”) — równoległe zapisy tego samego
// pacjenta z dwóch kart przeglądarki.
//
// Zapis czyta głowę rekordu (bieżącą wersję), na jej podstawie decyduje — brama P14 pyta „Ktoś inny zmienił ten
// rekord”, anti-clobber dociąga pomiary, numer wersji to głowa + 1 — i dopiero potem pisze. Między odczytem
// a zapisem nic nie chroniło rekordu przed drugą kartą. Najdłuższe takie okno otwiera samo pytanie bramy.
//
// Scenariusz ludzki (nic nie dzieje się „w tej samej milisekundzie”):
//   1. Ten sam pacjent wczytany w dwóch kartach (A i B).
//   2. B dopisuje pomiar i zapisuje.
//   3. A dopisuje inny pomiar i zapisuje — sejf słusznie pyta o pomiar z B.
//   4. Lekarz nie odpowiada od razu: przechodzi do karty B, dopisuje kolejny pomiar, „Zapisz dane”.
//   5. Wraca do A i wybiera „Przyjmij dane z bazy”.
// Przed poprawką: B meldowała „Zapisano”, a zapis z A (liczony na głowie sprzed kroku 4) stawał się bieżącą wersją
// BEZ pomiaru z kroku 4 i z tym samym numerem wersji co zapis B.
// Po poprawce: zapis B w kroku 4 czeka na blokadę pacjenta (pasek: „Czekam — ten pacjent jest zapisywany w innej
// karcie”), najwyżej 30 s. Gdy lekarz odpowie w A, zapis B rusza i widzi zapis A. Gdy nie odpowie w 30 s, zapis B
// kończy się komunikatem „Nie zapisano…”, niczego nie zapisuje, a formularz B zostaje do ponownego zapisu.
//
// Zegar: celowo prawdziwy (`@playwright/test`, nie tests/support/test-czas.mjs). Fikstura
// zegara instaluje się tylko na `page`; druga karta miałaby inny punkt startu, a kolejność
// wersji rozstrzyga `savedAtISO` — przesunięcie zegarów między kartami zmieniłoby to, co
// test mierzy. Obie karty prawdziwej przeglądarki dzielą jeden zegar systemowy.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#DwieKarty!26aa';
const TYTUL = 'Ktoś inny zmienił ten rekord po wczytaniu danych';

const REKORD = {
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 108, weight: 18 },
  growthBasic: {
    data: {
      measurements: [
        { ageMonths: 60, ageYears: 5, height: 105, weight: 17 },
        { ageMonths: 66, ageYears: 5.5, height: 108, weight: 18 },
      ],
    },
  },
};

async function regulamin(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function gotowa(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.saveUserData === 'function'
    && typeof window.collectUserData === 'function' && Boolean(window.VildaAuthUI)
    && typeof window.VildaVault.setSaveConflictResolver === 'function');
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
}

/* Pierwsza karta: zakłada konto. Sesja sejfu żyje w sessionStorage, czyli per karta. */
async function pierwszaKarta(page) {
  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  const { userId } = await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  return userId;
}

/* Kolejna karta tej samej przeglądarki: to samo konto, logowanie hasłem. */
async function kolejnaKarta(context, userId) {
  const page = await context.newPage();
  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (a) => window.VildaVault.unlockUser(a.userId, a.pw), { userId, pw: HASLO });
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  return page;
}

/* Wczytanie tak jak lekarz: Karta Pacjenta → „Wczytaj tego pacjenta" → „Nowy pomiar". */
async function wczytaj(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id,
    (rekord) => { if (rekord) window.applyLoadedData(rekord); }, null), patientId);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await page.waitForFunction((id) => window._vildaCurrentPatientId === id, patientId);
  await page.waitForTimeout(1500); // kaskada zerowania pól wizyty
  // Dzisiejsza wizyta — bez wieku, wzrostu i masy „Zapisz dane" nie przechodzi.
  await page.fill('#age', '9');
  await page.fill('#ageMonths', '6');
  await page.fill('#height', '134');
  await page.fill('#weight', '28');
}

/* „Obliczenia wzrostowe" → „Dodaj kolejny pomiar" → wpisanie wiersza historii. */
async function dopiszPomiar(page, { lat, mies, wzrost, masa }) {
  await page.evaluate(() => {
    const f = document.getElementById('growthCalculationsForm');
    if (f && getComputedStyle(f).display === 'none') document.getElementById('toggleGrowthCalculations').click();
  });
  await page.getByRole('button', { name: 'Dodaj kolejny pomiar' }).click();
  await page.evaluate((w) => {
    const wiersze = document.querySelectorAll('#basicGrowthMeasurements .measure-row');
    const r = wiersze[wiersze.length - 1];
    const ustaw = (sel, v) => {
      const e = r.querySelector(sel);
      e.value = String(v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ustaw('.bg-age-years', w.lat);
    ustaw('.bg-age-months', w.mies);
    ustaw('.bg-height', w.wzrost);
    ustaw('.bg-weight', w.masa);
  }, { lat, mies, wzrost, masa });
  const wiek = lat * 12 + mies;
  await expect.poll(() => page.evaluate(() => ((((window.collectUserData() || {}).growthBasic || {})
    .data || {}).measurements || []).map((m) => m.ageMonths)), { message: 'wiersz trafił do formularza' })
    .toContain(wiek);
}

const zapisz = (page) => page.locator('#saveDataBtnSidebar').click();
const pasek = (page) => page.locator('#vildaStatusSide');

/* Bieżąca wersja rekordu — to, co Karta Pacjenta pokazuje jako aktualne dane. */
const glowa = (page, patientId) => page.evaluate(async (id) => {
  const r = await window.VildaVault.getPatient(id);
  const g = r.snapshots[0];
  return {
    liczbaWersji: r.snapshots.length,
    numery: r.snapshots.map((s) => s.seq),
    wieki: (((g.payload.growthBasic || {}).data || {}).measurements || [])
      .map((m) => m.ageMonths).sort((a, b) => a - b),
  };
}, patientId);

/* Karta Pacjenta → zakładka „Historia": oś czasu pomiarów z bieżącej wersji rekordu. */
async function historiaWKarcie(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, () => {}, null), patientId);
  await page.getByRole('button', { name: 'Historia', exact: true }).click();
  const os = page.locator('.vilda-patient-timeline-list');
  await expect(os).toBeVisible();
  return os;
}

test.describe('Ten sam pacjent zapisywany z dwóch kart', () => {
  test('zapis z okna pytania nie cofa pomiaru zapisanego w międzyczasie w drugiej karcie', async ({ page, context }) => {
    test.setTimeout(180_000);
    const kartaA = page;
    const userId = await pierwszaKarta(kartaA);
    const { patientId } = await kartaA.evaluate(async (r) => window.VildaVault.savePatient(
      JSON.parse(JSON.stringify(r)), { dedup: false }), REKORD);
    const kartaB = await kolejnaKarta(context, userId);

    // 1. Ten sam pacjent w obu kartach.
    await wczytaj(kartaA, patientId);
    await wczytaj(kartaB, patientId);

    // 2. Karta B dopisuje pomiar z 6 lat 8 mies. i zapisuje — zwykły zapis, bez pytań.
    await kartaB.bringToFront();
    await dopiszPomiar(kartaB, { lat: 6, mies: 8, wzrost: 116, masa: 21 });
    await zapisz(kartaB);
    await expect(pasek(kartaB)).toContainText('Zapisano');
    await expect.poll(async () => (await glowa(kartaB, patientId)).liczbaWersji).toBe(2);

    // 3. Karta A dopisuje pomiar z 6 lat 2 mies. i zapisuje. Sejf słusznie pyta
    //    o pomiar dopisany w karcie B.
    await kartaA.bringToFront();
    await dopiszPomiar(kartaA, { lat: 6, mies: 2, wzrost: 112, masa: 20 });
    await zapisz(kartaA);
    const pytanieA = kartaA.getByRole('alertdialog', { name: TYTUL });
    await expect(pytanieA).toBeVisible();
    await expect(pytanieA.locator('.vilda-auth-conflict-list li')).toContainText('6 lat 8 mies.');

    // 4. Lekarz zostawia pytanie otwarte, przechodzi do karty B, dopisuje pomiar
    //    z 7 lat 8 mies. i zapisuje. Przejście między kartami trwa co najmniej chwilę;
    //    zapis w sejfie trwa dziesiątki milisekund.
    await kartaB.bringToFront();
    await dopiszPomiar(kartaB, { lat: 7, mies: 8, wzrost: 121, masa: 23 });
    await zapisz(kartaB);
    await expect(pasek(kartaB), 'zapis B czeka na zapis w karcie A').toContainText('Czekam — ten pacjent jest zapisywany w innej karcie');
    await kartaB.waitForTimeout(1500);

    // 5. Powrót do karty A: „Przyjmij dane z bazy".
    await kartaA.bringToFront();
    await pytanieA.getByRole('button', { name: 'Przyjmij dane z bazy' }).click();
    await expect(pytanieA).toHaveCount(0);

    // Obie karty kończą zapis. Jeżeli któraś zapyta o zmianę z drugiej karty, lekarz
    // przyjmuje dane z bazy — to jest odpowiedź, która obiecuje, że nic nie zginie.
    await expect.poll(async () => {
      for (const karta of [kartaA, kartaB]) {
        const okno = karta.getByRole('alertdialog', { name: TYTUL });
        if (await okno.count()) await okno.getByRole('button', { name: 'Przyjmij dane z bazy' }).click();
      }
      return (await glowa(kartaA, patientId)).liczbaWersji;
    }, { timeout: 20_000, message: 'wczytany rekord + trzy zapisy = cztery wersje' }).toBe(4);
    // Karta B potwierdziła także drugi zapis (pierwszy dał wersję 2).
    await expect(pasek(kartaB), 'karta B potwierdziła zapis pomiaru z 7 lat 8 mies.')
      .toContainText(/Zapisano \(snapshot [34]\)/);
    await expect(kartaA.getByRole('alertdialog')).toHaveCount(0);
    await expect(kartaB.getByRole('alertdialog')).toHaveCount(0);

    // Lekarz zagląda do Karty Pacjenta → „Historia". Każdy pomiar ma inny wzrost, więc
    // wzrost wskazuje wiersz jednoznacznie.
    const os = await historiaWKarcie(kartaA, patientId);
    await expect(os, 'pomiar dopisany w karcie A (6 lat 2 mies.)').toContainText('Wzrost 112 cm');
    await expect(os, 'pomiar z pierwszego zapisu karty B (6 lat 8 mies.)').toContainText('Wzrost 116 cm');
    await expect(os, 'pomiar, którego zapis karta B potwierdziła (7 lat 8 mies.), nie zniknął')
      .toContainText('Wzrost 121 cm');

    const po = await glowa(kartaA, patientId);
    // Wiersz 5 lat 6 mies. „Nowy pomiar" przenosi do historii karty zaawansowanej, więc tu
    // sprawdzamy tylko trzy wiersze dopisane w kartach.
    expect(po.wieki, 'bieżąca wersja rekordu ma pomiary dopisane w obu kartach')
      .toEqual(expect.arrayContaining([74, 80, 92]));
    expect(new Set(po.numery).size, `numery wersji są różne: ${po.numery.join(', ')}`)
      .toBe(po.numery.length);
  });

  test('limit 30 s: bez odpowiedzi w karcie A zapis B kończy się „Nie zapisano”, niczego nie zapisuje, a formularz zostaje', async ({ page, context }) => {
    test.setTimeout(240_000);
    const kartaA = page;
    const userId = await pierwszaKarta(kartaA);
    const { patientId } = await kartaA.evaluate(async (r) => window.VildaVault.savePatient(
      JSON.parse(JSON.stringify(r)), { dedup: false }), REKORD);
    const kartaB = await kolejnaKarta(context, userId);
    await wczytaj(kartaA, patientId);
    await wczytaj(kartaB, patientId);

    await kartaB.bringToFront();
    await dopiszPomiar(kartaB, { lat: 6, mies: 8, wzrost: 116, masa: 21 });
    await zapisz(kartaB);
    await expect(pasek(kartaB)).toContainText('Zapisano');
    await expect.poll(async () => (await glowa(kartaB, patientId)).liczbaWersji).toBe(2);

    await kartaA.bringToFront();
    await dopiszPomiar(kartaA, { lat: 6, mies: 2, wzrost: 112, masa: 20 });
    await zapisz(kartaA);
    const pytanieA = kartaA.getByRole('alertdialog', { name: TYTUL });
    await expect(pytanieA).toBeVisible();

    // Karta B zapisuje, gdy w A wisi pytanie — i nikt w A nie odpowiada.
    await kartaB.bringToFront();
    await dopiszPomiar(kartaB, { lat: 7, mies: 8, wzrost: 121, masa: 23 });
    await zapisz(kartaB);
    await expect(pasek(kartaB)).toContainText('Czekam — ten pacjent jest zapisywany w innej karcie');
    await expect(pasek(kartaB), 'po 30 s zapis B się przerywa')
      .toContainText('Nie zapisano — ten pacjent jest nadal zapisywany w innej karcie', { timeout: 40_000 });
    expect((await glowa(kartaB, patientId)).liczbaWersji, 'przerwany zapis niczego nie dopisał').toBe(2);
    const formularzB = await kartaB.evaluate(() => (((window.collectUserData() || {}).growthBasic || {}).data || {})
      .measurements.map((m) => m.ageMonths));
    expect(formularzB, 'formularz B nadal ma pomiar z 7 lat 8 mies.').toContain(92);

    // A odpowiada; potem B zapisuje ponownie i nic nie ginie.
    await kartaA.bringToFront();
    await pytanieA.getByRole('button', { name: 'Przyjmij dane z bazy' }).click();
    await expect.poll(async () => (await glowa(kartaA, patientId)).liczbaWersji).toBe(3);
    await kartaB.bringToFront();
    await zapisz(kartaB);
    await expect.poll(async () => {
      const okno = kartaB.getByRole('alertdialog', { name: TYTUL });
      if (await okno.count()) await okno.getByRole('button', { name: 'Przyjmij dane z bazy' }).click();
      return (await glowa(kartaB, patientId)).liczbaWersji;
    }, { timeout: 20_000, message: 'ponowny zapis B po odpowiedzi w A' }).toBe(4);
    const po = await glowa(kartaB, patientId);
    expect(po.wieki).toEqual(expect.arrayContaining([74, 80, 92]));
    expect(new Set(po.numery).size, `numery wersji są różne: ${po.numery.join(', ')}`).toBe(po.numery.length);
  });
});
