import { expect, test } from '../support/test-czas.mjs';

// P-POWLOKA-OBCY (2026-10-06) — panel powłoki nie może po cichu przejąć innego pacjenta.
//
// Panele Start i DocPro to osobne dokumenty w ramkach powłoki app.html; każdy trzyma w pamięci własny formularz,
// a migawka sesji, stan wspólny i identyfikator pacjenta są wspólne dla karty przeglądarki. Gdy jeden panel
// wczytywał innego pacjenta, drugi (ukryty) dalej trzymał poprzedniego: lustro formularza wpisywało mu nazwisko
// i płeć nowego pacjenta, a autozapis utrwalał migawkę-hybrydę (nazwisko Y, dane kliniczne X); przy powrocie
// powłoka przejmowała sam identyfikator i nakładała hybrydę — „Zapisz” dopisywało do rekordu Y punkty terapii,
// rodziców i pomiary X. Niezależnie od wyścigu wzrost rodziców X wracał do pustych pól Y ze stanu wspólnego.
//
// Każdy test chodzi wyłącznie przez prawdziwą powłokę i interfejs (lista pacjentów, Terminarz, skok do punktu GH,
// „Zapisz” w panelu bocznym) i sprawdza dane kliniczne, a nie tylko nazwisko na ekranie.
//
// Dane wyłącznie FIKCYJNE, własne konto sejfu w efemerycznym profilu przeglądarki.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PanelObcy!26';

const X_PAY = {
  name: 'Fikcyjny Pierwszy',
  user: { lastName: 'Fikcyjny', firstName: 'Pierwszy', sex: 'M', age: 8, ageMonths: 0, height: 126, weight: 25 },
  ghTherapyPoints: [{ id: 'gh-x1', type: 'start', ageYears: 8, ageMonths: 0, height: 126, weight: 25, dose: 0.03, drug: 'Genotropin', program: 'GHD' }],
  obesityTherapyPoints: [{ id: 'ob-x1', type: 'start', ageYears: 8, ageMonths: 0, dose: '0,6 mg', drug: 'Saxenda – liraglutyd', substance: 'liraglutyd' }],
  perinatal: { gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650, birthLengthCm: 41, birthHeadCircCm: 29 },
  advanced: {
    name: 'Fikcyjny Pierwszy', motherHeight: 158, fatherHeight: 171,
    data: { measurements: [{ ageMonths: 72, ageYears: 6, height: 112, weight: 19 }, { ageMonths: 96, ageYears: 8, height: 126, weight: 25 }] },
  },
};

/* Y bez własnego GH (wtedy przeciekał punkt GH X); wariant „oby” ma własny punkt otyłości (ginął przy odtworzeniu). */
function yPay(wariant) {
  const p = { name: 'Fikcyjna Druga', user: { lastName: 'Fikcyjna', firstName: 'Druga', sex: 'F', age: 11, ageMonths: 0, height: 141, weight: 36 } };
  if (wariant === 'oby') {
    p.obesityTherapyPoints = [{ id: 'ob-y1', type: 'start', ageYears: 11, ageMonths: 0, dose: '1,0 mg', drug: 'Fikcyjny lek Y', substance: 'fikcyjna' }];
  }
  return p;
}

/* Znaczniki pacjenta X w dowolnym zapisie formularza (migawka, payload snapshotu). */
function znacznikiX(p) {
  if (!p || typeof p !== 'object') return [];
  const out = [];
  const ids = (a) => (Array.isArray(a) ? a.map((x) => x && x.id) : []);
  if (ids(p.ghTherapyPoints).includes('gh-x1')) out.push('gh-x1');
  if (ids(p.obesityTherapyPoints).includes('ob-x1')) out.push('ob-x1');
  const adv = p.advanced || {};
  if (Number(adv.motherHeight) === 158 || Number(adv.fatherHeight) === 171) out.push('rodzice');
  const pomiary = (adv.data && adv.data.measurements) || [];
  if (pomiary.some((m) => m && Number(m.height) === 112)) out.push('pomiar-112');
  const per = p.perinatal || p.birth || {};
  if (Number(per.birthWeightG) === 1650) out.push('okoloporodowe');
  const f = p.foods || {};
  if ([...(f.snacks || []), ...(f.meals || [])].some((r) => r && Number(r.qty) === 7)) out.push('pokarmy');
  return out;
}

