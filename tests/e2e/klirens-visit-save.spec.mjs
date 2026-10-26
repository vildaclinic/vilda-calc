import { expect, test } from '@playwright/test';

async function openOptionalDetails(page, selector) {
  for (const details of await page.locator(selector).locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  }
}

// Faza 1 — pełny łańcuch: tagi silnika → ClcrVisitSave.collect → VildaVault.savePatientNote.
// Sejf syntetyczny tworzony w kontenerze (nie dotyka danych użytkownika);
// niskie KDF_ITERATIONS dla szybkości.

async function openCalculatorGuest(page) {
  await page.addInitScript(() => {
    window.__CLCR_TEST_LEGACY_BROAD = true;
  });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Korzystaj bez logowania', exact: true })
    .click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(
    () =>
      typeof window.clcrUpdate === 'function' &&
      Boolean(window.ClcrClinicalSafety) &&
      typeof window.applyVersion === 'function' &&
      Boolean(window.VildaVault) &&
      Boolean(window.ClcrVisitSave),
  );
  await page.evaluate(() => window.applyVersion('basic'));
}

async function setupVaultPatient(page) {
  return page.evaluate(async () => {
    const V = window.VildaVault;
    const user = await V.createUser('Haslo-Testowe-123', { iterations: 1, label: 'E2E' });
    await V.unlockUser(user.userId, 'Haslo-Testowe-123');
    const saved = await V.savePatient({ name: 'Pacjent Testowy' });
    const patientId = saved.patientId || saved.id || (saved.patient && saved.patient.patientId);
    document.dispatchEvent(
      new CustomEvent('vilda:patient-loaded', { detail: { patientId } }),
    );
    // Faza 5: po wczytaniu pacjenta blok tożsamości domyślnie się zwija do chipa
    // (Wariant C). Ten test dotyczy zapisu wyniku, więc rozwijamy panel jak lekarz
    // („Dane pacjenta ▾"), aby edytować pola tożsamości.
    if (window.ClcrIdentity && typeof window.ClcrIdentity.setCollapsed === 'function') {
      window.ClcrIdentity.setCollapsed(false);
    }
    return { patientId, unlocked: V.isUnlocked() };
  });
}

async function readClinicalNotes(page, patientId) {
  return page.evaluate(async (pid) => {
    const list = await window.VildaVault.listPatientNotesForPatient(pid);
    return list
      .filter((n) => n.category === 'wynik-klirens')
      .map((n) => ({
        id: n.id,
        patientId: n.patientId,
        category: n.category,
        clinicalDateISO: n.clinicalDateISO,
        title: n.title,
        body: n.body,
        labResult: n.labResult,
      }));
  }, patientId);
}

test('zapisuje TYLKO wybraną formułę (eGFR dorośli) — bez Cockcrofta obok', async ({ page }) => {
  await openCalculatorGuest(page);
  const setup = await setupVaultPatient(page);
  expect(setup.unlocked).toBe(true);
  expect(setup.patientId.length).toBeGreaterThan(0);

  // ręczny wybór formuły (jak w produkcji) → activeFormulaId = egfr
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('egfr'));
  await page.waitForTimeout(60);
  await page.locator('details.clcr-context-details:has(#weight) > summary').click();
  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('M');
  await openOptionalDetails(page, '#weight');
  await page.locator('#weight').fill('80');
  await openOptionalDetails(page, '#height');
  await page.locator('#height').fill('180');
  await page.locator('#Scr').fill('1.0');
  await expect(page.locator('#creatinineState')).toHaveValue('unknown');
  await expect(page.locator('#ScrAssay')).toHaveValue('');
  await page.evaluate(() => window.clcrUpdate());

  await expect(page.locator('[data-clcr-series="egfr"]')).toHaveCount(1);
  const btn = page.locator('#clcrVisitSaveBtn');
  await expect(page.locator('#clcrVisitSaveCard')).toBeVisible();
  await expect(btn).toBeEnabled();
  await page.locator('#clcrVisitDate').fill('2026-08-01');
  await btn.click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });

  const notes = await readClinicalNotes(page, setup.patientId);
  const labels = notes.map((n) => n.labResult && n.labResult.test);
  expect(labels).toContain('eGFR — dorośli (kreatynina)');
  // wybrano tylko eGFR — Cockcroft nie może się zapisać
  expect(labels).not.toContain('Klirens kreatyniny — dorośli (ml/min)');
  expect(labels).not.toContain('Klirens kreatyniny — dorośli (1,73 m²)');

  const egfr = notes.find((n) => n.labResult.test === 'eGFR — dorośli (kreatynina)');
  expect(egfr.clinicalDateISO).toContain('2026-08-01');
  expect(egfr.labResult.unit).toBe('mL/min/1,73 m²');
  expect(egfr.labResult.valueNum).toBeGreaterThan(85);
  expect(egfr.labResult.valueNum).toBeLessThan(100);
  expect(egfr.body).toContain('clcr:egfr');
});

