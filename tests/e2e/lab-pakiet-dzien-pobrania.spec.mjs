import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, otworzPakiet, tekst, utworzPakiet, wynikiBadan } from '../support/lab-pakiet-dane.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';

// LAB-PAKIETY PR7 (makieta i decyzje właściciela z 2026-11-14): ocena w dniu pobrania. Przy dacie pobrania
// wcześniejszej niż dziś pakiet liczy wiek pacjenta z daty urodzenia na dzień pobrania i ocenia wyniki tak, jak
// pojedyncze badanie oceniłoby je u pacjenta w tym wieku. Stadium z karty stosuje dopiero po jednym
// potwierdzeniu („Tak, Th2”); stadium ocenione w dniu pobrania albo wpisane w pakiecie obowiązuje bez pytania.
// Testy pilnują: (1) pytania i stanu oczekiwania, (2) ZGODNOŚCI z oceną pacjenta w tym samym wieku „na dziś”,
// (3) zapisu oceny jako aktualnej dla dnia pobrania, (4) powrotu pytania po zmianie daty, (5) stanów bez pytania,
// (6) wieku w dniu pobrania dla norm katalogu, (7) liczenia wieku z dat.
// Prawdziwy, fikcyjny sejf (tests/support/lab-pakiet-dane.mjs); zegar stron 17.06.2026. Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const DZIS = '2026-06-17';
// Ur. 10.04.2019: dziś 7 l 2 m, 06.06.2026 (11 dni temu) 7 l 1 m.
const OLA = { name: 'Fikcyjna Ola', sex: 'F', age: 7, ageMonths: 2, dobISO: '2019-04-10' };
// Ur. 21.04.2019: dziś 7 l 1 m — ten sam wiek, który Ola miała w dniu pobrania.
const ROWIESNICA = { name: 'Fikcyjna Rówieśnica', sex: 'F', age: 7, ageMonths: 1, dobISO: '2019-04-21' };

const kartaBadania = (page, id) => kartaPakietu(page).locator(`.lab-pkg-card[data-analyte="${id}"]`);
const porownania = (page, id) => kartaBadania(page, id).locator('.vilda-lab-assessment [data-comparison]').evaluateAll((wiersze) => wiersze.map((w) => [
  w.getAttribute('data-comparison'), w.getAttribute('data-status'), w.querySelector('h4, span')?.textContent || '',
]));
const ocenaPakietu = (page, id, wartosc, jednostka) => page.evaluate(([analit, raw, unit]) => window.VildaLabConverterRuntime.packagePuberty.assess(analit, raw, unit), [id, wartosc, jednostka]);
const czeka = (page, id) => kartaBadania(page, id).locator('.lab-pkg-card-pending');

// Pacjent wczytany tak, jak robi to formularz; ocena — stadium zapisane w ocenie pokwitania wizyty:
// biezace = stadium tej wizyty (dzisiejsze badanie), inaczej wcześniejsza obserwacja z karty.
async function wczytaj(page, patientId, dane, ocena = null) {
  await page.evaluate(({ pid, dane, ocena, dzis }) => {
    sessionStorage.setItem('vildaCurrentPatientId', pid);
    window.VildaPersistence.writeShared(dane, { force: true });
    const user = { ...dane, measuredAtISO: dzis };
    if (ocena) {
      const observations = { G: null, Th: null, P: null };
      observations[ocena.os] = { stage: ocena.stadium, sex: dane.sex, observedAtISO: ocena.data, ageMonths: ocena.wiekMies, source: 'clinician-entry' };
      user.pubertyAssessment = { version: 1, sex: dane.sex, observations };
      user.pubertyAssessmentVisit = { version: 1, visitId: 'e2e-wizyta', ownerPatientId: pid, currentAxes: ocena.biezace ? [ocena.os] : [],
        reference: { sex: dane.sex, ageMonths: dane.age * 12 + dane.ageMonths, measuredAtISO: dzis } };
    }
    window.VildaPersistence.writeMainSession({ version: 1, user });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }));
  }, { pid: patientId, dane, ocena, dzis: DZIS });
}
const TH2_DZIS = { os: 'Th', stadium: 2, data: DZIS, wiekMies: 86, biezace: true };
const nowyPacjent = (page, dane) => page.evaluate(async (d) => (await window.VildaVault.savePatient({ name: d.name, user: d }, { dedup: false })).patientId, dane);
const ocenaWizyty = (page) => page.evaluate(() => { const u = window.VildaPersistence.readMainSession().user; return u.pubertyAssessment ? u.pubertyAssessment.observations : null; });