async function przygotujStrone(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      // Wizyta Y jest „na dziś” — wyciszone przypomnienia, żeby okno przypomnień nie zasłaniało kliknięć.
      const d = new Date();
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      window.localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
      window.localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
    } catch { /* brak storage — pomiń */ }
  });
}

async function ramka(page, tytul, { formularz = true, timeout = 30000 } = {}) {
  await page.waitForFunction(([n, zFormularzem]) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault
      && (!zFormularzem || typeof f.contentWindow.applyLoadedData === 'function'));
  }, [tytul, formularz], { timeout });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

async function powlokaZKontem(page) {
  await przygotujStrone(page);
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

const zalozPacjentow = (start, wariant) => start.evaluate(async ({ x, y }) => {
  // Pokarm X (7 porcji) z danych samej aplikacji — sekcja pokarmów jest tylko na Start (kanał 8b).
  const dane = window.VildaFoodData || window.vildaFoodData || {};
  const klucz = Object.keys(dane.snacks || {})[0];
  if (klucz) x.foods = { snacks: [{ key: klucz, qty: 7 }], meals: [] };
  const a = await window.VildaVault.savePatient(JSON.parse(JSON.stringify(x)), { dedup: false });
  const b = await window.VildaVault.savePatient(JSON.parse(JSON.stringify(y)), { dedup: false });
  return { x: a.patientId, y: b.patientId };
}, { x: X_PAY, y: yPay(wariant) });

/* Wizyta Y w Terminarzu z przyciskiem „↗ Siatki / punkt GH” (pola jak ot() w gh_igf_therapy.js). */
const zalozWizyteY = (start, idY) => start.evaluate(async (pid) => {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const w = await window.VildaVault.savePatientNote({
    patientId: pid, category: 'treatment', title: 'Leczenie rhGH',
    body: 'Kontrola leczenia hormonem wzrostu.\nPreparat: Omnitrope.\nDawka: 0,025 mg/kg/d.',
    dueDateISO: iso, durationMin: 20, dueTime: '10:30',
    medication: { action: 'change', doseNum: 0.025, doseUnit: 'mg/kg/d', freq: 'dzień' },
    linkedAgeMonths: 132, ghPointId: 'gh-y0',
  });
  return Boolean(w && w.id);
}, idY);

/* Od P-PRZEJECIE-MODULY (#553, 2026-10-06) wskaźnik zapisu w panelu, który odtworzył albo przejął pacjenta karty
   wczytanego w innej ramce, bywa „dirty” bez żadnej zmiany w formularzu, a strażnik pyta przed wczytaniem innego
   pacjenta („Zapisać zmiany przed wczytaniem?”). Przed #553 tego okna w tych scenariuszach nie było; zgłoszone
   właścicielowi osobno. Odpowiadamy jak lekarz, który niczego nie zmieniał („Odrzuć zmiany i wczytaj”), i zostawiamy
   adnotację w raporcie testu. */
const STRAZNIK = '.vug-backdrop';
async function odpowiedzStraznikowi(ctx, gdzie) {
  test.info().annotations.push({ type: 'strażnik niezapisanych zmian (#553)', description: gdzie });
  await ctx.locator('.vug-btn.vug-danger').click();
  await ctx.waitForSelector(STRAZNIK, { state: 'detached', timeout: 10000 }).catch(() => {});
}

/* Lista pacjentów → karta → „Wczytaj tego pacjenta” → wybór wizyty (tak jak lekarz). */
async function wczytajZListy(page, ctx, nazwa, wybor) {
  await page.locator('#patientsListBtnSidebar').click();
  await ctx.locator('.pt-rcard2', { hasText: nazwa }).first().click();
  await ctx.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await ctx.waitForSelector(`#vildaLoadChoiceModal, ${STRAZNIK}`, { state: 'visible', timeout: 10000 });
  if (await ctx.locator(STRAZNIK).isVisible()) await odpowiedzStraznikowi(ctx, `wczytanie ${nazwa} z listy`);
  await ctx.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 10000 });
  await ctx.click(wybor === 'restore' ? '#vildaLcmRestore' : '#vildaLcmNew');
  await ctx.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

