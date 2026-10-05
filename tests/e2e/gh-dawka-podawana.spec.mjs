import { expect, test } from '../support/test-czas.mjs';

// P-GH-DAWKA-PODAWANA (2026-10-05). Decyzje właściciela: główną dawką w karcie „Leczenie hormonem wzrostu /
// IGF-1” i w monitorze jest dawka PODAWANA — mg/dobę (Omnitrope, Genotropin), mg/tydzień (Ngenla); pole mg/kg
// to przelicznik. Zaokrąglenie do najbliższego kroku wstrzykiwacza zostaje automatyczne. Karta pilnuje limitu
// jednego wstrzyknięcia (Genotropin GoQuick, Ngenla), podpowiada większy wstrzykiwacz, a dawkę Ngenla ponad
// limit dzieli na równe części w krokach. Ngenla bez przeliczeń na dobę i IU.
//
// ZMIERZONE przed zmianą (`audyt` 53d6a9e), te same kroki:
// - Omnitrope 10 mg, 35 kg, wpis 0,033 mg/kg/d → 1,2 mg/d; po zmianie masy na 38 kg karta liczyła od nowa
//   z mg/kg: 1,3 mg/d (dawka podawana zmieniała się sama).
// - Odtworzenie zapisanego stanu (1,1 mg/d przy 35 kg) przy masie 40 kg: 1,2 mg/d zamiast 1,1.
// - Ngenla 24 mg, 40 kg: „Pacjent: 26,4 mg/tydz 0,094 mg/kg/d = 0,66 mg/kg/tydz (1,98 IU/kg/tydz) 3,771 mg/d”,
//   notka „(≈ 0,094 mg/kg/d). (0,014–0,047 mg/kg/d)”; bez słowa o limicie 12 mg na wstrzyknięcie i o tym,
//   że dawka jest większa niż cały wstrzykiwacz.
// - Punkt Ngenla 60 mg dodany przy 43 kg: doseAbs × 7 = 28,38 mg/tydz (0,66 × 43), choć karta pokazywała
//   28,5 mg/tydz po zaokrągleniu do kroku 0,5 mg; tabela „28,380 mg/tydz = 0,660 mg/kg/tydz”. Edycja punktu
//   brała „Dawka (mg/kg/tydz)” 0,66, a zmiana masy w edycji na 45 kg zmieniała dawkę podawaną na 29,7 mg/tydz.
// - Wizyta kontrolna z karty, Ngenla 60 mg, 40 kg: okno „0,662 mg/kg/tydz · 3,79 mg/d”, a wpis do Terminarza
//   „Dawka: 0,662 mg/kg/d (3,79 mg/d).” — wartość mg/kg/tydz z etykietą mg/kg/d.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhDawka!2026a';

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

// Karta na Start: montujemy ją jawnie i pokazujemy, żeby wpisywać dawkę jak lekarz (zdarzenia zaufane).
async function otworzKarte(page) {
  await zaloguj(page);
  await page.mouse.click(5, 5); // pierwsza interakcja ładuje leniwie moduł karty GH/IGF-1
  await page.waitForFunction(() => Boolean(window.vildaGhIgfPersistApi), null, { timeout: 15000 });
  await page.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    document.getElementById('ghIgfTherapyCard').style.display = 'block';
  });
  await page.waitForSelector('#therDailyDoseAbs', { state: 'attached', timeout: 15000 });
}

// Dane pacjenta i wybór programu/preparatu — jak z formularza (zdarzenia input/change).
function ustaw(page, { masa, program, lek }) {
  return page.evaluate((p) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '9'); set('ageMonths', '0'); set('sex', 'M'); set('height', '130'); set('weight', String(p.masa));
    if (typeof window.update === 'function') window.update();
    if (p.program) set('therProg', p.program);
    if (p.lek) set('therDrug', p.lek);
  }, { masa, program, lek });
}