async function stadiumPakietu(page, os, stadium, przycisk = '#labPkgStageEdit') {
  if (!await page.locator('#labPkgStageEditor').isVisible()) await kliknij(page.locator(przycisk));
  await kliknij(page.locator(`#labPkgStageEditor .vpa-segments [data-puberty-axis="${os}"][data-puberty-stage="${stadium}"]`));
}

async function wypelnijDojrzewanie(page) {
  await page.locator('#labPkgValue-lh').fill('0,6');
  await page.locator('#labPkgValue-fsh').fill('3,2');
  await page.locator('#labPkgValue-estradiol').fill('60');
  await page.locator('#labPkgValue-inhibin_b').fill('60');
}

test('pobranie 11 dni temu, Th2 z dzisiejszej wizyty: jedno pytanie; po „Tak” ocena dla wieku i stadium w dniu pobrania — zgodna z oceną pacjentki w tym wieku; zapis jako aktualna ocena dnia pobrania', async ({ page }) => {
  test.setTimeout(120000);
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  await wczytaj(page, patientId, OLA, TH2_DZIS);
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol', 'inhibin_b']);
  await wypelnijDojrzewanie(page);

  // 1. Pobranie dziś: stadium tej wizyty, bez pytania — jak dotąd.
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');
  await expect(page.locator('#labPkgStageLabel')).toHaveText('Pokwitanie');
  await expect(page.locator('#labPkgStageAsk')).toBeHidden();
  await expect(page.locator('#labPkgDateNote')).toBeHidden();
  await expect(page.locator('#labPkgResultsHint')).toHaveText('na żywo, dla danych pacjenta z karty');
  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku'], ['stage', 'within', 'Dla stadium Th2']]);

  // 2. Data pobrania sprzed 11 dni: wiek z daty urodzenia na ten dzień i jedno pytanie o stadium.
  await page.locator('#labPkgDate').fill('2026-06-06');
  await expect(page.locator('#labPkgDateNote')).toHaveText('Pobranie 11 dni temu. Aplikacja ocenia wyniki dla wieku w dniu pobrania: 7 lat i 1 mies. (dziś 7 lat i 2 mies.).');
  await expect(page.locator('#labPkgDateNote .lab-pkg-date-age')).toHaveText('7 lat i 1 mies.');
  expect(await tekst(page.locator('#labPkgPatient'))).toBe('Kobieta · 7.1 lat w dniu pobrania · wiek dziecięcy/młodzieńczy');
  await expect(page.locator('#labPkgStageLabel')).toHaveText('Pokwitanie — z karty pacjenta');
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');
  await expect(page.locator('#labPkgStageMeta')).toHaveText('ocena z 17.06.2026 (dziś)');
  await expect(page.locator('#labPkgStageChip')).toBeHidden();
  await expect(page.locator('#labPkgStageEdit')).toBeHidden();
  await expect(page.locator('#labPkgStageAskText')).toHaveText('Czy w dniu pobrania, 06.06.2026, stadium też było Th2?');
  await expect(page.locator('#labPkgStageYes')).toHaveText('Tak, Th2');
  await expect(page.locator('#labPkgStageAskEdit')).toHaveText('Zmień ocenę');
  expect(await tekst(page.locator('#labPkgStageAsk'))).toBe('Czy w dniu pobrania, 06.06.2026, stadium też było Th2? Tak, Th2 Zmień ocenę Bez odpowiedzi aplikacja oceni wyniki tylko według wieku.');
  await expect(page.locator('#labPkgResultsHint')).toHaveText('na żywo, dla wieku w dniu pobrania · 06.06.2026');
  // Krok „Pacjent” czeka na odpowiedź.
  const krokPacjent = page.locator('#labPkgPuberty').locator('xpath=ancestor::div[contains(@class,"lab-pkg-step")][1]').locator('.lab-step-num');
  await expect(krokPacjent).toHaveClass(/is-ask/);
  await expect(krokPacjent).toHaveText('5');

  // Do odpowiedzi: ocena tylko według wieku; ocena według stadium i norma według Tannera czekają.
  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku']]);
  expect(await porownania(page, 'fsh')).toEqual([['age', 'within', 'Dla wieku']]);
  expect(await tekst(czeka(page, 'lh'))).toBe('Dla stadium Th2 — po potwierdzeniu stadium w dniu pobrania Potwierdź');
  expect(await tekst(czeka(page, 'fsh'))).toBe('Dla stadium Th2 — po potwierdzeniu stadium w dniu pobrania Potwierdź');
  expect(await tekst(czeka(page, 'estradiol'))).toBe('Norma dla Tanner II — po potwierdzeniu stadium w dniu pobrania Potwierdź');
  // Inhibina B ma zakresy tylko dla wieku — na stadium nie czeka.
  await expect(czeka(page, 'inhibin_b')).toHaveCount(0);
  expect(await porownania(page, 'inhibin_b')).toEqual([['age', 'within', 'Dla wieku']]);
  expect(await tekst(kartaBadania(page, 'estradiol'))).toContain('Norma · Dziewczynki prepubertalne (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany): 0–73,5 pmol/L');
  // Komunikat silnika „potrzebna jest ocena Th/M lub G” nie stoi nad kartami: ocena jest, czeka na potwierdzenie.
  await expect(page.locator('#labPkgClinical')).toBeHidden();
  expect(await tekst(page.locator('.lab-pkg-save-ctx'))).toBe('Fikcyjna Ola · pobranie 06.06.2026 · 7 l 1 m');
  await expect(page.locator('.lab-pkg-save-sub')).toHaveText('Stadium niepotwierdzone — 4 wyniki zapiszą się z oceną według wieku');
  const przed = await ocenaPakietu(page, 'lh', '0,6', 'IU/L');
  expect(przed.evaluation.input).toMatchObject({ contextBasis: 'current-patient', sampleDateISO: null, birthDateISO: null,
    age: { years: 7, months: 1, precision: 'month' }, puberty: { appliesToCurrentContext: false } });

  // 3. „Potwierdź” w karcie prowadzi do pytania; „Tak, Th2” — jedno kliknięcie, bez dalszych pytań.
  await kliknij(czeka(page, 'lh').locator('.lab-pkg-card-pending-link'));
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('labPkgStageYes');
  await kliknij(page.locator('#labPkgStageYes'));
  await expect(page.locator('#labPkgStageAsk')).toBeHidden();
  await expect(page.locator('#labPkgStageLabel')).toHaveText('Pokwitanie w dniu pobrania');
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');
  await expect(page.locator('#labPkgStageChip')).toHaveText('potwierdzone dla 06.06.2026');
  await expect(page.locator('#labPkgStageChip')).toHaveClass(/is-confirmed/);
  await expect(page.locator('#labPkgStageMeta')).toBeHidden();
  await expect(page.locator('#labPkgStageEdit')).toHaveText('Zmień ocenę');
  await expect(krokPacjent).toHaveText('✓');
  await expect(page.locator('#labPkgResultsHint')).toHaveText('na żywo, dla wieku i stadium w dniu pobrania · 06.06.2026');
  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku'], ['stage', 'within', 'Dla stadium Th2']]);
  expect(await porownania(page, 'fsh')).toEqual([['age', 'within', 'Dla wieku'], ['stage', 'within', 'Dla stadium Th2']]);
  for (const id of ['lh', 'fsh', 'estradiol', 'inhibin_b']) await expect(czeka(page, id)).toHaveCount(0);
  expect(await tekst(kartaBadania(page, 'estradiol'))).toBe('Estradiol 60 pmol/L w zakresie normy Norma · Dziewczynki Tanner II: 0–88,2 pmol/L');
  expect(await tekst(page.locator('#labPkgClinical'))).toBe('ROZWÓJ PŁCIOWY Wczesny rozwój gruczołów sutkowych — ocena przebiegu Th2 przed granicą wieku wymaga oceny progresji i objawów towarzyszących. Nie jest automatycznym rozpoznaniem CPP ani wyborem obserwacji. Dotyczy: LH, FSH');
  await expect(page.locator('.lab-pkg-save-sub')).toHaveText('4 wyniki trafią do Badań w karcie pacjenta');
  // Potwierdzenie jest lokalne: ocena dzisiejszej wizyty zostaje nietknięta.
  expect(await ocenaWizyty(page)).toMatchObject({ Th: { stage: 2, observedAtISO: DZIS, source: 'clinician-entry' } });
  const oceny = {};
  for (const [id, raw, unit] of [['lh', '0,6', 'IU/L'], ['fsh', '3,2', 'IU/L'], ['inhibin_b', '60', 'pg/mL']]) oceny[id] = await ocenaPakietu(page, id, raw, unit);
  expect(oceny.lh.evaluation.input).toMatchObject({ contextBasis: 'current-patient', sampleDateISO: null,
    age: { years: 7, months: 1, precision: 'month' }, puberty: { kind: 'Th', stage: 2, appliesToCurrentContext: true, source: 'lab-local' } });

  // 4. Zapis: ocena aktualna dla dnia pobrania (nie „wymaga ponownej oceny”), norma estradiolu według Tannera II.
  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();
  expect(await tekst(page.locator('#labPkgDone .lab-pkg-done-text'))).toBe('LH, FSH, Estradiol, Inhibina B · pobranie 06.06.2026');
  const zapis = await wynikiBadan(page, patientId);
  expect(zapis.map((n) => [n.labResult.testKey, n.clinicalDateISO])).toEqual([['estradiol', '2026-06-06'], ['fsh', '2026-06-06'], ['inhibin_b', '2026-06-06'], ['lh', '2026-06-06']]);
  for (const notatka of zapis.filter((n) => n.labResult.testKey !== 'estradiol')) {
    const klucz = notatka.labResult.testKey;
    expect(notatka.labResult.assessment.status, klucz).toBe('recorded');
    expect(notatka.labResult.assessment.reasonCodes, klucz).toEqual([]);
    expect(notatka.labResult.assessment.evaluation, klucz).toEqual(oceny[klucz].evaluation);
  }
  expect(zapis.find((n) => n.labResult.testKey === 'lh').labResult).toMatchObject({ value: '0,6', valueNum: 0.6, unit: 'IU/L' });
  expect(zapis.find((n) => n.labResult.testKey === 'estradiol').labResult.range.range.id).toBe('e2_F_tanner2');
  // Ponowny odczyt zapisanego wyniku z jego datą nie zmienia stanu oceny.
  expect(await page.evaluate((lab) => window.VildaLabSnapshot.reconcile(null, lab, null, '2026-06-06').assessment.status,
    zapis.find((n) => n.labResult.testKey === 'lh').labResult)).toBe('recorded');

  // 5. ZGODNOŚĆ: pacjentka, która ten sam wiek (7 l 1 m) ma dziś, z Th2 wpisanym w pakiecie, dostaje dokładnie
  //    tę samą ocenę — wejście silnika i wynik. Pakiet nie ma osobnych reguł dla dawnej próbki.
  const rowiesnica = await nowyPacjent(page, ROWIESNICA);
  await wczytaj(page, rowiesnica, ROWIESNICA);
  await page.locator('#labPkgDate').fill(DZIS);
  await expect(page.locator('#labPkgDateNote')).toBeHidden();
  await stadiumPakietu(page, 'Th', '2');
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');
  for (const [id, raw, unit] of [['lh', '0,6', 'IU/L'], ['fsh', '3,2', 'IU/L'], ['inhibin_b', '60', 'pg/mL']]) {
    expect((await ocenaPakietu(page, id, raw, unit)).evaluation, id).toEqual(oceny[id].evaluation);
  }
});

