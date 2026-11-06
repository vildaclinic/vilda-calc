import { expect, test } from '@playwright/test';

// Faza 6 (twardówka) — pokrycie e2e POZOSTAŁYCH rodzin modułów klirensu
// (poza eGFR/CKiD/Cockcroft, które mają już testy w klirens-visit-save.spec.mjs):
//   • spot ratio            → ACR   (albumina/kreatynina)
//   • frakcja wydalania     → FENa  (elektrolity)
//   • dobowa zbiórka (DZM)  → cl24  (klirens kreatyniny 24 h)
//   • dializa               → Kt/V  (URR i spKt/V — dwa osobne wybory i zapisy)
// Sens: KAŻDY moduł zapisuje standardową patientNote (category "wynik-klirens")
// tą samą szyną co eGFR. To domyka „twardówkę" — jeden mechanizm zapisu dla
// wszystkich formuł, więc eksport/import i wspólna oś czasu działają wszędzie.
// Sejf syntetyczny w kontenerze; niskie iteracje KDF dla szybkości.

async function openGuest(page, { legacyBroad = false } = {}) {
  if (legacyBroad) {
    await page.addInitScript(() => {
      window.__CLCR_TEST_LEGACY_BROAD = true;
    });
  }
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
      Boolean(window.ClcrUiWorkflow) &&
      Boolean(window.VildaVault) &&
      Boolean(window.ClcrVisitSave) &&
      typeof window.applyVersion === 'function',
  );
  await page.evaluate(() => window.applyVersion('basic'));
}

async function setupPatient(page) {
  return page.evaluate(async () => {
    const V = window.VildaVault;
    const u = await V.createUser('Haslo-Testowe-123', { iterations: 1, label: 'F6M' });
    await V.unlockUser(u.userId, 'Haslo-Testowe-123');
    const s = await V.savePatient({ name: 'Faza6 Moduły', age: 55, sex: 'M' });
    const patientId = s.patientId || s.id || (s.patient && s.patient.patientId);
    document.dispatchEvent(
      new CustomEvent('vilda:patient-loaded', { detail: { patientId } }),
    );
    if (window.ClcrIdentity && typeof window.ClcrIdentity.setCollapsed === 'function') {
      window.ClcrIdentity.setCollapsed(false);
    }
    return patientId;
  });
}

