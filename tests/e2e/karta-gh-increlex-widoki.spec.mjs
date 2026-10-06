import { expect, test } from '../support/test-czas.mjs';
import { czekajNaHistorie, sekcjaHistorii } from '../support/karta-czekanie.mjs';

// P-GH-INCRELEX-WIDOKI (polecenie właściciela 2026-10-05): reszta Karty pacjenta pokazuje Increlex w dawce na
// podanie 2× na dobę — jak „Aktualna dawka" (P-GH-INCRELEX-KARTA), karta terapii i Terminarz. Tylko wyświetlanie:
// punkty trzymają `dose` w mg/kg/d i `doseAbs` w mg/d, wpisy Terminarza `medication.doseNum` w mg/kg/d.
//
// ZMIERZONE przed zmianą (`audyt` 6651cfb), te same kroki:
// - tabela „Trend leczenia GH": „0,084 mg/kg/d", „0,24 mg/kg/d"; Historia: „Dawka: 0,240 mg/kg/d (4,80 mg/d)";
// - „Odpowiedź na leczenie wg preparatu" po zmianie Genotropin → Increlex: „0,2–0,24 mg/kg/d";
// - same wpisy Terminarza (bez punktów): legenda „dawka (mg/kg/d)", wiersze „0,24 mg/kg/d", „0,17 mg/kg/d",
//   etykiety wykresu „0,24", „0,17"; edytor notatki „Dawka w trakcie leczenia 0,24 mg/kg/d".
// Wykres trendu z punktów już wcześniej pokazywał % dawki zalecanej (bez mg/kg) — bez zmian.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhIncWidoki!26';

async function otworzKarte(page, punkty, notatki = []) {
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
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.saveUserData === 'function');
  await page.waitForTimeout(1200);
  await page.evaluate((pts) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('lastName', 'Fikcyjny'); set('firstName', 'Igf');
    set('age', '8'); set('ageMonths', '0'); set('sex', 'M'); set('height', '112'); set('weight', '20');
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', pts, { force: true });
    window.ghTherapyPoints = pts;
  }, punkty);
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(800);
  const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);
  for (const n of notatki) {
    await page.evaluate(async (a) => window.VildaVault.savePatientNote({ patientId: a.pid, ...a.n }), { pid, n });
  }
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, () => {}, null), pid);
  await expect(page.locator('.vilda-patient-tab[data-tab="traj"]')).toBeVisible({ timeout: 15000 });
  return pid;
}

// Tabela i legenda „Trend leczenia GH" (zakładka Siatki centylowe). Sekcja powstaje asynchronicznie.
async function trend(page, wierszy) {
  await page.locator('.vilda-patient-tab[data-tab="traj"]').click();
  const czytaj = () => page.evaluate(() => {
    const sek = document.querySelector('.vilda-patient-tab-content[data-tab="traj"]');
    const h = sek && Array.from(sek.querySelectorAll('p')).find((p) => /Trend leczenia GH/.test(p.textContent));
    if (!h) return null;
    const tab = Array.from(h.parentElement.querySelectorAll('table')).pop();
    const svg = h.parentElement.querySelector('svg');
    return {
      legenda: h.nextElementSibling ? h.nextElementSibling.textContent.replace(/\s+/g, ' ').trim() : '',
      wiersze: tab ? Array.from(tab.querySelectorAll('tr')).slice(1).map((r) => r.children[1].textContent.trim()) : [],
      wykres: svg ? Array.from(svg.querySelectorAll('text')).map((t) => t.textContent) : [],
    };
  });
  await expect.poll(async () => ((await czytaj()) || { wiersze: [] }).wiersze.length, { timeout: 15000 }).toBe(wierszy);
  return czytaj();
}

