import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-CYKLE rata 4 (decyzja właściciela 2026-09-30: rekomendacje D1–D8 projektu „Cykle leczenia
// otyłości” przyjęte; 2026-10-01: „ruszaj z ratą 4”). Zakładka „Postępy” dorosłego w Karcie pacjenta liczy
// punkt odniesienia, lek i stan leczenia z BIEŻĄCEGO cyklu (vilda_cykle_leczenia.js, granica = Zakończenie).
// Dotąd: pierwsze Włączenie w kolejności wpisywania i „Leczenie odstawione” przy jakimkolwiek Zakończeniu —
// pacjent na Wegovy po zakończonej Saxendzie dostawał procenty od masy sprzed Saxendy i zdanie o odstawieniu.
//
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PostepyCykle!26';
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'liraglutide', dose: '3,0 mg / dobę' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'semaglutide', dose: '2,4 mg / tydz.' };

async function otworzZKontem(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.VildaPostepyDoroslego)
    && Boolean(window.VildaPostepyDoroslegoUI) && Boolean(window.VildaCykleLeczenia));
}

/** Dorosły 170 cm; punkty [typ, dataISO, masa, lek, lata, miesiące] — wiek monitora (lata + reszta miesięcy) zgodny z datą. */
async function pacjent(page, imie, punkty) {
  return page.evaluate(async (d) => {
    const pts = d.punkty.map(([type, dateISO, weight, lek, ageYears, ageMonths], i) => ({
      id: `${type}-${dateISO}-${i}`, type, ageYears, ageMonths, weight, height: 170,
      bmi: +(weight / 2.89).toFixed(1), dose: lek.dose, dateISO, drug: lek.drug, substance: lek.substance,
    }));
    const ost = d.punkty[d.punkty.length - 1];
    const wynik = await window.VildaVault.savePatient({
      name: `Testowy ${d.imie}`,
      user: { lastName: 'Testowy', firstName: d.imie, sex: 'M', age: ost[4], ageMonths: ost[5], height: 170, weight: ost[2] },
      obesityTherapyPoints: pts,
    }, { dedup: false });
    return wynik.patientId;
  }, { imie, punkty });
}

/* CY-10 — przypadek syntetyczny projektu. Cykl 2 wpisany PRZED cyklem 1: wynik nie może zależeć od kolejności zapisu. */
const CYKL_1 = [
  ['start', '2024-01-12', 104, SAXENDA, 40, 0], ['continue', '2024-04-12', 99, SAXENDA, 40, 3],
  ['end', '2024-10-15', 97.5, SAXENDA, 40, 9],
];
const CYKL_2 = [
  ['start', '2024-11-12', 98.5, WEGOVY, 40, 10], ['continue', '2025-02-12', 95.5, WEGOVY, 41, 1],
  ['continue', '2025-05-10', 93, WEGOVY, 41, 3],
];

const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const widoczny = (page, sel) => page.locator(sel).locator('visible=true');

async function zakladkaPostepy(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  const przycisk = page.locator('.vilda-patient-tab[data-tab="traj"]');
  await expect(przycisk).toBeVisible({ timeout: 15000 });
  await expect(przycisk).toContainText('Postępy');
  await przycisk.click();
  const panel = page.locator('.vilda-pd-host');
  await expect(panel).toBeVisible();
  return panel;
}

test('CY-10: „Postępy” liczą od Włączenia bieżącego cyklu (Wegovy), bez „Leczenie odstawione”', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  const pid = await pacjent(page, 'Postepy-Cykle', [...CYKL_2, ...CYKL_1]);
  const panel = await zakladkaPostepy(page, pid);

  const t = norm(await panel.textContent());
  expect(t).toContain('Wszystkie zmiany liczone od masy ciała przy włączeniu bieżącego cyklu leczenia (cykl 2 z 2; 98,5 kg, 12.11.2024), nie od poprzedniej wizyty.');
  // Dotąd: „…przy włączeniu leczenia (104,0 kg, 12.01.2024)…” i „Leczenie odstawione w 40. tygodniu…”.
  expect(t).not.toContain('Leczenie odstawione');
  expect(t).not.toContain('104,0 kg, 12.01.2024');
  expect(t).toContain('Masa ciała na początku98,5 kg12.11.2024');
  expect(t).toContain('Masa ciała dzisiaj93,0 kg10.05.2025');
  // ChPL semaglutydu nie podaje progu ani terminu — żadnego znacznika oceny (dotąd: liraglutyd, 16. tydz.).
  expect(t).not.toContain('nominalnym czasie zwiększania dawki');

  const wykres = widoczny(page, '.vilda-pd-host svg.vilda-pd-svg-masa');
  await expect(wykres).toHaveCount(1);
  await expect(wykres).toContainText('tygodnie od włączenia leczenia');

  // Rozwijany opis: lek bieżącego cyklu.
  expect(await panel.locator('.vilda-pd-det').innerHTML()).toContain('Lek: <b>Wegovy (semaglutyd) – s.c. 1×/tydz.</b>');
});

test('ostatni cykl zakończony: „Leczenie odstawione” liczone od Włączenia tego cyklu', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  const pid = await pacjent(page, 'Postepy-CykleZakonczone', [
    ...CYKL_1, ...CYKL_2, ['end', '2025-06-01', 92.5, WEGOVY, 41, 4],
  ]);
  const panel = await zakladkaPostepy(page, pid);
  const t = norm(await panel.textContent());
  // 12.11.2024 → 01.06.2025: 29. tydzień (dotąd 72. — od Włączenia Saxendy).
  expect(t).toContain('Leczenie odstawione w 29. tygodniu');
  expect(t).toContain('(cykl 2 z 2; 98,5 kg, 12.11.2024)');
});

test('telefon (390 px): „Postępy” z dwoma cyklami bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await otworzZKontem(page);
  const pid = await pacjent(page, 'Postepy-CykleTelefon', [...CYKL_1, ...CYKL_2]);
  const panel = await zakladkaPostepy(page, pid);
  await expect(widoczny(page, '.vilda-pd-host svg.vilda-pd-svg-masa')).toHaveCount(1);
  await expect(panel.locator('.vilda-pd-odn')).toContainText('cykl 2 z 2; 98,5 kg, 12.11.2024');
  await panel.locator('.vilda-pd-odn').scrollIntoViewIfNeeded();
  const pomiar = await page.evaluate(() => {
    const o = document.querySelector('.vilda-pd-host .vilda-pd-odn').getBoundingClientRect();
    return {
      przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      prawo: o.right,
      szerokoscOkna: window.innerWidth,
    };
  });
  expect(pomiar.przewijanie, 'brak poziomego przewijania (AGENTS.md §6)').toBeLessThanOrEqual(0);
  expect(pomiar.prawo).toBeLessThanOrEqual(pomiar.szerokoscOkna);
});