test('potwierdzenie dotyczy konkretnego dnia: po zmianie daty pytanie wraca; stadium wpisane w pakiecie obowiązuje dla dnia pobrania; przy pobraniu dziś wraca stadium wizyty', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  await wczytaj(page, patientId, OLA, TH2_DZIS);
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol', 'inhibin_b']);
  await wypelnijDojrzewanie(page);
  await page.locator('#labPkgDate').fill('2026-06-06');
  await kliknij(page.locator('#labPkgStageYes'));
  await expect(page.locator('#labPkgStageChip')).toHaveText('potwierdzone dla 06.06.2026');

  // Inna data pobrania: potwierdzenie nie przechodzi dalej — jedno kliknięcie od nowa.
  await page.locator('#labPkgDate').fill('2026-05-20');
  await expect(page.locator('#labPkgStageAskText')).toHaveText('Czy w dniu pobrania, 20.05.2026, stadium też było Th2?');
  await expect(page.locator('#labPkgStageChip')).toBeHidden();
  await expect(page.locator('#labPkgDateNote')).toHaveText('Pobranie 28 dni temu. Aplikacja ocenia wyniki dla wieku w dniu pobrania: 7 lat i 1 mies. (dziś 7 lat i 2 mies.).');
  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku']]);

  // „Zmień ocenę” przy pytaniu: stadium wpisane w pakiecie dotyczy dnia pobrania — bez dodatkowego pytania.
  await stadiumPakietu(page, 'Th', '1', '#labPkgStageAskEdit');
  await expect(page.locator('#labPkgStageAsk')).toBeHidden();
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th1');
  await expect(page.locator('#labPkgStageChip')).toHaveText('wpisane dla dnia pobrania');
  await expect(page.locator('#labPkgStageChip')).not.toHaveClass(/is-confirmed/);
  await expect(page.locator('#labPkgStageLabel')).toHaveText('Pokwitanie w dniu pobrania');
  await kliknij(page.locator('#labPkgStageEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeHidden();
  // Th1 u dziewczynki 7 l 1 m: odniesienie przedpokwitaniowe LH — jak w pojedynczym badaniu u pacjentki w tym wieku.
  expect(await porownania(page, 'lh')).toEqual([['prepubertal', 'above', 'Odniesienie przedpokwitaniowe']]);
  expect((await ocenaPakietu(page, 'lh', '0,6', 'IU/L')).evaluation.input.puberty).toMatchObject({ kind: 'Th', stage: 1, appliesToCurrentContext: true, source: 'lab-local' });
  for (const id of ['lh', 'fsh', 'estradiol']) await expect(czeka(page, id)).toHaveCount(0);

  // Pobranie dziś: obowiązuje stadium dzisiejszej wizyty; korekta dla dawnej próbki nie przechodzi na dziś.
  await page.locator('#labPkgDate').fill(DZIS);
  await expect(page.locator('#labPkgStageAsk')).toBeHidden();
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');
  await expect(page.locator('#labPkgStageLabel')).toHaveText('Pokwitanie');
  await expect(page.locator('#labPkgStageChip')).toBeHidden();
  await expect(page.locator('#labPkgStageMeta')).toBeHidden();
  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku'], ['stage', 'within', 'Dla stadium Th2']]);
  expect((await ocenaPakietu(page, 'lh', '0,6', 'IU/L')).evaluation.input).toMatchObject({ age: { years: 7, months: 2 }, puberty: { kind: 'Th', stage: 2, appliesToCurrentContext: true } });
  // Karta pacjenta (ocena wizyty) bez zmian przez cały czas.
  expect(await ocenaWizyty(page)).toMatchObject({ Th: { stage: 2, observedAtISO: DZIS, source: 'clinician-entry' } });
});

test('bez pytania: brak stadium w karcie i stadium ocenione w dniu pobrania; wcześniejsza ocena z innego dnia — jedno pytanie z datą oceny', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });

  // A. Chłopiec ur. 10.04.2020 (dziś 6 l 2 m, w dniu pobrania 6 l 1 m), bez oceny pokwitania: nie ma czego potwierdzać.
  //    LH dostaje odniesienie przedpokwitaniowe dla wieku z dnia pobrania — to samo co przy pobraniu dziś.
  const chlopiec = { name: 'Fikcyjny Franek', sex: 'M', age: 6, ageMonths: 2, dobISO: '2020-04-10' };
  await wczytaj(page, patientId, chlopiec);
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh']);
  await page.locator('#labPkgValue-lh').fill('0,4');
  expect(await porownania(page, 'lh')).toEqual([['prepubertal', 'above', 'Odniesienie przedpokwitaniowe']]);
  await page.locator('#labPkgDate').fill('2026-06-06');
  await expect(page.locator('#labPkgDateNote')).toHaveText('Pobranie 11 dni temu. Aplikacja ocenia wyniki dla wieku w dniu pobrania: 6 lat i 1 mies. (dziś 6 lat i 2 mies.).');
  await expect(page.locator('#labPkgStageAsk')).toBeHidden();
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Nie oceniono stadium');
  await expect(page.locator('#labPkgStageLabel')).toHaveText('Pokwitanie');
  await expect(page.locator('#labPkgStageEdit')).toBeVisible();
  expect(await porownania(page, 'lh')).toEqual([['prepubertal', 'above', 'Odniesienie przedpokwitaniowe']]);
  expect(await tekst(kartaBadania(page, 'lh'))).toContain('Górna granica: 0,3 IU/L');
  await expect(czeka(page, 'lh')).toHaveCount(0);
  const lh = await ocenaPakietu(page, 'lh', '0,4', 'IU/L');
  expect(lh.evaluation.input.age).toMatchObject({ years: 6, months: 1 });
  expect(lh.evaluation.prepubertalLh).toMatchObject({ status: 'available', policyVersion: '2026-10-25.1', comparison: { status: 'above' } });

  // B. Dziewczynka z wcześniejszą oceną Th2 z karty wykonaną w dniu pobrania (06.06.2026): obowiązuje bez pytania.
  const ola = await nowyPacjent(page, OLA);
  await wczytaj(page, ola, OLA, { os: 'Th', stadium: 2, data: '2026-06-06', wiekMies: 85, biezace: false });
  // Zmiana pacjenta czyści wpisane wyniki — pole wypełniamy dopiero dla nowej pacjentki.
  await expect(page.locator('.lab-pkg-save-ctx')).toContainText('Fikcyjna Ola');
  await page.locator('#labPkgDate').fill(DZIS);
  await page.locator('#labPkgValue-lh').fill('0,6');
  // Dziś ta ocena jest wcześniejszą obserwacją — jak dotąd nie wchodzi do oceny wyniku.
  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku']]);
  await page.locator('#labPkgDate').fill('2026-06-06');
  await expect(page.locator('#labPkgStageAsk')).toBeHidden();
  await expect(page.locator('#labPkgStageLabel')).toHaveText('Pokwitanie w dniu pobrania');
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');
  await expect(page.locator('#labPkgStageMeta')).toHaveText('ocena z 06.06.2026');
  await expect(page.locator('#labPkgStageChip')).toBeHidden();
  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku'], ['stage', 'within', 'Dla stadium Th2']]);

  // C. Ta sama ocena przy innej dacie pobrania (20.05.2026): pytanie nazywa datę oceny z karty.
  await page.locator('#labPkgDate').fill('2026-05-20');
  await expect(page.locator('#labPkgStageAskText')).toHaveText('Czy w dniu pobrania, 20.05.2026, stadium też było Th2?');
  await expect(page.locator('#labPkgStageMeta')).toHaveText('ocena z 06.06.2026');
  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku']]);
  await kliknij(page.locator('#labPkgStageYes'));
  await expect(page.locator('#labPkgStageChip')).toHaveText('potwierdzone dla 20.05.2026');
  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku'], ['stage', 'within', 'Dla stadium Th2']]);
});

