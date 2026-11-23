import { expect, test } from '../support/test-czas.mjs';
import { zaloguj } from '../support/gh-wznowienie.mjs';
import { G1, G_DO_I, INC_PACJENT, I_DO_G } from '../support/karta-leczenie.mjs';

// P-GH-PROGRAM-BIEZACY (decyzja właściciela 2026-11-23: „popraw program w formularzu monitora DocPro”;
// docs/clinical/ALGORITHMS.md) — komputer. PRAWDZIWE DocPro: pole „Program terapeutyczny” (#therProg, zablokowane przy
// punktach) i wiersz „Program terapeutyczny: …” nad tabelą biorą program bieżący kursu (jak Karta pacjenta), nie program
// Włączenia; lista preparatów, podpowiedź dawki, nowy punkt z karty, formularz wsteczny i wizyta kontrolna w Terminarzu
// idą za polem. Dotąd (audyt e163b85a) po Włączeniu Increlex (IGF-1) i Kontynuacjach Genotropin (SNP) — IGF-1.
// Listę punktów zasiewamy w pamięci modułu, jak inne testy GH. Dane wyłącznie FIKCYJNE; własne konto sejfu.
test.use({ serviceWorkers: 'block' });

const LEKI_RHGH = ['Omnitrope 5 mg', 'Omnitrope 10 mg', 'Genotropin 5,3 mg', 'Genotropin 12 mg', 'Ngenla 24 mg', 'Ngenla 60 mg'];
const SNP = 'SNP (Somatotropinowa niedoczynność przysadki)';

// Pomiar bieżącej wizyty jak lekarz (zdarzenia input/change), bez dotykania karty GH.
const wizyta = (page, lata, mies, masa, wzrost) => page.evaluate(({ l, m, w, h }) => {
  const set = (id, v) => {
    const e = document.getElementById(id);
    e.value = v;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  };
  set('age', String(l)); set('ageMonths', String(m)); set('sex', 'M'); set('height', String(h)); set('weight', String(w));
  if (typeof window.update === 'function') window.update();
  document.getElementById('name').value = 'Fikcyjny Program';
}, { l: lata, m: mies, w: masa, h: wzrost });

// DocPro z kartą GH/IGF-1 na wierzchu strony; `program`, `lek` i `data` (ręczna data kontroli, jak z kalendarza karty) —
// stan karty przed wczytaniem punktów (np. stan zapisany przy dawnym polu IGF-1), potem lista punktów w pamięci modułu
// i zakładka „Monitorowanie”.
async function docPro(page, punkty, { program = null, lek = null, data = null, wiek = [8, 6, 22.5, 116] } = {}) {
  await zaloguj(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function' && Boolean(window.vildaGhIgfPersistApi)
    && Boolean(window.VildaGhDawka) && Boolean(window.VildaTrajectoryAnalysis) && Boolean(window.VildaGhPunkty), null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro biegnie do ~1,5 s po starcie strony
  await page.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    const k = document.getElementById('ghIgfTherapyCard');
    const pudlo = document.createElement('div');
    pudlo.style.cssText = 'position:relative;z-index:99999;background:#fff;padding:8px';
    document.body.prepend(pudlo);
    pudlo.appendChild(k);
    k.style.display = 'block';
  });
  await wizyta(page, ...wiek);
  await page.evaluate(({ lista, prog, lekKarty, dataKontroli }) => {
    const zmien = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (prog) zmien('therProg', prog);
    if (lekKarty) zmien('therDrug', lekKarty);
    if (dataKontroli) {
      const d = document.getElementById('manualControlDate');
      d.style.color = '#000';
      zmien('manualControlDate', dataKontroli);
    }
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
    window.refreshGHTherapyMonitor();
    window.ghActivateTab('mon');
  }, { lista: punkty, prog: program, lekKarty: lek, dataKontroli: data });
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(punkty.length);
}

