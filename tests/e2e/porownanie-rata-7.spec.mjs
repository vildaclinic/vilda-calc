import { expect, test } from '@playwright/test';

// P-WERDYKT rata 7 (decyzja właściciela 2026-09-27) na PRAWDZIWEJ stronie: karta „Porównanie z poprzednim pomiarem"
// przy oknie 1 mies. mówi o chudnięciu (ruch po tempie rocznym, kierunek przed poziomem, liczby w ogonie), pokazuje
// procent i tempo obok Δ kg, a przy punkcie leczenia otyłości w rekordzie — dopisek „w trakcie leczenia" i chip
// kontekstu także wtedy, gdy okno jest krótsze niż próg oceny (3 mies.). Zmiana punktów w monitorze odświeża kartę
// bez nowego pomiaru. Liczby z przypadku właściciela bez danych osobowych; dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Rata7!26d';

async function wpisz(page, pola) {
  await page.evaluate((p) => {
    Object.keys(p).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('brak pola ' + id);
      el.value = p[id];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (typeof window.update === 'function') window.update();
  }, pola);
}

async function pierwszaWizytaIWczytanie(page, pierwszy, przedZapisem) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
    try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (_) { /* brak schowka */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.update === 'function'
    && typeof window.saveUserData === 'function' && Boolean(window.VildaSummaryCards)
    && window.VildaWerdykt && window.VildaWerdykt.version === '7');
  await page.evaluate(() => { const a = document.getElementById('vilda-auth-ui-root'); if (a) a.style.display = 'none'; });
  const baner = page.locator('#consent-decline');
  if (await baner.count() && await baner.isVisible()) await baner.click();
  await page.waitForFunction(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, { timeout: 15000 });

  await wpisz(page, { firstName: 'Testowy', lastName: 'Fikcyjny-Rata7', ...pierwszy });
  await przedZapisem(page);
  await page.waitForTimeout(400);
  await expect.poll(() => page.evaluate(async () => Boolean(await window.saveUserData())), { timeout: 15000 }).toBe(true);
  await expect.poll(async () => page.evaluate(async () => (await window.VildaVault.listPatients()).length), { timeout: 15000 }).toBeGreaterThan(0);
  const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked() && typeof window.applyLoadedData === 'function');
  await page.evaluate(() => { const a = document.getElementById('vilda-auth-ui-root'); if (a) a.style.display = 'none'; });
  await page.evaluate(async (id) => {
    const p = await window.VildaVault.getPatient(id);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, pid);
  await page.waitForFunction(() => typeof window._vildaCurrentPatientId === 'string');
  const nowy = page.getByRole('button', { name: 'Nowy pomiar' }).first();
  await expect(nowy, 'modal „Co chcesz zrobić?" z przyciskiem Nowy pomiar').toBeVisible({ timeout: 10000 });
  await nowy.click();
  await expect(page.locator('#prevSummaryCard')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#weight')).toHaveValue('');
  return pid;
}

// chłopiec 16 l. 3 mies., 142 cm, 64 kg (BMI 31,7, >99c) → miesiąc później 62 kg (BMI 30,7)
const DZIECKO_1 = { sex: 'M', age: '16', ageMonths: '3', weight: '64', height: '142' };
const DZIECKO_2 = { age: '16', ageMonths: '4', weight: '62', height: '142' };
const PUNKT_OT = { id: 'ot-e2e-r7', type: 'start', ageYears: 16, ageMonths: 2, weight: 64.5, height: 142, drug: 'Wegovy' };

test('R7-1: bez punktów leczenia — po miesiącu karta mówi o redukcji z liczbami, BMI z poziomem, procent i tempo obok Δ', async ({ page }) => {
  test.setTimeout(150_000);
  await pierwszaWizytaIWczytanie(page, DZIECKO_1, async () => {});
  await wpisz(page, DZIECKO_2);
  const masa = page.locator('#prevSummaryCard tr[data-klucz="masa"]');
  const bmi = page.locator('#prevSummaryCard tr[data-klucz="bmi"]');
  await expect(masa.locator('.pt-zmiana .pt-pill')).toHaveText('redukcja masy ciała w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies.', { timeout: 10000 });
  await expect(masa.locator('.pt-zmiana .pt-tempo')).toHaveText('−3,1 %, −2,00 kg/mies.');
  await expect(bmi.locator('.pt-zmiana .pt-pill')).toHaveText(/^spadek BMI w krótkim oknie — −1,0 \(−3,1 %\) w 1 mies\., nadal otyłość \(>97c\)$/);
  await expect(bmi.locator('.pt-zmiana .pt-tempo')).toHaveText('−3,1 %');
  await expect(page.locator('#porownanieKontekst')).toBeHidden();
});

test('R7-2: punkt leczenia otyłości w rekordzie — dopisek „w trakcie leczenia" i chip kontekstu przy oknie 1 mies.; usunięcie punktu odświeża kartę bez nowego pomiaru', async ({ page }) => {
  test.setTimeout(150_000);
  await pierwszaWizytaIWczytanie(page, DZIECKO_1, async (p) => {
    await p.evaluate((pt) => {
      try { window.VildaPersistence.writeModuleJSON('OBESITY_THERAPY_POINTS', [pt], { force: true }); } catch (_) { /* brak modułu */ }
      if (typeof window.obesityTherapyMonitorSetPoints === 'function') window.obesityTherapyMonitorSetPoints([pt]);
      else window.obesityTherapyPoints = [pt];
    }, PUNKT_OT);
  });
  await expect.poll(() => page.evaluate(() => Array.isArray(window.obesityTherapyPoints) ? window.obesityTherapyPoints.length : -1)).toBe(1);
  await wpisz(page, DZIECKO_2);
  const masa = page.locator('#prevSummaryCard tr[data-klucz="masa"]');
  const bmi = page.locator('#prevSummaryCard tr[data-klucz="bmi"]');
  await expect(masa.locator('.pt-zmiana .pt-pill')).toHaveText('redukcja masy ciała w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies., w trakcie leczenia (1 mies., ocena od 3 mies.)', { timeout: 10000 });
  await expect(bmi.locator('.pt-zmiana .pt-pill')).toHaveText(/nadal otyłość \(>97c\), w trakcie leczenia \(1 mies\., ocena od 3 mies\.\)$/);
  await expect(page.locator('#porownanieKontekst')).toHaveText('kontekst: leczenie otyłości (Wegovy) — 1 mies. w odcinku');
  // P7: zmiana punktów (tu: usunięcie) ogłoszona sygnałem monitorów przelicza kartę bez wpisywania pomiaru.
  // Strona główna nie ładuje monitora otyłości (jest na docpro) — sygnał wysyłany tak, jak wysyła go monitor (R7-3).
  await page.evaluate(() => {
    window.obesityTherapyPoints = [];
    document.dispatchEvent(new CustomEvent('vilda:therapy-points-changed', { detail: { source: 'obesity' } }));
  });
  await expect(page.locator('#porownanieKontekst')).toBeHidden({ timeout: 10000 });
  await expect(masa.locator('.pt-zmiana .pt-pill')).toHaveText('redukcja masy ciała w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies.');
});

test('R7-3: docpro — monitory GH i otyłości ogłaszają zmianę punktów sygnałem, którego słucha karta porównania', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.obesityTherapyMonitorSetPoints === 'function' && typeof window.refreshGHTherapyMonitor === 'function');
  const zrodla = await page.evaluate(() => new Promise((resolve) => {
    const got = [];
    document.addEventListener('vilda:therapy-points-changed', (e) => { got.push(e.detail && e.detail.source); });
    window.obesityTherapyMonitorSetPoints([{ id: 'ot-e2e-r7b', type: 'start', ageYears: 12, ageMonths: 0, weight: 60, height: 150, drug: 'Saxenda' }]);
    window.refreshGHTherapyMonitor();
    setTimeout(() => resolve(got), 300);
  }));
  expect(zrodla).toContain('obesity');
  expect(zrodla).toContain('gh');
});
