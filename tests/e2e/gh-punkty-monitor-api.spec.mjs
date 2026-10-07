import fs from 'node:fs';
import { expect, test } from '../support/test-czas.mjs';

// P-GH-PUNKTY-API rata 2 i rata 3 (D5): monitor punktów terapii GH na prawdziwym DocPro bierze reguły punktu
// z VildaGhPunkty (vilda_gh_punkty.js); od raty 3 stary kod reguł jest usunięty, a bez tego pliku monitor nie zapisuje
// i prosi o odświeżenie strony. Ten sam ciąg czynności lekarza — punkt wsteczny, edycja punktu, nowy punkt z karty,
// odmowa drugiego Włączenia, usunięcie — w dwóch kontekstach przeglądarki: dzisiejszy monitor z modułem (licznik
// wywołań API pokazuje delegację) i monitor sprzed API (gh_therapy_monitor.js 52 z tests/fixtures, podstawiony przez
// route). Lista w oknie i w pamięci modułu, komunikat odmowy i wiersze tabeli muszą wyjść takie same. Trzeci kontekst:
// zablokowany vilda_gh_punkty.js — każda czynność kończy się odmową, a lista i tabela zostają bez zmian.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const MONITOR_PRZED_API = fs.readFileSync(new URL('../fixtures/gh-monitor-przed-api.js.txt', import.meta.url), 'utf8');
const ODSWIEZ = 'Nie zapisano: aplikacja nie wczytała się w całości. Odśwież stronę i spróbuj ponownie.';

const HASLO = 'E2e#GhPunktyMonitorApi!26';
const P1 = {
  id: 'gh-e2e-a1', type: 'start', ageYears: 8, ageMonths: 0, weight: 25, height: 122, boneAge: null,
  dose: 0.028, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.7,
};
const P2 = {
  id: 'gh-e2e-a2', type: 'continue', ageYears: 8, ageMonths: 6, weight: 27, height: 125.5, boneAge: null,
  dose: 0.8 / 27, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
};
const DRUGIE_WLACZENIE = 'Punkt „Włączenie leczenia” został już dodany.';

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

// wariant: 'teraz' (docpro.html bez zmian), 'przedApi' (monitor sprzed API zamiast gh_therapy_monitor.js),
// 'bezModulu' (vilda_gh_punkty.js nie dochodzi), 'bezModuluDawki' (vilda_gh_dawka.js nie dochodzi; D6).
async function otworzDocPro(page, wariant) {
  // Serwer synchronizacji odcięty: wynik nie zależy od sieci środowiska testu.
  await page.route(/^https:\/\/vilda-sync\./, (route) => route.abort());
  if (wariant === 'bezModulu') await page.route(/\/vilda_gh_punkty\.js(\?|$)/, (route) => route.abort());
  if (wariant === 'bezModuluDawki') await page.route(/\/vilda_gh_dawka\.js(\?|$)/, (route) => route.abort());
  if (wariant === 'przedApi') {
    await page.route(/\/gh_therapy_monitor\.js(\?|$)/, (route) => route.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8', body: MONITOR_PRZED_API,
    }));
  }
  await zaloguj(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function'
    && Boolean(window.vildaGhIgfPersistApi) && Boolean(window.vildaGhTherapyMonitorPersistApi), null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro biegnie do ~1,5 s po starcie strony
  expect(await page.evaluate(() => Boolean(window.VildaGhPunkty))).toBe(wariant !== 'bezModulu');
  expect(await page.evaluate(() => Boolean(window.VildaGhDawka))).toBe(wariant !== 'bezModuluDawki');
  await page.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    const k = document.getElementById('ghIgfTherapyCard');
    const pudlo = document.createElement('div');
    pudlo.style.cssText = 'position:relative;z-index:99999;background:#fff;padding:8px';
    document.body.prepend(pudlo);
    pudlo.appendChild(k);
    k.style.display = 'block';
    window.ghActivateTab('mon');
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '9'); set('ageMonths', '0'); set('sex', 'M'); set('height', '130'); set('weight', '29');
    if (typeof window.update === 'function') window.update();
    set('therProg', 'SNP'); set('therDrug', 'Omnitrope 10 mg');
    document.getElementById('name').value = 'Fikcyjny Test Api';
  });
  await page.evaluate((lista) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
    window.refreshGHTherapyMonitor();
  }, [P1, P2]);
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(2);
  if (wariant !== 'bezModulu') {
    // Licznik wywołań: dzisiejszy monitor czyta window.VildaGhPunkty przy każdym zapisie, monitor sprzed API wcale.
    await page.evaluate(() => {
      const api = window.VildaGhPunkty;
      const licznik = { wersja: api.wersja };
      window.__wywolaniaApi = [];
      for (const [k, f] of Object.entries(api)) {
        if (typeof f === 'function') licznik[k] = (...a) => { window.__wywolaniaApi.push(k); return f(...a); };
      }
      window.VildaGhPunkty = licznik;
    });
  }
}

