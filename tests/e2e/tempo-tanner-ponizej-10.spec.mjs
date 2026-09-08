import { expect, test } from '../support/test-czas.mjs';

// GROWTH-VELO-TANNER-U10 — poniżej 10. roku życia norma tempa szła WYŁĄCZNIE wg wieku
// metrykalnego; `applyVelocityNorms` kończyła się na progu z `getVelocityThreshold` i kontekst
// (Tanner, wiek kostny) nie był czytany w ogóle. Dziewczynka 9,5 r.ż. po menarche, rosnąca
// fizjologiczne 3 cm/rok, dostawała alarm „poniżej normy ≥5 cm/rok" — nawet gdy lekarz ręcznie
// wpisał jej Tanner V. Zgłoszone przez właściciela 2026-09-08.
//
// Ten test sprawdza PRAWDZIWY łańcuch na index.html: select #tannerStage → kontekst budowany
// przez kartę zaawansowaną → vilda_trajectory_analysis.js → werdykt widoczny dla lekarza.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#TempoTanner!26aa';

// Bramka konta chowa cały formularz (html.vilda-auth-locked), więc jak w pozostałych
// specyfikacjach zakładamy jednorazowe, fikcyjne konto testowe i odblokowujemy stronę.
async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaTrajectoryAnalysis)
    && typeof window.applyLoadedData === 'function');
}

// Dziewczynka 9 lat 6 mies., 3,0 cm w ciągu 12 miesięcy obserwacji.
const REKORD = {
  name: 'Testowa Zofia',
  user: { lastName: 'Testowa', firstName: 'Zofia', sex: 'F', age: 9, ageMonths: 6, height: 135, weight: 32 },
  advanced: {
    name: 'Testowa Zofia',
    motherHeight: 160,
    fatherHeight: 175,
    data: { measurements: [{ ageMonths: 102, ageYears: 8, height: 132, weight: 29 }] },
  },
};

async function policz(page, tanner) {
  await page.evaluate((r) => window.applyLoadedData(JSON.parse(JSON.stringify(r))), REKORD);
  if (await page.locator('#sex').isEnabled()) await page.selectOption('#sex', 'F');
  await page.fill('#age', '9');
  await page.fill('#ageMonths', '6');
  await page.fill('#height', '135');
  await page.fill('#weight', '32');
  return page.evaluate((ts) => {
    const pro = document.getElementById('resultsModeToggle');
    if (pro && !pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    const sel = document.getElementById('tannerStage');
    if (sel) {
      sel.value = ts == null ? '' : String(ts);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
    const model = window.advancedGrowthTrajectory;
    const vel = model && model.velocity;
    return {
      polePodpiete: Boolean(sel),
      wybrano: sel ? sel.value : null,
      velocity: vel,
      werdykt: vel ? window.VildaTrajectoryAnalysis.velocityAssessment(vel) : null,
    };
  }, tanner);
}

test('bez etapu Tannera dziewczynka 9,5 r.ż. przy 3 cm/rok nadal dostaje alarm', async ({ page }) => {
  await otworz(page);
  const w = await policz(page, null);

  // Kontrola pozytywna: łańcuch działa i bez Tannera zachowanie jest dokładnie jak dotąd.
  expect(w.polePodpiete, 'select #tannerStage istnieje na index.html').toBe(true);
  expect(w.velocity, 'model policzył tempo').not.toBeNull();
  expect(w.velocity.cmPerYear).toBeCloseTo(3.0, 1);
  expect(w.velocity.basis).toBe('age');
  expect(w.velocity.slow).toBe(true);
  expect(w.velocity.severity).toBe('danger');
  expect(w.werdykt.cls).toBe('bad');
});

test('Tanner V wpisany w formularzu zdejmuje alarm i nazywa powód', async ({ page }) => {
  await otworz(page);
  const w = await policz(page, 5);

  expect(w.wybrano).toBe('5');
  expect(w.velocity.cmPerYear).toBeCloseTo(3.0, 1);
  expect(w.velocity.basis, 'kontekst został wreszcie odczytany poniżej 10 lat').toBe('tanner45');
  expect(w.velocity.slow, 'deceleracja po skoku to nie „poniżej normy"').toBe(false);
  expect(w.velocity.alarm).toBe(false);
  expect(w.velocity.severity).toBeNull();
  expect(w.velocity.note).toMatch(/deceleracja fizjologiczna/);
  expect(w.werdykt.cls).toBe('stable');
  expect(w.werdykt.text).not.toMatch(/poniżej normy/);
});

test('Tanner II nie osłabia progu — 3 cm/rok w trakcie skoku nadal alarmuje', async ({ page }) => {
  await otworz(page);
  const w = await policz(page, 2);

  // Kontrola negatywna: w trakcie skoku oczekiwanie jest WYŻSZE, więc łagodniejszy próg
  // okołopokwitaniowy nie może tu wejść tylnymi drzwiami.
  expect(w.velocity.slow).toBe(true);
  expect(w.velocity.severity).toBe('danger');
  expect(w.velocity.normLabel).toMatch(/5 cm\/rok/);
  expect(w.werdykt.cls).toBe('bad');
});
