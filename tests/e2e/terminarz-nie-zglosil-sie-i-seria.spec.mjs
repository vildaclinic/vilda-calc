import { expect, test } from '../support/test-czas.mjs';

// Dwie poprawki Terminarza na życzenie właściciela (2026-09-11):
//
// 1. „Nie zgłosił się” było dostępne tylko dla kategorii „Kontrola” (followup). Pacjent nie
//    zgłasza się także na leczenie, badanie i obserwację — bramka ga() obejmuje teraz wszystkie
//    cztery kategorie pacjenta ($a), a „Przełóż” zostaje obok (wcześniej wykluczały się).
// 2. Seria podań leku (kategoria „Leczenie”) po zapisaniu dawała się tylko podejrzeć: modal
//    edycji wpisu chował sekcję „Powtarzaj podanie” dla istniejących wpisów. Teraz przy edycji
//    wpisu serii sekcja wraca jako „Przedłuż serię”: wybór kroku i horyzontu, dialog
//    „Sprawdzenie terminów” od ostatniego terminu serii + krok, nowe wpisy w TEJ SAMEJ serii.
//
// Realna strona terminarz.html z prawdziwym sejfem (VildaVault, IndexedDB) — jak w
// terminarz-transakcje.spec.mjs, skąd pochodzą pomocniki.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#TzSeria!2026x';

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const d10 = (s) => String(s || '').slice(0, 10);

async function otworzTerminarz(page) {
  const dialogi = [];
  page.on('dialog', async (d) => {
    dialogi.push({ typ: d.type(), tekst: d.message() });
    await d.accept();
  });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
  await page.addInitScript(() => {
    try {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
      localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/terminarz.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaTerminarz));
  await page.evaluate(
    async (pw) => (await window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 })).userId,
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
  const today = await page.evaluate(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  const dow = new Date(`${today}T12:00:00`).getDay();
  const D1 = addDays(today, (8 - dow) % 7 || 7); // najbliższy przyszły poniedziałek
  const D = (n) => addDays(D1, n - 1);
  return { dialogi, D1, D };
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
  await page.evaluate(
    (a) => {
      const el = document.querySelector(a.sel);
      if (!el) throw new Error(`brak ${a.sel}`);
      el.value = a.val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel, val },
  );
}

const wszystkieNotatki = (page) =>
  page.evaluate(async () =>
    (await window.VildaVault.listAllPatientNotes()).map((n) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      dueDateISO: n.dueDateISO || null,
      dueTime: n.dueTime || null,
      seriesId: n.seriesId || null,
      noShowAtISO: n.noShowAtISO || null,
      medication: n.medication || null,
    })),
  );

const odswiez = async (page) => {
  await page.evaluate(() => window.VildaTerminarz.refresh());
  await page.waitForTimeout(700);
};

const zapiszPacjenta = (page, name) =>
  page.evaluate(
    async (n) => (await window.VildaVault.savePatient({ name: n, user: { age: 9, sex: 'M' } })).patientId,
    name,
  );

async function idzDoTygodnia(page, D1) {
  await page.evaluate(() => window.VildaTerminarz.setView('week'));
  await page.waitForTimeout(300);
  await klik(page, '#tzToday');
  await page.waitForTimeout(400);
  for (let k = 0; k < 3; k += 1) {
    const jest = await page.evaluate(
      (d) => Boolean(document.querySelector(`.tz-wx__cell[data-add-day="${d}"]`)),
      D1,
    );
    if (jest) return;
    await klik(page, '#tzNext');
    await page.waitForTimeout(500);
  }
  throw new Error(`Nie znaleziono tygodnia z dniem ${D1}`);
}

async function otworzPopover(page, id) {
  await page.locator(`.tz-wb[data-note-id="${id}"]`).waitFor({ state: 'attached' });
  await klik(page, `.tz-wb[data-note-id="${id}"]`);
  await page.locator('.tz-pop').waitFor({ state: 'attached' });
}

