import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// P-OSTATNI-2a na PRAWDZIWEJ stronie: po ścieżce Wczytaj pacjenta → „Co chcesz zrobić?" → Nowy pomiar
// jest JEDNA karta „Porównanie z poprzednim pomiarem" na całą szerokość formularza (pod obiema
// kolumnami), z tabelą Poprzednio / Dziś / Zmiana, paskiem tempa i sekcją „Pozostałe wyniki",
// która przejmuje resztę „Podsumowania wyników" razem z przyciskami. Osobna karta Podsumowania
// w tej ścieżce znika. Plik „-mobile" → projekt mobile-chromium; blok desktopowy nadpisuje viewport.
// Dane FIKCYJNE. Zrzuty: VILDA_ZRZUTY=<katalog> (opcjonalnie).
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Uklad!26c';
const ZRZUTY = process.env.VILDA_ZRZUTY || '';

async function zrzut(locator, nazwa) {
  if (!ZRZUTY) return;
  fs.mkdirSync(ZRZUTY, { recursive: true });
  await locator.screenshot({ path: path.join(ZRZUTY, nazwa) });
}

async function wpisz(page, pola) {
  await page.evaluate((p) => {
    Object.keys(p).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('brak pola ' + id);
      el.value = p[id];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (typeof window.update === 'function') window.update();
  }, pola);
}

async function ustawPro(page, wlaczony) {
  await page.waitForFunction((chce) => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (pro.checked !== chce) { pro.checked = chce; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === chce;
  }, wlaczony, { timeout: 15000 });
}

async function pierwszaWizytaIWczytanie(page, pierwszy) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
    try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (_) { /* brak schowka */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.update === 'function'
    && typeof window.saveUserData === 'function' && Boolean(window.VildaSummaryCards));
  await page.evaluate(() => { const a = document.getElementById('vilda-auth-ui-root'); if (a) a.style.display = 'none'; });
  const baner = page.locator('#consent-decline');
  if (await baner.count() && await baner.isVisible()) await baner.click();
  await ustawPro(page, true);

  await wpisz(page, { firstName: 'Testowy', lastName: 'Fikcyjny-Uklad', ...pierwszy });
  await page.waitForTimeout(400);
  await expect.poll(() => page.evaluate(async () => Boolean(await window.saveUserData())), { timeout: 15000 }).toBe(true);
  await expect.poll(async () => page.evaluate(async () => (await window.VildaVault.listPatients()).length), { timeout: 15000 }).toBeGreaterThan(0);
  const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);

  await page.evaluate(async (id) => {
    const p = await window.VildaVault.getPatient(id);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, pid);
  await page.waitForFunction(() => typeof window._vildaCurrentPatientId === 'string');
  const nowy = page.getByRole('button', { name: 'Nowy pomiar' }).first();
  await expect(nowy, 'modal „Co chcesz zrobić?" z przyciskiem Nowy pomiar').toBeVisible({ timeout: 10000 });
  await nowy.click();
  await expect(page.locator('#prevSummaryCard')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#weight')).toHaveValue('');
  return pid;
}

const DZIECKO_1 = { sex: 'M', age: '8', ageMonths: '2', weight: '26', height: '126', waistCm: '58', hipCm: '66' };
const DZIECKO_2 = { age: '8', ageMonths: '9', weight: '29.5', height: '129', waistCm: '61', hipCm: '68' };

// P-OSTATNI-3: rytm pionowy kart to 1rem — karta porównania ma mieć TEN SAM odstęp od karty
// formularza (i od karty „Przypomnienia") u góry, co od kart Centyle/BMI i przycisku Podsumowania u dołu,
// równy odstępowi między innymi kartami wyników. Do SW 1.0.983 było 2rem u góry i 0 u dołu (desktop)
// oraz ~10 px / ~21 px (telefon).
async function odstepy(page) {
  return page.evaluate(() => {
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.display === 'none' || b.height === 0 ? null : { top: b.top + scrollY, bottom: b.bottom + scrollY }; };
    const f = r('#userSection fieldset.user-card'), k = r('#prevSummaryCard'), rem = r('#remindersInline');
    const nizej = ['#metabolicSummarySection', '#results', '#bmiCard'].map(r).filter(Boolean).map((x) => x.top);
    // wzorzec: odstęp między dwiema kolejnymi WIDOCZNYMI kartami lewej kolumny wyników (rytm 1rem)
    const dzieci = Array.from(document.querySelectorAll('#leftColumnWrap > *')).map((el) => { const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.display === 'none' || b.height === 0 ? null : { top: b.top + scrollY, bottom: b.bottom + scrollY }; }).filter(Boolean);
    const wzorzec = dzieci.length >= 2 ? dzieci[1].top - dzieci[0].bottom : null;
    return { gora: k.top - f.bottom, dol: Math.min(...nizej) - k.bottom, przypomnienia: rem ? k.top - rem.bottom : null, wzorzec };
  });
}

