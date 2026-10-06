import { expect, test } from '../support/test-czas.mjs';

// P-WYCZYSC-PUNKTY (2026-10-06) — test regresyjny: „Wyczyść wszystkie pola” na Start nie zostawia w DocPro punktów
// leczenia otyłości ani bisfosfonianów poprzedniego pacjenta.
//
// Scenariusz: Start z X → DocPro (pokazuje X) → Start „Wyczyść” (vilda_chrome.js powtarza je w DocPro). DocPro czyścił
// formularz, punkty GH, rodziców i pomiary, ale magazyn punktów zmieniony w innej ramce budził w monitorach otyłości
// i bisfosfonianów zapasowy odczyt z sejfu. Odczyt brał pacjenta ze zmiennej ramki (jeszcze X) i zapisywał punkty X
// z powrotem do pamięci panelu i do magazynu karty. Nowe dziecko zapisane potem z DocPro dostawało punkty X.
// Zmierzone: na `audyt` `8aa4150` (przed P-PRZEJECIE-MODULY, #553) 3 z 4 przebiegów czerwone (otyłość i bisfosfoniany);
// od `d3c0935` (#553: odczyt bierze pacjenta sesji karty i odrzuca wynik po zmianie pacjenta) 0 z 12. Test pilnuje,
// żeby nie wróciło.
//
// Dane wyłącznie FIKCYJNE, własne konto sejfu w efemerycznym profilu przeglądarki.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#WyczyscPunkty!26';

const X_PAY = {
  name: 'Fikcyjny Pierwszy',
  user: { lastName: 'Fikcyjny', firstName: 'Pierwszy', sex: 'M', age: 8, ageMonths: 0, height: 126, weight: 25 },
  ghTherapyPoints: [{ id: 'gh-x1', type: 'start', ageYears: 8, ageMonths: 0, height: 126, weight: 25, dose: 0.03, drug: 'Genotropin', program: 'GHD' }],
  obesityTherapyPoints: [{ id: 'ob-x1', type: 'start', ageYears: 8, ageMonths: 0, dose: '0,6 mg', drug: 'Saxenda – liraglutyd', substance: 'liraglutyd' }],
  bisphosTherapyPoints: [{ id: 'bis-x1', type: 'start', ageMonths: 96, weight: 25, indication: 'oi', drug: 'pamifos', dose: 1, cycleDays: 3 }],
};

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault && typeof f.contentWindow.applyLoadedData === 'function');
  }, tytul, { timeout: 30000 });
  return (await page.$(`iframe.app-pane[title="${tytul}"]`)).contentFrame();
}

async function powlokaZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.saveUserData === 'function');
  await page.waitForTimeout(1500);
  const zgoda = page.locator('#consent-decline');
  if (await zgoda.isVisible().catch(() => false)) await zgoda.click();
  return start;
}

/* Lista pacjentów → karta → „Wczytaj tego pacjenta” → „Nowy pomiar” (tak jak lekarz). */
async function wczytajZListy(page, ctx, nazwa) {
  await page.locator('#patientsListBtnSidebar').click();
  await ctx.locator('.pt-rcard2', { hasText: nazwa }).first().click();
  await ctx.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await ctx.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 10000 });
  await ctx.click('#vildaLcmNew');
  await ctx.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

/* Wpis pól jak w tozsamosc-pacjenta-duplikaty.spec.mjs: powtarzany, dopóki kolektor nie zobaczy oczekiwanego stanu. */
const wpiszPola = (ctx, pola) => ctx.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);
async function wpiszIPotwierdz(ctx, pola, warunek, opis) {
  let ostatnie = null;
  for (let proba = 0; proba < 15; proba += 1) {
    await wpiszPola(ctx, pola);
    ostatnie = await ctx.evaluate(() => { const d = window.collectUserData() || {}; return { name: d.name || null, user: d.user || {} }; });
    if (warunek(ostatnie)) return ostatnie;
    await ctx.waitForTimeout(200);
  }
  throw new Error(`formularz nie ustalił się na: ${opis} (ostatnio: ${JSON.stringify(ostatnie)})`);
}

/* Punkty terapii w pamięci panelu i w magazynie karty. */
const punkty = (ctx) => ctx.evaluate(() => {
  const ids = (a) => (Array.isArray(a) ? a.map((x) => x && x.id) : []);
  const mag = (k) => { try { return ids(JSON.parse(window.sessionStorage.getItem(k) || '[]')); } catch { return ['?']; } };
  return {
    gh: ids(window.ghTherapyPoints),
    otylosc: ids(window.obesityTherapyPoints),
    bisfosfoniany: ids(window.bisphosTherapyPoints),
    magazynOtylosc: mag('OBESITY_THERAPY_POINTS'),
    magazynBisfosfoniany: mag('BISPHOS_THERAPY_POINTS'),
  };
});
const BEZ_X = { gh: [], otylosc: [], bisfosfoniany: [], magazynOtylosc: [], magazynBisfosfoniany: [] };

