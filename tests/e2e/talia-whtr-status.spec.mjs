import { expect, test } from '../support/test-czas.mjs';

// P-TALIA rata P (2026-09-22): kafelki „Obwód talii” i „Talia / wzrost” w Statusie dorosłego
// na PRAWDZIWEJ Karcie pacjenta: od 19 lat, tylko gdy rekord ma obwód talii, z werdyktem kolorem
// jak BMI (progi z pliku danych: WHO populacja europejska; NICE dla BMI < 35).
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Talia!26p';

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.VildaBmi) && Boolean(window.VildaObwodTalii) && Boolean(window.VildaObwodTaliiDane));
}

async function zalozIOtworz(page, d) {
  const pid = await page.evaluate(async (d) => {
    const wynik = await window.VildaVault.savePatient({
      name: `Testowy ${d.imie}`,
      user: { lastName: 'Testowy', firstName: d.imie, sex: d.plec, age: d.wiekLat, ageMonths: d.mies || 0, height: d.wzrost, weight: d.masa, waist: d.talia, hip: d.biodra },
      zscore: { dataSource: 'OLAF' },
      advanced: { data: {} },
    }, { dedup: false });
    return wynik.patientId;
  }, d);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
  await expect(page.locator('.vilda-patient-tab-content[data-tab="antro"]')).toBeVisible();
  return pid;
}

const kafelek = (page, etykieta) => page.locator('.vilda-patient-stat', { has: page.locator('.vilda-patient-stat-label', { hasText: etykieta }) });

test.describe('P-TALIA — obwód talii i WHtR w Statusie dorosłego', () => {
  test('TALIA-1: mężczyzna 178 cm, talia 96 cm, BMI 28 → talia podwyższone (improve), WHtR 0,54 podwyższone', async ({ page }) => {
    await otworzZKontem(page);
    await zalozIOtworz(page, { imie: 'Talia-A', plec: 'M', wiekLat: 45, wzrost: 178, masa: 88.7, talia: 96, biodra: 100 });
    const t = kafelek(page, 'Obwód talii');
    await expect(t).toBeVisible();
    await expect(t).toContainText('96,0 cm');
    await expect(t).toContainText('podwyższone ryzyko (mężczyźni ≥ 94 cm)');
    await expect(t).toContainText('progi WHO, populacja europejska');
    await expect(t).toHaveClass(/vilda-patient-stat--improve/);
    const w = kafelek(page, 'Talia / wzrost');
    await expect(w).toBeVisible();
    await expect(w).toContainText('0,54');
    await expect(w).toContainText('podwyższone ryzyko (0,5–0,59)');
    await expect(w).toContainText('wg NICE; ocena dla BMI < 35');
    await expect(w).toHaveClass(/vilda-patient-stat--improve/);
  });

  test('TALIA-2: kobieta 165 cm, talia 90 cm → znacznie podwyższone (alert); WHtR 0,55', async ({ page }) => {
    await otworzZKontem(page);
    await zalozIOtworz(page, { imie: 'Talia-B', plec: 'F', wiekLat: 52, wzrost: 165, masa: 80, talia: 90 });
    const t = kafelek(page, 'Obwód talii');
    await expect(t).toContainText('znacznie podwyższone ryzyko (kobiety ≥ 88 cm)');
    await expect(t).toHaveClass(/vilda-patient-stat--alert/);
    await expect(kafelek(page, 'Talia / wzrost')).toContainText('0,55');
  });

  test('TALIA-3: BMI ≥ 35 — talia oceniona, WHtR bez werdyktu; norma → zielony', async ({ page }) => {
    await otworzZKontem(page);
    await zalozIOtworz(page, { imie: 'Talia-C', plec: 'M', wiekLat: 47, wzrost: 167, masa: 112.4, talia: 118 });
    await expect(kafelek(page, 'Obwód talii')).toHaveClass(/vilda-patient-stat--alert/);
    const w = kafelek(page, 'Talia / wzrost');
    await expect(w).toContainText('0,71');
    await expect(w).toContainText('przy BMI ≥ 35 wskaźnik nie różnicuje ryzyka');
    await expect(w, 'bez werdyktu: ani alarm, ani ok').not.toHaveClass(/vilda-patient-stat--/);
    await zalozIOtworz(page, { imie: 'Talia-D', plec: 'M', wiekLat: 30, wzrost: 180, masa: 75, talia: 84 });
    await expect(kafelek(page, 'Obwód talii')).toContainText('w normie (mężczyźni < 94 cm)');
    await expect(kafelek(page, 'Obwód talii')).toHaveClass(/vilda-patient-stat--ok/);
    await expect(kafelek(page, 'Talia / wzrost')).toContainText('0,47');
    await expect(kafelek(page, 'Talia / wzrost')).toHaveClass(/vilda-patient-stat--ok/);
  });

  test('TALIA-4: bez obwodu talii i poniżej 19 lat kafelków nie ma', async ({ page }) => {
    await otworzZKontem(page);
    await zalozIOtworz(page, { imie: 'Talia-E', plec: 'M', wiekLat: 45, wzrost: 178, masa: 88.7 });
    await expect(kafelek(page, 'Obwód talii')).toHaveCount(0);
    await expect(kafelek(page, 'Talia / wzrost')).toHaveCount(0);
    await zalozIOtworz(page, { imie: 'Talia-F', plec: 'M', wiekLat: 18, mies: 6, wzrost: 178, masa: 88.7, talia: 96 });
    await expect(kafelek(page, 'Obwód talii')).toHaveCount(0);
    await expect(kafelek(page, 'Talia / wzrost')).toHaveCount(0);
  });
});
