import { expect, test } from '../support/test-czas.mjs';
import { G_DO_I, I_DO_G, karta, kartaGh, opisKartyGh, otworz, paski, widokGh, zakladki, zapisz } from '../support/karta-leczenie.mjs';

// P-GH-PREPARAT-BIEZACY (decyzja właściciela 2026-11-23: „popraw ten błąd”; docs/clinical/ALGORITHMS.md). Karta pacjenta
// na PRAWDZIWEJ stronie (komputer): po zmianie Increlex → rhGH karta leczenia GH opisuje bieżący preparat (Genotropin) —
// znacznik, program, kafelek „Preparat i dawka” (bez dzielenia dawki rhGH na podanie), pasek leczenia, linia „Analizy”.
// Dotąd (audyt a7b2920b) program Włączenia „IGF-1” dawał „Leczony IGF-1 (mekasermina)”, „Program IGF-1 · 3 punkty
// kontrolne” i „2 × 0,35 mg na dobę” · „0,017 mg/kg na podanie · Genotropin 12 mg”. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block', chwila: '2026-11-19T11:00:00Z' });

async function leczenie(page) {
  await zakladki(page).filter({ hasText: 'Leczenie' }).click();
  await expect(kartaGh(page)).toBeVisible();
}
const wierszeTrendu = (page) => kartaGh(page).locator('.vilda-kg-trend').evaluate((el) => [...el.querySelectorAll('tr')]
  .map((r) => [...r.children].map((c) => c.textContent.trim())));

test.describe('Karta pacjenta — leczenie GH po zmianie preparatu (komputer)', () => {
  test('KP-1 I→G: „Leczony hormonem wzrostu (rhGH)”, „Program SNP · 3 punkty kontrolne”, kafelek i pasek „0,033 mg/kg/d”; trend per punkt', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, I_DO_G);
    await karta(page, pid);
    await expect(paski(page).locator('.vilda-kl-pasek-odznaka')).toHaveText('Leczony hormonem wzrostu (rhGH)');
    await expect(paski(page).locator('.vilda-kl-pasek-t')).toHaveText(/^0,033 mg\/kg\/d · 12 mies\./);
    await expect(paski(page).locator('.vilda-kl-pasek-t')).not.toContainText('na podanie');
    await leczenie(page);
    const k = kartaGh(page);

    await expect(k.locator('.vilda-gh-summary-head > .vilda-gh-summary-badge')).toHaveText('Leczony hormonem wzrostu (rhGH)');
    await expect(k.locator('.vilda-gh-summary-head .vilda-gh-summary-chip')).toHaveText(['aktywne', '🔄 zmiana preparatu']);
    await expect(k.locator('.vilda-kg-cichy')).toHaveText('Program SNP · 3 punkty kontrolne');
    await expect(k.locator('.vilda-kg-program')).toHaveAttribute('title', 'SNP — somatotropinowa niedoczynność przysadki');
    await expect(page.getByRole('tablist', { name: 'Leczony hormonem wzrostu (rhGH) — widok karty' })).toBeVisible();
    const opis = await opisKartyGh(page);
    expect(opis.kafelki[0]).toEqual(['Preparat i dawka', '0,033 mg/kg/d', 'Genotropin 12 mg']);
    expect(opis.nad[0]).toMatch(/^Preparaty \(historia\)Increlex 40 mg7 l\. 0 mies\. – .*→Genotropin 12 mg7 l\. 6 mies\. · aktualny$/);
    await expect(k.locator('.vilda-kg-widok--przeglad')).not.toContainText('na podanie');
    await expect(k).not.toContainText('mekasermina');

    // „Trend dawki”: wiersz Increlex w dawce na podanie, wiersze Genotropin w mg/kg/d (jak dotąd — per punkt).
    await widokGh(page, 'trend').click();
    await expect.poll(async () => (await wierszeTrendu(page)).length, { message: 'tabela trendu (nagłówek + 3 punkty)' }).toBe(4);
    expect((await wierszeTrendu(page)).slice(1)).toEqual([
      ['7 l. 0 mies.', '2 × 0,72 mg na dobę (0,04 mg/kg na podanie)', '—'],
      ['7 l. 6 mies.', '0,033 mg/kg/d', '—'],
      ['8 l. 0 mies.', '0,033 mg/kg/d', '—'],
    ]);

    // „Analiza”: cicha linia z programem i preparatem bieżącym.
    await widokGh(page, 'analiza').click();
    await expect(k.locator('.vilda-ko-cicha')).toHaveText('SNP — somatotropinowa niedoczynność przysadki · Genotropin 12 mg · ostatnia kontrola w wieku 8 l. 0 mies.');
  });

  test('KP-2 G→I: „Leczony IGF-1 (mekasermina)”, „Program IGF-1 · 2 punkty kontrolne”, kafelek „2 × 0,8 mg na dobę” · 0,04 mg/kg na podanie', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, G_DO_I);
    await karta(page, pid);
    await expect(paski(page).locator('.vilda-kl-pasek-t')).toHaveText(/^2 × 0,8 mg na dobę \(0,04 mg\/kg na podanie\) · 6 mies\./);
    await leczenie(page);
    const k = kartaGh(page);
    await expect(k.locator('.vilda-gh-summary-head > .vilda-gh-summary-badge')).toHaveText('Leczony IGF-1 (mekasermina)');
    await expect(k.locator('.vilda-kg-cichy')).toHaveText('Program IGF-1 · 2 punkty kontrolne'); // dotąd program Włączenia: SNP
    const opis = await opisKartyGh(page);
    expect(opis.kafelki[0]).toEqual(['Preparat i dawka', '2 × 0,8 mg na dobę', '0,04 mg/kg na podanie · Increlex 40 mg']);
  });
});