async function historiaDawki(page, ile) {
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  await czekajNaHistorie(page);
  // Wiersz wpisu GH w Historii: <div><span>Dawka: </span><span>…</span></div>.
  const czytaj = () => sekcjaHistorii(page).evaluate((el) => Array.from(el.querySelectorAll('div'))
    .filter((d) => d.children.length === 2 && d.children[0].textContent === 'Dawka: ')
    .map((d) => 'Dawka: ' + d.children[1].textContent.replace(/\s+/g, ' ').trim()));
  await expect.poll(async () => (await czytaj()).length, { timeout: 15000 }).toBeGreaterThanOrEqual(ile);
  return czytaj();
}

const inc = (id, type, y, m, h, w, dose, doseAbs) => ({ id, type, ageYears: y, ageMonths: m, height: h, weight: w,
  program: 'IGF-1', drug: 'Increlex 40 mg', dose, doseAbs, doseUnit: 'mg/kg/d' });
const gen = (id, type, y, m, h, w, dose, doseAbs) => ({ id, type, ageYears: y, ageMonths: m, height: h, weight: w,
  program: 'SNP', drug: 'Genotropin 12 mg', dose, doseAbs, doseUnit: 'mg/kg/d' });

test('Increlex z punktów: tabela trendu i Historia w dawce na podanie; wykres w % dawki zalecanej', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page, [
    inc('igf-w-s', 'start', 7, 6, 108, 19, 1.6 / 19, 1.6),
    inc('igf-w-c', 'continue', 8, 0, 112, 20, 0.24, 4.8),
  ]);
  const t = await trend(page, 2);
  expect(t.wiersze).toEqual([
    '2 × 0,8 mg na dobę (0,042 mg/kg na podanie)',
    '2 × 2,4 mg na dobę (0,12 mg/kg na podanie)',
  ]);
  // Wykres z punktów: procent dawki zalecanej (100% = 0,12 mg/kg na podanie) — bez jednostki mg/kg.
  expect(t.legenda).toContain('% dawki zalecanej');
  expect(t.wykres).toContain('100%');

  const h = await historiaDawki(page, 2);
  expect(h).toContain('Dawka: 2 × 2,4 mg na dobę (0,12 mg/kg na podanie)');
  expect(h).toContain('Dawka: 2 × 0,8 mg na dobę (0,042 mg/kg na podanie)');
  expect(h.join(' ')).not.toContain('mg/kg/d');
  // P-GH-INCRELEX-TYTUL: wpisy z punktów Increlex mają tytuł właściwy dla IGF-1.
  await expect(sekcjaHistorii(page).getByText('Leczenie IGF-1 (mekasermina)').first()).toBeVisible();
  await expect(sekcjaHistorii(page).getByText('Leczenie rhGH')).toHaveCount(0);
});

test('zmiana Genotropin → Increlex: segment Increlex w mg/kg na podanie, Genotropin bez zmian', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page, [
    gen('gh-w-1', 'start', 6, 0, 100, 16, 0.025, 0.4),
    gen('gh-w-2', 'continue', 6, 6, 103, 17, 0.025, 0.425),
    inc('igf-w-1', 'continue', 7, 0, 106, 18, 0.2, 3.6),
    inc('igf-w-2', 'continue', 7, 6, 109, 19, 0.24, 4.56),
  ]);
  await page.locator('.vilda-gha-btn').first().click();
  const panel = page.locator('.vilda-gha-panel').first();
  await expect(panel).toContainText('wg preparatu', { ignoreCase: true });
  const tekst = String(await panel.textContent()).replace(/\s+/g, ' ');
  expect(tekst).toMatch(/Genotropin 12 mg.*· 0,025 mg\/kg\/d/);
  expect(tekst).toMatch(/Increlex 40 mg.*· 0,1–0,12 mg\/kg na podanie/);
  expect(tekst).not.toContain('0,2–0,24 mg/kg/d');

  const t = await trend(page, 4);
  expect(t.wiersze).toEqual([
    '0,025 mg/kg/d',
    '0,025 mg/kg/d',
    '2 × 1,8 mg na dobę (0,1 mg/kg na podanie)',
    '2 × 2,28 mg na dobę (0,12 mg/kg na podanie)',
  ]);
});

