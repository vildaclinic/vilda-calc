import { expect, test } from '../support/test-czas.mjs';

// Test regresyjny P-GH-EDYCJA-LISTA (#561) na prawdziwym DocPro: edycja punktu terapii GH otwarta u pacjenta A nie
// trafia do listy pacjenta B wczytanego w tej samej stronie (applyLoadedData — lista pacjentów albo plik).
// Przed poprawką edycja przeżywała wczytanie B, a „Kontynuacja leczenia” u B dopisywała do listy B punkt A
// z wartościami A (masa, wzrost, preparat, id). Po poprawce wczytanie B kończy edycję, a lista B nie dostaje punktu A.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhEdycjaInnyPacjent!26';

const punkt = (id, nadpisania) => ({
  id, type: 'start', ageYears: 9, ageMonths: 0, weight: 43, height: 130, boneAge: null,
  dose: 1.1 / 43, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 1.1, ...nadpisania,
});
const A1 = punkt('gh-e2e-a1');
const B1 = punkt('gh-e2e-b1', {
  ageYears: 10, weight: 30, height: 135, dose: 0.03, drug: 'Genotropin 5,3 mg', doseAbs: 0.9,
});

async function zaloguj(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

// Karta GH/IGF-1 z monitorem siedzi na DocPro w ukrytej sekcji modułów — do klikania jak lekarz przenosimy ją na wierzch.
const kartaNaWierzch = (page) => page.evaluate(() => {
  window.vildaGhIgfPersistApi.ensureMounted();
  const k = document.getElementById('ghIgfTherapyCard');
  if (!k.parentNode || k.parentNode.id !== 'e2e-pudlo') {
    const pudlo = document.createElement('div');
    pudlo.id = 'e2e-pudlo';
    pudlo.style.cssText = 'position:relative;z-index:99999;background:#fff;padding:8px';
    document.body.prepend(pudlo);
    pudlo.appendChild(k);
  }
  k.style.display = 'block';
  window.ghActivateTab('mon');
});

// Pacjent A w DocPro z jednym punktem; edycja tego punktu otwarta, a masa w formularzu edycji zmieniona.
async function edycjaUPacjentaA(page, a) {
  await zaloguj(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function'
    && Boolean(window.vildaGhIgfPersistApi) && Boolean(window.vildaGhTherapyMonitorPersistApi)
    && typeof window.applyLoadedData === 'function', null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro biegnie do ~1,5 s po starcie strony
  await kartaNaWierzch(page);
  await page.evaluate((lista) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('name', 'Fikcyjny Pacjent A'); set('age', '9'); set('ageMonths', '0'); set('sex', 'M');
    set('height', '130'); set('weight', '43');
    if (typeof window.update === 'function') window.update();
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
    window.refreshGHTherapyMonitor();
  }, [a]);
  await page.click(`.edit-gh-pt-btn[data-id="${a.id}"]`);
  await page.evaluate(() => {
    const o = document.getElementById('ghEditOverlay');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Rozumiem');
    if (b) b.click();
  });
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  await page.fill('#ghEditWeight', '44.5');
  expect(await page.evaluate(() => window.vildaGhTherapyMonitorPersistApi.captureState().currentEditingId)).toBe(a.id);
}

const wczytajPacjentaB = (page, lista) => page.evaluate((punkty) => {
  window.applyLoadedData({
    name: 'Fikcyjny Pacjent B', age: '11', ageMonths: '0', sex: 'F', height: '140', weight: '32',
    ghTherapyPoints: punkty,
  });
}, lista);

const stan = (page) => page.evaluate(() => ({
  okno: JSON.stringify(window.ghTherapyPoints),
  modul: JSON.stringify(window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', null)),
  edycja: window.vildaGhTherapyMonitorPersistApi.captureState(),
}));

test('edycja punktu u pacjenta A, wczytanie pacjenta B w tej samej stronie: edycja kończy się, „Kontynuacja leczenia” nie dopisuje punktu A do listy B', async ({ page }) => {
  test.setTimeout(150_000);
  const bledy = [];
  page.on('pageerror', (e) => bledy.push(String(e && e.message)));
  await edycjaUPacjentaA(page, A1);
  const listaB = JSON.stringify([B1]);

  await wczytajPacjentaB(page, [B1]);
  // Wczytanie B kończy edycję punktu A: stan edycji pusty, formularz edycji schowany, lista = lista B.
  await expect.poll(() => stan(page)).toEqual({ okno: listaB, modul: listaB, edycja: null });
  await expect(page.locator('#ghTherapyEditContainer')).toBeHidden();

  // Lekarz u B otwiera kartę i klika „Kontynuacja leczenia”: punkt A (id, masa z edycji) nie trafia do listy B.
  await kartaNaWierzch(page);
  await page.click('#btnGhContinue');
  await page.waitForTimeout(800);
  const po = await stan(page);
  for (const lista of [JSON.parse(po.okno), JSON.parse(po.modul)]) {
    expect(lista.map((p) => p.id)).not.toContain(A1.id);
    expect(lista.filter((p) => p.weight === 44.5 || p.weight === A1.weight)).toEqual([]);
    expect(lista[0]).toEqual(B1);
  }
  expect(po.edycja).toBeNull();
  expect(bledy, `pageerror:\n${bledy.join('\n')}`).toEqual([]);
});