test('cały pakiet liczy wiek z dnia pobrania: norma katalogu dla przedziału wieku z dnia pobrania; data sprzed urodzenia wstrzymuje zapis', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  // Ur. 10.06.2020: dziś 6 lat (norma TSH „Dzieci 6–10 lat”), 20.05.2026 — 5 lat i 11 mies.
  const dziecko = { name: 'Fikcyjna Tosia', sex: 'F', age: 6, ageMonths: 0, dobISO: '2020-06-10' };
  await wczytaj(page, patientId, dziecko);
  await page.locator('#labPkgValue-tsh').fill('5,5');
  const tsh = kartaBadania(page, 'tsh');
  expect(await tekst(tsh.locator('.lab-pkg-card-norm'))).toBe('Norma · Dzieci 6–10 lat: 0,6–4,8 mIU/L');
  await expect(tsh.locator('.lab-range-status')).toHaveText('powyżej normy');
  expect(await tekst(page.locator('#labPkgPatient'))).toBe('Kobieta · 6 lat · wiek dziecięcy/młodzieńczy');

  await page.locator('#labPkgDate').fill('2026-05-20');
  await expect(page.locator('#labPkgDateNote')).toHaveText('Pobranie 28 dni temu. Aplikacja ocenia wyniki dla wieku w dniu pobrania: 5 lat i 11 mies. (dziś 6 lat).');
  expect(await tekst(page.locator('#labPkgPatient'))).toBe('Kobieta · 5.9 lat w dniu pobrania · wiek dziecięcy/młodzieńczy');
  // W dniu pobrania dziecko było w młodszym przedziale wieku normy — ten sam wynik mieści się w zakresie.
  expect(await tekst(tsh.locator('.lab-pkg-card-norm'))).toBe('Norma · Dzieci 1–5 lat: 0,7–6 mIU/L');
  await expect(tsh.locator('.lab-range-status')).toHaveText('w zakresie normy');
  // Pakiet bez badań pokwitaniowych: bez pytania o stadium.
  await expect(page.locator('#labPkgPuberty')).toBeHidden();
  await expect(page.locator('#labPkgResultsHint')).toHaveText('na żywo, dla wieku w dniu pobrania · 20.05.2026');
  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();
  const zapis = await wynikiBadan(page, patientId);
  expect(zapis).toHaveLength(1);
  expect(zapis[0].clinicalDateISO).toBe('2026-05-20');
  // Zapisana norma to norma z dnia pobrania — ta, którą pokazała karta wyniku.
  expect(zapis[0].labResult.range.range.id).toBe('tsh_1_5y');

  // Data sprzed urodzenia: błąd przy dacie, zapis wstrzymany.
  await page.locator('#labPkgValue-tsh').fill('5,5');
  await page.locator('#labPkgDate').fill('2020-06-01');
  await expect(page.locator('#labPkgDateNote')).toHaveText('Data pobrania jest wcześniejsza niż data urodzenia pacjenta.');
  await expect(page.locator('#labPkgDateNote')).toHaveClass(/is-error/);
  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgError')).toHaveText('Data pobrania jest wcześniejsza niż data urodzenia pacjenta.');
  expect(await wynikiBadan(page, patientId)).toHaveLength(1);
});