test('Increlex tylko we wpisach Terminarza (bez punktów): tabela, wykres, legenda i edytor notatki na podanie', async ({ page }) => {
  test.setTimeout(120_000);
  // Wpis sprzed P-GH-INCRELEX-PODANIE („Dawka: … mg/kg/d (… mg/d)") i wpis po niej („Dawka: 2 × … mg na dobę …").
  const pid = await otworzKarte(page, [], [
    { category: 'treatment', title: 'Leczenie rhGH', dueDateISO: '2026-11-02',
      body: 'Kontrola leczenia hormonem wzrostu / IGF-1.\nPreparat: Increlex 40 mg.\nDawka: 0,24 mg/kg/d (4,80 mg/d).\nMasa: 20,0 kg.',
      medication: { action: 'start', doseNum: 0.24, doseUnit: 'mg/kg/d', freq: 'dzień' } },
    { category: 'treatment', title: 'Leczenie rhGH', dueDateISO: '2027-02-01',
      body: 'Kontrola leczenia hormonem wzrostu / IGF-1.\nPreparat: Increlex 40 mg.\nDawka: 2 × 1,7 mg na dobę (0,085 mg/kg na podanie).\nMasa: 20,0 kg.',
      medication: { action: 'change', doseNum: 0.17, doseUnit: 'mg/kg/d', freq: 'dzień' } },
  ]);
  const t = await trend(page, 2);
  expect(t.wiersze).toEqual([
    '2 × 2,4 mg na dobę (0,12 mg/kg na podanie)',
    '2 × 1,7 mg na dobę (0,085 mg/kg na podanie)',
  ]);
  expect(t.legenda).toContain('dawka (mg/kg na podanie)');
  expect(t.wykres).toEqual(expect.arrayContaining(['0,12', '0,085']));
  expect(t.wykres).not.toContain('0,24');

  const lista = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), pid);
  const stary = lista.find((n) => n.medication && n.medication.doseNum === 0.24);
  await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({ patientId: d.pid, note: d.n }), { pid, n: stary });
  const dawka = page.locator('.b3-med-section').filter({ hasText: 'Dawka w trakcie leczenia' });
  await expect(dawka).toContainText('2 × 2,4 mg na dobę (0,12 mg/kg na podanie)');
  // Zapis notatki bez zmian — dawka w rekordzie nadal w mg/kg/d.
  expect(stary.medication).toMatchObject({ doseNum: 0.24, doseUnit: 'mg/kg/d' });
});

test('GH (kontrola): tabela trendu, Historia i edytor notatki bez zmian — mg/kg/d', async ({ page }) => {
  test.setTimeout(120_000);
  const pid = await otworzKarte(page, [
    gen('gh-k-1', 'start', 7, 6, 108, 19, 0.025, 0.475),
    gen('gh-k-2', 'continue', 8, 0, 112, 20, 0.025, 0.5),
  ], [
    { category: 'treatment', title: 'Leczenie rhGH', dueDateISO: '2026-11-02',
      body: 'Kontrola leczenia hormonem wzrostu / IGF-1.\nPreparat: Genotropin 12 mg.\nDawka: 0,025 mg/kg/d (0,50 mg/d).',
      medication: { action: 'change', doseNum: 0.025, doseUnit: 'mg/kg/d', freq: 'dzień' } },
  ]);
  const t = await trend(page, 2);
  expect(t.wiersze).toEqual(['0,025 mg/kg/d', '0,025 mg/kg/d']);
  const h = await historiaDawki(page, 2);
  expect(h).toContain('Dawka: 0,025 mg/kg/d (0,50 mg/d)');
  expect(h.join(' ')).not.toContain('na podanie');
  const lista = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), pid);
  await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({ patientId: d.pid, note: d.n }), { pid, n: lista[0] });
  await expect(page.locator('.b3-med-section').filter({ hasText: 'Dawka w trakcie leczenia' })).toContainText('0,025 mg/kg/d');
});
