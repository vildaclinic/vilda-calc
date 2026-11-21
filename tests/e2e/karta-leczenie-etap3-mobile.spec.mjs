import { expect, test } from '../support/test-czas.mjs';
import { G1, R1, bezPrzewijaniaWBok, karta, kartaGh, opisKartyGh, otworz, widokGh, zakladki, zapisz } from '../support/karta-leczenie.mjs';

// P-KARTA-LECZENIE, etap 3 — telefon (projekt mobile-chromium; makieta hybrydy 2026-11-19, H-telefon-gh-przeglad).
// Nagłówek karty GH: znacznik i stan, cichy tekst programu pod spodem; przełącznik „Przegląd | Trend dawki | Analiza”
// w jednym wierszu, bez przewijania w bok; kafelki 2 × 2; wykres i tabela trendu bez poziomego przewijania strony.
// Dane wyłącznie FIKCYJNE; sejf zakładany w teście.
test.use({ serviceWorkers: 'block', chwila: '2026-11-19T11:00:00Z' });

const prostokat = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, w: r.width }; });

async function sprawdzUklad(page) {
  const k = kartaGh(page);
  const odznaka = await prostokat(k.locator('.vilda-gh-summary-badge'));
  const cichy = await prostokat(k.locator('.vilda-kg-cichy'));
  const glowa = await prostokat(k.locator(':scope > .vilda-gh-summary-head'));
  expect(cichy.t, 'cichy tekst pod znacznikiem').toBeGreaterThanOrEqual(odznaka.b - 1);
  expect(Math.abs(cichy.l - glowa.l), 'cichy tekst od lewej krawędzi nagłówka').toBeLessThan(2);

  const zakladkiKarty = k.locator('.vilda-kg-seg [role="tab"]');
  const gory = await zakladkiKarty.evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
  expect(new Set(gory).size, 'przełącznik w jednym wierszu').toBe(1);
  const seg = await k.locator('.vilda-kg-seg').evaluate((s) => ({ w: s.scrollWidth, c: s.clientWidth, r: s.getBoundingClientRect().right, k: s.parentElement.getBoundingClientRect().right }));
  expect(seg.w, 'przełącznik bez przewijania w bok').toBeLessThanOrEqual(seg.c + 1);
  expect(seg.r).toBeLessThanOrEqual(seg.k);

  const kafelki = await k.locator('.vilda-ko-kafel').evaluateAll((ts) => ts.map((t) => { const r = t.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
  expect(new Set(kafelki.map((x) => x[1])).size, 'kafelki 2 × 2: dwa wiersze').toBe(2);
  expect(new Set(kafelki.map((x) => x[0])).size, 'kafelki 2 × 2: dwie kolumny').toBe(2);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);

  await widokGh(page, 'trend').click();
  const ramka = k.locator('.vilda-kg-ramka');
  await expect(ramka.locator('svg')).toBeVisible();
  await expect.poll(() => ramka.locator('tr').count()).toBeGreaterThan(1);
  const r = await prostokat(ramka);
  const svg = await prostokat(ramka.locator('svg'));
  const tabela = await prostokat(ramka.locator('table'));
  expect(svg.r, 'wykres w ramce').toBeLessThanOrEqual(r.r + 1);
  expect(tabela.r, 'tabela w ramce').toBeLessThanOrEqual(r.r + 1);
  expect(await bezPrzewijaniaWBok(page), 'trend bez poziomego przewijania strony').toBe(true);

  await widokGh(page, 'analiza').click();
  await expect(k.locator('.vilda-gha-panel')).toBeVisible();
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
}

test.describe('Karta pacjenta — karta leczenia GH (telefon)', () => {
  test('KGM-1 G1: cichy tekst pod znacznikiem, przełącznik w jednym wierszu, kafelki 2 × 2, trend i tabela bez przewijania w bok', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, G1);
    await karta(page, pid);
    await zakladki(page).filter({ hasText: 'Leczenie' }).click();
    await expect(kartaGh(page)).toBeVisible();
    const opis = await opisKartyGh(page);
    expect(opis).toEqual(expect.objectContaining({ przelacznik: ['Przegląd', 'Trend dawki', 'Analiza'], wybrany: 'Przegląd', cichy: 'Program SNP · 7 punktów kontrolnych' }));
    expect(opis.kafelki).toEqual([['Preparat i dawka', '0,033 mg/kg/d', 'Genotropin 12 mg'], ['Czas leczenia', '36 mies.', 'od 7 l. 0 mies.'],
      ['Tempo wzrastania', '6,2 cm/rok', 'ost. okres (z 6 mies.)'], ['Odpowiedź (ΔhSDS)', '+1,47', 'hSDS −2,87 → −1,40']]);
    await sprawdzUklad(page);
  });

  test('KGM-2 wznowienie (R1): „kurs 2 z 2”, „2 punkty kontrolne w kursie (5 łącznie)” pod znacznikiem, ten sam układ', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, R1);
    await karta(page, pid);
    await zakladki(page).filter({ hasText: 'Leczenie' }).click();
    await expect(kartaGh(page)).toBeVisible();
    await expect(kartaGh(page).locator('.vilda-gh-summary-head .vilda-gh-summary-chip')).toHaveText(['aktywne', 'kurs 2 z 2']);
    expect((await opisKartyGh(page)).cichy).toBe('Program SNP · 2 punkty kontrolne w kursie (5 łącznie)');
    await sprawdzUklad(page);
  });
});
