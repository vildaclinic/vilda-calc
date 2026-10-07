import { expect, test } from '../support/test-czas.mjs';

// Testy regresyjne P-GH-SESJA-LISTA (#562) w powłoce app.html: punkt terapii GH usunięty prawdziwym monitorem
// w DocPro nie wraca po przełączeniu paneli. Pacjent z sejfu z jednym punktem, wczytany przez „Odtwórz zapis”.
// Przed poprawką sesja główna DocPro zachowywała starą listę (zawierającą usunięty punkt), a Start
// odtwarzał z niej pamięć modułu i punkt wracał we wszystkich kopiach:
// S5 — pacjent wczytany na Start, mostek na Start chwilowo wstrzymany w chwili usunięcia;
// S7 — powłoka otwarta od razu na DocPro i tam wczytany pacjent; mostek na Start (ramka doładowana przez powłokę w tle,
//      bez pacjenta) wstrzymany w chwili usunięcia. Gdy mostek działa, sam poprawia sesję; bez niego punkt wracał.
// Po poprawce lista jest pusta we wszystkich kopiach obu ramek (okno, pamięć modułu, sesja główna).
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PowlokaUsuniecieGh!26';
const PO_PRZEJSCIU_MS = 2600; // panel docelowy odtwarza wspólny stan i sesję główną po przełączeniu
const P0 = {
  id: 'gh-e2e-usun-p0', type: 'start', ageYears: 12, ageMonths: 0, weight: 40, height: 140.1, boneAge: null,
  dose: 0.033, doseUnit: 'mg/kg/d', drug: 'Genotropin 5,3 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 1.32,
};

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaPersistence && f.contentWindow.VildaVault);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

const gotowa = (fr) => fr.waitForFunction(() => window.VildaVault.isUnlocked()
  && typeof window.saveUserData === 'function' && typeof window.applyLoadedData === 'function'
  && !document.documentElement.classList.contains('vilda-auth-locked'), null, { timeout: 30000 });

const TYTULY = { start: 'Start', docpro: 'DocPro' };
async function przejdz(page, cel) {
  await page.evaluate((p) => window.VildaShell.navigate(p), cel);
  const fr = await ramka(page, TYTULY[cel]);
  await page.waitForTimeout(PO_PRZEJSCIU_MS);
  return fr;
}

const wpisz = (fr, pola) => fr.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);

const dataUrodzenia = (fr) => fr.evaluate(() => {
  const d = new Date();
  const u = new Date(d.getFullYear() - 12, d.getMonth() - 1, 5);
  const z = (n) => String(n).padStart(2, '0');
  return `${z(u.getDate())}-${z(u.getMonth() + 1)}-${u.getFullYear()}`;
});

// Identyfikatory punktów GH w każdej kopii ramki: lista okna, pamięć modułu i sesja główna karty.
const kopie = (fr) => fr.evaluate(() => {
  const ids = (a) => (Array.isArray(a) ? a.map((p) => p && p.id) : null);
  const P = window.VildaPersistence;
  const s = P.readMainSession();
  return { okno: ids(window.ghTherapyPoints), modul: ids(P.readModuleJSON('GH_THERAPY_POINTS', null)), sesja: s ? ids(s.ghTherapyPoints) : null };
});
const PUSTO = { okno: [], modul: [], sesja: [] };

async function otworzPowloke(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await gotowa(start);
  await page.waitForTimeout(1500);
  return start;
}

// Pacjent z punktem P0 zapisany w sejfie; potem formularz wyczyszczony.
async function zapiszPacjentaZPunktem(page, start) {
  await wpisz(start, { lastName: 'Fikcyjna', firstName: 'Ewa', dobInput: await dataUrodzenia(start), sex: 'F', height: '148.5', weight: '50.5' });
  await start.evaluate((lista) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
    window.ghTherapyPoints = lista;
  }, [P0]);
  await start.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await page.waitForTimeout(1200);
  expect(await start.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(1200);
  await start.evaluate(() => window.clearAllData());
  await page.waitForTimeout(900);
}

// „Wczytaj tego pacjenta” → „Odtwórz zapis” w danej ramce.
async function wczytajPacjenta(page, fr) {
  const pid = (await fr.evaluate(async () => (await window.VildaVault.listPatients()).map((p) => p.patientId)))[0];
  await fr.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), pid);
  await fr.getByRole('button', { name: 'Wczytaj tego pacjenta' }).waitFor({ state: 'visible', timeout: 15000 });
  await fr.evaluate(() => { const b = document.getElementById('consent-banner'); if (b) b.remove(); });
  await fr.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Wczytaj tego pacjenta').click(); });
  await fr.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 8000 });
  await fr.evaluate(() => document.getElementById('vildaLcmRestore').click());
  await fr.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

