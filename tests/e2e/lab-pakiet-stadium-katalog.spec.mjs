import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, otworzPakiet, tekst, utworzPakiet, wczytajPacjentaZOcena, wynikiBadan } from '../support/lab-pakiet-dane.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';

// LAB-PAKIETY PR8 (decyzja właściciela z 2026-11-14): stadium w pakiecie, w którym dobiera ono tylko normy
// katalogu. Badania katalogu z zakresem według Tannera (IGF-1, IGFBP-3, androstendion, estradiol…) biorą stadium
// z karty. Pakiet bez LH, FSH i testosteronu całkowitego nie miał wiersza stadium: stadium nie dało się poprawić,
// a przy dawnej próbce pakiet brał dzisiejsze bez pytania. Teraz taki pakiet ma ten sam wiersz stadium, ten sam
// edytor i to samo jedno pytanie o dzień pobrania co pakiet z LH (PR6, PR7). Testy pilnują: (1) wiersza i notki,
// (2) korekty stadium zmieniającej normę, (3) pytania i stanu oczekiwania przy dawnej próbce oraz zapisu normy,
// (4) że nośnik oceny pokwitania (LH) nie jest oceniany ani zapisywany, (5) pakietów, w których wiersza nie ma.
// Prawdziwy, fikcyjny sejf (tests/support/lab-pakiet-dane.mjs); zegar stron 17.06.2026. Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const DZIS = '2026-06-17';
// Ur. 10.04.2016: dziś 10 l 2 m, 06.06.2026 — 10 l 1 m.
const HANIA = { name: 'Fikcyjna Hania', sex: 'F', age: 10, ageMonths: 2, dobISO: '2016-04-10' };
const TH2_DZIS = { os: 'Th', stadium: 2, data: DZIS, wiekMies: 122, biezace: true };
const kartaBadania = (page, id) => kartaPakietu(page).locator(`.lab-pkg-card[data-analyte="${id}"]`);
const norma = (page, id) => tekst(kartaBadania(page, id).locator('.lab-pkg-card-norm'));
const status = (page, id) => kartaBadania(page, id).locator('.lab-range-status');
const czeka = (page, id) => kartaBadania(page, id).locator('.lab-pkg-card-pending');
const opis = (page, ids) => page.evaluate((lista) => {
  const p = window.VildaLabConverterRuntime.packagePuberty.presentation(lista);
  return { available: p.available, stage: p.stage ? { summary: p.stage.summary, catalog: p.stage.catalog || null } : null, cycle: p.cycle, stageAnalytes: p.stageAnalytes };
}, ids);
const ocenaWizyty = (page) => page.evaluate(() => { const u = window.VildaPersistence.readMainSession().user; return u.pubertyAssessment ? u.pubertyAssessment.observations : null; });
async function stadiumPakietu(page, os, stadium) {
  if (!await page.locator('#labPkgStageEditor').isVisible()) await kliknij(page.locator('#labPkgStageEdit'));
  await kliknij(page.locator(`#labPkgStageEditor .vpa-segments [data-puberty-axis="${os}"][data-puberty-stage="${stadium}"]`));
}