/* Wczytanie w panelu innym niż Start: lista pacjentów powłoki otwiera się zawsze w Start, więc tu ścieżka
   source:"pick" z vilda_auth_ui.js (applyLoadedData + vilda:patient-loaded) i wybór wizyty w oknie „Co chcesz zrobić?”. */
async function wczytajWRamce(page, ctx, patientId, wybor) {
  await ctx.evaluate(async (pid) => {
    const p = await window.VildaVault.getPatient(pid);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: pid, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, patientId);
  await ctx.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 10000 });
  await ctx.click(wybor === 'restore' ? '#vildaLcmRestore' : '#vildaLcmNew');
  await ctx.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

/* Terminarz → wizyta Y → „Edytuj” → „↗ Siatki / punkt GH” (skok do DocPro). */
async function skokGHDoY(page, idY) {
  await page.locator('a.sidebar-link[href="terminarz.html"]').click();
  const t = await ramka(page, 'Terminarz', { formularz: false });
  await t.waitForSelector('.tz-row', { state: 'visible', timeout: 15000 });
  await t.locator('.tz-row', { hasText: 'Fikcyjna Druga' }).first().locator('button[data-act="edit"]').click();
  const skok = t.locator('.vilda-pne button', { hasText: 'Siatki / punkt GH' });
  await skok.waitFor({ state: 'visible', timeout: 10000 });
  await skok.click();
  const docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction((y) => window._vildaCurrentPatientId === y
    || Boolean(document.querySelector('.vug-backdrop')), idY, { timeout: 20000 });
  if (await docpro.locator(STRAZNIK).isVisible()) await odpowiedzStraznikowi(docpro, 'skok GH do DocPro');
  await docpro.waitForFunction((y) => window._vildaCurrentPatientId === y, idY, { timeout: 20000 });
  return docpro;
}

/* Migawki sesji karty próbkowane przez czas paczek lustra (180/1000/2600 ms) i zapisów z debounce. */
async function probkujMigawki(page, ms) {
  const wyniki = [];
  const koniec = Date.now() + ms;
  while (Date.now() < koniec) {
    wyniki.push(await page.evaluate(() => {
      try { return JSON.parse(window.sessionStorage.getItem('vildaMainSessionV1') || 'null'); } catch { return null; }
    }));
    await page.waitForTimeout(300);
  }
  return wyniki;
}

/* Stan panelu w pamięci i w polach: to, co „Zapisz” weźmie do rekordu. */
const stanPanelu = (ctx) => ctx.evaluate(() => {
  const v = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
  const ids = (a) => (Array.isArray(a) ? a.map((x) => x && x.id) : []);
  const adv = window.advancedGrowthData || {};
  const pomiary = Array.isArray(adv.measurements) ? adv.measurements
    : (adv.data && Array.isArray(adv.data.measurements) ? adv.data.measurements : []);
  return {
    nazwisko: v('lastName'),
    gh: ids(window.ghTherapyPoints),
    otylosc: ids(window.obesityTherapyPoints),
    rodzice: [v('advMotherHeight'), v('advFatherHeight')],
    wzrostyHistorii: pomiary.map((m) => Number(m && m.height)),
    porcje: [...document.querySelectorAll('.food-row input[type="number"]')].map((el) => Number(el.value)),
    id: window._vildaCurrentPatientId || null,
  };
});

