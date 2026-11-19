import { expect, test } from '../support/test-czas.mjs';

// P-POSTEPY-DZIENNIK (decyzje właściciela 2026-11-19: „Postępy i lista pacjentów z dziennika”; listy — „Bez zmiany
// sejfu”). Karta pacjenta dorosłego na PRAWDZIWEJ stronie:
//   PD-1 zakładka „Postępy” liczy z dziennika leczenia — wpis z masą od pacjenta dopisany w „Wpisy leczenia” jest
//        na wykresie od razu, bez ponownego otwierania karty (panel rysuje się od nowa w tym samym miejscu);
//   PD-2 w „Wpisy leczenia” Włączenie (i każdy wpis zmieniający przebieg leczenia) poprawia się w DocPro —
//        Karta nie daje „Popraw”/„Usuń”; Kontynuacja tego samego leku — tak;
//   PD-3 wpis bieżącego cyklu z dwiema wersjami zdejmuje punkt oceny wg ChPL z „Postępów” i mówi dlaczego.
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block', chwila: '2026-11-18T12:00:00Z' });

const HASLO = 'E2e#PostepyDziennik!26';
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };
const pkt = (id, type, dateISO, mies, weight, dose) => ({
  id, type, dateISO, ageYears: 47, ageMonths: mies, weight, height: 170, bmi: +(weight / 2.89).toFixed(1), dose, ...SAXENDA,
});
const MIGAWKA = [
  pkt('s-start', 'start', '2026-06-01', 4, 112, '0,6 mg / dobę'),
  pkt('s-lip', 'continue', '2026-07-06', 5, 108, '3,0 mg / dobę'),
];

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.VildaDziennikOtylosciUI)
    && Boolean(window.VildaPostepyDoroslego) && Boolean(window.VildaPostepyDoroslegoUI));
}

async function pacjent(page) {
  return page.evaluate(async (pts) => (await window.VildaVault.savePatient({
    name: 'Testowy Adam',
    user: { lastName: 'Testowy', firstName: 'Adam', sex: 'M', age: 47, ageMonths: 10, height: 170, weight: 108, dobISO: '1979-01-12' },
    obesityTherapyPoints: pts,
  }, { dedup: false })).patientId, MIGAWKA);
}

async function karta(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
  await expect(page.locator('.vdo')).toBeVisible({ timeout: 15000 });
}
async function postepy(page) {
  await page.locator('.vilda-patient-tab[data-tab="traj"]').click();
  await expect(page.locator('.vilda-pd-host')).toBeVisible();
  return page.locator('.vilda-pd-host');
}
async function wroc(page) {
  await page.locator('.vilda-patient-tab').first().click();
  await expect(page.locator('.vdo')).toBeVisible();
}
const wiersz = (page, dateISO) => page.locator(`.vdo-list:not(.vdo-list-deleted) > .vdo-item[data-date="${dateISO}"]`);

test.describe('Postępy dorosłego i „Wpisy leczenia” na dzienniku leczenia', () => {
  test('PD-1: wpis z masą od pacjenta dopisany w Karcie jest od razu w „Postępach”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjent(page);
    await karta(page, pid);

    let panel = await postepy(page);
    await expect(panel).toContainText('108,0');
    await expect(panel).not.toContainText('99,1');
    await wroc(page);

    await page.getByRole('button', { name: 'Kontynuacja' }).click();
    const okno = page.getByRole('dialog', { name: /Nowy wpis leczenia/ });
    await expect(okno).toBeVisible();
    await okno.locator('#vdoDate').fill('2026-11-10');
    await okno.locator('#vdoW').fill('99,1');
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(okno).toBeHidden();
    await expect(wiersz(page, '2026-11-10')).toContainText('99,1 kg');

    panel = await postepy(page);
    await expect(panel).toContainText('99,1');
    await expect(page.locator('.vilda-pd-host'), 'jeden panel — nowy zastąpił stary').toHaveCount(1);
    await expect(panel).toContainText('Punkt oceny odpowiedzi wg ChPL');
  });

  test('PD-2: Włączenie poprawia się w DocPro; Kontynuacja tego samego leku — w Karcie', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjent(page);
    await karta(page, pid);
    const start = wiersz(page, '2026-06-01');
    await expect(start).toContainText('Włączenie');
    // P-OTYLOSC-SKOK (etap 2): zamiast samego tekstu — przycisk do monitora DocPro i widoczny powód.
    await expect(start.getByRole('button', { name: 'Edytuj w DocPro →' })).toBeVisible();
    await expect(start).toContainText('Od Włączenia zależą cykl, ocena wg ChPL i listy pacjentów.');
    await expect(start.getByRole('button', { name: /Popraw|Usuń/ })).toHaveCount(0);
    const kont = wiersz(page, '2026-07-06');
    await expect(kont.getByRole('button', { name: 'Popraw wpis z 06.07.2026' })).toBeVisible();
    await expect(kont.getByRole('button', { name: 'Usuń wpis z 06.07.2026' })).toBeVisible();
    await expect(kont.getByRole('button', { name: 'Edytuj w DocPro →' })).toHaveCount(0);
    await expect(page.locator('.vdo')).toContainText('Włączenie, Zakończenie i zmianę leku edytujesz w monitorze DocPro');
    // Sejf bez zmian: lista „Leczenie otyłości — Saxenda, trwa” liczy się jak dotąd z zapisu wizyty.
    const naLiscie = await page.evaluate(async (id) => (await window.VildaVault.previewPatientListRule({ type: 'obesity', drugKey: 'saxenda', scope: 'active' })).patientIds.includes(id), pid);
    expect(naLiscie).toBe(true);
  });

  test('PD-3: dwie wersje wpisu bieżącego cyklu zdejmują punkt oceny wg ChPL z „Postępów”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjent(page);
    // Wpis i dwie równoległe poprawki (dwa urządzenia) — tak, jak zapisuje je Karta.
    await page.evaluate(async ({ id, migawka, lek }) => {
      const D = window.VildaDziennikOtylosci;
      const d = (w) => ({ type: 'continue', dateISO: '2026-11-10', ageYears: 47, ageMonths: 9, weight: w, weightSource: 'pacjent', height: null, ...lek, dose: '3,0 mg / dobę' });
      const p0 = D.planNowego(await D.wczytaj(id, migawka), id, d(99.1));
      await D.zapisz(id, p0.wersje);
      const baza = await D.wczytaj(id, migawka);
      await D.zapisz(id, D.planPoprawki(baza, id, p0.entryId, d(98.6)).wersje);
      await D.zapisz(id, D.planPoprawki(baza, id, p0.entryId, d(99.4)).wersje);
    }, { id: pid, migawka: MIGAWKA, lek: SAXENDA });
    await karta(page, pid);
    await expect(page.locator('.vdo-item-conflict')).toHaveCount(1);
    const panel = await postepy(page);
    await expect(panel.locator('.vilda-pd-ostrz')).toContainText('Wpis z 10.11.2026 ma dwie wersje');
    await expect(panel).not.toContainText('Punkt oceny odpowiedzi wg ChPL');
  });
});