test('pakiet „Wzrost” (IGF-1, IGFBP-3, TSH): wiersz stadium z notką, korekta stadium zmienia normę IGF-1 i IGFBP-3; LH — nośnik oceny pokwitania — nie jest oceniane ani zapisywane', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  await wczytajPacjentaZOcena(page, patientId, HANIA, TH2_DZIS);
  await utworzPakiet(page, 'Wzrost', ['igf1', 'igfbp3', 'tsh']);
  await page.locator('#labPkgValue-igf1').fill('65');
  await page.locator('#labPkgValue-igfbp3').fill('4');
  await page.locator('#labPkgValue-tsh').fill('2,1');

  // Stadium z karty dobiera normę jak dotąd; nowością jest wiersz stadium z możliwością korekty.
  await expect(page.locator('#labPkgPuberty')).toBeVisible();
  await expect(page.locator('#labPkgStageLabel')).toHaveText('Pokwitanie');
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');
  await expect(page.locator('#labPkgStageEdit')).toHaveText('Zmień ocenę');
  await expect(page.locator('#labPkgPubertyNote')).toHaveText('Stadium dobiera normę według Tannera: IGF-1, IGFBP-3.');
  await expect(page.locator('#labPkgCycle')).toBeHidden();
  await expect(page.locator('#labPkgStageAsk')).toBeHidden();
  expect(await norma(page, 'igf1')).toBe('Norma · Dziewczynki Tanner II: 15,5–59,1 nmol/L');
  await expect(status(page, 'igf1')).toHaveText('powyżej normy');
  expect(await norma(page, 'igfbp3')).toContain('Tanner II (wczesne pokwitanie)');
  expect(await norma(page, 'igfbp3')).toContain('2–5,8 mg/L');
  expect(await norma(page, 'tsh')).toBe('Norma · Dzieci 6–10 lat: 0,6–4,8 mIU/L');
  expect(await opis(page, ['igf1', 'igfbp3', 'tsh'])).toEqual({ available: true, stage: { summary: 'Th2', catalog: ['igf1', 'igfbp3'] }, cycle: null, stageAnalytes: [] });

  // „Zmień ocenę” → Th3: korekta tylko dla tego sprawdzenia; IGF-1 65 nmol/L mieści się w normie dla Tanner III.
  await stadiumPakietu(page, 'Th', '3');
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th3');
  expect(await norma(page, 'igf1')).toBe('Norma · Dziewczynki Tanner III: 33,8–69,3 nmol/L');
  await expect(status(page, 'igf1')).toHaveText('w zakresie normy');
  expect(await norma(page, 'igfbp3')).toContain('2,5–7,5 mg/L');
  expect(await norma(page, 'tsh')).toBe('Norma · Dzieci 6–10 lat: 0,6–4,8 mIU/L');
  expect(await tekst(page.locator('#labPkgPatient'))).toContain('Tanner III (nadpisanie lokalne; u pacjenta: Th II)');
  await kliknij(page.locator('#labPkgStageEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeHidden();
  // Karta pacjenta (ocena wizyty) bez zmian.
  expect(await ocenaWizyty(page)).toMatchObject({ Th: { stage: 2, observedAtISO: DZIS, source: 'clinician-entry' } });

  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();
  const zapis = await wynikiBadan(page, patientId);
  // Trzy badania pakietu, każde z normą katalogu; LH (nośnik oceny pokwitania) nie ma wśród wyników, a żaden
  // wynik nie niesie koperty oceny pokwitaniowej.
  expect(zapis.map((n) => [n.labResult.testKey, n.labResult.range.range.id, Object.prototype.hasOwnProperty.call(n.labResult, 'assessment')])).toEqual([
    ['igf1', 'igf1_F_tanner3', false], ['igfbp3', 'igfbp3_tanner3', false], ['tsh', 'tsh_6_10y', false]]);
});

test('dawna próbka w pakiecie „Wzrost”: stadium z karty czeka na jedno potwierdzenie, norma według Tannera czeka w kartach; po „Tak” norma i zapis dla Tanner II', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  await wczytajPacjentaZOcena(page, patientId, HANIA, TH2_DZIS);
  await utworzPakiet(page, 'Wzrost', ['igf1', 'igfbp3', 'tsh']);
  await page.locator('#labPkgValue-igf1').fill('65');
  await page.locator('#labPkgValue-igfbp3').fill('4');
  await page.locator('#labPkgValue-tsh').fill('2,1');
  await page.locator('#labPkgDate').fill('2026-06-06');

  await expect(page.locator('#labPkgDateNote')).toHaveText('Pobranie 11 dni temu. Aplikacja ocenia wyniki dla wieku w dniu pobrania: 10 lat i 1 mies. (dziś 10 lat i 2 mies.).');
  await expect(page.locator('#labPkgStageLabel')).toHaveText('Pokwitanie — z karty pacjenta');
  await expect(page.locator('#labPkgStageMeta')).toHaveText('ocena z 17.06.2026 (dziś)');
  await expect(page.locator('#labPkgStageAskText')).toHaveText('Czy w dniu pobrania, 06.06.2026, stadium też było Th2?');
  // Do odpowiedzi: norma bez stadium (dla wieku albo zakres ogólny), a norma według Tannera czeka.
  expect(await norma(page, 'igf1')).toBe('Norma · Dziewczynki pubertalne (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany): 15,5–76,8 nmol/L');
  await expect(status(page, 'igf1')).toHaveText('w zakresie normy');
  await expect(status(page, 'igfbp3')).toHaveText('zakres ogólny — bez oceny dla dziecka');
  expect(await tekst(czeka(page, 'igf1'))).toBe('Norma dla Tanner II — po potwierdzeniu stadium w dniu pobrania Potwierdź');
  expect(await tekst(czeka(page, 'igfbp3'))).toBe('Norma dla Tanner II — po potwierdzeniu stadium w dniu pobrania Potwierdź');
  await expect(czeka(page, 'tsh')).toHaveCount(0);
  await expect(page.locator('.lab-pkg-save-sub')).toHaveText('Stadium niepotwierdzone — 3 wyniki zapiszą się z oceną według wieku');

  await kliknij(page.locator('#labPkgStageYes'));
  await expect(page.locator('#labPkgStageChip')).toHaveText('potwierdzone dla 06.06.2026');
  await expect(page.locator('#labPkgStageLabel')).toHaveText('Pokwitanie w dniu pobrania');
  expect(await norma(page, 'igf1')).toBe('Norma · Dziewczynki Tanner II: 15,5–59,1 nmol/L');
  await expect(status(page, 'igf1')).toHaveText('powyżej normy');
  expect(await norma(page, 'igfbp3')).toContain('2–5,8 mg/L');
  for (const id of ['igf1', 'igfbp3', 'tsh']) await expect(czeka(page, id)).toHaveCount(0);
  await expect(page.locator('.lab-pkg-save-sub')).toHaveText('3 wyniki trafią do Badań w karcie pacjenta');
  expect(await ocenaWizyty(page)).toMatchObject({ Th: { stage: 2, observedAtISO: DZIS, source: 'clinician-entry' } });

  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();
  const zapis = await wynikiBadan(page, patientId);
  expect(zapis.map((n) => [n.labResult.testKey, n.clinicalDateISO, n.labResult.range.range.id])).toEqual([
    ['igf1', '2026-06-06', 'igf1_F_tanner2'], ['igfbp3', '2026-06-06', 'igfbp3_tanner2'], ['tsh', '2026-06-06', 'tsh_6_10y']]);

  // Zapis bez odpowiedzi nie jest wstrzymany: norma bez stadium.
  await page.locator('#labPkgValue-igf1').fill('65');
  await page.locator('#labPkgDate').fill('2026-05-20');
  await expect(page.locator('#labPkgStageAskText')).toHaveText('Czy w dniu pobrania, 20.05.2026, stadium też było Th2?');
  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();
  const drugi = (await wynikiBadan(page, patientId)).filter((n) => n.clinicalDateISO === '2026-05-20');
  expect(drugi.map((n) => [n.labResult.testKey, n.labResult.range.range.id])).toEqual([['igf1', 'igf1_F_peripubertal_age']]);
});