test('dorosła kobieta: wiek w dniu pobrania, bez pytania o stadium, „Cykl / menopauza” jak dotąd', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  const kobieta = { name: 'Fikcyjna Dorosła', sex: 'F', age: 30, ageMonths: 5, dobISO: '1996-01-15' };
  await wczytaj(page, patientId, kobieta);
  await utworzPakiet(page, 'Oś gonadalna', ['lh', 'fsh']);
  await page.locator('#labPkgValue-lh').fill('6');
  await page.locator('#labPkgCycle').selectOption('follicular');
  const dzis = (await ocenaPakietu(page, 'lh', '6', 'IU/L')).evaluation;
  await page.locator('#labPkgDate').fill('2026-06-06');
  await expect(page.locator('#labPkgDateNote')).toHaveText('Pobranie 11 dni temu. Aplikacja ocenia wyniki dla wieku w dniu pobrania: 30 lat i 4 mies. (dziś 30 lat i 5 mies.).');
  await expect(page.locator('#labPkgStageAsk')).toBeHidden();
  await expect(page.locator('#labPkgStageSummary')).toBeHidden();
  await expect(page.locator('#labPkgCycle')).toHaveValue('follicular');
  const pobranie = (await ocenaPakietu(page, 'lh', '6', 'IU/L')).evaluation;
  expect(pobranie.input).toMatchObject({ age: { years: 30, months: 4 }, reproductiveContext: 'follicular' });
  // Ten sam zakres fazy folikularnej co przy pobraniu dziś.
  expect(pobranie.biochemical).toEqual(dzis.biochemical);
});