/* Start: prawdziwe pisanie w polu. DocPro trzyma formularz podstawowy zwinięty (pole jest, ale niewidoczne) —
   tam wartość i zdarzenia input/change, jak w pozostałych testach DocPro. */
async function wpiszPomiar(ctx, masa, wzrost, wiek = null) {
  const pola = [['weight', masa], ['height', wzrost]];
  if (wiek != null) pola.unshift(['age', wiek]);
  for (const [id, val] of pola) {
    const pole = ctx.locator(`#${id}`);
    if (await pole.isVisible()) {
      await pole.fill(String(val));
      await pole.dispatchEvent('change');
    } else {
      await ctx.evaluate(([i, v]) => {
        const el = document.getElementById(i);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, [id, val]);
    }
  }
  await ctx.waitForTimeout(900);
}

const rekordy = (ctx, ids) => ctx.evaluate(async (I) => {
  const o = {};
  for (const [k, id] of Object.entries(I)) {
    const p = await window.VildaVault.getPatient(id);
    o[k] = { n: p.snapshotCount, najnowszy: p.snapshots[0].payload };
  }
  return o;
}, ids);

/* Wpis pól jak w tozsamosc-pacjenta-duplikaty.spec.mjs: formularz ustala się asynchronicznie, więc wpis jest
   powtarzany, dopóki kolektor (collectUserData) nie zobaczy oczekiwanego stanu. */
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

function bezZnacznikowX(stan) {
  return {
    gh: stan.gh.includes('gh-x1'),
    otylosc: stan.otylosc.includes('ob-x1'),
    rodzice: stan.rodzice[0] === '158' || stan.rodzice[1] === '171',
    pomiar112: stan.wzrostyHistorii.includes(112),
    pokarmy: stan.porcje.includes(7),
  };
}
const CZYSTO = { gh: false, otylosc: false, rodzice: false, pomiar112: false, pokarmy: false };

/* Mini-podsumowanie (wiek, masa, wzrost…) rysowane przez Start na pasku powłoki (≥ 1400 px, bramka PRO). */
const mini = (page) => page.evaluate(() => {
  const m = document.querySelector('#vildaShellDecor #miniSummary');
  return m ? m.textContent.replace(/\s+/g, ' ').trim() : '';
});

/* Znacznik dokumentu ramki: znika, gdy ramka zostanie przeładowana. */
const oznacz = (ctx, wartosc) => ctx.evaluate((v) => { window.__e2eDokument = v; }, wartosc);
const znacznik = (ctx) => ctx.evaluate(() => window.__e2eDokument || null);

test.describe('panel powłoki z innym pacjentem', () => {
  test.setTimeout(300_000);

  for (const [wariant, wybor] of [['nogh', 'new'], ['oby', 'restore']]) {
    test(`Start z X → skok GH do Y w DocPro → powrót → „Zapisz”: rekord Y bez danych X (Y ${wariant}, X „${wybor}”)`, async ({ page }) => {
      const natywne = [];
      page.on('dialog', (d) => { natywne.push(d.message()); d.dismiss().catch(() => {}); });
      const start = await powlokaZKontem(page);
      const ids = await zalozPacjentow(start, wariant);
      expect(await zalozWizyteY(start, ids.y), 'wizyta Y w Terminarzu').toBe(true);

      await wczytajZListy(page, start, 'Fikcyjny Pierwszy', wybor);
      await expect(start.locator('#lastName')).toHaveValue('Fikcyjny');
      const stanX = await stanPanelu(start);
      expect(stanX.porcje, 'warunek wstępny: pokarm X (7 porcji) na Start').toContain(7);
      const przed = await rekordy(start, ids);
      // Mini-podsumowanie powłoki (bramka PRO podmieniona jak w mini-podsumowanie-wyczysc.spec.mjs). Pomiar X jest
      // w formularzu tylko przy „Odtwórz zapis” — „Nowy pomiar” czyści masę i wzrost wizyty.
      await start.evaluate(() => {
        window.VildaProAccess.hasAccess = () => true;
        document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
      });
      if (wybor === 'restore') await expect.poll(() => mini(page), { timeout: 10000 }).toMatch(/Waga.*25,0.*Wzrost.*126,0/);
      await oznacz(start, 'start-x');

      await skokGHDoY(page, ids.y);
      const migawki = await probkujMigawki(page, 4500);
      const hybrydy = migawki.filter((m) => m && /Fikcyjna/.test(String(m.name || '')) && znacznikiX(m).length);
      expect(hybrydy.map(znacznikiX), 'migawka sesji karty nigdy nie łączy nazwiska Y z danymi X').toEqual([]);

      // (c) W tle Start jest bezczynny: nie przeładowuje się, nie przejmuje Y i nie przyjmuje lustra.
      expect(await znacznik(start), 'Start w tle nie jest przeładowywany').toBe('start-x');
      expect(await start.evaluate(() => [document.getElementById('lastName').value, window.VildaPanelPacjent.nieaktualny()]))
        .toEqual(['Fikcyjny', true]);
      // Pasek powłoki przy DocPro z Y nie pokazuje pomiarów X ze Startu.
      await expect.poll(() => mini(page), { message: 'mini-podsumowanie = Y', timeout: 10000 }).toMatch(/Waga.*36,0.*Wzrost.*141,0/);

      const historiaPrzed = await page.evaluate(() => window.history.length);
      await page.locator('a.sidebar-link[href="index.html"]').click();
      const s2 = await ramka(page, 'Start');
      await expect(s2.locator('#lastName'), 'Start pokazuje Y').toHaveValue('Fikcyjna', { timeout: 20000 });
      await page.waitForTimeout(2500);
      // (b) Przy pokazaniu: świeży dokument (przeładowanie), bez dodatkowego wpisu w historii.
      expect(await znacznik(s2), 'Start przeładowany przy pokazaniu').toBe(null);
      expect(await page.evaluate(() => window.history.length), 'przeładowanie nie dodaje wpisu w historii')
        .toBeLessThanOrEqual(historiaPrzed + 1);
      const stan = await stanPanelu(s2);
      expect(stan.id, 'tożsamość ramki Start = Y').toBe(ids.y);
      expect(bezZnacznikowX(stan), `Start po powrocie nie trzyma danych X: ${JSON.stringify(stan)}`).toEqual(CZYSTO);
      if (wariant === 'oby') expect(stan.otylosc, 'własny punkt otyłości Y zostaje').toContain('ob-y1');

      await wpiszPomiar(s2, 36.8, 142.1);
      await page.locator('#saveDataBtnSidebar').click();
      await expect.poll(async () => (await rekordy(s2, ids)).y.n, { timeout: 15000 }).toBe(przed.y.n + 1);
      const po = await rekordy(s2, ids);
      expect(znacznikiX(po.y.najnowszy), 'najnowszy zapis Y bez danych X').toEqual([]);
      expect(po.y.najnowszy.name).toBe('Fikcyjna Druga');
      if (wariant === 'oby') {
        expect((po.y.najnowszy.obesityTherapyPoints || []).map((x) => x.id), 'zapis Y zachowuje własny punkt otyłości').toContain('ob-y1');
      }
      expect(po.x.n, 'rekord X bez nowego zapisu').toBe(przed.x.n);
      expect(natywne, 'bez okien natywnych').toEqual([]);
    });
  }

  test('kierunek odwrotny: DocPro z X w tle, Start wczytuje Y → DocPro i zapis z DocPro bez danych X', async ({ page }) => {
    const start = await powlokaZKontem(page);
    const ids = await zalozPacjentow(start, 'nogh');

    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    const docpro = await ramka(page, 'DocPro');
    await page.waitForTimeout(2000);
    await wczytajWRamce(page, docpro, ids.x, 'new');
    await expect(docpro.locator('#lastName')).toHaveValue('Fikcyjny');
    await oznacz(docpro, 'docpro-x');

    await page.locator('a.sidebar-link[href="index.html"]').click();
    const s = await ramka(page, 'Start');
    await page.waitForTimeout(1500);
    await wczytajZListy(page, s, 'Fikcyjna Druga', 'new');
    await expect(s.locator('#lastName')).toHaveValue('Fikcyjna');
    const przed = await rekordy(s, ids);
    await page.waitForTimeout(3000);
    expect(await znacznik(docpro), 'DocPro w tle nie jest przeładowywany').toBe('docpro-x');
    expect(await docpro.evaluate(() => document.getElementById('lastName').value), 'DocPro w tle nie przejmuje Y').toBe('Fikcyjny');

    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    const d2 = await ramka(page, 'DocPro');
    await expect(d2.locator('#lastName'), 'DocPro pokazuje Y').toHaveValue('Fikcyjna', { timeout: 20000 });
    await page.waitForTimeout(2500);
    expect(await znacznik(d2), 'DocPro przeładowany przy pokazaniu').toBe(null);
    const stan = await stanPanelu(d2);
    expect(stan.id).toBe(ids.y);
    expect(bezZnacznikowX(stan), `DocPro po powrocie nie trzyma danych X: ${JSON.stringify(stan)}`).toEqual(CZYSTO);

    // „Nowy pomiar” pacjentki bez daty urodzenia: wiek, masa i wzrost wpisuje lekarz (tak samo na Start).
    await wpiszPomiar(d2, 36.9, 142.2, 11);
    await page.locator('#saveDataBtnSidebar').click();
    await expect.poll(async () => (await rekordy(d2, ids)).y.n, { timeout: 15000 }).toBe(przed.y.n + 1);
    const po = await rekordy(d2, ids);
    expect(znacznikiX(po.y.najnowszy), 'zapis Y z DocPro bez danych X').toEqual([]);
    expect(po.x.n).toBe(przed.x.n);
  });

  test('wzrost rodziców X nie wraca do pustych pól Y po wczytaniu Y w tym samym panelu', async ({ page }) => {
    const start = await powlokaZKontem(page);
    const ids = await zalozPacjentow(start, 'nogh');
    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    const docpro = await ramka(page, 'DocPro');
    await page.waitForTimeout(2000);
    await wczytajWRamce(page, docpro, ids.x, 'new');
    await expect(docpro.locator('#advMotherHeight')).toHaveValue('158');
    await wczytajWRamce(page, docpro, ids.y, 'new');
    await expect(docpro.locator('#lastName')).toHaveValue('Fikcyjna');
    await page.waitForTimeout(3000); // odświeżenie paneli w tle (ping vilda:sharedLoadSeq → vildaPersistRestoreAll)
    const rodzice = await docpro.evaluate(() => [
      document.getElementById('advMotherHeight').value, document.getElementById('advFatherHeight').value]);
    expect(rodzice, 'Y nie ma rodziców w rekordzie — pola zostają puste').toEqual(['', '']);
    expect(ids.y).toBeTruthy();
  });

  test('kontrola: ten sam pacjent w obu panelach — ciepła ramka DocPro nie jest przeładowywana', async ({ page }) => {
    const start = await powlokaZKontem(page);
    await zalozPacjentow(start, 'nogh');
    await wczytajZListy(page, start, 'Fikcyjny Pierwszy', 'new');
    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    const docpro = await ramka(page, 'DocPro');
    await expect(docpro.locator('#lastName')).toHaveValue('Fikcyjny', { timeout: 15000 });
    await docpro.evaluate(() => { window.__e2eTenSamDokument = 'tak'; });

    await page.locator('a.sidebar-link[href="index.html"]').click();
    const s = await ramka(page, 'Start');
    await wpiszPomiar(s, 25.4, 126.8);
    await page.locator('#saveDataBtnSidebar').click();
    await page.waitForTimeout(3500);

    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    const d2 = await ramka(page, 'DocPro');
    await page.waitForTimeout(2000);
    expect(await d2.evaluate(() => window.__e2eTenSamDokument || null), 'ten sam dokument DocPro').toBe('tak');
    await expect(d2.locator('#lastName')).toHaveValue('Fikcyjny');
  });
  test('nowe dziecko zapisane na Start: ciepły DocPro z tym samym dzieckiem nie jest przeładowywany (nadanie identyfikatora)', async ({ page }) => {
    const start = await powlokaZKontem(page);
    await wpiszIPotwierdz(start, { firstName: 'Nowy', lastName: 'Fikcyjny-Nowy', sex: 'M' },
      (s) => String(s.name || '').includes('Fikcyjny-Nowy'), 'nazwisko nowego dziecka');
    await wpiszIPotwierdz(start, { age: '7', ageMonths: '0', weight: '23', height: '121' },
      (s) => s.user.weight === 23 && s.user.age === 7, 'pomiar nowego dziecka');
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    const docpro = await ramka(page, 'DocPro');
    await expect(docpro.locator('#lastName')).toHaveValue('Fikcyjny-Nowy', { timeout: 15000 });
    await oznacz(docpro, 'docpro-nowy');

    await page.locator('a.sidebar-link[href="index.html"]').click();
    const s = await ramka(page, 'Start');
    await s.evaluate(async () => { await window.saveUserData(); });
    await expect.poll(() => s.evaluate(() => window.sessionStorage.getItem('vildaCurrentPatientId')), { timeout: 20000 }).not.toBeNull();
    const id = await s.evaluate(() => window.sessionStorage.getItem('vildaCurrentPatientId'));
    await page.waitForTimeout(1500);

    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    const d2 = await ramka(page, 'DocPro');
    await page.waitForTimeout(2000);
    expect(await znacznik(d2), 'ten sam dokument DocPro (bez przeładowania)').toBe('docpro-nowy');
    expect(await d2.evaluate(() => [window.VildaPanelPacjent.nieaktualny(), window.VildaPanelPacjent.wlasciciel()]))
      .toEqual([false, id]);
    await expect(d2.locator('#lastName')).toHaveValue('Fikcyjny-Nowy');
  });

  test('skok GH do nieaktualnego DocPro (DocPro z X, Start z Y): DocPro przeładowany przy pokazaniu, pokazuje Y bez danych X', async ({ page }) => {
    const start = await powlokaZKontem(page);
    const ids = await zalozPacjentow(start, 'nogh');
    expect(await zalozWizyteY(start, ids.y)).toBe(true);
    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    const docpro = await ramka(page, 'DocPro');
    await page.waitForTimeout(2000);
    await wczytajWRamce(page, docpro, ids.x, 'new');
    await oznacz(docpro, 'docpro-x');

    await page.locator('a.sidebar-link[href="index.html"]').click();
    const s = await ramka(page, 'Start');
    await page.waitForTimeout(1500);
    await wczytajZListy(page, s, 'Fikcyjna Druga', 'new');
    await expect(s.locator('#lastName')).toHaveValue('Fikcyjna');

    const d2 = await skokGHDoY(page, ids.y);
    await expect(d2.locator('#lastName'), 'DocPro pokazuje Y').toHaveValue('Fikcyjna', { timeout: 20000 });
    await page.waitForTimeout(2500);
    expect(await znacznik(d2), 'DocPro przeładowany przy pokazaniu').toBe(null);
    expect(bezZnacznikowX(await stanPanelu(d2)), 'DocPro po skoku bez danych X').toEqual(CZYSTO);
    expect(await d2.evaluate(() => window.sessionStorage.getItem('vilda:gh-jump')), 'zamiar skoku skonsumowany').toBe(null);
  });
});
