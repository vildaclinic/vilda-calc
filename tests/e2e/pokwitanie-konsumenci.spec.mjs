import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// P-POKWITANIE-KONSUMENCI (decyzja właściciela 2026-10-15): konsumenci, które do tej pory
// czytały tylko stary numer `tannerStage`, dostają typowaną oś G/Th ze wspólnej oceny
// (G u chłopca, Th u dziewczynki, nigdy samo P) z kwalifikacją jak w prognozach wzrostu:
// ocena z tej wizyty albo wcześniejsza do 12 miesięcy, oznaczona. Przed poprawką
// (pomiar 2026-10-15): przelicznik pokazywał „(z danych: nieznany)” przy G3 w panelu,
// HOMA-IR nie wypełniał etapu, a kreator epikryzy nie widział G/Th/P.
test.use({ serviceWorkers: 'block' });

const terms = page => page.addInitScript(() => {
  localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  localStorage.setItem('analyticsConsent', 'denied');
});

function assessment({ sex = 'M', axis = 'G', stage = 3, ageMonths = 120, current = true, extra = {} } = {}) {
  const observations = { G: null, Th: null, P: null, ...extra };
  if (axis) observations[axis] = { stage, sex, observedAtISO: null, ageMonths, source: 'clinician-entry' };
  return {
    pubertyAssessment: { version: 1, sex, observations },
    pubertyAssessmentVisit: { version: 1, visitId: 'e2e-visit', ownerPatientId: null,
      currentAxes: current && axis ? [axis] : [], reference: { sex, ageMonths: 120, measuredAtISO: null } },
  };
}

async function seed(page, path, shared, sessionUser) {
  await terms(page);
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaPersistence));
  await page.evaluate(({ shared, sessionUser }) => {
    window.VildaPersistence.writeShared(shared, { force: true });
    window.VildaPersistence.writeMainSession({ version: 1, user: { ...shared, ...sessionUser } });
  }, { shared, sessionUser });
  await page.reload({ waitUntil: 'load' });
}

test.describe('przelicznik jednostek — tabele Tanner-zależne czytają typowaną oś', () => {
  async function open(page, sessionUser, shared = { sex: 'M', age: 10, ageMonths: 0 }) {
    await seed(page, '/przelicznik-jednostek.html', shared, sessionUser);
    await page.waitForFunction(() => Boolean(window.LabUnitConverter && window.VildaPubertyAssessmentContext));
    await page.locator('#labPatientToggle').click();
    await expect(page.locator('#labOverrideTanner')).toBeVisible();
  }

  test('G3 z tej wizyty: opcja domyślna i opis pacjenta nazywają oś, nadpisanie lokalne ją zachowuje', async ({ page }) => {
    await open(page, assessment());
    await expect(page.locator('#labOverrideTannerDefault')).toHaveText('(z danych: G III)');
    await expect(page.locator('#labPatientText')).toContainText('G III');
    await page.locator('#labOverrideTanner').selectOption('4');
    await expect(page.locator('#labOverrideTannerNote')).toContainText('u pacjenta pozostaje G III');
  });

  test('wcześniejsza ocena do 12 miesięcy jest oznaczona; Th u dziewczynki', async ({ page }) => {
    await open(page, assessment({ sex: 'F', axis: 'Th', stage: 2, ageMonths: 114, current: false }), { sex: 'F', age: 10, ageMonths: 0 });
    await expect(page.locator('#labOverrideTannerDefault')).toHaveText('(z danych: Th II — wcześniejsza ocena)');
  });

  test('samo P oraz obecna typowana ocena nie wracają do starego numeru', async ({ page }) => {
    await open(page, assessment({ axis: 'P', stage: 3 }), { sex: 'M', age: 10, ageMonths: 0, tannerStage: '2' });
    await expect(page.locator('#labOverrideTannerDefault')).toHaveText('(z danych: nieznany)');
  });

  test('bez typowanej oceny stary numer działa jak dotąd', async ({ page }) => {
    await open(page, {}, { sex: 'M', age: 10, ageMonths: 0, tannerStage: '2' });
    await expect(page.locator('#labOverrideTannerDefault')).toHaveText('(z danych: Tanner II)');
  });
});