const wywolania = (page) => page.evaluate(() => (window.__wywolaniaApi || []).splice(0));
// Lista bez id nowych punktów (id nadaje zegar przy zapisie): reszta rekordu, z kolejnością kluczy, ma być identyczna.
const stan = (page) => page.evaluate((znane) => {
  const bezNowychId = (lista) => JSON.stringify((lista || []).map((p) => (znane.includes(p.id) ? p : { ...p, id: '#nowe' })));
  return {
    okno: bezNowychId(window.ghTherapyPoints),
    modul: bezNowychId(window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', [])),
    komunikat: (document.querySelector('#ghInfoOverlay p') || {}).textContent || null,
    wiersze: Array.from(document.querySelectorAll('#ghTherapyTbody .edit-gh-pt-btn')).length,
  };
}, [P1.id, P2.id]);
const zamknijKomunikat = (page) => page.evaluate(() => {
  const o = document.getElementById('ghInfoOverlay');
  const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'OK');
  if (b) b.click();
});

async function czynnosciLekarza(page) {
  const kroki = [];
  // 1. Punkt wsteczny „Kontynuacja”.
  await page.click('#btnGhRetro');
  await page.selectOption('#ghRetroType', 'continue');
  await page.selectOption('#ghRetroProg', 'SNP');
  await page.selectOption('#ghRetroDrug', 'Omnitrope 10 mg');
  await page.fill('#ghRetroAge', '8');
  await page.fill('#ghRetroAgeMonths', '3');
  await page.fill('#ghRetroWeight', '26');
  await page.fill('#ghRetroHeight', '124');
  await page.fill('#ghRetroDose', '0.75');
  await page.click('#btnGhRetroAdd');
  kroki.push({ stan: await stan(page), api: await wywolania(page) });
  // 2. Edycja Kontynuacji P2 (masa i wzrost).
  await page.click(`.edit-gh-pt-btn[data-id="${P2.id}"]`);
  await page.evaluate(() => {
    const o = document.getElementById('ghEditOverlay');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Rozumiem');
    if (b) b.click();
  });
  await page.fill('#ghEditWeight', '27.6');
  await page.fill('#ghEditHeight', '126');
  await page.click('#btnGhContinue');
  await expect(page.locator('#ghTherapyEditContainer')).toBeHidden();
  kroki.push({ stan: await stan(page), api: await wywolania(page) });
  // 3. Nowy punkt z karty (bieżąca wizyta).
  await page.click('#btnGhContinue');
  kroki.push({ stan: await stan(page), api: await wywolania(page) });
  // 4. Drugie Włączenie z karty: odmowa z komunikatem.
  await page.click('#btnGhStart');
  await expect(page.locator('#ghInfoOverlay')).toContainText(DRUGIE_WLACZENIE);
  kroki.push({ stan: await stan(page), api: await wywolania(page) });
  await zamknijKomunikat(page);
  // 5. Usunięcie P1 z potwierdzeniem.
  await page.click(`.delete-gh-pt-btn[data-id="${P1.id}"]`);
  await page.evaluate(() => {
    const o = document.getElementById('ghDeleteOverlay');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Usuń');
    if (b) b.click();
  });
  await expect(page.locator(`.delete-gh-pt-btn[data-id="${P1.id}"]`)).toHaveCount(0);
  kroki.push({ stan: await stan(page), api: await wywolania(page) });
  return kroki;
}

