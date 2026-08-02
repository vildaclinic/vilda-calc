import { expect, test } from '@playwright/test';

// Faza 6 (twardówka): integralność danych wizyt klirensu.
//  1) wynik klirensu przeżywa eksport/import karty pacjenta (istniejący mechanizm);
//  2) wizyta klirensu trafia do WSPÓLNEJ osi czasu pacjenta (timeline + seria lab),
//     tak jak punkty wizyt GH — dzięki temu, że zapis to standardowa patientNote.
// Sejf syntetyczny w kontenerze; niskie iteracje KDF dla szybkości.

async function openGuest(page) {
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
      Boolean(window.VildaVault) &&
      Boolean(window.ClcrVisitSave) &&
      typeof window.applyVersion === 'function',
  );
  await page.evaluate(() => window.applyVersion('basic'));
}

async function setupPatientWithEgfrVisit(page) {
  const pid = await page.evaluate(async () => {
    const V = window.VildaVault;
    const u = await V.createUser('Haslo-Testowe-123', { iterations: 1, label: 'F6' });
    await V.unlockUser(u.userId, 'Haslo-Testowe-123');
    const s = await V.savePatient({ name: 'Faza6 Pacjent', age: 54, sex: 'M' });
    const patientId = s.patientId || s.id || (s.patient && s.patient.patientId);
    document.dispatchEvent(
      new CustomEvent('vilda:patient-loaded', { detail: { patientId } }),
    );
    if (window.ClcrIdentity && typeof window.ClcrIdentity.setCollapsed === 'function') {
      window.ClcrIdentity.setCollapsed(false);
    }
    return patientId;
  });
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('egfr'));
  await page.waitForTimeout(80);
  await page.locator('#age').fill('54');
  await page.locator('#sex').selectOption('M');
  await page.locator('#Scr').fill('1.1');
  await page.locator('#creatinineState').selectOption('stable');
  await page.evaluate(() => window.clcrUpdate());
  await page.locator('#clcrVisitDate').fill('2026-08-01');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', {
    timeout: 15000,
  });
  return pid;
}

test('Faza 6: wynik klirensu przeżywa eksport i import karty pacjenta', async ({
  page,
}) => {
  await openGuest(page);
  const pid = await setupPatientWithEgfrVisit(page);

  const notes = await page.evaluate(async (patientId) => {
    const V = window.VildaVault;
    const env = await V.exportPatientEnvelope(patientId);
    await V.removePatient(patientId);
    const imp = await V.importPatientFromEnvelope(env);
    let newPid = (imp && (imp.patientId || imp.id)) || null;
    if (!newPid) {
      const list = await V.listPatients();
      newPid = list && list[0] && (list[0].patientId || list[0].id);
    }
    const all = await V.listPatientNotesForPatient(newPid);
    return all
      .filter((n) => n.category === 'wynik-klirens')
      .map((n) => ({
        test: n.labResult && n.labResult.test,
        val: n.labResult && n.labResult.valueNum,
        date: n.clinicalDateISO,
      }));
  }, pid);

  expect(notes.length).toBe(1);
  expect(notes[0].test).toBe('eGFR — dorośli (kreatynina)');
  // U4b: zapisana wartość = wyświetlona (całkowita), nie surowa z ułamkiem
  expect(notes[0].val).toBe(80);
  expect(String(notes[0].date)).toContain('2026-08-01');
});

test('Faza 6: wizyta klirensu trafia do wspólnej osi czasu (timeline + seria lab)', async ({
  page,
}) => {
  await openGuest(page);
  const pid = await setupPatientWithEgfrVisit(page);

  const r = await page.evaluate(async (patientId) => {
    const V = window.VildaVault;
    const tl = (await V.listPatientTimelineEvents(patientId)) || [];
    const ls = (await V.listPatientLabSeries(patientId)) || [];
    return {
      timelineNote:
        tl.find(
          (e) => e && e.type === 'note' && e.category === 'wynik-klirens',
        ) || null,
      labSeries: (Array.isArray(ls) ? ls : []).map(
        (s) => s.test || s.label || s.key || s.name,
      ),
    };
  }, pid);

  // Wizyta klirensu jest widoczna jako zdarzenie w osi czasu pacjenta (z wynikiem)…
  expect(r.timelineNote).toBeTruthy();
  expect(r.timelineNote.title).toContain('eGFR — dorośli (kreatynina)');
  expect(r.timelineNote.labResult && r.timelineNote.labResult.valueNum).toBe(80);
  // …oraz jako seria laboratoryjna (nakładana na kartę pacjenta jak inne wyniki).
  expect(r.labSeries).toContain('eGFR — dorośli (kreatynina)');
});