// Wypełnia pola tak jak lekarz w UI: wartości bezpośrednie + potwierdzenia
// boolowskie przez sparowany select ui_<pole>_answer = „yes" (jak w produkcji).
async function fillAndCompute(page, formulaId, vals, yesBooleans) {
  await page.evaluate(
    async ({ id, vals, yes }) => {
      const W = window.ClcrUiWorkflow;
      W.selectFormula(id);
      await new Promise((r) => {
        setTimeout(r, 60);
      });
      const set = (fid, v) => {
        const e = document.getElementById(fid);
        if (!e) throw new Error('brak pola: ' + fid);
        if (e.tagName === 'SELECT') {
          e.value = v;
          e.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (e.type === 'checkbox') {
          e.checked = v === true || v === 'yes';
          e.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          e.value = v;
          e.dispatchEvent(new Event('input', { bubbles: true }));
          e.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      for (const [k, v] of Object.entries(vals)) set(k, v);
      for (const b of yes || []) {
        const sel = document.getElementById('ui_' + b + '_answer');
        if (sel) {
          sel.value = 'yes';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          set(b, 'yes');
        }
      }
      window.clcrUpdate();
      await new Promise((r) => {
        setTimeout(r, 120);
      });
    },
    { id: formulaId, vals, yes: yesBooleans },
  );
}

async function saveVisit(page) {
  await page.locator('#clcrVisitDate').fill('2026-08-01');
  const btn = page.locator('#clcrVisitSaveBtn');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', {
    timeout: 15000,
  });
}

async function klirensNotes(page, pid) {
  return page.evaluate(async (patientId) => {
    const list = await window.VildaVault.listPatientNotesForPatient(patientId);
    return list
      .filter((n) => n.category === 'wynik-klirens')
      .map((n) => ({
        test: n.labResult && n.labResult.test,
        unit: n.labResult && n.labResult.unit,
        val: n.labResult && n.labResult.valueNum,
        date: n.clinicalDateISO,
        tag: (n.body || '').match(/clcr:[A-Za-z0-9_]+/)
          ? (n.body || '').match(/clcr:[A-Za-z0-9_]+/)[0]
          : null,
      }));
  }, pid);
}

test('Faza 6 (spot): ACR — albumina/kreatynina zapisuje się do karty', async ({
  page,
}) => {
  await openGuest(page, { legacyBroad: true });
  const pid = await setupPatient(page);

  await fillAndCompute(
    page,
    'ACR',
    {
      sex: 'M',
      spotSampleKind: 'firstMorning',
      U_Alb: '30',
      Ucr_spot: '100',
      Ucr_spot_unit: 'mg/dl',
    },
    [],
  );

  await expect(page.locator('[data-clcr-series="ACR"]')).toHaveCount(1);
  await saveVisit(page);

  const notes = await klirensNotes(page, pid);
  const acr = notes.find((n) => n.tag === 'clcr:ACR');
  expect(acr).toBeTruthy();
  expect(acr.test).toBe('Albumina/kreatynina — ACR');
  expect(acr.unit).toBe('mg/g');
  expect(acr.val).toBe(30);
  expect(String(acr.date)).toContain('2026-08-01');
});

test('Faza 6 (elektrolity): FENa — frakcja wydalania sodu zapisuje się do karty', async ({
  page,
}) => {
  await openGuest(page, { legacyBroad: true });
  const pid = await setupPatient(page);

  await fillAndCompute(
    page,
    'FENa_spot',
    {
      age: '55',
      spotSampleKind: 'random',
      U_Na_spot: '40',
      S_Na_spot: '140',
      Ucr_spot: '100',
      Ucr_spot_unit: 'mg/dl',
      Scr_spot: '1.0',
      Scr_spot_unit: 'mg/dl',
    },
    [],
  );

  await expect(page.locator('[data-clcr-series="FENa_spot"]')).toHaveCount(1);
  await saveVisit(page);

  const notes = await klirensNotes(page, pid);
  const fena = notes.find((n) => n.tag === 'clcr:FENa_spot');
  expect(fena).toBeTruthy();
  expect(fena.test).toBe('Frakcja wydalania sodu (FENa)');
  expect(fena.unit).toBe('%');
  // Surowa FENa 2/7%; sam wynik nie ustala etiologii AKI.
  expect(fena.val).toBeCloseTo(0.2857142857142857, 12);
});

test('Faza 6 (DZM): cl24 — klirens kreatyniny z dobowej zbiórki zapisuje się do karty', async ({
  page,
}) => {
  await openGuest(page, { legacyBroad: true });
  const pid = await setupPatient(page);

  await fillAndCompute(
    page,
    'cl24',
    {
      Scr: '1.0',
      ScrUnit: 'mg/dl',
      Ucr: '100',
      V24: '1500',
      Cl24DurationHours: '24',
    },
  );

  await expect(page.locator('[data-clcr-series="cl24"]')).toHaveCount(1);
  await saveVisit(page);

  const notes = await klirensNotes(page, pid);
  const cl = notes.find((n) => n.tag === 'clcr:cl24');
  expect(cl).toBeTruthy();
  expect(cl.test).toBe('Klirens kreatyniny — zmierzony (DZM)');
  expect(cl.unit).toBe('mL/min');
  // (Ucr·V24)/(Scr·1440) = (100·1500)/(1,0·1440) ≈ 104 mL/min
  expect(Number.isInteger(cl.val)).toBe(true); // U4b: całkowita, jak wyświetlona
  expect(cl.val).toBe(104);
});

test('Faza 6 (dializa): Kt/V — osobno wybrane URR i spKt/V zapisują się do tej samej karty', async ({
  page,
}) => {
  await openGuest(page);
  const pid = await setupPatient(page);

  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('KTV'));
  await expect(page.locator('#ktvInputCard')).toBeVisible();
  const result = page.locator('#clcrResultReport [data-clcr-ktv-snapshot]');

  // Dwa stężenia wystarczają do URR. Zapis dotyczy wyłącznie wybranego wskaźnika.
  await page.locator('button[data-clcr-ktv-variant="urr"]').click();
  await page.locator('#UreaPre').fill('150');
  await page.locator('#UreaPost').fill('45');
  await expect(result).toHaveCount(1);
  await expect(result).toHaveAttribute('data-clcr-series', 'KTV_urr');
  await saveVisit(page);
  await expect.poll(() => klirensNotes(page, pid)).toHaveLength(1);
  expect((await klirensNotes(page, pid))[0].tag).toBe('clcr:KTV_urr');

  // Drugi, jawny wybór korzysta z zachowanych stężeń i danych przebiegu sesji.
  await page.locator('button[data-clcr-ktv-variant="spktv"]').click();
  await page.locator('#ktvDurationMinutes').fill('240');
  await page.locator('#ktvUF').fill('2');
  await page.locator('#ktvW').fill('70');
  await page.locator('#ktvSessionsPerWeek').selectOption('3');
  await page.locator('#ktvPidiDays').selectOption('2');
  await expect(result).toHaveCount(1);
  await expect(result).toHaveAttribute('data-clcr-series', 'KTV_spktv');
  await saveVisit(page);
  await expect.poll(() => klirensNotes(page, pid)).toHaveLength(2);

  const notes = await klirensNotes(page, pid);
  const urr = notes.find((n) => n.tag === 'clcr:KTV_urr');
  const spktv = notes.find((n) => n.tag === 'clcr:KTV_spktv');

  // URR = (1 − post/pre)·100 = (1 − 45/150)·100 = 70%
  expect(urr).toBeTruthy();
  expect(urr.test).toBe('URR — wskaźnik redukcji mocznika');
  expect(urr.unit).toBe('%');
  expect(urr.val).toBe(70);

  // spKt/V (Daugirdas) ≈ 1,4 — bezwymiarowe
  expect(spktv).toBeTruthy();
  expect(spktv.test).toBe('spKt/V (mocznik, pojedyncza pula)');
  expect(spktv.unit).toBe('—');
  expect(spktv.val).toBeGreaterThan(1.1);
  expect(spktv.val).toBeLessThan(1.7);
  expect(notes.every((note) => note.date === '2026-08-01')).toBe(true);
  const persisted = await page.evaluate(
    (patientId) => window.VildaVault.listPatientNotesForPatient(patientId),
    pid,
  );
  expect(persisted.filter((note) => note.category === 'wynik-klirens')).toHaveLength(2);
  expect(persisted.every((note) => note.patientId === pid)).toBe(true);
});
