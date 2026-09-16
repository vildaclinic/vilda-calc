import { expect, test } from '../support/test-czas.mjs';

// P-PANEL-ZWINIETY / P-MPH-KOLOR (decyzje właściciela 2026-09-16) — na PRAWDZIWYCH stronach:
//   • po wczytaniu pacjenta z danymi pokwitaniowymi panel „Dane pokwitaniowe" zostaje zwinięty
//     obiema drogami („Nowy pomiar" i „Odtwórz zapis"), na index i na docpro, a przycisk mówi
//     „+ Dane pokwitaniowe (wpisane)";
//   • kafelek MPH w Karcie pacjenta dostaje kolor jak kafelek wzrostu: bardzo niscy rodzice →
//     centyl MPH < 3 → alarm; 3–10 → ostrzeżenie; MPH w normie → neutralny.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PanelMph!26a';

async function otworzZKontem(page, url = '/index.html') {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowe(page);
}

async function gotowe(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.applyLoadedData === 'function' && typeof window.updateTannerVisibility === 'function');
  await page.waitForTimeout(1200);
}

/* Rekord z etapem Tannera i faktem trwałym — panel ma co pokazać, a mimo to zostaje zwinięty. */
const REKORD = {
  name: 'Fikcyjny Panelowy',
  user: { firstName: 'Panelowy', lastName: 'Fikcyjny', sex: 'M', age: 12, ageMonths: 0, height: 141, weight: 34, tannerStage: '2' },
  puberty: { onsetAgeYears: 11 },
};

async function wczytaj(page, rekord) {
  const pid = await page.evaluate(async (r) => {
    const zapis = await window.VildaVault.savePatient(JSON.parse(JSON.stringify(r)), { dedup: false });
    window.applyLoadedData(JSON.parse(JSON.stringify(r)));
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: zapis.patientId, source: 'pick' } }));
    return zapis.patientId;
  }, rekord);
  await page.waitForFunction((id) => window._vildaCurrentPatientId === id, pid);
  await page.waitForTimeout(1500);
  return pid;
}

const panel = (page) => page.evaluate(() => ({
  otwarty: document.getElementById('tannerStageWrap').style.display !== 'none',
  przycisk: document.getElementById('tannerToggleBtn').textContent,
  etap: document.getElementById('tannerStage').value,
  onset: document.getElementById('pubertyOnsetAge').value,
}));

async function panelZwinietyZDanymi(page, gdzie) {
  const p = await panel(page);
  expect(p.otwarty, `${gdzie}: panel zwinięty`).toBe(false);
  expect(p.przycisk, `${gdzie}: przycisk sygnalizuje dane`).toBe('+ Dane pokwitaniowe (wpisane)');
  expect(p.etap, `${gdzie}: etap w polu mimo zwinięcia`).toBe('2');
  expect(p.onset).toBe('11');
}

test('index: po wczytaniu panel zwinięty przy „Nowy pomiar" i przy „Odtwórz zapis"; lekarz otwiera go sam', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  await wczytaj(page, REKORD);
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible({ timeout: 5000 });
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await page.waitForTimeout(3500); // odświeżenia widoczności po wczytaniu (0/200/800 ms i moduły po 3,2 s)
  await panelZwinietyZDanymi(page, 'index, Nowy pomiar');

  // Druga droga: wczytanie jeszcze raz i „Odtwórz zapis".
  await page.evaluate(() => window.clearAllData());
  await page.waitForTimeout(800);
  expect((await panel(page)).przycisk, 'po wyczyszczeniu bez dopisku').toBe('+ Dane pokwitaniowe');
  await wczytaj(page, REKORD);
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible({ timeout: 5000 });
  await page.locator('#vildaLcmRestore').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await page.waitForTimeout(3500);
  await panelZwinietyZDanymi(page, 'index, Odtwórz zapis');

  await page.getByRole('button', { name: '+ Dane pokwitaniowe (wpisane)', exact: true }).click();
  expect((await panel(page)).otwarty, 'klik lekarza otwiera panel').toBe(true);
  await expect(page.locator('#tannerStage')).toBeVisible();
});

test('docpro: po wczytaniu panel zwinięty, z dopiskiem „(wpisane)"', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page, '/docpro.html');
  await wczytaj(page, REKORD);
  if (await page.locator('#vildaLcmNew').count()) await page.locator('#vildaLcmNew').click();
  await page.waitForTimeout(3500);
  await panelZwinietyZDanymi(page, 'docpro');
});

/* Karta pacjenta: kafelek MPH w sekcji „Wzrastanie i genetyka rodzinna". */
async function kolorKafelkaMph(page, rekord) {
  const pid = await page.evaluate(async (r) => (await window.VildaVault.savePatient(JSON.parse(JSON.stringify(r)), { dedup: false })).patientId, rekord);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, () => {}, null), pid);
  const kafelek = page.locator('.vilda-patient-stat', { has: page.locator('.vilda-patient-stat-label', { hasText: /^MPH$/ }) }).first();
  await expect(kafelek).toBeVisible({ timeout: 15000 });
  const klasa = await kafelek.getAttribute('class');
  const podpis = await kafelek.locator('.vilda-patient-stat-extra, .vilda-patient-stat-sub').first().textContent();
  return { klasa, podpis };
}

test('Karta pacjenta: kafelek MPH kolorowany jak kafelek wzrostu (alarm < 3. c., ostrzeżenie 3–10 c., neutralny w normie)', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  const baza = { user: { sex: 'M', age: 10, ageMonths: 0, height: 138, weight: 32 } };

  // Bardzo niscy rodzice: MPH = (150 + 158 + 13) / 2 = 160,5 cm → u chłopca na 18 lat poniżej 3. centyla.
  const alarm = await kolorKafelkaMph(page, { name: 'Fikcyjny Niski', ...baza, advanced: { motherHeight: 150, fatherHeight: 158 } });
  expect(alarm.klasa, 'MPH poniżej 3. centyla → alarm, jak wzrost').toContain('vilda-patient-stat--alert');
  expect(alarm.podpis).toMatch(/<1\. centyl|^[12]\. centyl/);

  // Niscy rodzice: MPH = (156 + 166 + 13) / 2 = 167,5 cm → między 3. a 10. centylem.
  const ostrz = await kolorKafelkaMph(page, { name: 'Fikcyjny Niskawy', ...baza, advanced: { motherHeight: 156, fatherHeight: 166 } });
  expect(ostrz.klasa, 'MPH 3–10. centyl → ostrzeżenie, jak wzrost').toContain('vilda-patient-stat--improve');
  expect(ostrz.klasa).not.toContain('vilda-patient-stat--alert');

  // Rodzice przeciętni: MPH = (165 + 178 + 13) / 2 = 178 cm → w normie, kafelek neutralny.
  const norma = await kolorKafelkaMph(page, { name: 'Fikcyjny Przecietny', ...baza, advanced: { motherHeight: 165, fatherHeight: 178 } });
  expect(norma.klasa).not.toContain('vilda-patient-stat--alert');
  expect(norma.klasa).not.toContain('vilda-patient-stat--improve');
});
