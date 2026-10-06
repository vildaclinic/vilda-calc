import { expect, test } from '../support/test-czas.mjs';

// P-GH-PUNKTY-TESTY (T2): punkty terapii GH na prawdziwym DocPro — edycja i usuwanie po id, sygnały zapisu
// (zdarzenie `vilda:therapy-points-changed`, pamięć modułu, kanał `gh-therapy-sync` z tabId karty, echo
// odbiornika app.js) oraz powiązanie wizyty kontrolnej z ostatnim punktem. Test charakteryzujący: opisuje
// DZISIEJSZE zachowanie monitora, zanim zapis punktów przejdzie do wspólnego API, także tam, gdzie zachowanie
// czeka na decyzję właściciela (w nazwie „stan obecny — do decyzji”). Punkty zmieniamy przyciskami monitora;
// listę startową zasiewamy w pamięci modułu, jak inne testy GH.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhPunkty!2026t';

// Trzy punkty w kształcie, jaki dziś zapisuje monitor (15 kluczy, doseAbs na końcu). Środkowy ma wiek kostny,
// IGF-1 i pole spoza schematu: edycja w miejscu ma je przenieść razem z kolejnością kluczy.
const P1 = {
  id: 'gh-e2e-p1', type: 'start', ageYears: 8, ageMonths: 0, weight: 25, height: 122, boneAge: 7.5,
  dose: 0.028, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: 180, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.7,
};
const P2 = {
  id: 'gh-e2e-p2', type: 'continue', ageYears: 8, ageMonths: 6, weight: 27, height: 125.5, boneAge: 8.25,
  dose: 0.8 / 27, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: 245.5, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8, notatkaE2e: 'pole spoza schematu',
};
const P3 = {
  id: 'gh-e2e-p3', type: 'continue', ageYears: 9, ageMonths: 0, weight: 29, height: 128.4, boneAge: null,
  dose: 0.9 / 29, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.9,
};
// Okno kontrolne PO spełnieniu warunku: echo przychodzi ok. 20 ms po zapisie; tu sprawdzamy już tylko,
// że nic więcej nie dochodzi.
const OKNO_KONTROLNE_MS = 400;

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

// Jak w gh-dawka-podawana: karta GH/IGF-1 z monitorem siedzi na DocPro w ukrytej sekcji modułów,
// więc do klikania jak lekarz przenosimy ją na wierzch strony.
async function otworzDocPro(page) {
  await zaloguj(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function'
    && Boolean(window.vildaGhIgfPersistApi) && Boolean(window.VildaGhDawka), null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro biegnie do ~1,5 s po starcie strony
  await page.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    const k = document.getElementById('ghIgfTherapyCard');
    const pudlo = document.createElement('div');
    pudlo.style.cssText = 'position:relative;z-index:99999;background:#fff;padding:8px';
    document.body.prepend(pudlo);
    pudlo.appendChild(k);
    k.style.display = 'block';
  });
}

// Dane pacjenta i wybór programu/preparatu — jak z formularza (zdarzenia input/change).
async function ustaw(page, masa) {
  await page.evaluate((m) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '9'); set('ageMonths', '0'); set('sex', 'M'); set('height', '130'); set('weight', String(m));
    if (typeof window.update === 'function') window.update();
    set('therProg', 'SNP'); set('therDrug', 'Omnitrope 10 mg');
    document.getElementById('name').value = 'Fikcyjny Test Punktow';
  }, masa);
}

// Trzy punkty wchodzą do pamięci modułu z pominięciem monitora, jak w innych testach GH; monitor je wczytuje.
async function trzyPunkty(page) {
  await page.evaluate((lista) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
    window.refreshGHTherapyMonitor();
    window.ghActivateTab('mon');
  }, [P1, P2, P3]);
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(3);
}