const karta = (page) => page.evaluate(() => ({
  program: document.getElementById('therProg').value,
  zablokowane: document.getElementById('therProg').disabled,
  wiersz: (document.querySelector('#ghTherapyTbody tr.gh-program-row') || { textContent: null }).textContent,
  leki: [...document.getElementById('therDrug').options].map((o) => o.value),
  lek: document.getElementById('therDrug').value,
}));
// Pola dawki i ręcznej daty kontroli karty (wynik kalkulatora z ręcznej daty: #therManual).
const dawkaIData = (page) => page.evaluate(() => ({
  dawka: document.getElementById('therDailyDose').value,
  data: document.getElementById('manualControlDate').value,
  wydanie: (document.getElementById('therManual') || { textContent: '' }).textContent.trim() !== '',
}));
const DATA = '2027-02-15';
const ostatni = (page) => page.evaluate(() => {
  const p = window.ghTherapyPoints[window.ghTherapyPoints.length - 1];
  return { type: p.type, ageYears: p.ageYears, ageMonths: p.ageMonths, drug: p.drug, program: p.program };
});

test('GPB-1 I→G: „Program terapeutyczny” SNP (zablokowane), wiersz „Program terapeutyczny: SNP”, lista SNP z Genotropin 12 mg; Kontynuacja z karty, formularz wsteczny i wizyta w Terminarzu — SNP', async ({ page }) => {
  test.setTimeout(150_000);
  const bledy = [];
  page.on('pageerror', (e) => bledy.push(String(e && e.message)));
  // Karta przed wczytaniem: program IGF-1 (lista: Increlex 40 mg) z ręczną datą kontroli — jak stan karty zapisany przy
  // dawnym polu. Przeliczenie listy: dawka zalecana programu SNP 0,025 mg/kg/d na kroku wstrzykiwacza Genotropin 12 mg
  // (0,6 mg/d przy 22,5 kg = 0,027 mg/kg/d; dotąd 0,08 mg/kg/d Increlexu), ręczna data kontroli zostaje.
  await docPro(page, I_DO_G.ghTherapyPoints, { program: 'IGF-1', data: DATA });
  expect(await karta(page)).toEqual({ program: 'SNP', zablokowane: true, wiersz: 'Program terapeutyczny: SNP', leki: LEKI_RHGH, lek: 'Genotropin 12 mg' });
  await expect(page.locator('#therDoseNote')).toContainText('zalecana dawka dla programu SNP');
  expect(await dawkaIData(page)).toEqual({ dawka: '0.027', data: DATA, wydanie: true });

  // Kontynuacja z karty terapii (bieżąca wizyta 8 l. 6 mies.) — program SNP, Genotropin 12 mg.
  await page.click('#btnGhContinue');
  await expect.poll(() => page.evaluate(() => window.ghTherapyPoints.length)).toBe(4);
  await expect(page.locator('#ghInfoOverlay')).toHaveCount(0);
  expect(await ostatni(page)).toEqual({ type: 'continue', ageYears: 8, ageMonths: 6, drug: 'Genotropin 12 mg', program: 'SNP' });
  expect((await karta(page)).program).toBe('SNP');

  // Formularz wsteczny kopiuje pole: SNP i preparat karty.
  await page.click('#btnGhRetro');
  await expect(page.locator('#ghTherapyRetroContainer')).toBeVisible();
  await expect(page.locator('#ghRetroProg')).toHaveValue('SNP');
  await expect(page.locator('#ghRetroDrug')).toHaveValue('Genotropin 12 mg');
  await page.evaluate(() => window.ghCancelRetroForm());

  // Wizyta kontrolna w Terminarzu z karty (zapis przechwycony w stronie, bez sejfu).
  await page.evaluate(() => {
    window._vildaCurrentPatientId = 'pacjent-e2e-program';
    window.__wpis = null;
    window.VildaVault.savePatientNote = (p) => { window.__wpis = p; return Promise.resolve(); };
    window.ghActivateTab('rec');
  });
  await page.click('#tzAdd90');
  await expect(page.locator('#tzGhVisitOverlay')).toContainText(`program ${SNP}`);
  await page.click('#tzGhConfirm');
  await page.waitForFunction(() => Boolean(window.__wpis));
  const wpis = await page.evaluate(() => window.__wpis);
  expect(wpis.title).toBe('Leczenie rhGH');
  expect(wpis.body).toContain(`Program: ${SNP}.`);
  expect(wpis.body).toContain('Preparat: Genotropin 12 mg.');
  expect(bledy).toEqual([]);
});