test('CKiD U25 u 20-latka — zapisuje tylko wybraną formułę, wyklucza panel porównawczy', async ({ page }) => {
  await openCalculatorGuest(page);
  const setup = await setupVaultPatient(page);

  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('ckid_u25'));
  await page.waitForTimeout(60);
  await page.locator('details.clcr-context-details:has(#weight) > summary').click();
  await page.locator('#age').fill('20');
  await page.locator('#sex').selectOption('F');
  await openOptionalDetails(page, '#weight');
  await page.locator('#weight').fill('60');
  await openOptionalDetails(page, '#height');
  await page.locator('#height').fill('165');
  await page.locator('#Scr').fill('0.9');
  await page.evaluate(() => window.clcrUpdate());

  // silnik renderuje egfr/cg jako porównanie (otagowane), ale zapis ich pomija
  const visibleSeries = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-clcr-series]'))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getAttribute('data-clcr-series')),
  );
  expect(visibleSeries).toContain('ckid_u25');
  expect(visibleSeries).toContain('egfr'); // panel porównawczy widoczny

  await page.locator('#clcrVisitDate').fill('2026-08-01');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });

  const labels = (await readClinicalNotes(page, setup.patientId)).map(
    (n) => n.labResult && n.labResult.test,
  );
  expect(labels).toContain('eGFR — dzieci i młodzież 1–25 lat (kreatynina)');
  // porównawcze egfr/cg NIE mogą trafić do karty
  expect(labels).not.toContain('eGFR — dorośli (kreatynina)');
  expect(labels).not.toContain('Klirens kreatyniny — dorośli (ml/min)');
});

test('Faza 6: Cockcroft–Gault (cg) — zapis formuły dorosłej z masą ciała', async ({ page }) => {
  await openCalculatorGuest(page);
  const setup = await setupVaultPatient(page);

  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('cg'));
  await page.waitForTimeout(60);
  await page.locator('#age').fill('60');
  await page.locator('#sex').selectOption('M');
  await openOptionalDetails(page, '#weight');
  await page.locator('#weight').fill('80');
  await page.locator('#Scr').fill('1.2');
  await page.evaluate(() => window.clcrUpdate());

  await expect(page.locator('[data-clcr-series="cg"]')).toHaveCount(1);
  await page.locator('#clcrVisitDate').fill('2026-08-01');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });

  const notes = await readClinicalNotes(page, setup.patientId);
  const cg = notes.find((n) => n.labResult && n.labResult.test === 'Klirens kreatyniny — dorośli (ml/min)');
  expect(cg).toBeTruthy();
  expect(cg.labResult.unit).toBe('mL/min');
  // U4b: historia = wartość WYŚWIETLONA (całkowita), nie surowa z ułamkiem
  expect(Number.isInteger(cg.labResult.valueNum)).toBe(true);
  expect(cg.labResult.valueNum).toBeGreaterThan(60);
  expect(cg.labResult.valueNum).toBeLessThan(90);
  expect(cg.body).toContain('clcr:cg');
});

