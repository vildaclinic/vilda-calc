import { expect, test } from '../support/test-czas.mjs';
import {
  K10, K8, KONTYNUACJA_PO_Z, KURS_2, W7, Z9, docPro, komunikat, punkty, wizyta, wsteczny, zaloguj, zamknijKomunikat,
} from '../support/gh-wznowienie.mjs';
import { karta, tresc } from '../support/karta-leczenie.mjs';

// P-GH-WZNOWIENIE, część 2 (decyzje właściciela 2026-11-20, W2; docs/clinical/ALGORITHMS.md) — komputer. Wpis
// wznowienia leczenia GH na PRAWDZIWYM DocPro: Włączenie po Zakończeniu przyciskiem karty i formularzem wstecznym,
// odmowa Kontynuacji po Zakończeniu bez nowego Włączenia, tabela z wierszem „Kurs 2 — …”, metryki i B.64 z kursu 2;
// lista z monitora w Karcie pacjenta („kurs 2 z 2”); panel wiersza na Start po Zakończeniu prowadzi do Włączenia.
// Listę startową zasiewamy w pamięci modułu, jak inne testy GH. Dane wyłącznie FIKCYJNE; własne konto sejfu.
test.use({ serviceWorkers: 'block' });

test('GW-E1: wznowienie przyciskiem karty po Zakończeniu, odmowa Kontynuacji po Zakończeniu, tabela „Kurs 2”, metryki i B.64 z kursu 2, edycja Zakończenia kursu 1, Karta pacjenta „kurs 2 z 2”', async ({ page }) => {
  test.setTimeout(150_000);
  const bledy = [];
  page.on('pageerror', (e) => bledy.push(String(e && e.message)));
  await docPro(page, [W7, K8, Z9]);
  await expect(page.locator('#ghTherapyStartHint')).toBeVisible();
  await expect(page.locator('#ghTherapyStartHint')).toHaveText('Aby wznowić leczenie, dodaj „Włączenie leczenia”.');

  // Kontynuacja z bieżącej wizyty (10 l. 0 mies.) po Zakończeniu — odmowa, lista bez zmian.
  await page.click('#btnGhContinue');
  await expect(komunikat(page)).toHaveText(KONTYNUACJA_PO_Z);
  await zamknijKomunikat(page);
  expect(await punkty(page)).toEqual([['start', 7, 0], ['continue', 8, 0], ['end', 9, 0]]);

  // Włączenie (wznowienie) przyciskiem karty — przyjęte.
  await page.click('#btnGhStart');
  await expect.poll(() => punkty(page)).toEqual([['start', 7, 0], ['continue', 8, 0], ['end', 9, 0], ['start', 10, 0]]);
  await expect(page.locator('#ghInfoOverlay')).toHaveCount(0);
  await expect(page.locator('#ghTherapyStartHint')).toBeHidden();
  await expect(page.locator('#ghTherapyTbody tr.gh-kurs-row')).toHaveText([KURS_2]);
  // Kurs 2 ma tylko Włączenie: B.64 nie ocenia przerwy ani kursu 1.
  await expect(page.locator('#ghB64ResponseNote')).toHaveCount(0);

  // Kontynuacja 11 l. 0 mies. formularzem wstecznym (rodzaje: Włączenie niedostępne).
  await page.click('#btnGhRetro');
  await expect(page.locator('#ghRetroType option[value="start"]')).toBeDisabled();
  await expect(page.locator('#ghRetroType')).toHaveValue('continue');
  await page.evaluate(() => window.ghCancelRetroForm());
  await wsteczny(page, 'continue', 11, 0, 30, 137, '0.9');
  await expect.poll(() => punkty(page)).toEqual([['start', 7, 0], ['continue', 8, 0], ['end', 9, 0], ['start', 10, 0], ['continue', 11, 0]]);
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('#ghTherapyTbody tr')).map((tr) => (tr.classList.contains('gh-kurs-row')
    ? `#${tr.textContent}` : (tr.querySelector('.edit-gh-pt-btn') || { getAttribute: () => null }).getAttribute('data-id'))).filter(Boolean));
  const [w10, k11] = await page.evaluate(() => window.ghTherapyPoints.slice(3).map((p) => String(p.id)));
  expect(ids).toEqual([W7.id, K8.id, Z9.id, `#${KURS_2}`, w10, k11]);
  await expect(page.locator('#ghTherapyMetricsBody tr.gh-kurs-row')).toHaveText([KURS_2]);
  await expect(page.locator('#ghB64ResponseNote')).toContainText('wynosi 7,0 cm/rok (z 12 mies.)');
  const metryki = await page.evaluate(() => window.ghTherapyMetrics.map((m) => [m.Gw_kurs, m.gv_abs == null ? null : Math.round(m.gv_abs * 10) / 10]));
  expect(metryki).toEqual([[1, null], [1, 7], [1, 6], [2, null], [2, 7]]);

  // Przegląd: Zakończenie kursu 1 po wznowieniu da się edytować (poprawka wzrostu) — kursy zostają dwa.
  await page.click(`.edit-gh-pt-btn[data-id="${Z9.id}"]`);
  await page.evaluate(() => {
    const o = document.getElementById('ghEditOverlay');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Rozumiem');
    if (b) b.click();
  });
  await page.fill('#ghEditHeight', '123.5');
  await page.click('#btnGhEnd');
  await expect(page.locator('#ghTherapyEditContainer')).toBeHidden();
  await expect(page.locator('#ghInfoOverlay')).toHaveCount(0);
  expect(await page.evaluate((id) => window.ghTherapyPoints.find((p) => p.id === id).height, Z9.id)).toBe(123.5);
  await expect(page.locator('#ghTherapyTbody tr.gh-kurs-row')).toHaveText([KURS_2]);

  // Lista z monitora w rekordzie pacjenta → Karta pacjenta: kurs 2 z 2, Włączenie z kursu 2.
  const pid = await page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjny Wznowiony',
    user: { lastName: 'Fikcyjny', firstName: 'Wznowiony', sex: 'M', age: 11, ageMonths: 0, height: 137, weight: 30 },
    ghTherapyPoints: window.ghTherapyPoints,
  }, { dedup: false })).patientId);
  await karta(page, pid);
  await page.getByRole('button', { name: 'Leczony hormonem wzrostu (rhGH): otwórz zakładkę Leczenie' }).click();
  const lecz = tresc(page, 'leczenie');
  await expect(lecz.locator('.vilda-gh-summary-head .vilda-gh-summary-chip')).toHaveText(['aktywne', 'kurs 2 z 2']);
  await expect(lecz.locator('.vilda-gh-summary')).toContainText('Włączeniew wieku 10 l. 0 mies.');
  expect(bledy).toEqual([]);
});