test('GPB-2 G→I: „Program terapeutyczny” IGF-1, lista Increlex 40 mg, podpowiedź dawki IGF-1; Kontynuacja z karty — IGF-1 + Increlex; cały kurs IGF-1 — lista Increlex', async ({ page }) => {
  test.setTimeout(150_000);
  await docPro(page, G_DO_I.ghTherapyPoints, { wiek: [8, 0, 20.5, 118] });
  expect(await karta(page)).toEqual({ program: 'IGF-1', zablokowane: true, wiersz: 'Program terapeutyczny: IGF-1', leki: ['Increlex 40 mg'], lek: 'Increlex 40 mg' });
  await expect(page.locator('#therDoseNote')).toContainText('IGF‑1 (mekasermina)');
  // Dawka zalecana karty dla IGF-1 (dotąd 0,027 mg/kg/d Omnitrope 10 mg przy liście rhGH).
  expect((await dawkaIData(page)).dawka).toBe('0.08');
  await page.click('#btnGhContinue');
  await expect.poll(() => page.evaluate(() => window.ghTherapyPoints.length)).toBe(3);
  expect(await ostatni(page)).toEqual({ type: 'continue', ageYears: 8, ageMonths: 0, drug: 'Increlex 40 mg', program: 'IGF-1' });

  // Cały kurs Increlex (IGF-1) po wczytaniu przy karcie z listą rhGH: lista idzie za polem.
  await page.evaluate((lista) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
    window.refreshGHTherapyMonitor();
  }, INC_PACJENT.ghTherapyPoints);
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(2);
  expect(await karta(page)).toEqual({ program: 'IGF-1', zablokowane: true, wiersz: 'Program terapeutyczny: IGF-1', leki: ['Increlex 40 mg'], lek: 'Increlex 40 mg' });
});

test('GPB-3 I→G, edycja Włączenia Increlex: pole IGF-1 podczas edycji, po zapisie edycji — SNP; Włączenie dalej IGF-1', async ({ page }) => {
  test.setTimeout(150_000);
  await docPro(page, I_DO_G.ghTherapyPoints, { program: 'IGF-1' });
  await page.click('.edit-gh-pt-btn[data-id="ig-s"]');
  await page.evaluate(() => {
    const o = document.getElementById('ghEditOverlay');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Rozumiem');
    if (b) b.click();
  });
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  await expect(page.locator('#therProg')).toHaveValue('IGF-1');
  await expect(page.locator('#therProg')).toBeDisabled();
  await expect(page.locator('#ghTherapyTbody tr.gh-program-row')).toHaveText('Program terapeutyczny: SNP');
  // Preparaty programu w formularzu edycji (lista monitora) = lista karty dla tego programu (gh_igf_therapy.js).
  const lekiEdycji = () => page.evaluate(() => [...document.getElementById('ghEditDrug').options].map((o) => o.value));
  expect(await lekiEdycji()).toEqual(['Increlex 40 mg']);
  await page.click('#btnGhStart'); // zapis edycji bez zmian
  await expect(page.locator('#ghTherapyEditContainer')).toBeHidden();
  await expect(page.locator('#ghInfoOverlay')).toHaveCount(0);
  expect(await page.evaluate(() => window.ghTherapyPoints.find((p) => p.id === 'ig-s'))).toMatchObject({ type: 'start', drug: 'Increlex 40 mg', program: 'IGF-1' });
  expect(await karta(page)).toEqual({ program: 'SNP', zablokowane: true, wiersz: 'Program terapeutyczny: SNP', leki: LEKI_RHGH, lek: 'Genotropin 12 mg' });
  await page.click('.edit-gh-pt-btn[data-id="ig-c2"]');
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  expect(await lekiEdycji()).toEqual(LEKI_RHGH);
});

