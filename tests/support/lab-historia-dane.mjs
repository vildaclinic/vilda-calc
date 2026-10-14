import { czekajNaBadania } from './karta-czekanie.mjs';

export { czekajNaBadania, sekcjaBadan } from './karta-czekanie.mjs';

/**
 * LAB-HISTORIA PR2: fikcyjny sejf i fikcyjna pacjentka dla e2e zakładki „Badania” (desktop i telefon).
 *
 * Dane wyłącznie FIKCYJNE. Zestaw pokrywa przypadki widoku: tarczyca w dwóch jednostkach (TSH zapisane raz
 * w μIU/mL, fT4 raz w ng/dL — wynik przeliczony bez strzałki), normy tekstowe wpisu (strzałka ↓/↑ z zapisu),
 * pojedynczy wynik fT3 (bez wykresu), LH z zapisaną oceną (także wynik cenzorowany „<0,1”), prolaktyna
 * w jednostce nierozpoznanej („Inne”), leczenie tiamazolem i jedno zlecenie bez wyniku z minionym terminem.
 * Zegar stron w testach to 17.06.2026 (tests/support/czas.mjs), więc daty badań są wcześniejsze.
 */

export const URODZENIE = '2014-03-10';

export async function otworzSejf(page, sciezka = '/index.html') {
  await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:')
    ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto(sciezka, { waitUntil: 'load' });
  await page.evaluate(() => window.VildaSession?.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaLabSnapshot));
  await page.evaluate(() => window.VildaVault.createUser('E2e#Badania!2026', { label: 'Fikcyjny sejf badań', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && Boolean(window.VildaAuthUI));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  return page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjna Badaniowa',
    user: { name: 'Fikcyjna Badaniowa', sex: 'F', age: 12, ageMonths: 3, height: 152, weight: 41 },
  }, { dedup: false })).patientId);
}

// Ocena LH z produkcyjnego silnika (jak w lab-snapshot.spec.mjs); strona Start ładuje go tylko do testu.
async function zaladujSilnikLh(page) {
  if (await page.evaluate(() => Boolean(window.VildaLabPuberty && window.VildaLabPubertyData))) return;
  await page.addScriptTag({ url: '/vilda_lab_puberty_data.js' });
  await page.addScriptTag({ url: '/vilda_lab_puberty.js' });
}

export async function zapiszHistorie(page, patientId) {
  await zaladujSilnikLh(page);
  return page.evaluate(async ({ pid, dob }) => {
    const V = window.VildaVault;
    const lab = (date, test, testKey, value, valueNum, unit, extra = {}) => V.savePatientNote({
      patientId: pid, title: `Fikcyjne ${test.split(' ')[0]}`, body: extra.body || '', category: 'wynik-badania',
      clinicalDateISO: date,
      labResult: { test, testKey, value, ...(valueNum == null ? {} : { valueNum }), unit, ...(extra.norm ? { norm: extra.norm } : {}) },
    });
    const ids = {};
    ids.tsh1 = (await lab('2026-01-14', 'TSH (tyreotropina)', 'tsh', '0,01 μIU/mL', 0.01, 'μIU/mL', { body: 'rozpoznanie · tiamazol 30 mg' })).id;
    ids.tsh2 = (await lab('2026-02-25', 'TSH (tyreotropina)', 'tsh', '0,02 mIU/L', 0.02, 'mIU/L', { norm: '0,27–4,2 mIU/L', body: 'redukcja do 20 mg' })).id;
    ids.tsh3 = (await lab('2026-04-08', 'TSH (tyreotropina)', 'tsh', '0,05 mIU/L', 0.05, 'mIU/L', { norm: '0,27–4,2 mIU/L', body: 'redukcja tiamazolu do 10 mg' })).id;
    ids.tsh4 = (await lab('2026-06-02', 'TSH (tyreotropina)', 'tsh', '0,12 mIU/L', 0.12, 'mIU/L', { norm: '0,27–4,2 mIU/L', body: 'kontrola po redukcji do 10 mg' })).id;
    ids.ft41 = (await lab('2026-01-14', 'fT4 (wolna tyroksyna)', 'ft4', '38,5 pmol/L', 38.5, 'pmol/L')).id;
    ids.ft42 = (await lab('2026-02-25', 'fT4 (wolna tyroksyna)', 'ft4', '2,1 ng/dL', 2.1, 'ng/dL')).id;
    ids.ft43 = (await lab('2026-04-08', 'fT4 (wolna tyroksyna)', 'ft4', '21 pmol/L', 21, 'pmol/L', { norm: '12–22 pmol/L' })).id;
    ids.ft44 = (await lab('2026-06-02', 'fT4 (wolna tyroksyna)', 'ft4', '17,8 pmol/L', 17.8, 'pmol/L', { norm: '12–22 pmol/L' })).id;
    ids.ft3 = (await lab('2026-06-02', 'fT3 (wolna trójjodotyronina)', 'ft3', '5,2 pmol/L', 5.2, 'pmol/L')).id;
    ids.prl1 = (await lab('2026-02-25', 'Prolaktyna (PRL)', 'prolactin', '12 ng/mL', 12, 'ng/mL')).id;
    ids.prl2 = (await lab('2026-04-08', 'Prolaktyna (PRL)', 'prolactin', '250 mU/l', 250, 'mU/l')).id;
    const lh = async (date, value) => {
      const evaluation = window.VildaLabPuberty.evaluate({
        analyte: 'lh', value, unit: 'IU/L', sex: 'F', birthDateISO: dob, sampleDateISO: date,
        specimen: 'serum', measurementKind: 'basal',
        assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
        puberty: { kind: 'Th', stage: 3, assessedAtISO: date },
        treatment: { gnrha: 'no', sexSteroids: 'no' },
      }, window.VildaLabPubertyData);
      const labResult = { test: 'LH (hormon luteinizujący)', testKey: 'lh', value, unit: 'IU/L', assessment: window.VildaLabSnapshot.create(evaluation) };
      if (evaluation.measurement.isExact) labResult.valueNum = evaluation.measurement.plotValue;
      return (await V.savePatientNote({ patientId: pid, title: 'Fikcyjne LH', body: 'Fikcyjny komentarz LH', category: 'wynik-badania', clinicalDateISO: date, labResult })).id;
    };
    ids.lh1 = await lh('2026-02-25', '<0,1');
    ids.lh2 = await lh('2026-04-08', '1,8');
    ids.lh3 = await lh('2026-06-02', '2,4');
    const med = (date, action, dose) => V.savePatientNote({
      patientId: pid, title: `Fikcyjny tiamazol ${dose}`, body: '', category: 'treatment', clinicalDateISO: date,
      medication: { name: 'Tiamazol', action, dose },
    });
    ids.med1 = (await med('2026-01-14', 'start', '30 mg')).id;
    ids.med2 = (await med('2026-02-25', 'change', '20 mg')).id;
    ids.med3 = (await med('2026-04-08', 'change', '10 mg')).id;
    ids.zlecenie = (await V.savePatientNote({
      patientId: pid, title: 'Kontrola TSH', body: 'Fikcyjne zlecenie', category: 'wynik-badania', dueDateISO: '2026-06-16',
      labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh' },
    })).id;
    return ids;
  }, { pid: patientId, dob: URODZENIE });
}

export async function otworzBadania(page, patientId) {
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), patientId);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
  await czekajNaBadania(page);
}