test('ten sam ciąg czynności lekarza daje ten sam wynik na dzisiejszym monitorze z modułem VildaGhPunkty i na monitorze sprzed API; dzisiejszy deleguje', async ({ browser }) => {
  test.setTimeout(240_000);
  const wyniki = {};
  for (const wariant of ['teraz', 'przedApi']) {
    const kontekst = await browser.newContext();
    const page = await kontekst.newPage();
    const bledy = [];
    page.on('pageerror', (e) => bledy.push(String(e && e.message)));
    await otworzDocPro(page, wariant);
    // Podstawienie zadziałało: tylko dzisiejszy monitor zna odmowę bez modułu.
    const tekstMonitora = await page.evaluate(async () => {
      const s = Array.from(document.scripts).find((x) => /gh_therapy_monitor\.js/.test(x.src));
      return (await fetch(s.src)).text();
    });
    expect(tekstMonitora.includes('Gpn()'), wariant).toBe(wariant === 'teraz');
    wyniki[wariant] = await czynnosciLekarza(page);
    expect(bledy, `pageerror (${wariant})`).toEqual([]);
    await kontekst.close();
  }

  const z = wyniki.teraz;
  const b = wyniki.przedApi;
  expect(z.map((k) => k.stan)).toEqual(b.map((k) => k.stan));
  // Sens kroków: wsteczny dopisał punkt, edycja nie zmieniła długości, karta dopisała, odmowa bez zmian, usunięcie.
  expect(z.map((k) => JSON.parse(k.stan.modul).length)).toEqual([3, 3, 4, 4, 3]);
  expect(z[3].stan.komunikat).toBe(DRUGIE_WLACZENIE);
  expect(JSON.parse(z[1].stan.modul)[1]).toMatchObject({ id: P2.id, weight: 27.6, height: 126 });

  // Każda ścieżka zaczyna od bramki uszkodzonych wpisów (P-GH-PUNKTY-USZKODZONE).
  expect(z.map((k) => k.api)).toEqual([
    ['uszkodzone', 'sprawdzRodzaj', 'polaZPodawanej', 'punkt', 'zapisz'],
    ['uszkodzone', 'sprawdzRodzaj', 'polaZPodawanej', 'zmienWMiejscu', 'zapisz'],
    ['uszkodzone', 'sprawdzRodzaj', 'jednostkaDawki', 'dniIgf', 'normalizujWiek', 'sprawdzWartosci', 'zapisz'],
    ['uszkodzone', 'sprawdzRodzaj'],
    ['uszkodzone', 'zapisz'],
  ]);
  expect(b.flatMap((k) => k.api)).toEqual([]);
});

for (const [plik, wariant] of [['vilda_gh_punkty.js', 'bezModulu'], ['vilda_gh_dawka.js (D6)', 'bezModuluDawki']]) test(`bez ${plik} monitor odmawia każdego zapisu i usunięcia z prośbą o odświeżenie strony; lista bez zmian`, async ({ page }) => {
  test.setTimeout(180_000);
  const bledy = [];
  page.on('pageerror', (e) => bledy.push(String(e && e.message)));
  await otworzDocPro(page, wariant);
  const poczatek = await stan(page);
  expect(JSON.parse(poczatek.modul).map((p) => p.id)).toEqual([P1.id, P2.id]);
  const odmowa = async (opis) => {
    await expect(page.locator('#ghInfoOverlay'), opis).toContainText(ODSWIEZ);
    const s = await stan(page);
    expect({ ...s, komunikat: null }, opis).toEqual({ ...poczatek, komunikat: null });
    await zamknijKomunikat(page);
  };

  // 1. Nowy punkt z karty (Kontynuacja i drugie Włączenie: bez modułu monitor nie ocenia danych).
  await page.click('#btnGhContinue');
  await odmowa('karta: Kontynuacja');
  await page.click('#btnGhStart');
  await odmowa('karta: Włączenie');
  // 2. Punkt wsteczny: odmowa, formularz zostaje otwarty z danymi.
  await page.click('#btnGhRetro');
  await page.selectOption('#ghRetroType', 'continue');
  await page.selectOption('#ghRetroProg', 'SNP');
  await page.selectOption('#ghRetroDrug', 'Omnitrope 10 mg');
  await page.fill('#ghRetroAge', '8');
  await page.fill('#ghRetroAgeMonths', '3');
  await page.fill('#ghRetroWeight', '26');
  await page.fill('#ghRetroHeight', '124');
  await page.fill('#ghRetroDose', '0.75');
  await page.click('#btnGhRetroAdd');
  await odmowa('punkt wsteczny');
  await expect(page.locator('#ghTherapyRetroContainer')).toBeVisible();
  await expect(page.locator('#ghRetroDose')).toHaveValue('0.75');
  await page.click('#btnGhRetroCancel');
  // 3. Usunięcie z potwierdzeniem: punkt zostaje.
  await page.click(`.delete-gh-pt-btn[data-id="${P1.id}"]`);
  await page.evaluate(() => {
    const o = document.getElementById('ghDeleteOverlay');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Usuń');
    if (b) b.click();
  });
  await odmowa('usunięcie');
  await expect(page.locator(`.delete-gh-pt-btn[data-id="${P1.id}"]`)).toHaveCount(1);
  // 4. Edycja: odmowa, formularz edycji zostaje otwarty z danymi.
  await page.click(`.edit-gh-pt-btn[data-id="${P2.id}"]`);
  await page.evaluate(() => {
    const o = document.getElementById('ghEditOverlay');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Rozumiem');
    if (b) b.click();
  });
  await page.fill('#ghEditWeight', '27.6');
  await page.click('#btnGhContinue');
  await odmowa('edycja');
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  await expect(page.locator('#ghEditWeight')).toHaveValue('27.6');

  expect(bledy).toEqual([]);
});
