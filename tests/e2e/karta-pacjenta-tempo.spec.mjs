import { expect, test } from '../support/test-czas.mjs';

// P-TEMPO etap 3 — Karta pacjenta i Historia mówią o tempie tym samym modelem, co karta
// wzrostowa. Audyt 2026-09-15: kafelek „Prędkość wzrastania" pokazywał liczbę zamrożoną
// przy zapisie bez odstępu, kafelek „SDS tempa" liczył z osi czasu sejfu (inny zestaw
// punktów), a Historia miała własny silnik (> kwartał wstecz) i heurystykę „spadek o 20%".
// Tu patrzymy wyłącznie na to, co realnie trafia na ekran Karty.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#KartaTempo!26aa';

async function otworz(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaTempoWzrastania) && Boolean(window.VildaAuthUI));
}

/* Dziewczynka 9 lat, `wzrost` cm; jeden wiersz historii: 8 lat, 128 cm. Zapis przez
 * przycisk aplikacji, żeby rekord powstał dokładnie tak, jak u lekarza. */
async function policzIZapisz(page, wzrost) {
  await page.fill('#lastName', 'Probna');
  await page.fill('#firstName', 'Ola');
  await page.evaluate((h) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '9'); set('ageMonths', '0'); set('sex', 'F');
    set('height', String(h)); set('weight', '30');
    if (typeof window.update === 'function') window.update();
  }, wzrost);
  await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (f && getComputedStyle(f).display !== 'none') return;
    if (t) { t.disabled = false; t.click(); }
  });
  await expect(page.locator('#advancedGrowthForm')).toBeVisible({ timeout: 10000 });
  await page.waitForSelector('#advMeasurements .measure-row', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => {
      const e = w.querySelector(sel);
      if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    set('.adv-age-years', '8'); set('.adv-age-months', '0');
    set('.adv-height', '128'); set('.adv-weight', '27');
    window.calculateGrowthAdvanced();
  });
  await page.waitForFunction(() => Number(window.advancedGrowthData && window.advancedGrowthData.growthVelocityGapM) === 12);
  await page.locator('#saveDataBtnSidebar').click();
  let id = null;
  await expect.poll(async () => {
    id = await page.evaluate(async () => {
      const lista = await window.VildaVault.listPatients();
      return Array.isArray(lista) && lista.length === 1 && lista[0] ? lista[0].patientId : null;
    });
    return typeof id === 'string' && id.length > 0;
  }, { message: 'sejf ma dokładnie jednego zapisanego pacjenta' }).toBe(true);
  return id;
}

async function otworzKarte(page, id) {
  await page.evaluate(() => window.clearAllData());
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), id);
  await expect(page.locator('.vhv-tile')).toBeVisible();
}

const kafelki = (page) => page.evaluate(() => {
  const pane = [...document.querySelectorAll('.vilda-patient-tab-content')]
    .find((x) => !x.classList.contains('vilda-patient-tab-content--hidden'));
  return [...pane.querySelectorAll('.vilda-patient-stat')].map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim());
});

async function historia(page) {
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const pane = page.locator('.vilda-patient-tab-content[data-tab="timeline"]');
  await expect(pane).toBeVisible();
  await expect(pane).toContainText('cm/rok');
  return (await pane.innerText()).replace(/\s+/g, ' ');
}

test.describe('Karta pacjenta — tempo z jednego modelu', () => {
  test('w normie: kafelek z odstępem, SDS na tym samym odstępie, wiersz Historii bez „Prędkości", bez obserwacji', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    // 135 cm; rok wcześniej 128 cm → 7,0 cm/rok z 12 mies., norma 5–10 lat ≥5 cm/rok.
    const id = await policzIZapisz(page, 135);
    await otworzKarte(page, id);

    const k = await kafelki(page);
    const tempo = k.find((t) => /^Tempo wzrastania/.test(t));
    expect(tempo, 'kafelek nazywa się „Tempo wzrastania", nie „Prędkość"').toBeTruthy();
    expect(tempo).toContain('7,0 cm/rok (z 12 mies.)');
    expect(tempo).not.toMatch(/⚠/);
    expect(k.some((t) => /Prędkość wzrastania/.test(t))).toBe(false);

    await page.locator('.vhv-tile').click();
    const panel = page.locator('.vhv-panel');
    await expect(panel).toBeVisible();
    await expect(panel, 'SDS liczony z tego samego odstępu, co kafelek obok').toContainText('Odstęp pomiarów: 12 mies.');
    await expect(panel).toContainText('Tempo: 7,0 cm/rok');

    const h = await historia(page);
    expect(h).toContain('Tempo 7,0 cm/rok (z 12 mies.)');
    expect(h).not.toMatch(/Prędkość/);
    expect(h, 'tempo w normie — bez automatycznego ostrzeżenia').not.toMatch(/Spowolnienie wzrastania|Zatrzymanie wzrastania/);
  });

  test('poniżej normy: kafelek z flagą, a Historia ze „Spowolnieniem" w brzmieniu karty', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    // 132 cm; rok wcześniej 128 cm → 4,0 cm/rok z 12 mies., poniżej normy ≥5 cm/rok.
    const id = await policzIZapisz(page, 132);
    await otworzKarte(page, id);

    const k = await kafelki(page);
    const tempo = k.find((t) => /^Tempo wzrastania/.test(t));
    expect(tempo).toContain('4,0 cm/rok (z 12 mies.)');
    expect(tempo).toContain('⚠ tempo poniżej normy');

    const h = await historia(page);
    expect(h).toContain('Tempo 4,0 cm/rok (z 12 mies.)');
    expect(h).toContain('Spowolnienie wzrastania');
    expect(h, 'werdykt karty słowo w słowo, nie procenty spadku').toContain('Tempo wzrastania 4,0 cm/rok (z 12 mies.) — poniżej normy dla wieku (norma ≥5 cm/rok)');
    expect(h).not.toMatch(/Prędkość spadła o/);
  });
});