const punkty = (page) => page.evaluate(() => JSON.stringify(window.ghTherapyPoints));
const modul = (page) => page.evaluate(() => JSON.stringify(
  window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', [])));
const tabId = (page) => page.evaluate(() => window.VildaPersistence.getTabId());

// Nakładka potwierdzenia (z-index 10000) leży pod kartą przeniesioną na wierzch, więc jej przyciski
// klikamy przez DOM, jak w gh-docpro-karta-ukryta.
const kliknijWNakladce = (page, tekst) => page.evaluate((t) => {
  Array.from(document.querySelectorAll('#ghDeleteOverlay button')).find((b) => b.textContent === t).click();
}, tekst);

async function usun(page, id) {
  await page.click(`.delete-gh-pt-btn[data-id="${id}"]`);
  await expect(page.locator('#ghDeleteOverlay')).toContainText('Czy na pewno usunąć punkt?');
  await kliknijWNakladce(page, 'Usuń');
  await expect(page.locator('#ghDeleteOverlay')).toHaveCount(0);
}

// Drugi obiekt kanału w stronie odbiera to, co monitor wysyła innym ramkom (nadawca nie słyszy samego siebie).
async function sluchajKanalu(page) {
  await page.evaluate(() => {
    window.__kanal = [];
    new BroadcastChannel('gh-therapy-sync').addEventListener('message', (m) => { window.__kanal.push(m.data); });
  });
}
async function odebraneZKanalu(page) {
  return page.evaluate(() => window.__kanal.splice(0));
}

// Dziennik sygnałów w kolejności wystąpienia:
// E — zdarzenie `vilda:therapy-points-changed` (z adnotacją, czy window jest wtedy zgodne z pamięcią modułu);
// M — zapis listy do pamięci modułu (VildaPersistence jest zamrożony, więc słuchamy zapisu do storage);
// BC — komunikat wysłany na kanał `gh-therapy-sync`; R — odświeżenie monitora (wywołuje je odbiornik app.js);
// | — koniec synchronicznej części kliknięcia.
async function dziennikSygnalow(page) {
  await page.evaluate(() => {
    window.__sygnaly = [];
    const zgodne = () => JSON.stringify(window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []))
      === JSON.stringify(window.ghTherapyPoints);
    document.addEventListener('vilda:therapy-points-changed', (e) => {
      window.__sygnaly.push(`E:${e.detail && e.detail.source}:${zgodne() ? 'zgodne' : 'ROZNE'}`);
    });
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (klucz, wartosc) {
      if (/ghTherapyPoints/.test(String(klucz))) {
        window.__sygnaly.push(`M:${wartosc === JSON.stringify(window.ghTherapyPoints) ? 'lista' : 'INNA'}`);
      }
      return setItem.apply(this, arguments);
    };
    const postMessage = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function (m) {
      if (this.name === 'gh-therapy-sync') {
        const t = m && m.tabId === window.VildaPersistence.getTabId() ? 'tabId' : JSON.stringify(m && m.tabId);
        window.__sygnaly.push(`BC:${m && m.type}:${t}`);
      }
      return postMessage.apply(this, arguments);
    };
    const odswiez = window.refreshGHTherapyMonitor;
    window.refreshGHTherapyMonitor = function () {
      window.__sygnaly.push('R');
      return odswiez.apply(this, arguments);
    };
  });
}
// Klika przycisk synchronicznie i zamyka część synchroniczną znacznikiem „|”.
async function kliknijZeZnacznikiem(page, selektor) {
  await page.evaluate((s) => {
    document.querySelector(s).click();
    window.__sygnaly.push('|');
  }, selektor);
}
async function sygnalyPo(page, oczekiwane) {
  await expect.poll(() => page.evaluate(() => window.__sygnaly.slice())).toEqual(oczekiwane);
  await page.waitForTimeout(OKNO_KONTROLNE_MS);
  expect(await page.evaluate(() => window.__sygnaly.splice(0))).toEqual(oczekiwane);
}

test('A: edycja środkowego z 3 punktów zachowuje id, długość i kolejność listy, kolejność kluczy, wiek kostny, IGF-1 i pole spoza schematu; sąsiedzi bez zmian', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzDocPro(page);
  await ustaw(page, 32);
  await trzyPunkty(page);

  await page.click('.edit-gh-pt-btn[data-id="gh-e2e-p2"]');
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  await expect(page.locator('#ghEditAge')).toHaveValue('8');
  await expect(page.locator('#ghEditAgeMonths')).toHaveValue('6');
  await expect(page.locator('#ghEditBoneAge')).toHaveValue('8.25');
  await expect(page.locator('#ghEditIgf1')).toHaveValue('245.5');
  await expect(page.locator('#ghEditDose')).toHaveValue('0.8'); // dawka podawana mg/dobę (doseAbs)

  // Lekarz poprawia masę, wzrost i dawkę podawaną; zapis tym samym przyciskiem typu co punkt.
  await page.fill('#ghEditWeight', '27.6');
  await page.fill('#ghEditHeight', '126');
  await page.fill('#ghEditDose', '0.9');
  await page.click('#btnGhContinue');
  await expect(page.locator('#ghTherapyEditContainer')).toBeHidden();

  // Ten sam obiekt na tej samej pozycji: zmienione tylko pola z formularza, reszta i kolejność kluczy zostają.
  const p2PoEdycji = { ...P2, weight: 27.6, height: 126, dose: 0.9 / 27.6, doseAbs: 0.9 };
  const oczekiwane = JSON.stringify([P1, p2PoEdycji, P3]);
  expect(await punkty(page)).toBe(oczekiwane);
  expect(await modul(page)).toBe(oczekiwane);
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('#ghTherapyTbody .edit-gh-pt-btn'))
    .map((b) => b.getAttribute('data-id')))).toEqual(['gh-e2e-p1', 'gh-e2e-p2', 'gh-e2e-p3']);
});