test('„Wyczyść” na Start przy DocPro z X: DocPro i magazyn karty bez punktów terapii X; nowe dziecko zapisane z DocPro bez punktów X', async ({ page }) => {
  test.setTimeout(240_000);
  const natywne = [];
  page.on('dialog', (d) => { natywne.push(d.message()); d.dismiss().catch(() => {}); });
  const start = await powlokaZKontem(page);
  const idX = await start.evaluate(async (x) => (await window.VildaVault.savePatient(x, { dedup: false })).patientId, X_PAY);
  await wczytajZListy(page, start, 'Fikcyjny Pierwszy');

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await expect(docpro.locator('#lastName')).toHaveValue('Fikcyjny', { timeout: 15000 });
  await expect.poll(async () => (await punkty(docpro)).otylosc, { message: 'warunek wstępny: DocPro ma punkt otyłości X', timeout: 15000 })
    .toContain('ob-x1');
  await expect.poll(async () => (await punkty(docpro)).bisfosfoniany, { message: 'warunek wstępny: DocPro ma punkt bisfosfonianów X', timeout: 15000 })
    .toContain('bis-x1');

  await page.locator('a.sidebar-link[href="index.html"]').click();
  const s = await ramka(page, 'Start');
  await s.click('#clearAllDataBtn');
  const straznik = s.locator('.vug-btn.vug-danger');
  if (await straznik.isVisible({ timeout: 2000 }).catch(() => false)) await straznik.click();
  await expect(s.locator('#lastName')).toHaveValue('');
  await page.waitForTimeout(3000); // dłużej niż zapasowy odczyt z sejfu w monitorach (350 ms) i odczyt rekordu

  expect(await punkty(docpro), 'DocPro po „Wyczyść” na Start: bez punktów X w pamięci i w magazynie karty').toEqual(BEZ_X);
  expect(await punkty(s), 'Start po „Wyczyść”').toMatchObject({ magazynOtylosc: [], magazynBisfosfoniany: [] });

  await wpiszIPotwierdz(s, { firstName: 'Trzeci', lastName: 'Fikcyjny-Trzeci', sex: 'M' },
    (st) => String(st.name || '').includes('Fikcyjny-Trzeci'), 'nazwisko nowego dziecka');
  await wpiszIPotwierdz(s, { age: '6', ageMonths: '0', weight: '21', height: '116' },
    (st) => st.user.weight === 21 && st.user.age === 6, 'pomiar nowego dziecka');
  await page.waitForTimeout(1500);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const d2 = await ramka(page, 'DocPro');
  await expect(d2.locator('#lastName'), 'DocPro pokazuje nowe dziecko').toHaveValue('Fikcyjny-Trzeci', { timeout: 20000 });
  await page.waitForTimeout(2500);
  expect(await punkty(d2), 'DocPro z nowym dzieckiem').toEqual(BEZ_X);

  await d2.evaluate(async () => { await window.saveUserData(); });
  await expect.poll(() => d2.evaluate(async () => (await window.VildaVault.listPatients()).length), { timeout: 20000 }).toBe(2);
  const zapis = await d2.evaluate(async (x) => {
    const lista = await window.VildaVault.listPatients();
    const z = lista.find((p) => p.patientId !== x);
    const p = await window.VildaVault.getPatient(z.patientId);
    const pay = p.snapshots[0].payload;
    const ids = (a) => (Array.isArray(a) ? a.map((q) => q && q.id) : []);
    return { name: pay.name, otylosc: ids(pay.obesityTherapyPoints), bisfosfoniany: ids(pay.bisphosTherapyPoints), gh: ids(pay.ghTherapyPoints) };
  }, idX);
  expect(zapis, 'rekord nowego dziecka bez punktów terapii X').toEqual({ name: 'Fikcyjny-Trzeci Trzeci', otylosc: [], bisfosfoniany: [], gh: [] });
  // DocPro potwierdza zapis natywnym oknem („Zapisano nowego pacjenta…”) — inne natywne okna byłyby błędem.
  expect(natywne.filter((m) => !/^Zapisano nowego pacjenta/.test(m)), 'bez innych okien natywnych').toEqual([]);
});