function zmienMase(page, masa) {
  return page.evaluate((m) => {
    const e = document.getElementById('weight');
    e.value = String(m);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, masa);
}

// Lekarz wpisuje wartość i wychodzi z pola (Tab) — tak jak w karcie.
async function wpisz(page, sel, wartosc) {
  await page.fill(sel, wartosc);
  await page.press(sel, 'Tab');
}

const stan = (page) => page.evaluate(() => {
  const t = (id) => {
    const e = document.getElementById(id);
    return e ? e.textContent.replace(/\s+/g, ' ').trim() : null;
  };
  const widac = (id) => {
    const e = document.getElementById(id);
    return Boolean(e && !e.hidden && e.style.display !== 'none' && e.textContent.trim());
  };
  const c = window.ghTherapyCalc || {};
  return {
    lek: document.getElementById('therDrug').value,
    podawana: document.getElementById('therDailyDoseAbs').value,
    naKg: document.getElementById('therDailyDose').value,
    etykieta: t('therDoseAbsLabelText'),
    etykietaKg: t('therDoseLabelText'),
    krok: t('therDoseStepNote'),
    zaokraglenie: widac('therDoseRoundNote') ? t('therDoseRoundNote') : '',
    // Komunikat wstrzykiwacza: tytuł | treść (przyciski osobno).
    wstrzykiwacz: widac('therPenNote')
      ? ['strong', 'span'].map((sel) => document.querySelector(`#therPenNote [role="status"] > ${sel}`))
        .map((x) => (x ? x.textContent.replace(/\s+/g, ' ').trim() : '')).join(' | ')
      : '',
    przyciski: Array.from(document.querySelectorAll('#therPenNote button')).map((b) => b.textContent.trim()),
    ostrzezenie: widac('therWarning') ? t('therWarning') : '',
    notka: t('therDoseNote'),
    pacjent: t('therSummary'),
    mgNaDobe: c.perDayMg,
    mgNaTydzien: c.perWeekMg,
  };
});

const blisko = (x, y) => Math.abs(x - y) < 1e-9;

test('A: Omnitrope 10 mg, 35 kg — wpis 0,033 mg/kg/d daje 1,2 mg/d; zmiana masy nie zmienia dawki podawanej', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);
  await ustaw(page, { masa: 35, program: 'SNP', lek: 'Omnitrope 10 mg' });
  let s = await stan(page);
  // Domyślna dawka programu 0,025 mg/kg/d × 35 kg = 0,875 → krok 0,1 mg.
  expect(s.etykieta).toBe('Dawka podawana (mg/dobę)');
  expect(s.etykietaKg).toBe('Dawka na kg (mg/kg/dobę)');
  expect(s.podawana).toBe('0.9');
  expect(s.krok).toBe('Krok 0,1 mg (Omnitrope 10 mg)');

  await wpisz(page, '#therDailyDose', '0.033');
  s = await stan(page);
  expect(s.podawana).toBe('1.2');
  expect(blisko(s.mgNaDobe, 1.2)).toBe(true);
  expect(s.zaokraglenie).toBe('Wpisano 0,033 mg/kg/d × 35 kg = 1,155 mg/d. Zaokrąglono do najbliższego kroku 0,1 mg: '
    + '1,2 mg/d (0,034 mg/kg/d).');

  await zmienMase(page, 38);
  s = await stan(page);
  expect(blisko(s.mgNaDobe, 1.2)).toBe(true);
  expect(s.podawana).toBe('1.2');
  expect(s.naKg).toBe('0.032');
  expect(s.zaokraglenie).toBe('');
  expect(s.pacjent).toContain('Pacjent: 1,2 mg/d');

  // Wpis wprost w mg/dobę spoza kroku: zaokrąglenie do najbliższego kroku z wyjaśnieniem.
  await wpisz(page, '#therDailyDoseAbs', '1.13');
  s = await stan(page);
  expect(s.podawana).toBe('1.1');
  expect(s.zaokraglenie).toBe('Wpisano 1,13 mg/d. Zaokrąglono do najbliższego kroku 0,1 mg: 1,1 mg/d (0,029 mg/kg/d).');
});

