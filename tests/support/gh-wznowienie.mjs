import { expect } from '@playwright/test';

/**
 * P-GH-WZNOWIENIE, część 2 — wspólne dane i pomocnicy specyfikacji gh-wznowienie-docpro.spec.mjs (komputer)
 * i gh-wznowienie-docpro-mobile.spec.mjs (telefon): logowanie do fikcyjnego sejfu, monitor GH na DocPro z listą
 * zasianą w pamięci modułu, pomiar wizyty, formularz wstecznego punktu. Dane wyłącznie FIKCYJNE.
 */
const HASLO = 'E2e#GhWznowienie!26';
const P = (id, type, lata, mies, weight, height) => ({
  id, type, ageYears: lata, ageMonths: mies, weight, height, boneAge: null, dose: 0.03, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.03 * weight,
});
export const W7 = P('gw-e2e-w7', 'start', 7, 0, 18, 110);
export const K8 = P('gw-e2e-k8', 'continue', 8, 0, 21, 117);
export const Z9 = P('gw-e2e-z9', 'end', 9, 0, 24, 123);
export const K10 = P('gw-e2e-k10', 'continue', 10, 0, 27, 130);
export const KONTYNUACJA_PO_Z = 'Po „Zakończeniu leczenia” dodaj najpierw „Włączenie leczenia” (wznowienie leczenia).';
export const KURS_2 = 'Kurs 2 — wznowienie w wieku 10 l. 0 mies.';

export async function zaloguj(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

// Jak w gh-punkty-charakterystyka: karta GH/IGF-1 z monitorem przeniesiona na wierzch strony DocPro.
export async function docPro(page, lista) {
  await zaloguj(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function' && Boolean(window.vildaGhIgfPersistApi)
    && Boolean(window.VildaGhDawka) && Boolean(window.VildaTrajectoryAnalysis) && Boolean(window.VildaGhPunkty), null, { timeout: 60000 });
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
  await wizyta(page, 10, 0, 27, 130);
  await page.evaluate((lista) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
    window.refreshGHTherapyMonitor();
    window.ghActivateTab('mon');
  }, lista);
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(lista.length);
}

// Pomiar bieżącej wizyty (pola formularza, jak lekarz) i preparat karty GH.
export async function wizyta(page, lata, mies, masa, wzrost) {
  await page.evaluate(({ l, m, w, h }) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', String(l)); set('ageMonths', String(m)); set('sex', 'M'); set('height', String(h)); set('weight', String(w));
    if (typeof window.update === 'function') window.update();
    if (!document.getElementById('therProg').disabled) set('therProg', 'SNP');
    set('therDrug', 'Omnitrope 10 mg');
    document.getElementById('name').value = 'Fikcyjny Wznowiony';
  }, { l: lata, m: mies, w: masa, h: wzrost });
}

export const punkty = (page) => page.evaluate(() => window.ghTherapyPoints.map((p) => [p.type, p.ageYears, p.ageMonths]));
export const komunikat = (page) => page.locator('#ghInfoOverlay p');
export async function zamknijKomunikat(page) {
  await page.evaluate(() => Array.from(document.querySelectorAll('#ghInfoOverlay button')).find((b) => b.textContent === 'OK').click());
  await expect(page.locator('#ghInfoOverlay')).toHaveCount(0);
}
export async function wsteczny(page, typ, lata, mies, masa, wzrost, dawka = '0.8') {
  await page.click('#btnGhRetro');
  await expect(page.locator('#ghTherapyRetroContainer')).toBeVisible();
  await page.selectOption('#ghRetroType', typ);
  await page.selectOption('#ghRetroDrug', 'Omnitrope 10 mg');
  await page.fill('#ghRetroAge', String(lata));
  await page.fill('#ghRetroAgeMonths', String(mies));
  await page.fill('#ghRetroHeight', String(wzrost));
  await page.fill('#ghRetroWeight', String(masa));
  await page.fill('#ghRetroDose', dawka);
  await page.click('#btnGhRetroAdd');
}