test('gość bez pacjenta — karta zapisu nieaktywna z podpowiedzią', async ({ page }) => {
  await openCalculatorGuest(page);
  // liczymy bez sejfu/pacjenta
  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('M');
  await openOptionalDetails(page, '#weight');
  await page.locator('#weight').fill('80');
  await openOptionalDetails(page, '#height');
  await page.locator('#height').fill('180');
  await page.locator('#Scr').fill('1.0');
  await page.evaluate(() => window.clcrUpdate());

  const card = page.locator('#clcrVisitSaveCard');
  await expect(card).toBeVisible();
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await expect(page.locator('#clcrVisitHint')).toContainText('Zaloguj się');
});

test('historia Klirensu pokazuje wszystkie datowane pomiary pod własnymi ID w odrębnym podglądzie', async ({ page }) => {
  await openCalculatorGuest(page);
  const setup = await setupVaultPatient(page);
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('egfr'));
  await page.waitForTimeout(60);
  await page.locator('details.clcr-context-details:has(#weight) > summary').click();

  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('M');
  await openOptionalDetails(page, '#weight');
  await page.locator('#weight').fill('80');
  await openOptionalDetails(page, '#height');
  await page.locator('#height').fill('180');

  // wizyta 1 (Scr 1.0 → wyższy eGFR)
  await page.locator('#Scr').fill('1.0');
  await page.evaluate(() => window.clcrUpdate());
  await page.locator('#clcrVisitDate').fill('2026-06-01');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });
  const [firstNote] = await readClinicalNotes(page, setup.patientId);
  expect(firstNote.id).toBeTruthy();
  expect(firstNote.clinicalDateISO).toBe('2026-06-01');

  // wizyta 2 (Scr 1.4 → niższy eGFR)
  await page.locator('#Scr').fill('1.4');
  await page.evaluate(() => window.clcrUpdate());
  await page.locator('#clcrVisitDate').fill('2026-07-01');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });

  const notes = await readClinicalNotes(page, setup.patientId);
  expect(notes).toHaveLength(2);
  expect(new Set(notes.map((note) => note.id)).size).toBe(2);
  expect(notes.find((note) => note.id === firstNote.id)).toEqual(firstNote);
  expect(notes.every((note) => note.patientId === setup.patientId && note.labResult.test === 'eGFR — dorośli (kreatynina)')).toBe(true);
  await expect(page.locator('#clcrHistoryCard')).toHaveCount(0);
  await page.locator('#clcrOpenHistoryBtn').click();
  const hist = page.locator('#clcrPatientCard');
  await expect(hist).toBeVisible();
  await expect(hist.getByRole('heading', { name: 'Historia wyników Klirensu', exact: true })).toBeVisible();
  await expect(hist.locator('.vilda-clcr-measurement-group')).toHaveCount(1);
  await expect(hist.locator('tr[data-note-id]')).toHaveCount(2);
  for (const note of notes) {
    const row = hist.locator(`tr[data-note-id="${note.id}"]`);
    await expect(row).toHaveCount(1);
    await expect(row.locator('time')).toHaveAttribute('datetime', note.clinicalDateISO);
    await expect(row.locator('.vilda-clcr-value')).toContainText(note.labResult.value.replace('.', ','));
    await expect(row.locator('.vilda-clcr-row-reference')).toHaveText(note.labResult.norm || 'Brak zapisanej normy');
  }
  await expect(hist).toContainText('01.06.26');
  await expect(hist).toContainText('01.07.26');
  await expect(hist.locator('.vilda-clcr-chart, .cvs-spark')).toHaveCount(0);
  await expect(hist).not.toContainText('vs. poprzednio');
  await page.locator('#cpcClose').click();
  await expect(hist).toBeHidden();
  expect(await readClinicalNotes(page, setup.patientId)).toEqual(notes);
});