test('B: Ngenla 24 mg, 40 kg — limit 12 mg na wstrzyknięcie, podpowiedź 60 mg; zmiana zachowuje dawkę i zaokrągla do 0,5 mg', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);
  await ustaw(page, { masa: 40, program: 'SNP', lek: 'Ngenla 24 mg' });
  let s = await stan(page);
  expect(s.etykieta).toBe('Dawka podawana (mg/tydzień)');
  expect(s.etykietaKg).toBe('Dawka na kg (mg/kg/tydzień)');
  expect(s.podawana).toBe('26.4');
  expect(s.krok).toBe('Krok 0,2 mg; jedno wstrzyknięcie 0,2–12 mg');
  expect(s.wstrzykiwacz).toBe('Ta dawka nie zmieści się w jednym wstrzyknięciu | 26,4 mg to więcej niż 12 mg — tyle najwięcej '
    + 'podaje jedno wstrzyknięcie wstrzykiwacza Ngenla 24 mg — i więcej niż cały wstrzykiwacz (24 mg). Ta dawka wymaga '
    + '3 wstrzyknięć po 8,8 mg. Ngenla 60 mg podaje 0,5–30 mg w jednym wstrzyknięciu, krok 0,5 mg (ChPL Ngenla, pkt 4.2).');
  expect(s.przyciski).toEqual(['Zmień na Ngenla 60 mg', 'Zostaw 24 mg']);
  // Ngenla bez przeliczeń na dobę i IU — w ramce „Pacjent” i w notce programu.
  expect(s.pacjent).toBe('Pacjent: 26,4 mg/tydz 0,66 mg/kg/tydz 3 wstrzyknięcia po 8,8 mg');
  expect(s.notka).toBe('Somatrogon (Ngenla): zalecana dawka 0,66 mg/kg/tydz.');
  expect(s.ostrzezenie).toBe('');

  // Lekarz potwierdza dawkę 26,4 mg/tydz, potem przechodzi na wstrzykiwacz 60 mg przyciskiem.
  await wpisz(page, '#therDailyDoseAbs', '26.4');
  await page.click('#therPenNote button:has-text("Zmień na Ngenla 60 mg")');
  s = await stan(page);
  expect(s.lek).toBe('Ngenla 60 mg');
  expect(s.podawana).toBe('26.5');
  expect(blisko(s.mgNaTydzien, 26.5)).toBe(true);
  expect(s.zaokraglenie).toBe('Zmieniono preparat. Dawkę 26,4 mg/tydz zaokrąglono do najbliższego kroku 0,5 mg: '
    + '26,5 mg/tydz (0,662 mg/kg/tydz).');
  expect(s.wstrzykiwacz).toBe('');
  expect(s.pacjent).toBe('Pacjent: 26,5 mg/tydz 0,662 mg/kg/tydz 1 wstrzyknięcie');
  // 26,5 mg to dawka 0,66 mg/kg/tydz po zaokrągleniu do kroku 0,5 mg — bez ostrzeżenia o dawce zalecanej.
  expect(s.ostrzezenie).toBe('');
});

test('C: Ngenla 60 mg, 50 kg — 33 mg w 2 wstrzyknięciach po 16,5 mg; „Zostaw 24 mg” zostawia wstrzykiwacz i opisuje podział', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);
  await ustaw(page, { masa: 50, program: 'SNP', lek: 'Ngenla 60 mg' });
  let s = await stan(page);
  expect(s.podawana).toBe('33');
  expect(s.wstrzykiwacz).toBe('Dawka powyżej 30 mg — 2 wstrzyknięcia | Podaj 2 wstrzyknięcia po 16,5 mg, każde w inne miejsce, '
    + 'aby zapobiec lipoatrofii (ChPL Ngenla, pkt 4.2).');
  expect(s.przyciski).toEqual([]);
  expect(s.pacjent).toBe('Pacjent: 33 mg/tydz 0,66 mg/kg/tydz 2 wstrzyknięcia po 16,5 mg');

  // 33,5 mg/tydz: równe części w krokach 0,5 mg — 17 i 16,5 mg.
  await wpisz(page, '#therDailyDoseAbs', '33.5');
  s = await stan(page);
  expect(s.wstrzykiwacz).toContain('Podaj 2 wstrzyknięcia: 17 mg i 16,5 mg');

  await ustaw(page, { masa: 40, lek: 'Ngenla 24 mg' });
  await wpisz(page, '#therDailyDoseAbs', '26.4');
  await page.click('#therPenNote button:has-text("Zostaw 24 mg")');
  s = await stan(page);
  expect(s.lek).toBe('Ngenla 24 mg');
  expect(s.podawana).toBe('26.4');
  expect(s.wstrzykiwacz).toBe('Dawka powyżej 12 mg — 3 wstrzyknięcia | Podaj 3 wstrzyknięcia po 8,8 mg, każde w inne miejsce, '
    + 'aby zapobiec lipoatrofii (ChPL Ngenla, pkt 4.2).');
});

