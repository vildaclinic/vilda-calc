import { expect, test } from '../support/test-czas.mjs';
import { czekajNaPacjentow, czekajNaZnikniecieRekordu } from '../support/sejf-czekanie.mjs';

// P-SCALANIE (zlecenie właściciela 2026-09-15): widok „Duplikaty" w zakładce Pacjenci scala
// rekordy Z BAZY o tym samym nazwisku — na życzenie lekarza, po potwierdzeniu, nigdy sam.
// Przed zmianą grupa „różni pacjenci o tym samym nazwisku" była tylko do oglądania.
// Własne, fikcyjne konto sejfu; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Scalanie!26dd';

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
    window.__alerty = [];
    window.alert = (t) => { window.__alerty.push(String(t)); };
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && typeof window.VildaVault.mergePatients === 'function');
}

/* Klasyczny duplikat: stary rekord bez daty (2 wersje, historia 2 wierszy) i nowy z datą. */
async function paraDuplikatow(page) {
  return page.evaluate(async () => {
    const V = window.VildaVault;
    const a = await V.savePatient({
      name: 'Fikcyjna Ewa', user: { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', age: 8, ageMonths: 0, height: 126, weight: 25 },
      advanced: { data: { measurements: [{ ageMonths: 84, ageYears: 7, height: 120, weight: 22 }] } },
    }, { dedup: false });
    await V.savePatient({
      name: 'Fikcyjna Ewa', user: { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', age: 8, ageMonths: 6, height: 129, weight: 26 },
      advanced: { data: { measurements: [{ ageMonths: 84, ageYears: 7, height: 120, weight: 22 }, { ageMonths: 96, ageYears: 8, height: 126, weight: 25 }] } },
    }, { patientId: a.patientId, dedup: false });
    const b = await V.savePatient({
      name: 'Fikcyjna Ewa', user: { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', dobISO: '2017-03-05', age: 9, ageMonths: 4, height: 135, weight: 30.8 },
      advanced: { data: { measurements: [{ ageMonths: 106, ageYears: 106 / 12, height: 131, weight: 28 }] } },
    }, { dedup: false, forceNew: true });
    await V.savePatientNote({ patientId: a.patientId, title: 'Kontrola', body: '', category: 'kontrola', dueDateISO: '2026-12-01' });
    return { stary: a.patientId, nowy: b.patientId };
  });
}

/* Odczyt w trakcie scalania może trafić na rekord, którego wersje już przepięto (snapshots puste)
   albo nagłówek już usunięty — taki rekord pomijamy, zamiast wywracać test na `undefined.payload`. */
const pacjenci = (page) => page.evaluate(async () => {
  const l = await window.VildaVault.listPatients();
  const out = [];
  for (const p of l) {
    const f = await window.VildaVault.getPatient(p.patientId);
    const glowa = f && Array.isArray(f.snapshots) ? f.snapshots[0] : null;
    if (!f || !f.header || !glowa || !glowa.payload) continue;
    const pom = ((glowa.payload.advanced || {}).data || {}).measurements || [];
    out.push({ id: p.patientId, dob: f.header.dobISO || null, n: f.snapshotCount,
      rows: pom.map((m) => m.ageMonths).sort((x, y) => x - y),
      notatki: (await window.VildaVault.listPatientNotesForPatient(p.patientId)).length });
  }
  return out;
});

/* Koniec scalania poznajemy po ZNIKNIĘCIU rekordu źródłowego — to ostatni krok mergePatients,
   po nim wszystko inne (przepięcie wersji, scalona głowa, poprawka licznika, notatki) jest już
   zrobione. Dotychczasowa bramka na samej długości listy była podwójnie zawodna: liczyła przez
   page.waitForFunction z predykatem `async` (Promise jest zawsze prawdziwy, więc przepuszczała
   od razu), a helper `pacjenci` niżej celowo POMIJA rekord bez poprawnej głowy — czyli źródło
   w trakcie scalania — więc i on pokazywał 1, zanim scalanie się skończyło. */
async function czekajNaKoniecScalania(page, zrodlowyId) {
  await czekajNaZnikniecieRekordu(page, zrodlowyId);
  await expect
    .poll(async () => page.evaluate(() => window.__alerty.some((a) => /Scalono/.test(a))), { timeout: 15000 })
    .toBe(true);
}

async function otworzDuplikaty(page) {
  await page.evaluate(() => window.VildaAuthUI.showPatientsList(() => {}));
  const przejrzyj = page.locator('.pt-dupbar button', { hasText: 'Przejrzyj' });
  await expect(przejrzyj, 'pasek duplikatów widoczny').toBeVisible({ timeout: 15000 });
  await przejrzyj.click();
  await expect(page.locator('.pt-dupgrp')).toHaveCount(1);
}

test.describe('Duplikaty z bazy — scalanie na życzenie lekarza', () => {
  test('grupa pokazuje oba rekordy, a „Zostaw ten" scala pozostałe po potwierdzeniu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const { stary, nowy } = await paraDuplikatow(page);
    await otworzDuplikaty(page);

    const wiersze = page.locator('.pt-dupgrp .pt-duprow');
    await expect(wiersze).toHaveCount(2);
    await expect(page.locator('.pt-dupgrp-sub')).toContainText('Zostaw ten');
    const przyciski = page.locator('.pt-dupgrp .pt-merge-btn--base');
    await expect(przyciski).toHaveCount(2);

    // Zostaje rekord z datą urodzenia (drugi wiersz: „ur. …").
    const wierszZData = page.locator('.pt-dupgrp .pt-duprow', { hasText: 'ur.' });
    await expect(wierszZData).toHaveCount(1);
    await wierszZData.locator('.pt-merge-btn--base').click();

    const arkusz = page.locator('.vilda-auth-sheet-conflict[aria-label="Scalić w jeden rekord?"]');
    await expect(arkusz).toBeVisible();
    await expect(arkusz).toContainText('Zostaje: „Fikcyjna Ewa”');
    await expect(arkusz).toContainText('Dołączony i usunięty');
    await expect(arkusz).toContainText('nie można cofnąć');
    await arkusz.locator('button', { hasText: 'Scal w jeden rekord' }).click();

    await czekajNaKoniecScalania(page, stary);
    await czekajNaPacjentow(page, 1);
    await expect.poll(async () => (await pacjenci(page)).length, { timeout: 15000 }).toBe(1);
    const [p] = await pacjenci(page);
    expect(p.id).toBe(nowy);
    expect(p.dob).toBe('2017-03-05');
    expect(p.n, '1 wersja celu + 2 źródła + scalona głowa').toBe(4);
    expect(p.rows).toEqual([84, 96, 106]);
    expect(p.notatki, 'wpis Terminarza przepięty').toBe(1);
    expect(await page.evaluate(async (id) => window.VildaVault.getPatient(id), stary)).toBeNull();
    const alerty = await page.evaluate(() => window.__alerty);
    expect(alerty.some((a) => /Scalono 1 rekord/.test(a))).toBe(true);
    // Po scaleniu lista wraca bez paska duplikatów.
    await expect(page.locator('.pt-dupbar')).toHaveCount(0);
  });

  test('„Anuluj" w arkuszu niczego nie zmienia', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    await paraDuplikatow(page);
    await otworzDuplikaty(page);
    await page.locator('.pt-dupgrp .pt-merge-btn--base').first().click();
    const arkusz = page.locator('.vilda-auth-sheet-conflict[aria-label="Scalić w jeden rekord?"]');
    await expect(arkusz).toBeVisible();
    await arkusz.locator('button', { hasText: 'Anuluj' }).click();
    await expect(arkusz).toHaveCount(0);
    expect((await pacjenci(page)).length).toBe(2);
  });

  test('„To różne dzieci" ukrywa grupę na tym urządzeniu i nie rusza rekordów', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    await paraDuplikatow(page);
    await otworzDuplikaty(page);
    await page.locator('.pt-dup-rozne').click();
    await expect(page.locator('.pt-dupgrp')).toHaveCount(0);
    await expect(page.locator('.pt-empty')).toContainText('Brak duplikatów');
    expect((await pacjenci(page)).length).toBe(2);
    // Po ponownym otwarciu listy grupa nadal ukryta, a znacznik „możliwy duplikat" zniknął.
    await page.evaluate(() => window.VildaAuthUI.showPatientsList(() => {}));
    await expect(page.locator('.vilda-patients2')).toBeVisible();
    await expect(page.locator('.pt-dupbar')).toHaveCount(0);
    await expect(page.locator('.pt-row--dup')).toHaveCount(0);
    const klucz = await page.evaluate(() => window.localStorage.getItem('vildaDuplikatyRozneV1'));
    expect(klucz, 'pamięć trzyma tylko identyfikatory').not.toMatch(/Fikcyjna/);
  });
});