test('bez stadium w karcie: wiersz „Nie oceniono stadium” pozwala je wpisać; przy dawnej próbce nie ma pytania', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  // Chłopiec ur. 10.03.2014: dziś 12 l 3 m; bez oceny pokwitania.
  await wczytajPacjentaZOcena(page, patientId, { name: 'Fikcyjny Olek', sex: 'M', age: 12, ageMonths: 3, dobISO: '2014-03-10' });
  await utworzPakiet(page, 'Androgeny', ['androstenedione', 'tsh']);
  await page.locator('#labPkgValue-androstenedione').fill('2');
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Nie oceniono stadium');
  await expect(page.locator('#labPkgPubertyNote')).toHaveText('Stadium dobiera normę według Tannera: Androstendion.');
  expect(await norma(page, 'androstenedione')).toBe('Norma · Chłopcy pubertalni (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany): 1,08–4,89 nmol/L');
  await page.locator('#labPkgDate').fill('2026-06-06');
  await expect(page.locator('#labPkgStageAsk')).toBeHidden();
  await expect(czeka(page, 'androstenedione')).toHaveCount(0);
  await stadiumPakietu(page, 'G', '3');
  await expect(page.locator('#labPkgStageSummary')).toHaveText('G3');
  await expect(page.locator('#labPkgStageChip')).toHaveText('wpisane dla dnia pobrania');
  expect(await norma(page, 'androstenedione')).toBe('Norma · Chłopcy Tanner III: 1,74–3,49 nmol/L');
});

test('wiersza stadium nie ma, gdy stadium nie dobiera normy: pakiet „Tarczyca” u dziecka i badania z normą według Tannera u dorosłej', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  await wczytajPacjentaZOcena(page, patientId, HANIA, TH2_DZIS);
  await page.locator('#labPkgValue-tsh').fill('2,1');
  await expect(kartaBadania(page, 'tsh').locator('.lab-pkg-card-norm')).toBeVisible();
  await expect(page.locator('#labPkgPuberty')).toBeHidden();
  expect(await opis(page, ['tsh', 'ft4', 'ft3'])).toMatchObject({ available: false, stage: null });

  const dorosla = await page.evaluate(async () => (await window.VildaVault.savePatient({ name: 'Fikcyjna Dorosła', user: { name: 'Fikcyjna Dorosła', sex: 'F', age: 30, ageMonths: 5, dobISO: '1996-01-15' } }, { dedup: false })).patientId);
  await wczytajPacjentaZOcena(page, dorosla, { name: 'Fikcyjna Dorosła', sex: 'F', age: 30, ageMonths: 5, dobISO: '1996-01-15' });
  await utworzPakiet(page, 'Wzrost', ['igf1', 'igfbp3']);
  await page.locator('#labPkgValue-igf1').fill('25');
  expect(await norma(page, 'igf1')).toBe('Norma · Dorośli 30–39 lat: 11,8–30,1 nmol/L');
  await expect(page.locator('#labPkgPuberty')).toBeHidden();
  await page.locator('#labPkgDate').fill('2026-06-06');
  await expect(page.locator('#labPkgPuberty')).toBeHidden();
  await expect(page.locator('#labPkgStageAsk')).toBeHidden();
});