test('B: usunięcie 1 z 3 przyciskiem z potwierdzeniem zostawia pozostałe punkty bez zmian; pamięć modułu równa window', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzDocPro(page);
  await ustaw(page, 32);
  await trzyPunkty(page);

  // Anulowanie w nakładce niczego nie zmienia.
  await page.click('.delete-gh-pt-btn[data-id="gh-e2e-p2"]');
  await kliknijWNakladce(page, 'Anuluj');
  await expect(page.locator('#ghDeleteOverlay')).toHaveCount(0);
  expect(await punkty(page)).toBe(JSON.stringify([P1, P2, P3]));

  await usun(page, 'gh-e2e-p2');
  const oczekiwane = JSON.stringify([P1, P3]);
  await expect.poll(() => punkty(page)).toBe(oczekiwane);
  expect(await modul(page)).toBe(oczekiwane);
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(2);
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('#ghTherapyTbody .delete-gh-pt-btn'))
    .map((b) => b.getAttribute('data-id')))).toEqual(['gh-e2e-p1', 'gh-e2e-p3']);
});

test('C: dodanie, edycja i usunięcie wysyłają na kanale gh-therapy-sync po jednym komunikacie {type:"update", tabId} z tabId tej karty', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzDocPro(page);
  await ustaw(page, 32);
  await page.evaluate(() => window.ghActivateTab('mon'));
  const tab = await tabId(page);
  expect(typeof tab).toBe('string');
  expect(tab).not.toBe('');
  await sluchajKanalu(page);

  await page.click('#btnGhStart');
  await expect.poll(() => page.evaluate(() => window.__kanal.length)).toBe(1);
  expect(await odebraneZKanalu(page)).toEqual([{ type: 'update', tabId: tab }]);
  const [punkt] = JSON.parse(await punkty(page));

  await page.click(`.edit-gh-pt-btn[data-id="${punkt.id}"]`);
  await page.fill('#ghEditWeight', '32.4');
  await page.click('#btnGhStart');
  await expect.poll(() => page.evaluate(() => window.__kanal.length)).toBe(1);
  expect(await odebraneZKanalu(page)).toEqual([{ type: 'update', tabId: tab }]);

  await usun(page, punkt.id);
  await expect.poll(() => page.evaluate(() => window.__kanal.length)).toBe(1);
  expect(await odebraneZKanalu(page)).toEqual([{ type: 'update', tabId: tab }]);
  expect(await punkty(page)).toBe('[]');
});