test('niemowlę: wiek w dniach z karty cofa się o dni od pobrania — ocena jak u niemowlęcia, które ten wiek ma dziś', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  // Wiek w dniach bierze strona z pamięci formularza głównego (VildaLabNeonatalContext). Tutaj jej odczyt
  // zastępuje wiek liczony z daty urodzenia pacjenta na dziś — w postaci, w jakiej formularz główny podaje go
  // z dat kalendarzowych: przedział [d−1, d] (sama data nie mówi, czy minęła pełna doba).
  await page.evaluate((dzis) => {
    window.VildaLabNeonatalContext.read = (shared) => {
      if (!shared || !shared.dobISO) return null;
      const dni = Math.round((Date.parse(dzis) - Date.parse(shared.dobISO)) / 86400000);
      return { postnatalDays: { lower: Math.max(0, dni - 1), upper: dni, source: 'main-calendar-dates' }, gestationalDays: null };
    };
  }, DZIS);
  // Chłopiec ur. 03.04.2026: dziś 75. dzień od urodzenia, 06.06.2026 (11 dni temu) — 64.
  const niemowle = { name: 'Fikcyjny Staś', sex: 'M', age: 0, ageMonths: 2, dobISO: '2026-04-03' };
  await wczytaj(page, patientId, niemowle);
  await utworzPakiet(page, 'Minipokwitanie', ['lh', 'fsh']);
  await expect.poll(() => page.evaluate(() => window.VildaLabConverterRuntime.packagePuberty.presentation(['lh']).sourceStatus)).toBe('ready');
  const dzis = (await ocenaPakietu(page, 'lh', '2,4', 'IU/L')).evaluation;
  expect(dzis.input.neonatalAge.postnatalDays).toMatchObject({ lower: 74, upper: 75 });
  await page.locator('#labPkgDate').fill('2026-06-06');
  await expect(page.locator('#labPkgDateNote')).toHaveText('Pobranie 11 dni temu. Aplikacja ocenia wyniki dla wieku w dniu pobrania: 2 mies.');
  const pobranie = {};
  for (const [id, raw] of [['lh', '2,4'], ['fsh', '1,8']]) pobranie[id] = (await ocenaPakietu(page, id, raw, 'IU/L')).evaluation;
  expect(pobranie.lh.input.neonatalAge.postnatalDays).toMatchObject({ lower: 63, upper: 64, source: 'main-calendar-dates' });
  expect(pobranie.lh.input.age).toBeNull();
  expect(pobranie.lh.input).toMatchObject({ contextBasis: 'current-patient', sampleDateISO: null, birthDateISO: null });

  // ZGODNOŚĆ: chłopiec ur. 14.04.2026 jest dziś w 64. dniu od urodzenia — ta sama ocena, wejście silnika i wynik.
  const rowiesnik = await nowyPacjent(page, { name: 'Fikcyjny Jaś', sex: 'M', age: 0, ageMonths: 2, dobISO: '2026-04-14' });
  await wczytaj(page, rowiesnik, { name: 'Fikcyjny Jaś', sex: 'M', age: 0, ageMonths: 2, dobISO: '2026-04-14' });
  await page.locator('#labPkgDate').fill(DZIS);
  await expect.poll(() => page.evaluate(() => window.VildaLabConverterRuntime.packagePuberty.presentation(['lh']).sourceStatus)).toBe('ready');
  for (const [id, raw] of [['lh', '2,4'], ['fsh', '1,8']]) expect((await ocenaPakietu(page, id, raw, 'IU/L')).evaluation, id).toEqual(pobranie[id]);
});

