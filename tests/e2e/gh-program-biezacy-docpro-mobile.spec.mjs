import { expect, test } from '../support/test-czas.mjs';
import { zaloguj } from '../support/gh-wznowienie.mjs';
import { I_DO_G, bezPrzewijaniaWBok } from '../support/karta-leczenie.mjs';

// P-GH-PROGRAM-BIEZACY (decyzja właściciela 2026-11-23: „popraw program w formularzu monitora DocPro”;
// docs/clinical/ALGORITHMS.md) — telefon (projekt mobile-chromium). Monitor GH na PRAWDZIWYM DocPro po Włączeniu Increlex
// (IGF-1) i Kontynuacjach Genotropin (SNP): pole „Program terapeutyczny” i wiersz „Program terapeutyczny: SNP” nad
// tabelą, lista preparatów SNP z Genotropin 12 mg, Kontynuacja z karty z programem SNP; wiersz mieści się w karcie,
// a strona nie przewija się w bok. Dotąd (audyt e163b85a) — IGF-1. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

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