test('D: sygnały zapisu — dodanie i edycja [E (odczyt na wejściu), M, E, BC update z tabId | echo app.js: R, E], usunięcie [M, E, BC | R, E]; 3 zdarzenia na zapis — stan obecny — do decyzji (pytanie 8)', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzDocPro(page);
  await ustaw(page, 32);
  await page.evaluate(() => window.ghActivateTab('mon'));
  await dziennikSygnalow(page);
  // Pamięć modułu jest zapisana PRZED zdarzeniem i przed komunikatem kanału, a przy każdym zdarzeniu
  // window jest zgodne z modułem. Pierwsze E to odczyt modułu na wejściu przycisku (jeszcze przed walidacją),
  // trzecie — echo: odbiornik app.js w tym samym dokumencie dostaje komunikat monitora i odświeża monitor.
  const zapis = ['E:gh:zgodne', 'M:lista', 'E:gh:zgodne', 'BC:update:tabId', '|', 'R', 'E:gh:zgodne'];

  await kliknijZeZnacznikiem(page, '#btnGhStart');
  await sygnalyPo(page, zapis);
  const [punkt] = JSON.parse(await punkty(page));

  // Otwarcie edycji nie wysyła sygnałów; zapis edycji — ten sam ciąg co dodanie.
  await page.click(`.edit-gh-pt-btn[data-id="${punkt.id}"]`);
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  expect(await page.evaluate(() => window.__sygnaly.slice())).toEqual([]);
  await page.fill('#ghEditWeight', '32.4');
  await kliknijZeZnacznikiem(page, '#btnGhStart');
  await sygnalyPo(page, zapis);

  // Nakładka potwierdzenia nie wysyła sygnałów; usunięcie nie czyta modułu na wejściu (bez pierwszego E).
  await page.click(`.delete-gh-pt-btn[data-id="${punkt.id}"]`);
  await expect(page.locator('#ghDeleteOverlay')).toBeVisible();
  expect(await page.evaluate(() => window.__sygnaly.slice())).toEqual([]);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#ghDeleteOverlay button')).find((b) => b.textContent === 'Usuń').click();
    window.__sygnaly.push('|');
  });
  await sygnalyPo(page, ['M:lista', 'E:gh:zgodne', 'BC:update:tabId', '|', 'R', 'E:gh:zgodne']);
  expect(await punkty(page)).toBe('[]');
});

test('E: odbiornik app.js — komunikat z tabId tej karty odświeża monitor z pamięci modułu (typ bez znaczenia); z obcym, pustym albo bez tabId jest ignorowany', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzDocPro(page);
  await ustaw(page, 32);
  await page.evaluate(() => window.ghActivateTab('mon'));
  // Zmiana pamięci modułu z pominięciem monitora: w tym samym dokumencie nie ma zdarzenia storage,
  // więc monitor jej nie widzi, dopóki nie dostanie sygnału.
  await page.evaluate((p) => window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [p], { force: true }), P3);
  expect(await punkty(page)).toBe('[]');
  await dziennikSygnalow(page);

  // Komunikaty z jednego nadawcy dochodzą do odbiornika w kolejności wysłania, więc gdy przyjdzie
  // odświeżenie po ostatnim (z własnym tabId), cztery wcześniejsze są już obsłużone.
  const tab = await tabId(page);
  await page.evaluate((t) => {
    const nadawca = new BroadcastChannel('gh-therapy-sync');
    nadawca.postMessage({ type: 'update', tabId: 'karta-obca-e2e' });
    nadawca.postMessage({ type: 'update' });
    nadawca.postMessage({ type: 'update', tabId: '' });
    nadawca.postMessage({ type: 'clear' });
    nadawca.postMessage({ type: 'clear', tabId: t });
  }, tab);
  // BC — wysłane przez test; jedno odświeżenie i jedno zdarzenie, mimo typu „clear” lista z modułu zostaje.
  await sygnalyPo(page, [
    'BC:update:"karta-obca-e2e"', 'BC:update:undefined', 'BC:update:""', 'BC:clear:undefined', 'BC:clear:tabId',
    'R', 'E:gh:zgodne',
  ]);
  expect(await punkty(page)).toBe(JSON.stringify([P3]));
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn[data-id="gh-e2e-p3"]')).toHaveCount(1);
});

// ---- Wizyta kontrolna z karty GH/IGF-1 → Terminarz: powiązanie z punktem przez ghPointId ----