async function sprawdzOdstepy(page) {
  const o = await odstepy(page);
  expect(o.wzorzec, 'wzorzec: odstęp między kartami wyników').toBeGreaterThan(0);
  expect(Math.abs(o.gora - o.wzorzec), `odstęp nad kartą (${o.gora}) = wzorzec (${o.wzorzec})`).toBeLessThanOrEqual(1);
  expect(Math.abs(o.dol - o.wzorzec), `odstęp pod kartą (${o.dol}) = wzorzec (${o.wzorzec})`).toBeLessThanOrEqual(1);
  expect(Math.abs(o.wzorzec - 16), 'wzorzec to 1rem').toBeLessThanOrEqual(1);
  return o;
}

async function sprawdzWspolne(page) {
  const karta = page.locator('#prevSummaryCard');
  const tabela = karta.locator('.porownanie-tabela');
  await expect(tabela).toBeVisible();
  // kolejność w DOM: lewa kolumna → karta porównania → prawa kolumna (karta jest dzieckiem #calcForm)
  const kolejnosc = await page.evaluate(() => {
    const u = document.getElementById('userSection'), w = document.getElementById('prevSummaryWrap'), d = document.getElementById('doctorSection');
    const po = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { rodzic: w.parentElement.id, uPrzedW: po(u, w), wPrzedD: po(w, d) };
  });
  expect(kolejnosc).toEqual({ rodzic: 'calcForm', uPrzedW: true, wPrzedD: true });
  // wiersz wzrostu: Dziś = 129,0 cm, Zmiana = +3,0 cm
  const wzrost = tabela.locator('tr[data-klucz="wzrost"]');
  await expect(wzrost.locator('.pt-dzis .pt-w')).toHaveText(/129,0/);
  await expect(wzrost.locator('.pt-dzis .pt-w')).not.toHaveClass(/pt-brak/);
  await expect(wzrost.locator('.pt-zmiana .pt-d')).toHaveText(/^\+3,0/);
  await expect(tabela.locator('tr[data-klucz="bmi"] td').first()).toHaveText('BMI');
  // pasek tempa: JEDNO zdanie z silnika (dziecko)
  const tempo = page.locator('#porownanieTempo');
  await expect(tempo).toBeVisible();
  await expect(tempo).toHaveText(/Tempo wzrastania: 5,1 cm\/rok/);
  // osobna karta Podsumowania znika, jej reszta + przycisk PDF są w „Pozostałych wynikach"
  await expect(page.locator('#currentSummaryCard')).toBeHidden();
  const pozostale = page.locator('#porownaniePozostale');
  await expect(pozostale).toBeVisible();
  await expect(pozostale.locator('[data-patient-report-pdf-btn]')).toBeVisible();
  await expect(pozostale.locator('.current-summary-row').first()).toBeVisible();
  const tekstPozostale = await pozostale.innerText();
  expect(tekstPozostale).not.toMatch(/^Wzrost:|^Waga:|^BMI:/m);
  expect(tekstPozostale).not.toMatch(/Tempo wzrastania:/);
  expect(tekstPozostale).toMatch(/PRO/);
  // PRO: ΔSDS w kolumnie Zmiana; podpis „Dziś" z Podsumowania (centyl + SDS)
  await expect(wzrost.locator('.pt-zmiana .pt-s')).toHaveText(/ΔhSDS/);
  await expect(wzrost.locator('.pt-dzis .pt-s').first()).toHaveText(/centyl/);
  await expect(page.locator('#porownanieOdstep')).toHaveText('7 mies. temu');
  // bez poziomego przewijania
  const szer = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  expect(szer.s).toBeLessThanOrEqual(szer.c + 1);
}