const przyciskiPopovera = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.tz-pop .tz-pop__grid button[data-pop]')).map((b) =>
      b.getAttribute('data-pop'),
    ),
  );

// ---------------------------------------------------------------------------------------------

test('„Nie zgłosił się” jest dostępne dla leczenia, badania i obserwacji — obok „Przełóż”', async ({
  page,
}) => {
  const { D, D1 } = await otworzTerminarz(page);
  const pid = await zapiszPacjenta(page, 'Nieobecny Norbert');
  const kategorie = [
    ['followup', 1],
    ['treatment', 2],
    ['wynik-badania', 3],
    ['observation', 4],
  ];
  const ids = {};
  for (const [cat, dzien] of kategorie) {
    ids[cat] = await page.evaluate(
      async (a) =>
        (
          await window.VildaVault.savePatientNote({
            patientId: a.pid,
            title: `Wpis ${a.cat}`,
            body: '',
            category: a.cat,
            dueDateISO: a.d,
            dueTime: '10:00',
          })
        ).id,
      { pid, cat, d: D(dzien) },
    );
  }
  await idzDoTygodnia(page, D1);
  await odswiez(page);

  for (const [cat] of kategorie) {
    await otworzPopover(page, ids[cat]);
    const btns = await przyciskiPopovera(page);
    expect(btns, `${cat}: brak „Nie zgłosił się”`).toContain('noshow');
    expect(btns, `${cat}: „Przełóż” ma zostać obok`).toContain('postpone');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }

  // Klik „Nie zgłosił się” na leczeniu odnotowuje nieobecność pacjenta w sejfie.
  await otworzPopover(page, ids.treatment);
  await klik(page, '.tz-pop button[data-pop="noshow"]');
  await expect
    .poll(async () => (await wszystkieNotatki(page)).find((n) => n.id === ids.treatment).noShowAtISO)
    .toBeTruthy();
});

