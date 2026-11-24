import { expect, test } from '../support/test-czas.mjs';
import { I_DO_G, bezPrzewijaniaWBok, karta, kartaGh, opisKartyGh, otworz, paski, widokGh, zakladki, zapisz } from '../support/karta-leczenie.mjs';

// P-GH-PREPARAT-BIEZACY — telefon (projekt mobile-chromium). Po zmianie Increlex → rhGH pasek leczenia i karta GH opisują
// bieżący preparat (Genotropin): znacznik rhGH, „Program SNP” pod znacznikiem, kafelek „0,033 mg/kg/d” bez dawki
// „na podanie”; trend z wierszem Increlex na podanie i wierszami Genotropin w mg/kg/d, bez przewijania w bok.
// Dane wyłącznie FIKCYJNE; sejf zakładany w teście.
test.use({ serviceWorkers: 'block', chwila: '2026-11-19T11:00:00Z' });

test.describe('Karta pacjenta — leczenie GH po zmianie preparatu (telefon)', () => {
  test('KPM-1 I→G: pasek i karta „Leczony hormonem wzrostu (rhGH)”, „Program SNP · 3 punkty kontrolne”, „0,033 mg/kg/d”; trend bez przewijania w bok', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, I_DO_G);
    await karta(page, pid);
    await expect(paski(page).locator('.vilda-kl-pasek-odznaka')).toHaveText('Leczony hormonem wzrostu (rhGH)');
    await expect(paski(page).locator('.vilda-kl-pasek-t')).toHaveText(/^0,033 mg\/kg\/d · /);
    await zakladki(page).filter({ hasText: 'Leczenie' }).click();
    const k = kartaGh(page);
    await expect(k).toBeVisible();
    await expect(k.locator('.vilda-gh-summary-badge')).toHaveText('Leczony hormonem wzrostu (rhGH)');
    const opis = await opisKartyGh(page);
    expect(opis.cichy).toBe('Program SNP · 3 punkty kontrolne');
    expect(opis.kafelki[0]).toEqual(['Preparat i dawka', '0,033 mg/kg/d', 'Genotropin 12 mg']);
    const [odznaka, cichy] = await Promise.all([k.locator('.vilda-gh-summary-badge'), k.locator('.vilda-kg-cichy')]
      .map((l) => l.evaluate((el) => el.getBoundingClientRect().toJSON())));
    expect(cichy.top, 'cichy tekst pod znacznikiem').toBeGreaterThanOrEqual(odznaka.bottom - 1);
    expect(await bezPrzewijaniaWBok(page)).toBe(true);

    await widokGh(page, 'trend').click();
    await expect.poll(() => k.locator('.vilda-kg-trend tr').count()).toBe(4);
    expect(await k.locator('.vilda-kg-trend tr').evaluateAll((rs) => rs.slice(1).map((r) => r.children[1].textContent.trim())))
      .toEqual(['2 × 0,72 mg na dobę (0,04 mg/kg na podanie)', '0,033 mg/kg/d', '0,033 mg/kg/d']);
    expect(await bezPrzewijaniaWBok(page), 'trend bez poziomego przewijania strony').toBe(true);
  });
});