test.describe('telefon', () => {
  test('jedna karta porównania, tabela bez kolumny „Poprzednio" (jest „było …"), reszta Podsumowania w karcie', async ({ page }) => {
    test.setTimeout(150_000);
    await pierwszaWizytaIWczytanie(page, DZIECKO_1);
    await wpisz(page, DZIECKO_2);
    await sprawdzWspolne(page);
    await sprawdzOdstepy(page);
    const wzrost = page.locator('#prevSummaryCard tr[data-klucz="wzrost"]');
    await expect(wzrost.locator('.pt-kol-poprzednio')).toBeHidden();
    await expect(wzrost.locator('.pt-byl')).toBeVisible();
    await expect(wzrost.locator('.pt-byl')).toHaveText(/było 126,0/);
    await zrzut(page.locator('#prevSummaryCard'), 'porownanie-karta-mobile.png');
    await zrzut(page, 'porownanie-strona-mobile.png');
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test('karta zajmuje całą szerokość formularza pod obiema kolumnami; bez PRO nie ma ΔSDS ani „Pozostałych"', async ({ page }) => {
    test.setTimeout(150_000);
    await pierwszaWizytaIWczytanie(page, DZIECKO_1);
    await wpisz(page, DZIECKO_2);
    await sprawdzWspolne(page);
    await sprawdzOdstepy(page);
    const wzrost = page.locator('#prevSummaryCard tr[data-klucz="wzrost"]');
    await expect(wzrost.locator('.pt-kol-poprzednio')).toBeVisible();
    await expect(wzrost.locator('.pt-byl')).toBeHidden();
    const geo = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const f = r('calcForm'), k = r('prevSummaryCard'), u = r('userSection'), d = r('doctorSection');
      return { formL: f.left, formR: f.right, kL: k.left, kR: k.right, kT: k.top, uB: u.bottom, dB: d.bottom, uR: u.right, dL: d.left };
    });
    expect(geo.kL, 'lewa krawędź karty = lewa krawędź formularza').toBeLessThanOrEqual(geo.formL + 2);
    expect(geo.kR, 'prawa krawędź karty = prawa krawędź formularza').toBeGreaterThanOrEqual(geo.formR - 2);
    expect(geo.dL, 'dwie kolumny nad kartą').toBeGreaterThan(geo.uR - 2);
    expect(geo.kT, 'karta pod obiema kolumnami').toBeGreaterThanOrEqual(Math.max(geo.uB, geo.dB) - 2);
    await zrzut(page.locator('#prevSummaryCard'), 'porownanie-karta-desktop.png');
    await zrzut(page, 'porownanie-strona-desktop.png');

    await ustawPro(page, false);
    await wpisz(page, { weight: '29.5' });
    await expect(page.locator('#prevSummaryCard')).toBeVisible();
    await expect(wzrost.locator('.pt-zmiana .pt-d')).toHaveText(/^\+3,0/);
    await expect(wzrost.locator('.pt-zmiana .pt-s')).toHaveCount(0);
    await expect(wzrost.locator('.pt-dzis .pt-s').first()).toHaveText(/^\d+ centyl$/);
    await expect(page.locator('#porownaniePozostale')).toBeHidden();
    await expect(page.locator('#currentSummaryCard')).toBeHidden();
    await expect(page.locator('#porownanieTempo')).toBeVisible();
    await zrzut(page.locator('#prevSummaryCard'), 'porownanie-karta-desktop-bez-pro.png');
  });

  test('z kartą „Przypomnienia" w prawej kolumnie: ten sam odstęp od niej, co od formularza', async ({ page }) => {
    test.setTimeout(150_000);
    const pid = await pierwszaWizytaIWczytanie(page, DZIECKO_1);
    await wpisz(page, DZIECKO_2);
    // wpis „na dziś" + PRO (jak w przypomnienia-karta.spec) → karta Przypomnienia w prawej kolumnie
    await page.evaluate(async (id) => {
      const V = window.VildaVault, d = new Date(), p = (n) => String(n).padStart(2, '0');
      await V.savePatientNote({ patientId: id, title: 'Kontrola wzrostu', body: '', category: 'followup', dueDateISO: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` });
      window.VildaProAccess.hasAccess = () => true;
      window.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    }, pid);
    await page.waitForFunction(() => { const el = document.getElementById('remindersInline'); return !!el && el.style.display !== 'none' && el.textContent.includes('Przypomnienia'); }, null, { timeout: 20000 });
    await expect(page.locator('#prevSummaryCard')).toBeVisible();
    const o = await sprawdzOdstepy(page);
    expect(o.przypomnienia, 'karta Przypomnienia jest widoczna').not.toBeNull();
    expect(Math.abs(o.przypomnienia - o.wzorzec), `odstęp od Przypomnień (${o.przypomnienia}) = wzorzec (${o.wzorzec})`).toBeLessThanOrEqual(1);
    await zrzut(page, 'porownanie-strona-desktop-przypomnienia.png');
  });

  test('dorosły: różnice i kategoria BMI, bez paska tempa', async ({ page }) => {
    test.setTimeout(150_000);
    await pierwszaWizytaIWczytanie(page, { sex: 'F', age: '25', ageMonths: '0', weight: '60', height: '165' });
    await wpisz(page, { age: '26', ageMonths: '0', weight: '66', height: '165' });
    const karta = page.locator('#prevSummaryCard');
    await expect(karta.locator('tr[data-klucz="masa"] .pt-zmiana .pt-d')).toHaveText(/^\+6,0/);
    await expect(karta.locator('tr[data-klucz="bmi"] .pt-zmiana .pt-pill')).toHaveText(/kategoria BMI/);
    await expect(page.locator('#porownanieTempo')).toBeHidden();
    await expect(karta.locator('tr[data-klucz="cole"]')).toHaveCount(0);
    await zrzut(karta, 'porownanie-karta-dorosly.png');
  });
});