test('Serię podań leku da się przedłużyć z modala edycji wpisu serii', async ({ page }) => {
  const { D, D1, dialogi } = await otworzTerminarz(page);
  await zapiszPacjenta(page, 'Seria Sebastian');

  // Seria: co 7 dni przez 3 miesiące od poniedziałku D1 (bez kolizji z weekendem).
  await klik(page, '#tzAddBtn');
  await page.locator('#tzNewTermOverlay').waitFor({ state: 'attached' });
  await page.locator('.tz-nt-item[data-pid]').first().waitFor({ state: 'attached' });
  await ustaw(page, '#tzNtSearch', 'Sebastian');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const el = document.querySelector('.tz-nt-item[data-pid]');
    if (!el) throw new Error('brak pacjenta na liście modala');
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await klik(page, '#tzNtCats .tz-ntcat[data-cat="treatment"]');
  await ustaw(page, '#tzNtDate', D1);
  await ustaw(page, '#tzNtTitle', 'Somatropina');
  await klik(page, '#tzNtRxStep .tz-ntcat[data-step="7"]');
  await klik(page, '#tzNtRxHorizon .tz-ntcat[data-mon="3"]');
  await klik(page, '#tzNtSave');
  await page.locator('#tzRxDlg #tzRxSave').waitFor({ state: 'attached' });
  await klik(page, '#tzRxDlg #tzRxSave');
  // Dialog znika dopiero po zapisaniu OSTATNIEGO wpisu serii — dopóki jest w DOM, zapis trwa.
  // Migawka „przed” brana wcześniej łapała serię w połowie (CI: 6 z 14 wpisów) i późniejsza
  // kontrola „zwykły zapis niczego nie dokłada” widziała dokończenie serii jako dołożenie.
  await expect(page.locator('#tzRxDlg')).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(async () => (await wszystkieNotatki(page)).filter((n) => n.category === 'treatment').length)
    .toBeGreaterThan(5);
  const przed = (await wszystkieNotatki(page)).filter((n) => n.category === 'treatment');
  const seriesId = przed[0].seriesId;
  expect(seriesId).toBeTruthy();
  expect(przed.every((n) => n.seriesId === seriesId)).toBe(true);
  const datyPrzed = przed.map((n) => d10(n.dueDateISO)).sort();
  const ostatniaPrzed = datyPrzed[datyPrzed.length - 1];

  // Edycja wpisu serii z popovera: sekcja „Przedłuż serię” ma być widoczna.
  await idzDoTygodnia(page, D1);
  await odswiez(page);
  const pierwszy = przed.find((n) => d10(n.dueDateISO) === D1);
  await otworzPopover(page, pierwszy.id);
  await klik(page, '.tz-pop button[data-pop="edit"]');
  await page.locator('#tzNewTermOverlay').waitFor({ state: 'attached' });
  await expect(page.locator('#tzNtRxSec')).toBeVisible();
  await expect(page.locator('#tzNtRxExtHint')).toContainText('Ta seria:');

  // Zwykły „Zapisz zmiany” bez przedłużania niczego nie dokłada.
  await ustaw(page, '#tzNtTitle', 'Somatropina 0,5 mg');
  await klik(page, '#tzNtSave');
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  await expect
    .poll(async () => (await wszystkieNotatki(page)).filter((n) => n.category === 'treatment').length)
    .toBe(przed.length);
  expect(
    (await wszystkieNotatki(page)).find((n) => n.id === pierwszy.id).title,
    'edycja pojedynczego wpisu zapisana',
  ).toBe('Somatropina 0,5 mg');

  // Przedłużenie: co 7 dni o 3 miesiące od ostatniego terminu serii.
  await otworzPopover(page, pierwszy.id);
  await klik(page, '.tz-pop button[data-pop="edit"]');
  await page.locator('#tzNewTermOverlay').waitFor({ state: 'attached' });
  await klik(page, '#tzNtRxStep .tz-ntcat[data-step="7"]');
  await klik(page, '#tzNtRxHorizon .tz-ntcat[data-mon="3"]');
  await expect(page.locator('#tzNtSave')).toHaveText(/przedłuż serię/i);
  await klik(page, '#tzNtSave');
  await page.locator('#tzRxDlg #tzRxSave').waitFor({ state: 'attached' });
  await klik(page, '#tzRxDlg #tzRxSave');
  await expect(page.locator('#tzRxDlg')).toHaveCount(0);
  await expect
    .poll(async () => (await wszystkieNotatki(page)).filter((n) => n.category === 'treatment').length)
    .toBeGreaterThan(przed.length + 5);

  const po = (await wszystkieNotatki(page)).filter((n) => n.category === 'treatment');
  expect(po.every((n) => n.seriesId === seriesId), 'nowe wpisy w tej samej serii').toBe(true);
  const datyPo = po.map((n) => d10(n.dueDateISO)).sort();
  expect(new Set(datyPo).size, 'bez duplikatów dat').toBe(datyPo.length);
  const nowe = datyPo.filter((d) => d > ostatniaPrzed);
  expect(nowe[0], 'pierwsze nowe podanie tydzień po ostatnim').toBe(addDays(ostatniaPrzed, 7));
  for (let k = 1; k < nowe.length; k += 1) {
    expect(nowe[k], 'kolejne co 7 dni').toBe(addDays(nowe[k - 1], 7));
  }
  expect(datyPo.slice(0, datyPrzed.length), 'stare wpisy nietknięte').toEqual(datyPrzed);
  const dodane = po.filter((n) => d10(n.dueDateISO) > ostatniaPrzed);
  expect(dodane.every((n) => n.title === 'Somatropina 0,5 mg'), 'nowe wpisy niosą treść z modala').toBe(true);
  expect(dialogi.filter((x) => x.typ === 'alert'), JSON.stringify(dialogi)).toEqual([]);
});
