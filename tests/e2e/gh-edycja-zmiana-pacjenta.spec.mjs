import { expect, test } from '../support/test-czas.mjs';

// P-GH-EDYCJA-PACJENT: w powłoce app.html zmiana pacjenta sesji karty w innej ramce kończy od razu edycję punktu terapii
// GH otwartą w DocPro — razem z nakładką „Edytujesz punkt leczenia” (w body, poza kartą GH, którą chowa przy tym
// P-TOZSAMOSC-RAMEK). Wcześniej nakładka zostawała otwarta nad DocPro nowego pacjenta. Bez zmiany listy punktów.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhEdycjaPacjent!26';
const PUNKT = {
  id: 'gh-e2e-pacjent-1', type: 'start', ageYears: 9, ageMonths: 0, weight: 30, height: 131, boneAge: null,
  dose: 0.025, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL',
  igf1DaysSinceDose: null, doseAbs: 0.75,
};

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaPersistence);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

const stanDocPro = (docpro) => docpro.evaluate(() => ({
  nakladka: Boolean(document.getElementById('ghEditOverlay')),
  edycja: Boolean(window.vildaGhTherapyMonitorPersistApi.captureState()),
  lista: (window.ghTherapyPoints || []).map((p) => p.id),
}));

test('zmiana pacjenta w ramce Start zamyka w DocPro nakładkę edycji punktu GH i kończy edycję, bez zmiany listy', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.waitForFunction(() => Boolean(window.VildaVault));
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForTimeout(1500);
  await start.evaluate(() => sessionStorage.setItem('vildaCurrentPatientId', 'fikc-pacjent-1'));

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function'
    && Boolean(window.vildaGhIgfPersistApi) && Boolean(window.vildaGhTherapyMonitorPersistApi), null, { timeout: 30000 });
  await page.waitForTimeout(2600); // odtworzenie stanu DocPro po przełączeniu
  await docpro.evaluate((p) => {
    window.vildaGhIgfPersistApi.ensureMounted();
    document.getElementById('ghIgfTherapyCard').style.display = 'block';
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [p], { force: true });
    window.refreshGHTherapyMonitor();
    window.ghActivateTab('mon');
    // „Edytuj” w wierszu tabeli; nakładki „Edytujesz punkt leczenia” lekarz jeszcze nie zamknął.
    document.querySelector(`.edit-gh-pt-btn[data-id="${p.id}"]`).click();
  }, PUNKT);
  await expect.poll(() => stanDocPro(docpro)).toEqual({ nakladka: true, edycja: true, lista: [PUNKT.id] });

  // Inna ramka tej karty (Start) zmienia pacjenta sesji karty.
  await start.evaluate(() => sessionStorage.setItem('vildaCurrentPatientId', 'fikc-pacjent-2'));

  await expect.poll(() => stanDocPro(docpro), { message: 'DocPro po zmianie pacjenta w ramce Start' })
    .toEqual({ nakladka: false, edycja: false, lista: [PUNKT.id] });
  expect(await docpro.evaluate(() => window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', null)))
    .toEqual([PUNKT]);
});