test('D: Genotropin 5,3 mg — 1,6 mg/d przekracza 1,5 mg na wstrzyknięcie; zmiana na 12 mg daje 1,65 mg/d', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);
  await ustaw(page, { masa: 48, program: 'SNP', lek: 'Genotropin 5,3 mg' });
  await wpisz(page, '#therDailyDoseAbs', '1.6');
  let s = await stan(page);
  expect(s.krok).toBe('Krok 0,05 mg; jedno wstrzyknięcie 0,1–1,5 mg');
  expect(s.wstrzykiwacz).toBe('Ta dawka nie zmieści się w jednym wstrzyknięciu | 1,6 mg to więcej niż 1,5 mg — tyle najwięcej '
    + 'podaje jedno wstrzyknięcie wstrzykiwacza Genotropin 5,3 mg. Genotropin 12 mg podaje 0,3–4,5 mg w jednym '
    + 'wstrzyknięciu, krok 0,15 mg (ulotka Genotropin).');
  expect(s.przyciski).toEqual(['Zmień na Genotropin 12 mg', 'Zostaw 5,3 mg']);
  await page.click('#therPenNote button:has-text("Zmień na Genotropin 12 mg")');
  s = await stan(page);
  expect(s.lek).toBe('Genotropin 12 mg');
  expect(s.podawana).toBe('1.65');
  expect(blisko(s.mgNaDobe, 1.65)).toBe(true);
  expect(s.wstrzykiwacz).toBe('');
});

test('E: odtworzenie zapisanego stanu — dawka podawana 1,1 mg/d zostaje przy innej masie ciała', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);
  await ustaw(page, { masa: 35, program: 'SNP', lek: 'Omnitrope 10 mg' });
  await wpisz(page, '#therDailyDoseAbs', '1.1');
  const zapis = await page.evaluate(() => window.vildaGhIgfPersistApi.captureState());
  expect(zapis.dailyDoseAbs).toBe('1.1');
  await page.evaluate(() => window.vildaGhIgfPersistApi.resetState({}));
  await zmienMase(page, 40);
  await page.evaluate((z) => window.vildaGhIgfPersistApi.restoreState(z), zapis);
  const s = await stan(page);
  expect(s.lek).toBe('Omnitrope 10 mg');
  expect(blisko(s.mgNaDobe, 1.1)).toBe(true);
  expect(s.podawana).toBe('1.1');
});

// ---- Monitor (DocPro): nowy punkt z karty, edycja, punkt wsteczny, stary punkt Ngenla ----