// Usunięcie punktu prawdziwym monitorem: przycisk w tabeli i potwierdzenie w nakładce.
async function usunWDocPro(docpro, id) {
  await docpro.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function'
    && Boolean(window.vildaGhIgfPersistApi), null, { timeout: 30000 });
  await docpro.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    document.getElementById('ghIgfTherapyCard').style.display = 'block';
    window.ghActivateTab('mon');
  });
  await expect(docpro.locator(`.delete-gh-pt-btn[data-id="${id}"]`)).toHaveCount(1);
  await docpro.evaluate((pid) => document.querySelector(`.delete-gh-pt-btn[data-id="${pid}"]`).click(), id);
  await docpro.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#ghDeleteOverlay button')).find((x) => x.textContent === 'Usuń');
    b.click();
  });
  await expect.poll(() => docpro.evaluate(() => (window.ghTherapyPoints || []).length)).toBe(0);
}

async function oczekujPustej(fr, opis) {
  await expect.poll(() => kopie(fr), { message: opis, timeout: 10000 }).toEqual(PUSTO);
}

test('S5: punkt usunięty w DocPro przy wstrzymanym mostku na Start nie wraca po przejściach Start ↔ DocPro', async ({ page }) => {
  test.setTimeout(180_000);
  const bledy = [];
  page.on('pageerror', (e) => bledy.push(String(e && e.message)));
  let start = await otworzPowloke(page);
  await zapiszPacjentaZPunktem(page, start);
  await wczytajPacjenta(page, start);
  expect((await kopie(start)).modul).toEqual([P0.id]);

  let docpro = await przejdz(page, 'docpro');
  await gotowa(docpro);
  expect((await kopie(docpro)).modul).toEqual([P0.id]);
  await start.evaluate(() => { window.__vildaSuppressGhAdvancedImportUntil = Date.now() + 2500; });
  await usunWDocPro(docpro, P0.id);
  await page.waitForTimeout(3000);
  await oczekujPustej(docpro, 'DocPro po usunięciu');

  start = await przejdz(page, 'start');
  await oczekujPustej(start, 'Start po przejściu');
  await oczekujPustej(docpro, 'DocPro, gdy widoczny jest Start');
  docpro = await przejdz(page, 'docpro');
  await oczekujPustej(docpro, 'DocPro po powrocie');
  await oczekujPustej(start, 'Start po powrocie do DocPro');
  expect(bledy, `pageerror:\n${bledy.join('\n')}`).toEqual([]);
});

test('S7: pacjent wczytany od razu w DocPro, mostek na Start wstrzymany — punkt usunięty w DocPro nie wraca po przejściu do Start i z powrotem', async ({ page }) => {
  test.setTimeout(180_000);
  const bledy = [];
  page.on('pageerror', (e) => bledy.push(String(e && e.message)));
  const start = await otworzPowloke(page);
  await zapiszPacjentaZPunktem(page, start);
  await page.waitForTimeout(2100);

  // Powłoka otwarta od razu na DocPro; pacjent wczytany w DocPro, nie na Start.
  await page.goto('/app.html#/docpro', { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  let docpro = await ramka(page, 'DocPro');
  await gotowa(docpro);
  await wczytajPacjenta(page, docpro);
  await expect.poll(() => kopie(docpro).then((k) => k.modul)).toEqual([P0.id]);
  const startWTle = await ramka(page, 'Start'); // powłoka doładowuje Start w tle ~1,2 s po otwarciu
  await startWTle.evaluate(() => { window.__vildaSuppressGhAdvancedImportUntil = Date.now() + 2500; });
  await usunWDocPro(docpro, P0.id);
  await page.waitForTimeout(2000);
  await oczekujPustej(docpro, 'DocPro po usunięciu');

  const startPo = await przejdz(page, 'start');
  await page.waitForTimeout(1500);
  await oczekujPustej(startPo, 'Start po przejściu');
  await oczekujPustej(docpro, 'DocPro, gdy widoczny jest Start');
  docpro = await przejdz(page, 'docpro');
  await oczekujPustej(docpro, 'DocPro po powrocie');
  expect(bledy, `pageerror:\n${bledy.join('\n')}`).toEqual([]);
});