test('GPB-4 bez zmian: cały kurs SNP, cały kurs IGF-1 i wznowienie (kurs 1 Increlex, kurs 2 Genotropin) — pole i wiersz jak dotąd', async ({ page }) => {
  test.setTimeout(150_000);
  await docPro(page, G1.ghTherapyPoints, { wiek: [10, 6, 30.5, 134] });
  const odczyt = async () => { const k = await karta(page); return [k.program, k.zablokowane, k.wiersz]; };
  expect(await odczyt()).toEqual(['SNP', true, 'Program terapeutyczny: SNP']);
  const wczytaj = (lista) => page.evaluate((l) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', l, { force: true });
    window.refreshGHTherapyMonitor();
  }, lista);
  await wczytaj(INC_PACJENT.ghTherapyPoints);
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(2);
  expect(await odczyt()).toEqual(['IGF-1', true, 'Program terapeutyczny: IGF-1']);
  const P = (id, type, lata, drug, program) => ({
    id, type, ageYears: lata, ageMonths: 0, weight: 18 + 2 * (lata - 7), height: 110 + 5 * (lata - 7), dose: drug.startsWith('Increlex') ? 0.08 : 0.033,
    doseAbs: (drug.startsWith('Increlex') ? 0.08 : 0.033) * (18 + 2 * (lata - 7)), doseUnit: 'mg/kg/d', drug, program, igf1: null,
  });
  await wczytaj([P('r-w1', 'start', 7, 'Increlex 40 mg', 'IGF-1'), P('r-z1', 'end', 8, 'Increlex 40 mg', 'IGF-1'),
    P('r-w2', 'start', 9, 'Genotropin 12 mg', 'SNP'), P('r-k2', 'continue', 10, 'Genotropin 12 mg', 'SNP')]);
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(4);
  await expect(page.locator('#ghTherapyTbody tr.gh-kurs-row')).toHaveText(['Kurs 2 — wznowienie w wieku 9 l. 0 mies.']);
  expect(await odczyt()).toEqual(['SNP', true, 'Program terapeutyczny: SNP']);
});

test('GPB-5 I→G z sejfu: wczytanie pacjenta na DocPro, karta i „Monitorowanie” — SNP; po odświeżeniu strony (F5) dalej SNP z listą SNP', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  const pid = await page.evaluate(async (r) => (await window.VildaVault.savePatient(r, { dedup: false })).patientId, I_DO_G);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function' && Boolean(window.vildaGhIgfPersistApi)
    && typeof window.applyLoadedData === 'function', null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  // Wczytanie tak, jak robi to zakładka Pacjenci (wzorzec skok-gh-rozgloszenie).
  await page.evaluate(async (id) => {
    const p = await window.VildaVault.getPatient(id);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, pid);
  await expect.poll(() => page.evaluate(() => (window.ghTherapyPoints || []).length)).toBe(3);
  await page.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    document.getElementById('ghIgfTherapyCard').style.display = 'block';
    window.ghActivateTab('mon');
  });
  await expect(page.locator('#ghTherapyTbody tr.gh-program-row')).toHaveText('Program terapeutyczny: SNP');
  const pole = () => page.evaluate(() => ({
    program: document.getElementById('therProg').value, zablokowane: document.getElementById('therProg').disabled,
    lekNaLiscie: [...document.getElementById('therDrug').options].some((o) => o.value === 'Genotropin 12 mg'),
  }));
  expect(await pole()).toEqual({ program: 'SNP', zablokowane: true, lekNaLiscie: true });
  await page.waitForTimeout(800); // zapis stanu DocPro (z opóźnieniem po zmianie)
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function' && Boolean(window.vildaGhIgfPersistApi), null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro
  await expect.poll(() => page.evaluate(() => (window.ghTherapyPoints || []).length)).toBe(3);
  expect(await pole()).toEqual({ program: 'SNP', zablokowane: true, lekNaLiscie: true });
  await expect(page.locator('#ghTherapyTbody tr.gh-program-row')).toHaveText('Program terapeutyczny: SNP');
});

// S1–S2 (przegląd 2026-11-23): bieżący preparat rhGH (Genotropin), a program pola IGF-1 — zapis Genotropinu z programem
// IGF-1 (S1) albo edycja ostatniej Kontynuacji zapisana bez zmian (S2, program z Włączenia przy edycji — pytanie 17).
// Program pola przeczy rodzajowi preparatu: karta zostaje przy Genotropinie, bez przeliczania listy — jak dotąd.
const PK = (id, type, lata, mies, drug, program) => ({
  id, type, ageYears: lata, ageMonths: mies, weight: 18 + 2 * (lata - 7), height: 110 + 5 * (lata - 7),
  dose: drug.startsWith('Increlex') ? 0.08 : 0.033, doseAbs: (drug.startsWith('Increlex') ? 0.08 : 0.033) * (18 + 2 * (lata - 7)),
  doseUnit: 'mg/kg/d', drug, program, igf1: null,
});
const S1 = [PK('s1-w', 'start', 7, 0, 'Increlex 40 mg', 'IGF-1'), PK('s1-k1', 'continue', 7, 6, 'Genotropin 12 mg', 'IGF-1'),
  PK('s1-k2', 'continue', 8, 0, 'Genotropin 12 mg', 'IGF-1')];