test('GW-E2: stary zapis W2 (Kontynuacja po Zakończeniu): podpowiedź, dopisanie Włączenia formularzem wstecznym (później niż pierwszy punkt — odmowa)', async ({ page }) => {
  test.setTimeout(150_000);
  await docPro(page, [W7, Z9, K10]);
  await expect(page.locator('#ghTherapyStartHint')).toContainText('Kurs 2 (po „Zakończeniu leczenia”) nie ma punktu „Włączenie leczenia”.');
  await expect(page.locator('#ghTherapyTbody tr.gh-kurs-row')).toHaveText(['Kurs 2 — bez Włączenia (pierwszy punkt w wieku 10 l. 0 mies.)']);
  // Formularz wsteczny: Włączenie dostępne i wybrane (kurs bez Włączenia).
  await page.click('#btnGhRetro');
  await expect(page.locator('#ghRetroType')).toHaveValue('start');
  await expect(page.locator('#ghRetroType option[value="end"]')).toBeEnabled();
  await page.evaluate(() => window.ghCancelRetroForm());
  await wsteczny(page, 'start', 10, 6, 28, 133);
  await expect(komunikat(page)).toHaveText('„Włączenie leczenia” nie może być późniejsze niż pierwszy punkt tego kursu leczenia.');
  await zamknijKomunikat(page);
  await page.evaluate(() => window.ghCancelRetroForm());
  await wsteczny(page, 'start', 10, 0, 27, 130);
  await expect.poll(() => punkty(page)).toEqual([['start', 7, 0], ['end', 9, 0], ['continue', 10, 0], ['start', 10, 0]]);
  await expect(page.locator('#ghTherapyTbody tr.gh-kurs-row')).toHaveText([KURS_2]);
  await expect(page.locator('#ghTherapyStartHint')).toBeHidden();
  // Kontynuacja z karty (bieżąca wizyta 10 l. 0 mies. → 11 l. 0 mies.) znów przechodzi.
  await wizyta(page, 11, 0, 30, 137);
  await page.click('#btnGhContinue');
  await expect.poll(() => punkty(page).then((l) => l.length)).toBe(5);
  await expect(page.locator('#ghInfoOverlay')).toHaveCount(0);
});

test('GW-E3: panel wiersza na Start po Zakończeniu — tylko „Włączenie leczenia”, zapis wznowienia z pomiaru wiersza', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  await page.waitForFunction(() => Boolean(window.VildaProAccess) && Boolean(window.VildaGhPunktZWiersza));
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const t = document.getElementById('resultsModeToggle');
    if (t && !t.checked) { t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); }
    const b = document.getElementById('consent-banner');
    if (b) b.remove();
  });
  await page.fill('#lastName', 'Fikcyjny');
  await page.fill('#firstName', 'Wznowiony');
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('age', '10'); set('ageMonths', '6'); set('sex', 'M'); set('height', '133'); set('weight', '28');
    if (typeof window.update === 'function') window.update();
  });
  await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (!(f && getComputedStyle(f).display !== 'none')) t.click();
  });
  await expect(page.locator('#advancedGrowthForm')).toBeVisible({ timeout: 10000 });
  await page.waitForSelector('#advMeasurements .measure-row', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => { const e = w.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('.adv-age-years', '10'); set('.adv-age-months', '0'); set('.adv-height', '130'); set('.adv-weight', '27');
    window.calculateGrowthAdvanced();
  });
  await page.evaluate((pts) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', pts, { force: true });
    window.ghTherapyPoints = pts;
  }, [W7, K8, Z9]);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await expect(page.locator('#advMeasurements .measure-row[data-gh-id]')).toHaveCount(3);

  const reczny = page.locator('#advMeasurements .measure-row:not([data-gh-id])').first();
  await reczny.locator('.gh-z-wiersza-btn').click();
  const panel = page.locator('#ghZWierszaPanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('input[value="start"]')).toBeEnabled();
  await expect(panel.locator('input[value="start"]')).toBeChecked();
  await expect(panel.locator('input[value="continue"]')).toBeDisabled();
  await expect(panel.locator('input[value="end"]')).toBeDisabled();
  await expect(panel.locator('label:has(input[value="continue"])')).toHaveAttribute('title', KONTYNUACJA_PO_Z);
  await page.fill('#ghZWierszaDawka', '0.8');
  await page.click('#ghZWierszaZapisz');
  await expect(page.locator('#ghZWierszaStatus')).toContainText('Zapisano punkt leczenia GH: Włączenie leczenia, 10 l. 0 mies.');
  const modul = await page.evaluate(() => window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []).map((p) => [p.type, p.ageYears, p.ageMonths]));
  expect(modul).toEqual([['start', 7, 0], ['continue', 8, 0], ['end', 9, 0], ['start', 10, 0]]);
});