test('wiek z daty urodzenia na dzień pobrania: ukończone lata i miesiące, miesięcznica w krótszym miesiącu w jego ostatnim dniu', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  const wiek = async (dobISO, dataISO, dane = {}) => {
    await wczytaj(page, patientId, { name: 'Fikcyjna Kalendarzowa', sex: 'F', age: 7, ageMonths: 2, ...(dobISO ? { dobISO } : {}), ...dane });
    // Dane pacjenta z karty wczytują się chwilę; do tego czasu strona nie zna daty urodzenia.
    await expect.poll(() => page.evaluate(() => window.VildaLabConverterRuntime.packagePuberty.presentation(['lh']).sourceStatus)).toBe('ready');
    return page.evaluate(([data, dzis]) => {
      const stan = window.VildaLabConverterRuntime.packagePuberty.setSampleDate(data, dzis);
      return [stan.mode, stan.age ? stan.age.years + ' l ' + stan.age.months + ' m' : null, stan.daysAgo];
    }, [dataISO, DZIS]);
  };
  expect(await wiek('2019-04-10', '2026-06-06')).toEqual(['dated', '7 l 1 m', 11]);
  expect(await wiek('2019-04-10', '2026-04-10')).toEqual(['dated', '7 l 0 m', 68]);
  expect(await wiek('2019-04-10', '2026-04-09')).toEqual(['dated', '6 l 11 m', 69]);
  // Urodzeni 29 lutego i 31 dnia miesiąca: miesięcznica w ostatnim dniu krótszego miesiąca (jak wiek z dat w silniku LH/FSH).
  expect(await wiek('2020-02-29', '2026-02-27')).toEqual(['dated', '5 l 11 m', 110]);
  expect(await wiek('2020-02-29', '2026-02-28')).toEqual(['dated', '6 l 0 m', 109]);
  expect(await wiek('2025-01-31', '2025-02-27')).toEqual(['dated', '0 l 0 m', 475]);
  expect(await wiek('2025-01-31', '2025-02-28')).toEqual(['dated', '0 l 1 m', 474]);
  expect(await wiek('2019-04-10', '2019-04-10')).toEqual(['dated', '0 l 0 m', 2625]);
  // Poza oceną w dniu pobrania: dziś, data przyszła, data sprzed urodzenia, brak daty urodzenia.
  expect(await wiek('2019-04-10', DZIS)).toEqual(['today', null, null]);
  expect(await wiek('2019-04-10', '2026-06-18')).toEqual(['today', null, null]);
  expect(await wiek('2019-04-10', '2019-04-09')).toEqual(['before-birth', null, 2626]);
  expect(await wiek(null, '2026-06-06')).toEqual(['no-birth-date', null, 11]);
  expect(await wiek('2019-04-10', 'nie-data')).toEqual(['today', null, null]);
});
