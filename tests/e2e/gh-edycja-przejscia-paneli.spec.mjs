import { expect, test } from '../support/test-czas.mjs';

// P-GH-EDYCJA-ODCISK, test kontrolny w powłoce app.html: edycja punktu terapii GH otwarta w DocPro u pacjenta bez
// sejfu (pusty znacznik pacjenta sesji karty) przeżywa przejścia Start ↔ DocPro i zapisuje punkt w miejscu. Przy pustym
// znaczniku edycja trwa tylko, gdy edytowany punkt na liście jest taki sam jak przy otwarciu — ten test pilnuje, żeby
// przejścia paneli (mostek na Start, odtworzenie sesji w DocPro) nie zmieniały punktu i nie kończyły edycji.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhEdycjaPrzejscia!26';
const PO_PRZEJSCIU_MS = 2600; // panel docelowy odtwarza wspólny stan i sesję główną po przełączeniu
const NIE_ZAPISANO = 'Nie zapisano zmian: edytowany punkt nie należy do bieżącej listy punktów. Otwórz edycję ponownie.';

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaPersistence);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

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

async function otworzPowloke(page) {
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
    && typeof window.applyLoadedData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForTimeout(1500);
  await wpisz(start, { name: 'Fikcyjna Ewa', age: '13', ageMonths: '0', sex: 'F', height: '146.2', weight: '44' });
  await page.waitForTimeout(1500);
  return start;
}

// Karta GH/IGF-1 z monitorem siedzi na DocPro w ukrytej sekcji modułów — do klikania jak lekarz przenosimy ją na wierzch.
const kartaNaWierzch = (docpro) => docpro.evaluate(() => {
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

const stan = (fr) => fr.evaluate(() => ({
  pacjent: window.sessionStorage.getItem('vildaCurrentPatientId'),
  edycja: window.vildaGhTherapyMonitorPersistApi.captureState(),
  modul: window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', null),
}));

test('pacjent bez sejfu: edycja punktu GH w DocPro przeżywa przejścia Start ↔ DocPro i zapisuje punkt w miejscu', async ({ page }) => {
  test.setTimeout(180_000);
  const bledy = [];
  page.on('pageerror', (e) => bledy.push(String(e && e.message)));
  await otworzPowloke(page);
  let docpro = await przejdz(page, 'docpro');
  await docpro.waitForFunction(() => typeof window.ghAddTherapyPoint === 'function' && Boolean(window.vildaGhIgfPersistApi), null, { timeout: 30000 });
  await kartaNaWierzch(docpro);
  await wpisz(docpro, { therProg: 'SNP', therDrug: 'Omnitrope 10 mg' });
  await docpro.evaluate(() => window.ghAddTherapyPoint('start'));
  await expect.poll(() => docpro.evaluate(() => (window.ghTherapyPoints || []).length)).toBe(1);
  const punkt = await docpro.evaluate(() => window.ghTherapyPoints[0]);

  // Edycja punktu: nowa masa w formularzu edycji.
  await docpro.click(`.edit-gh-pt-btn[data-id="${punkt.id}"]`);
  await docpro.evaluate(() => {
    const o = document.getElementById('ghEditOverlay');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Rozumiem');
    if (b) b.click();
  });
  await docpro.fill('#ghEditWeight', '44.6');
  const przed = await stan(docpro);
  expect(przed.pacjent).toBeNull();
  expect(przed.edycja).toMatchObject({ currentEditingId: String(punkt.id) });

  // Przejścia Start ↔ DocPro: edycja trwa, punkt na liście bez zmian.
  await przejdz(page, 'start');
  docpro = await przejdz(page, 'docpro');
  await przejdz(page, 'start');
  docpro = await przejdz(page, 'docpro');
  const po = await stan(docpro);
  expect(po.edycja).toMatchObject({ currentEditingId: String(punkt.id), fields: { weight: '44.6' } });
  expect(po.modul).toEqual([punkt]);

  // Zapis edycji: ten sam id i pozycja, nowa masa, bez komunikatu odmowy.
  await kartaNaWierzch(docpro);
  await docpro.click('#btnGhStart');
  await expect.poll(() => docpro.evaluate(() => window.vildaGhTherapyMonitorPersistApi.captureState())).toBeNull();
  const lista = await docpro.evaluate(() => window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', null));
  expect(lista.map((p) => p.id)).toEqual([punkt.id]);
  expect(lista[0]).toMatchObject({ weight: 44.6, type: 'start', drug: 'Omnitrope 10 mg' });
  expect(await docpro.evaluate(() => {
    const o = document.getElementById('ghInfoOverlay');
    return o ? o.textContent : '';
  })).not.toContain(NIE_ZAPISANO);
  expect(bledy, `pageerror:\n${bledy.join('\n')}`).toEqual([]);
});
