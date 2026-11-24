import { expect, test } from '../support/test-czas.mjs';
import { zaloguj } from '../support/gh-wznowienie.mjs';
import { I_DO_G, bezPrzewijaniaWBok } from '../support/karta-leczenie.mjs';

// P-GH-PROGRAM-BIEZACY (decyzja właściciela 2026-11-23: „popraw program w formularzu monitora DocPro”;
// docs/clinical/ALGORITHMS.md) — telefon (projekt mobile-chromium). Monitor GH na PRAWDZIWYM DocPro po Włączeniu Increlex
// (IGF-1) i Kontynuacjach Genotropin (SNP): pole „Program terapeutyczny” i wiersz „Program terapeutyczny: SNP” nad
// tabelą, lista preparatów SNP z Genotropin 12 mg, Kontynuacja z karty z programem SNP; wiersz mieści się w karcie,
// a strona nie przewija się w bok. Dotąd (audyt e163b85a) — IGF-1. Dane wyłącznie FIKCYJNE.
// P-GH-PROGRAM-EDYCJA (decyzja właściciela 2026-11-23: „popraw edycję punktu (pytanie 17)”) — GPBM-2: edycja Kontynuacji
// Genotropin po I→G na telefonie — pole i zapis z programem punktu SNP (dotąd, audyt 77cb60dc, IGF-1 z Włączenia).
test.use({ serviceWorkers: 'block' });

// DocPro na telefonie z kartą GH/IGF-1 na wierzchu strony, wizytą 8;6 i listą punktów w pamięci modułu.
async function docProTelefon(page, lista, program) {
  await zaloguj(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function' && Boolean(window.vildaGhIgfPersistApi)
    && Boolean(window.VildaGhDawka) && Boolean(window.VildaTrajectoryAnalysis) && Boolean(window.VildaGhPunkty), null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro biegnie do ~1,5 s po starcie strony
  await page.evaluate(({ l, prog }) => {
    window.vildaGhIgfPersistApi.ensureMounted();
    const k = document.getElementById('ghIgfTherapyCard');
    const pudlo = document.createElement('div');
    pudlo.style.cssText = 'position:relative;z-index:99999;background:#fff;padding:8px';
    document.body.prepend(pudlo);
    pudlo.appendChild(k);
    k.style.display = 'block';
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '8'); set('ageMonths', '6'); set('sex', 'M'); set('height', '116'); set('weight', '22.5');
    if (typeof window.update === 'function') window.update();
    document.getElementById('name').value = 'Fikcyjny Program';
    set('therProg', prog);
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', l, { force: true });
    window.refreshGHTherapyMonitor();
    window.ghActivateTab('mon');
  }, { l: lista, prog: program });
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(lista.length);
}

test('GPBM-1 I→G na telefonie: „Program terapeutyczny” SNP, wiersz programu SNP, lista SNP z Genotropin 12 mg, Kontynuacja z karty — SNP; bez przewijania strony w bok', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function' && Boolean(window.vildaGhIgfPersistApi)
    && Boolean(window.VildaGhDawka) && Boolean(window.VildaTrajectoryAnalysis) && Boolean(window.VildaGhPunkty), null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro biegnie do ~1,5 s po starcie strony
  await page.evaluate((lista) => {
    // Jak w gh-wznowienie-docpro-mobile: karta GH/IGF-1 z monitorem przeniesiona na wierzch strony DocPro.
    window.vildaGhIgfPersistApi.ensureMounted();
    const k = document.getElementById('ghIgfTherapyCard');
    const pudlo = document.createElement('div');
    pudlo.style.cssText = 'position:relative;z-index:99999;background:#fff;padding:8px';
    document.body.prepend(pudlo);
    pudlo.appendChild(k);
    k.style.display = 'block';
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '8'); set('ageMonths', '6'); set('sex', 'M'); set('height', '116'); set('weight', '22.5');
    if (typeof window.update === 'function') window.update();
    document.getElementById('name').value = 'Fikcyjny Program';
    set('therProg', 'IGF-1'); // karta przed wczytaniem punktów: program IGF-1, lista Increlex 40 mg
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
    window.refreshGHTherapyMonitor();
    window.ghActivateTab('mon');
  }, I_DO_G.ghTherapyPoints);
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(3);
  const wiersz = page.locator('#ghTherapyTbody tr.gh-program-row');
  await expect(wiersz).toHaveText('Program terapeutyczny: SNP');
  await expect(page.locator('#therProg')).toHaveValue('SNP');
  await expect(page.locator('#therProg')).toBeDisabled();
  await expect(page.locator('#therDrug')).toHaveValue('Genotropin 12 mg');
  const geo = await wiersz.locator('td').evaluate((td) => ({ colSpan: td.colSpan, wylewa: td.scrollWidth > td.clientWidth + 1 }));
  expect(geo).toEqual({ colSpan: 9, wylewa: false });
  await page.click('#btnGhContinue');
  await expect.poll(() => page.evaluate(() => window.ghTherapyPoints.length)).toBe(4);
  const nowy = await page.evaluate(() => window.ghTherapyPoints[3]);
  expect(nowy).toMatchObject({ type: 'continue', ageYears: 8, ageMonths: 6, drug: 'Genotropin 12 mg', program: 'SNP' });
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
});

test('GPBM-2 I→G na telefonie, edycja Kontynuacji Genotropin 7;6 bez zmian: pole SNP podczas edycji (dotąd IGF-1), zapis z SNP, karta SNP i Genotropin 12 mg; bez przewijania strony w bok', async ({ page }) => {
  test.setTimeout(150_000);
  await docProTelefon(page, I_DO_G.ghTherapyPoints, 'IGF-1');
  await page.click('.edit-gh-pt-btn[data-id="ig-c1"]');
  await page.evaluate(() => {
    const o = document.getElementById('ghEditOverlay');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Rozumiem');
    if (b) b.click();
  });
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  await expect(page.locator('#therProg')).toHaveValue('SNP');
  await expect(page.locator('#therProg')).toBeDisabled();
  await expect(page.locator('#ghEditDrug')).toHaveValue('Genotropin 12 mg');
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
  await page.click('#btnGhContinue'); // zapis edycji bez zmian
  await expect(page.locator('#ghTherapyEditContainer')).toBeHidden();
  expect(await page.evaluate(() => window.ghTherapyPoints.find((p) => p.id === 'ig-c1'))).toMatchObject({ drug: 'Genotropin 12 mg', program: 'SNP' });
  await expect(page.locator('#therProg')).toHaveValue('SNP');
  await expect(page.locator('#therDrug')).toHaveValue('Genotropin 12 mg');
  await expect(page.locator('#ghTherapyTbody tr.gh-program-row')).toHaveText('Program terapeutyczny: SNP');
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
});
