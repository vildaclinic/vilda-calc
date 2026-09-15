import { expect, test } from '@playwright/test';

// Zlecenie właściciela 2026-09-15: docpro.html ma mieć Nazwisko i Imię w dwóch polach, jak
// strona główna. Jedno pole gubiło jawne części nazwiska w rekordzie, a przy następnym
// wczytaniu na index aplikacja pytała, które słowo jest nazwiskiem. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Docpro!26ee';

async function otworz(page, strona) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(strona, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
}

async function konto(page) {
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowe(page);
}

async function gotowe(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.saveUserData === 'function' && typeof window.collectUserData === 'function');
  // DocPro chowa kalkulator za bramką PRO (html.vilda-pro-inactive → .container ukryty). Pola
  // nazwiska nie zależą od PRO; na potrzeby asercji widoczności odsłaniamy kontener tak, jak
  // widzi go użytkownik z aktywnym planem.
  await page.evaluate(() => {
    document.documentElement.classList.remove('vilda-pro-inactive');
    document.documentElement.classList.add('vilda-pro-active');
  });
  await page.waitForTimeout(800);
}

function wpisz(page, pola) {
  return page.evaluate((p) => {
    Object.keys(p).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('brak pola ' + id);
      el.value = p[id];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, pola);
}

const stan = (page) => page.evaluate(() => {
  const d = window.collectUserData() || {};
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
  return { name: g('name'), lastName: g('lastName'), firstName: g('firstName'),
    kolektor: { name: d.name, firstName: d.user && d.user.firstName, lastName: d.user && d.user.lastName } };
});

test.describe('docpro — Nazwisko i Imię w dwóch polach', () => {
  test('pola istnieją, kanon #name składa się z nich, a rekord dostaje jawne części', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, '/docpro.html');
    await konto(page);
    await expect(page.locator('#lastName')).toBeVisible();
    await expect(page.locator('#firstName')).toBeVisible();
    await expect(page.locator('#name')).toBeHidden();

    await wpisz(page, { lastName: 'Fikcyjny', firstName: 'Tomasz', sex: 'M', age: '7', ageMonths: '2', weight: '24', height: '122' });
    const s = await stan(page);
    expect(s.name).toBe('Fikcyjny Tomasz');
    expect(s.kolektor.lastName).toBe('Fikcyjny');
    expect(s.kolektor.firstName).toBe('Tomasz');

    expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
    const rekord = await page.evaluate(async () => {
      const l = await window.VildaVault.listPatients();
      const f = await window.VildaVault.getPatient(l[0].patientId);
      const u = f.snapshots[0].payload.user;
      return { hdrLn: f.header.lastName, hdrFn: f.header.firstName, plLn: u.lastName, plFn: u.firstName };
    });
    expect(rekord).toEqual({ hdrLn: 'Fikcyjny', hdrFn: 'Tomasz', plLn: 'Fikcyjny', plFn: 'Tomasz' });
  });

  test('nazwa wpisana na stronie głównej pojawia się na docpro już rozdzielona', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, '/index.html');
    await konto(page);
    await wpisz(page, { lastName: 'Fikcyjna-Dwuczłonowa', firstName: 'Anna Maria', sex: 'K', age: '6', ageMonths: '0', weight: '20', height: '115' });
    await page.waitForTimeout(600);
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await gotowe(page);
    const s = await stan(page);
    expect(s.lastName).toBe('Fikcyjna-Dwuczłonowa');
    expect(s.firstName).toBe('Anna Maria');
    expect(s.kolektor.name).toBe('Fikcyjna-Dwuczłonowa Anna Maria');
  });

  test('stary rekord z jedną nazwą dostaje na docpro to samo pytanie o rozdzielenie, co na stronie głównej', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, '/docpro.html');
    await konto(page);
    const pid = await page.evaluate(async () => (await window.VildaVault.savePatient({
      name: 'Szymon Fikcyjny', user: { sex: 'M', age: 10, ageMonths: 0, height: 140, weight: 33 },
    }, { dedup: false })).patientId);
    await page.evaluate(async (id) => {
      const p = await window.VildaVault.getPatient(id);
      window.applyLoadedData(p.snapshots[0].payload);
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id, source: 'pick' } }));
    }, pid);
    const prompt = page.locator('.vnf-fix:not([hidden])');
    await expect(prompt).toBeVisible({ timeout: 10000 });
    await expect(prompt).toContainText('Szymon Fikcyjny');
    // Po wczytaniu pacjenta aplikacja najpierw pyta „Nowy pomiar / Odtwórz zapisany stan"
    // (okno leży nad promptem) — lekarz odpowiada na nie, a dopiero potem rozdziela nazwisko.
    await page.locator('#vildaLcmNew').click();
    // Nazwisko = ostatni token (opcja pierwsza).
    await prompt.locator('button').first().click();
    await expect.poll(async () => (await stan(page)).lastName).toBe('Fikcyjny');
    expect((await stan(page)).firstName).toBe('Szymon');
    await expect.poll(async () => page.evaluate(async (id) => {
      const p = await window.VildaVault.getPatient(id);
      return p.snapshots[0].payload.user.lastName || null;
    }, pid)).toBe('Fikcyjny');
  });
});