test('GPB-6 S1 Genotropin z programem IGF-1, karta na Genotropin 12 mg: pole IGF-1, karta (preparat, lista, dawka, data kontroli) bez zmian; Kontynuacja z karty — Genotropin', async ({ page }) => {
  test.setTimeout(150_000);
  await docPro(page, S1, { program: 'SNP', lek: 'Genotropin 12 mg', data: DATA });
  expect(await karta(page)).toEqual({ program: 'IGF-1', zablokowane: true, wiersz: 'Program terapeutyczny: IGF-1', leki: LEKI_RHGH, lek: 'Genotropin 12 mg' });
  const przed = await dawkaIData(page);
  expect(przed.data).toBe(DATA);
  await page.evaluate(() => window.refreshGHTherapyMonitor());
  expect(await dawkaIData(page)).toEqual(przed);
  await page.click('#btnGhContinue');
  await expect.poll(() => page.evaluate(() => window.ghTherapyPoints.length)).toBe(4);
  expect(await ostatni(page)).toEqual({ type: 'continue', ageYears: 8, ageMonths: 6, drug: 'Genotropin 12 mg', program: 'IGF-1' });
  expect((await karta(page)).lek).toBe('Genotropin 12 mg');
});

test('GPB-7 S2 I→G, karta na Genotropin 12 mg: edycja ostatniej Kontynuacji zapisana bez zmian (program IGF-1) — karta i data kontroli bez zmian; Kontynuacja z karty — Genotropin', async ({ page }) => {
  test.setTimeout(150_000);
  await docPro(page, I_DO_G.ghTherapyPoints, { program: 'SNP', lek: 'Genotropin 12 mg', data: DATA });
  expect(await karta(page)).toEqual({ program: 'SNP', zablokowane: true, wiersz: 'Program terapeutyczny: SNP', leki: LEKI_RHGH, lek: 'Genotropin 12 mg' });
  const przed = await dawkaIData(page);
  await page.click('.edit-gh-pt-btn[data-id="ig-c2"]');
  await page.evaluate(() => {
    const o = document.getElementById('ghEditOverlay');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Rozumiem');
    if (b) b.click();
  });
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  await page.click('#btnGhContinue'); // zapis edycji bez zmian
  await expect(page.locator('#ghTherapyEditContainer')).toBeHidden();
  expect(await page.evaluate(() => window.ghTherapyPoints.find((p) => p.id === 'ig-c2'))).toMatchObject({ drug: 'Genotropin 12 mg', program: 'IGF-1' });
  expect(await karta(page)).toEqual({ program: 'IGF-1', zablokowane: true, wiersz: 'Program terapeutyczny: IGF-1', leki: LEKI_RHGH, lek: 'Genotropin 12 mg' });
  expect((await dawkaIData(page)).data).toBe(przed.data);
  await page.click('#btnGhContinue');
  await expect.poll(() => page.evaluate(() => window.ghTherapyPoints.length)).toBe(4);
  expect(await ostatni(page)).toEqual({ type: 'continue', ageYears: 8, ageMonths: 6, drug: 'Genotropin 12 mg', program: 'IGF-1' });
});

test('GPB-8 G→I z sejfu: wczytanie przy karcie z listą rhGH — IGF-1, Increlex 40 mg, 0,08 mg/kg/d; stan zapisu pacjenta „zapisano” (zdarzenia karty nie są zmianą danych pacjenta)', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  const pid = await page.evaluate(async (r) => (await window.VildaVault.savePatient(r, { dedup: false })).patientId, G_DO_I);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function' && Boolean(window.vildaGhIgfPersistApi)
    && typeof window.applyLoadedData === 'function', null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(async (id) => {
    const p = await window.VildaVault.getPatient(id);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, pid);
  await expect.poll(() => page.evaluate(() => (window.ghTherapyPoints || []).length)).toBe(2);
  await page.waitForTimeout(1500);
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
  await page.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    document.getElementById('ghIgfTherapyCard').style.display = 'block';
    window.ghActivateTab('mon');
  });
  await expect(page.locator('#ghTherapyTbody tr.gh-program-row')).toHaveText('Program terapeutyczny: IGF-1');
  expect(await karta(page)).toEqual({ program: 'IGF-1', zablokowane: true, wiersz: 'Program terapeutyczny: IGF-1', leki: ['Increlex 40 mg'], lek: 'Increlex 40 mg' });
  expect((await dawkaIData(page)).dawka).toBe('0.08');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
});
