import { expect, test } from '../support/test-czas.mjs';

// P-NOTATKI rata 3c, pozycja G33 — przycisk „Pełny edytor →" w stopce szybkiego modalu Terminarza.
//
// Ładunek przekazywany pełnemu arkuszowi notatki niósł wyłącznie tytuł, kategorię, datę i treść.
// Godzina i długość wizyty wpisane w szybkim modalu ginęły bez słowa: lekarz ustawiał 10:30 / 45 min,
// klikał „Pełny edytor →" i widział puste pola czasu, a po zapisie termin nie miał godziny.
//
// Kliknięcia wykonujemy przez el.click() w page.evaluate — tak jak pozostałe specy Terminarza
// (elementy overlay'ów o wysokim z-index, warstwa auth-ui ukryta stylami).

const HASLO = 'E2e#PelnyEdytor!2026';

async function otworzTerminarz(page) {
  page.on('dialog', async (d) => { await d.accept(); });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    try {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
      localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
    } catch { /* brak storage — pomiń */ }
  });
  await page.goto('/terminarz.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaTerminarz));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(
    () => window.VildaVault.isUnlocked() && Boolean(document.getElementById('terminarzRoot')),
  );
  await page.evaluate(() => {
    const a = document.getElementById('vilda-auth-ui-root');
    if (a) a.style.display = 'none';
  });
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
}

async function klik(page, sel) {
  await page.locator(sel).first().waitFor({ state: 'attached' });
  await page.evaluate((q) => {
    const el = document.querySelector(q);
    if (!el) throw new Error(`brak ${q}`);
    el.click();
  }, sel);
}

async function ustaw(page, sel, val) {
  await page.locator(sel).first().waitFor({ state: 'attached' });
  await page.evaluate((a) => {
    const el = document.querySelector(a.sel);
    if (!el) throw new Error(`brak ${a.sel}`);
    el.value = a.val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel, val });
}

const zalozPacjenta = (page) => page.evaluate(async () => {
  const w = await window.VildaVault.savePatient({
    name: 'Testowy Zenobiusz',
    user: {
      lastName: 'Testowy', firstName: 'Zenobiusz', sex: 'M',
      age: 9, ageMonths: 0, height: 132, weight: 29,
    },
  }, { dedup: false });
  return w.patientId;
});

async function wybierzPacjenta(page) {
  await page.locator('.tz-nt-item[data-pid]').first().waitFor({ state: 'attached' });
  await ustaw(page, '#tzNtSearch', 'Testowy');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const el = document.querySelector('.tz-nt-item[data-pid]');
    if (!el) throw new Error('brak pacjenta na liście modala');
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}

// Pola czasu w arkuszu pełnego edytora (.vilda-pne).
const godzinaArkusza = (page) => page.locator('.vilda-pne input[type="time"]').first();
const dlugoscArkusza = (page) => page.locator('.vilda-pne input[type="number"][placeholder="20"]').first();

test('G33 — „Pełny edytor →" zabiera ze sobą godzinę i długość wizyty', async ({ page }) => {
  const dzis = await otworzTerminarz(page);
  await zalozPacjenta(page);

  await klik(page, '#tzAddBtn');
  await page.locator('#tzNewTermOverlay').waitFor({ state: 'attached' });
  await wybierzPacjenta(page);
  await klik(page, '#tzNtCats .tz-ntcat[data-cat="treatment"]');
  await ustaw(page, '#tzNtDate', dzis);
  await ustaw(page, '#tzNtTime', '10:30');
  await klik(page, '#tzNtDurPills .tz-ntcat[data-dur="45"]');

  await klik(page, '#tzNtFull');

  await expect(page.locator('.vilda-pne'), 'pełny edytor się otwiera').toBeVisible();
  await expect(godzinaArkusza(page), 'godzina przechodzi z szybkiego modalu').toHaveValue('10:30');
  await expect(dlugoscArkusza(page), 'długość wizyty też').toHaveValue('45');
});

test('G33 — bez daty przypomnienia godzina nie jedzie do arkusza (nie budzimy walidacji G24)', async ({ page }) => {
  // Kontrola negatywna. Walidacja G24 z raty 2 zatrzymuje zapis przy godzinie bez daty;
  // nie wolno wpychać lekarza w ten stan zmianą, która ma godzinę RATOWAĆ.
  await otworzTerminarz(page);
  await zalozPacjenta(page);

  await klik(page, '#tzAddBtn');
  await page.locator('#tzNewTermOverlay').waitFor({ state: 'attached' });
  await wybierzPacjenta(page);
  await klik(page, '#tzNtCats .tz-ntcat[data-cat="treatment"]');
  await ustaw(page, '#tzNtTime', '10:30');
  await ustaw(page, '#tzNtDate', '');

  await klik(page, '#tzNtFull');

  await expect(page.locator('.vilda-pne')).toBeVisible();
  await expect(godzinaArkusza(page), 'godzina bez daty zostaje w szybkim modalu').toHaveValue('');
  await expect(dlugoscArkusza(page)).toHaveValue('');
});

test('G33 — notatka z kotwicą wieku omija szybki modal i idzie prosto do pełnego edytora', async ({ page }) => {
  // Bramka Bn: wpis z linkedAgeMonths (także 0 — noworodek z G9) albo z datą zdarzenia
  // nie mieści się w szybkim modalu, bo ten nie ma tych pól i po cichu by je zgubił.
  const dzis = await otworzTerminarz(page);
  const patientId = await zalozPacjenta(page);

  const noteId = await page.evaluate(async (d) => {
    const w = await window.VildaVault.savePatientNote({
      patientId: d.patientId, title: 'Z KOTWICĄ', body: 'Kontrola wzrostu.',
      category: 'followup', dueDateISO: d.dzis, linkedAgeMonths: 108,
    });
    return w.id;
  }, { patientId, dzis });

  await page.evaluate(() => window.VildaTerminarz.refresh());
  await page.waitForTimeout(600);

  const rozstrzygniecie = await page.evaluate(async (id) => {
    const lista = await window.VildaVault.listAllPatientNotes();
    const wpis = lista.find((n) => n.id === id);
    return {
      znaleziony: Boolean(wpis),
      kotwica: wpis ? wpis.linkedAgeMonths : null,
      bn: window.VildaTerminarz.__internals.Bn(wpis),
    };
  }, noteId);

  expect(rozstrzygniecie.znaleziony, 'notatka jest w Terminarzu').toBe(true);
  expect(rozstrzygniecie.kotwica).toBe(108);
  expect(rozstrzygniecie.bn, 'false = pełny edytor, nie szybki modal').toBe(false);
});