test.describe('HOMA-IR — etap dojrzewania z typowanej osi', () => {
  for (const [label, sessionUser, shared, expected] of [
    ['G3 chłopca → pokwitanie', assessment({ ageMonths: 144 }), { sex: 'M', age: 12, ageMonths: 0 }, 'pub'],
    ['G5 → dojrzewanie pełne', assessment({ stage: 5, ageMonths: 144 }), { sex: 'M', age: 12, ageMonths: 0 }, 'full'],
    ['Th1 dziewczynki → przedpokwitaniowy', assessment({ sex: 'F', axis: 'Th', stage: 1, ageMonths: 144 }), { sex: 'F', age: 12, ageMonths: 0 }, 'pre'],
    ['samo P3 → bez etapu', assessment({ axis: 'P', stage: 3, ageMonths: 144 }), { sex: 'M', age: 12, ageMonths: 0, tannerStage: '3' }, ''],
  ]) {
    test(label, async ({ page }) => {
      await seed(page, '/homa-ir.html', shared, { ...sessionUser, pubertyAssessmentVisit: { ...sessionUser.pubertyAssessmentVisit, reference: { sex: shared.sex, ageMonths: 144, measuredAtISO: null } } });
      await page.waitForFunction(() => typeof window.computeHoma === 'function');
      await expect.poll(() => page.locator('#stage').inputValue(), { timeout: 10000 }).toBe(expected);
    });
  }
});

test('kreator epikryzy wypełnia G i P z oceny bieżącej wizyty', async ({ page }) => {
  await terms(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.VildaPubertyAssessmentContext && window.VildaEpicrisisUI));
  await czekajNaOdtworzenieSesji(page);
  await page.locator('#sex').selectOption('M');
  await page.locator('#age').fill('12');
  await page.locator('#height').fill('150');
  await page.locator('#weight').fill('40');
  await page.locator('#tannerToggleBtn').click();
  await page.locator('.vpa-segments [data-puberty-axis="G"][data-puberty-stage="3"]').click();
  await page.locator('.vpa-segments [data-puberty-axis="P"][data-puberty-stage="2"]').click();
  await page.evaluate(() => window.VildaEpicrisisUI.show());
  for (let step = 0; step < 4 && !(await page.locator('#epi-tanner-g').count()); step += 1) {
    await page.getByRole('button', { name: 'Dalej →' }).click();
  }
  await expect(page.locator('#epi-tanner-g')).toHaveValue('3');
  await expect(page.locator('#epi-tanner-p')).toHaveValue('2');
});

test('Karta Pacjenta pokazuje ostatni zapis G/Th/P z datą i wiekiem oceny', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await terms(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  // Własny zaszyfrowany sejf w efemerycznym kontekście Playwrighta; wyłącznie fikcyjne dane.
  await page.evaluate(() => window.VildaVault.createUser('E2e#Konsumenci!2026', { label: 'Fikcyjny sejf konsumentów', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(page);
  const id = await page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjna Karolina', user: { lastName: 'Fikcyjna', firstName: 'Karolina', sex: 'F', age: 12, ageMonths: 0, height: 150, weight: 40,
      pubertyAssessment: { version: 1, sex: 'F', observations: {
        G: null, Th: { stage: 3, sex: 'F', observedAtISO: '2026-04-15', ageMonths: 144, source: 'clinician-entry' },
        P: { stage: 2, sex: 'F', observedAtISO: null, ageMonths: null, source: null } } } }
  }, { dedup: false })).patientId);
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid, null, null), id);
  await page.getByRole('button', { name: /Edytuj/ }).first().click();
  await page.getByRole('button', { name: /Dojrzewanie płciowe/ }).click();
  await expect(page.locator('.ve-coll-body').filter({ hasText: 'Ostatni zapis oceny G/Th/P' }))
    .toContainText('Th3 (15.04.2026, w wieku 12 l 0 mies.) · P2 (czas oceny nieznany)');
});