test('Karta pacjenta otwiera główne Badania, a osobna historia pokazuje te same pomiary bez kopii', async ({ page }) => {
  await openCalculatorGuest(page);
  const setup = await setupVaultPatient(page);
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('egfr'));
  await page.waitForTimeout(60);
  await page.locator('details.clcr-context-details:has(#weight) > summary').click();
  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('M');
  await openOptionalDetails(page, '#weight');
  await page.locator('#weight').fill('80');
  await openOptionalDetails(page, '#height');
  await page.locator('#height').fill('180');

  await page.locator('#Scr').fill('1.0');
  await page.evaluate(() => window.clcrUpdate());
  await page.locator('#clcrVisitDate').fill('2026-06-01');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });

  await page.locator('#Scr').fill('1.4');
  await page.evaluate(() => window.clcrUpdate());
  await page.locator('#clcrVisitDate').fill('2026-08-01');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });

  const notes = await readClinicalNotes(page, setup.patientId);
  expect(notes).toHaveLength(2);
  expect(new Set(notes.map((note) => note.id)).size).toBe(2);
  expect(notes.every((note) => note.patientId === setup.patientId && note.labResult.test === 'eGFR — dorośli (kreatynina)')).toBe(true);

  // Zatwierdzony V3: nazwa karty prowadzi do wspólnej zakładki Badania.
  const open = page.locator('#clcrOpenCardBtn');
  await expect(open).toBeVisible();
  await open.click();

  await expect(page.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/active/);
  await expect(page.locator('.vilda-patient-hero-name')).toContainText('Pacjent Testowy');
  const main = page.locator('.vilda-lab-hist-panel[data-panel="renal"]');
  await expect(main).toContainText('eGFR — dorośli (kreatynina)');
  await expect(main.locator('.vilda-clcr-measurement-group')).toHaveCount(1);
  await expect(main.locator('tr[data-note-id]')).toHaveCount(2);
  await expect(main.locator('.vilda-clcr-point')).toHaveCount(2);
  for (const note of notes) {
    const row = main.locator(`tr[data-note-id="${note.id}"]`);
    await expect(row).toHaveCount(1);
    await expect(row.locator('time')).toHaveAttribute('datetime', note.clinicalDateISO);
    await expect(row.locator('.vilda-clcr-value')).toContainText(note.labResult.value.replace('.', ','));
    await expect(row.locator('.vilda-clcr-row-reference')).toHaveText(note.labResult.norm || 'Brak zapisanej normy');
    await expect(main.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveCount(1);
  }
  await expect(main).toContainText('01.06.26');
  await expect(main).toContainText('01.08.26');
  await expect(page.locator('#clcrPatientCard')).toBeHidden();

  // Lokalny podgląd to oddzielna akcja, oparta na tych samych oryginalnych ID.
  await page.evaluate(() => window.VildaAuthUI.hide());
  await page.locator('#clcrOpenHistoryBtn').click();
  const card = page.locator('#clcrPatientCard');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Historia wyników Klirensu', exact: true })).toBeVisible();
  await expect(card.locator('.vilda-clcr-measurement-group')).toHaveCount(1);
  await expect(card.locator('tr[data-note-id]')).toHaveCount(2);
  await expect(card.locator('.vilda-clcr-measurements thead th')).toHaveText(['Data badania', 'Wynik', 'Zapisana norma', 'Zapisana ocena', 'Szczegóły']);
  for (const note of notes) await expect(card.locator(`tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await expect(card.locator('.cpc-flow')).toHaveCount(0);
  await expect(card).toContainText('01.08.26');

  // „Zamknij" chowa kartę
  await page.locator('#cpcClose').click();
  await expect(card).toBeHidden();
  expect(await readClinicalNotes(page, setup.patientId)).toEqual(notes);
});