async function otworzDocPro(page) {
  await zaloguj(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function'
    && Boolean(window.vildaGhIgfPersistApi) && Boolean(window.VildaGhDawka), null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro biegnie do ~1,5 s po starcie strony
  // Na DocPro karta siedzi w ukrytej sekcji modułów; do wpisywania jak lekarz przenosimy ją na wierzch strony.
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

const punkty = (page) => page.evaluate(() => (window.ghTherapyPoints || []).map((p) => ({ ...p })));
const komorkaDawki = (page, i) => page.evaluate((n) => {
  const w = Array.from(document.querySelectorAll('#ghTherapyTbody tr')).filter((r) => r.querySelector('.edit-gh-pt-btn'));
  return w[n] ? w[n].children[6].innerText.trim() : null;
}, i);
const info = (page, id) => page.evaluate((x) => document.getElementById(x).textContent.replace(/\s+/g, ' ').trim(), id);

test('F: punkt z karty zapisuje dawkę podawaną po zaokrągleniu; edycja w mg/tydz — zmiana masy jej nie zmienia', async ({ page }) => {
  test.setTimeout(180_000);
  await otworzDocPro(page);
  await ustaw(page, { masa: 43, program: 'SNP', lek: 'Ngenla 60 mg' });
  expect((await stan(page)).podawana).toBe('28.5'); // 0,66 × 43 = 28,38 → krok 0,5 mg
  await page.evaluate(() => { document.getElementById('name').value = 'Fikcyjny Test Dawki'; window.ghAddTherapyPoint('start'); });
  let p = (await punkty(page)).at(-1);
  expect(p.doseUnit).toBe('mg/kg/tydz');
  expect(blisko(p.doseAbs * 7, 28.5)).toBe(true);
  expect(blisko(p.dose, 28.5 / 43)).toBe(true);
  expect(await komorkaDawki(page, 0)).toBe('28,5 mg/tydz\n0,663 mg/kg/tydz');

  // Edycja: pole w mg/tydzień z dawką podawaną; zmiana masy w edycji zmienia tylko mg/kg.
  await page.evaluate(() => window.ghActivateTab('mon'));
  await page.click('.edit-gh-pt-btn');
  await expect(page.locator('#ghEditDoseLabel')).toHaveText('Dawka podawana (mg/tydzień)');
  await expect(page.locator('#ghEditDose')).toHaveValue('28.5');
  expect(await info(page, 'ghEditDoseInfo')).toBe('= 0,663 mg/kg/tydz przy 43 kg');
  await page.fill('#ghEditWeight', '45');
  expect(await info(page, 'ghEditDoseInfo')).toBe('= 0,633 mg/kg/tydz przy 45 kg');
  await page.evaluate(() => window.ghAddTherapyPoint('start'));
  p = (await punkty(page)).at(-1);
  expect(p.weight).toBe(45);
  expect(blisko(p.doseAbs * 7, 28.5)).toBe(true);
  expect(blisko(p.dose, 28.5 / 45)).toBe(true);

  // Zmiana preparatu tygodniowego na dobowy w edycji czyści pole i mówi dlaczego.
  await page.click('.edit-gh-pt-btn');
  await page.selectOption('#ghEditDrug', 'Omnitrope 10 mg');
  await expect(page.locator('#ghEditDose')).toHaveValue('');
  await expect(page.locator('#ghEditDoseLabel')).toHaveText('Dawka podawana (mg/dobę)');
  expect(await info(page, 'ghEditDoseInfo')).toBe('Zmieniono preparat tygodniowy na dobowy. Wpisz dawkę podawaną w mg/dobę '
    + '— poprzednia (28,5 mg/tydzień) się nie przenosi.');
  await page.fill('#ghEditDose', '1.1');
  expect(await info(page, 'ghEditDoseInfo')).toBe('= 0,024 mg/kg/d przy 45 kg');
});

test('G: punkt wsteczny w dawce podawanej, bez zaokrąglania; stary punkt Ngenla czytany z doseAbs × 7', async ({ page }) => {
  test.setTimeout(180_000);
  await otworzDocPro(page);
  await ustaw(page, { masa: 38, program: 'SNP', lek: 'Omnitrope 10 mg' });
  await page.evaluate(() => { window.ghActivateTab('mon'); window.ghOpenRetroForm(); });
  await page.selectOption('#ghRetroDrug', 'Omnitrope 10 mg');
  await expect(page.locator('#ghRetroDoseLabel')).toHaveText('Dawka podawana (mg/dobę)');
  await page.fill('#ghRetroAge', '8');
  await page.fill('#ghRetroAgeMonths', '6');
  await page.fill('#ghRetroHeight', '125');
  await page.fill('#ghRetroDose', '1.13');
  expect(await info(page, 'ghRetroDoseInfo')).toBe('Wpisz wagę, aby przeliczyć dawkę na kg. — 1,13 mg nie pasuje do kroku 0,1 mg '
    + '(Omnitrope 10 mg). Zapiszemy tak, jak wpisano — sprawdź wpis.');
  await page.fill('#ghRetroWeight', '38');
  expect(await info(page, 'ghRetroDoseInfo')).toBe('= 0,03 mg/kg/d przy 38 kg — 1,13 mg nie pasuje do kroku 0,1 mg '
    + '(Omnitrope 10 mg). Zapiszemy tak, jak wpisano — sprawdź wpis.');
  await page.selectOption('#ghRetroDrug', 'Ngenla 60 mg');
  await expect(page.locator('#ghRetroDoseLabel')).toHaveText('Dawka podawana (mg/tydzień)');
  await page.selectOption('#ghRetroDrug', 'Omnitrope 10 mg');
  await page.evaluate(() => window.ghAddRetroPoint());
  const r = (await punkty(page)).at(-1);
  expect(r.doseAbs).toBe(1.13);
  expect(blisko(r.dose, 1.13 / 38)).toBe(true);

  // Stary punkt Ngenla (zapis sprzed zmiany: mg/kg/tydz i doseAbs w mg/d) — bez przepisywania rekordu.
  await page.evaluate(() => {
    const lista = window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []);
    lista.push({
      id: 'gh-e2e-stary', type: 'continue', ageYears: 9, ageMonths: 6, weight: 50, height: 131, boneAge: null,
      dose: 0.66, doseUnit: 'mg/kg/tydz', doseAbs: 0.66 * 50 / 7, drug: 'Ngenla 60 mg', program: 'SNP',
      igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null,
    });
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
    window.refreshGHTherapyMonitor();
  });
  const wiersze = await page.evaluate(() => Array.from(document.querySelectorAll('#ghTherapyTbody tr'))
    .filter((w) => w.querySelector('.edit-gh-pt-btn')).map((w) => w.children[6].innerText.trim()));
  expect(wiersze).toContain('33 mg/tydz · 2 wstrzyknięcia\n0,660 mg/kg/tydz');
  await page.click('.edit-gh-pt-btn[data-id="gh-e2e-stary"]');
  await expect(page.locator('#ghEditDose')).toHaveValue('33');
  const stary = (await punkty(page)).find((x) => x.id === 'gh-e2e-stary');
  expect(stary.dose).toBe(0.66);
  expect(stary.doseAbs).toBe(0.66 * 50 / 7);
});

test('H: wizyta kontrolna z karty dla Ngenla — dawka w mg/tydz i mg/kg/tydz (dotąd mg/kg/tydz z etykietą mg/kg/d)', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);
  await ustaw(page, { masa: 40, program: 'SNP', lek: 'Ngenla 60 mg' });
  // Zapis do Terminarza przechwytujemy w stronie: sprawdzamy treść wpisu, nie zapisujemy go w sejfie.
  await page.evaluate(() => {
    document.getElementById('name').value = 'Fikcyjny Test Dawki';
    window._vildaCurrentPatientId = 'pacjent-e2e-dawka';
    window.__wpis = null;
    window.VildaVault.savePatientNote = (p) => { window.__wpis = p; return Promise.resolve(); };
  });
  await page.click('#tzAdd90');
  await expect(page.locator('#tzGhVisitOverlay')).toContainText('26,5 mg/tydz · 0,662 mg/kg/tydz');
  await page.click('#tzGhConfirm');
  await page.waitForFunction(() => Boolean(window.__wpis));
  const wpis = await page.evaluate(() => window.__wpis);
  expect(wpis.body).toContain('Dawka: 26,5 mg/tydz (0,662 mg/kg/tydz).');
  expect(wpis.body).not.toContain('mg/kg/d');
  expect(wpis.medication).toMatchObject({ doseUnit: 'mg/kg/tydz', freq: 'tydzień' });
});