async function przechwycWpisy(page) {
  // Zapis do Terminarza przechwytujemy w stronie: sprawdzamy treść wpisu, nie zapisujemy go w sejfie.
  await page.evaluate(() => {
    window._vildaCurrentPatientId = 'pacjent-e2e-punkty';
    window.__wpisy = [];
    window.VildaVault.savePatientNote = (p) => { window.__wpisy.push(p); return Promise.resolve(); };
  });
}
async function wizytaKontrolna(page) {
  const przed = await page.evaluate(() => window.__wpisy.length);
  await page.evaluate(() => window.ghActivateTab('rec'));
  await page.click('#tzAdd90');
  await expect(page.locator('#tzGhVisitOverlay')).toBeVisible();
  await page.click('#tzGhConfirm');
  await page.waitForFunction((n) => window.__wpisy.length > n, przed);
  await expect(page.locator('#tzGhVisitOverlay')).toHaveCount(0);
  return page.evaluate(() => window.__wpisy.at(-1));
}

test('F: wizyta kontrolna przy zgodnym ostatnim punkcie niesie jego ghPointId i wiek; po zmianie dawki w karcie — bez ghPointId', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzDocPro(page);
  await ustaw(page, 38);
  await przechwycWpisy(page);
  await page.evaluate(() => window.ghActivateTab('mon'));
  await page.click('#btnGhStart');
  const [punkt] = JSON.parse(await punkty(page));

  // Ostatni punkt zgodny z kartą (preparat, program, dawka mg/kg do 3 miejsc): wizyta wiąże się z nim.
  let wpis = await wizytaKontrolna(page);
  expect(wpis.ghPointId).toBe(String(punkt.id));
  expect(wpis.linkedAgeMonths).toBe(108);
  expect(wpis.medication).toEqual({ action: 'start', doseNum: punkt.dose, doseUnit: 'mg/kg/d', freq: 'dzień' });

  // Inna dawka w karcie: punkt nie jest już zgodny, wpis powstaje z danych karty, bez powiązania.
  const dawkaKarty = await page.evaluate(() => window.ghTherapyCalc.perDayMg);
  await page.fill('#therDailyDoseAbs', String(dawkaKarty + 0.3));
  await page.press('#therDailyDoseAbs', 'Tab');
  await expect.poll(() => page.evaluate(() => window.ghTherapyCalc.perDayMg)).not.toBe(dawkaKarty);
  wpis = await wizytaKontrolna(page);
  expect('ghPointId' in wpis).toBe(false);
  expect(wpis.linkedAgeMonths).toBe(108);
  expect(wpis.medication.action).toBe('change');
});

test('G: wizyta kontrolna wiąże się z OSTATNIM ELEMENTEM listy, nie z ostatnim punktem po wieku — stan obecny — do decyzji (pytanie 21)', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzDocPro(page);
  await ustaw(page, 38);
  await przechwycWpisy(page);
  await page.evaluate(() => window.ghActivateTab('mon'));
  await page.click('#btnGhStart'); // 9 l. 0 mies., dawka z karty
  const dawkaKarty = await page.evaluate(() => window.ghTherapyCalc.perDayMg);

  // Punkt wsteczny z wcześniejszego wieku (8 l. 6 mies.) z tą samą dawką: trafia na koniec listy.
  await page.click('#btnGhRetro');
  await page.selectOption('#ghRetroDrug', 'Omnitrope 10 mg');
  await page.fill('#ghRetroAge', '8');
  await page.fill('#ghRetroAgeMonths', '6');
  await page.fill('#ghRetroHeight', '126');
  await page.fill('#ghRetroWeight', '38');
  await page.fill('#ghRetroDose', String(dawkaKarty));
  await page.click('#btnGhRetroAdd');
  const lista = JSON.parse(await punkty(page));
  expect(lista.map((p) => [p.type, p.ageYears, p.ageMonths])).toEqual([['start', 9, 0], ['continue', 8, 6]]);
  expect(lista[1].dose).toBe(lista[0].dose); // oba punkty zgodne z kartą

  const wpis = await wizytaKontrolna(page);
  expect(wpis.ghPointId).toBe(String(lista[1].id));
  expect(wpis.linkedAgeMonths).toBe(102);
  expect(wpis.medication.action).toBe('change');
});
