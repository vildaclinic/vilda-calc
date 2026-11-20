import { expect, test } from '../support/test-czas.mjs';
import { BEZ, G1, O1, R1, X1, aktywna, bezPrzewijaniaWBok, karta, otworz, paski, pasyGh, polozenieZakladek, tresc, zakladki, zapisz } from '../support/karta-leczenie.mjs';

// P-KARTA-LECZENIE, etap 1 — telefon (projekt mobile-chromium). D3: siedem zakładek w istniejącej siatce 2 + 2 + 2 + 1;
// pasek leczenia w dwóch liniach (1: znacznik + stan; 2: wartości + pigułka), „›” po prawej, bez „Leczenie →”; gdy linia 2
// się nie mieści — odpadają ostatnie części wartości (nigdy pigułka), tekst nie mniejszy niż 12,8 px. Brak przewijania
// w bok. Dane wyłącznie FIKCYJNE; sejf zakładany w teście.
test.use({ serviceWorkers: 'block', chwila: '2026-11-19T11:00:00Z' });

/** Geometria paska: linie (górne krawędzie i wysokości), rozmiar tekstu wartości, widoczność „›” i „Leczenie →”. */
const geometriaPaska = (pasek) => pasek.evaluate((b) => {
  const r = (s) => b.querySelector(s).getBoundingClientRect();
  const widoczny = (s) => getComputedStyle(b.querySelector(s)).display !== 'none';
  const l1 = r('.vilda-kl-pasek-l1'), l2 = r('.vilda-kl-pasek-l2'), chev = r('.vilda-kl-pasek-chev'), bb = b.getBoundingClientRect();
  const l2el = b.querySelector('.vilda-kl-pasek-l2');
  return {
    dwieLinie: l2.top >= l1.bottom - 1 && Math.round(l1.height) <= 30 && Math.round(l2.height) <= 30,
    wysokosc: Math.round(bb.height),
    czcionka: parseFloat(getComputedStyle(b.querySelector('.vilda-kl-pasek-t')).fontSize),
    wartosci: b.querySelector('.vilda-kl-pasek-t').textContent,
    pominiete: Number(b.getAttribute('data-pominiete')),
    pigulka: b.querySelector('.vilda-kl-pigulka') ? b.querySelector('.vilda-kl-pigulka').textContent : null,
    wylewa: l2el.scrollWidth > l2el.clientWidth + 1,
    strzalka: widoczny('.vilda-kl-pasek-chev'),
    strzalkaWPionie: Math.abs((chev.top + chev.bottom) / 2 - (bb.top + bb.bottom) / 2) <= 4,
    idz: widoczny('.vilda-kl-pasek-idz'),
  };
});

test.describe('Karta pacjenta — zakładka „Leczenie” i pasek leczenia (telefon)', () => {
  test('KLM-1 O1: pasek w dwóch liniach, 7 zakładek 2+2+2+1, bez przewijania w bok; klik → „Leczenie”, „+ Kontynuacja” otwiera okno', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, O1);
    await karta(page, pid);
    await expect(aktywna(page)).toHaveText('Status');
    await expect(paski(page)).toHaveCount(1);
    const pasek = page.getByRole('button', { name: 'Leczenie otyłości — Wegovy: otwórz zakładkę Leczenie' });
    await expect.poll(() => geometriaPaska(pasek).then((g) => g.dwieLinie)).toBe(true);
    const g = await geometriaPaska(pasek);
    expect(g).toEqual(expect.objectContaining({ wartosci: '2,4 mg · 20 tyg. · BMI −8,6%', pominiete: 0, pigulka: '⏳ oceń po 12 tyg.',
      wylewa: false, strzalka: true, strzalkaWPionie: true, idz: false }));
    expect(g.czcionka).toBeGreaterThanOrEqual(12.8);
    expect(g.wysokosc, 'dwie linie, nie trzy').toBeLessThanOrEqual(82);

    // D3: siedem zakładek w siatce 2 + 2 + 2 + 1 (ostatnia na całą szerokość).
    await expect(zakladki(page)).toHaveText(['Status', 'Leczenie', 'Siatki centylowe', 'Notatki', 'Historia', 'Badania', 'Plany opieki']);
    const rzedy = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.vilda-patient-tabs > .vilda-patient-tab')].map((x) => x.getBoundingClientRect());
      const wiersze = [];
      t.forEach((r) => { const w = wiersze.find((x) => Math.abs(x.top - r.top) < 4); if (w) w.n += 1; else wiersze.push({ top: r.top, n: 1, szer: r.width }); });
      const pasekZ = document.querySelector('.vilda-patient-tabs').getBoundingClientRect();
      return { wiersze: wiersze.map((w) => w.n), ostatniaNaCalosc: t[6].width > pasekZ.width * 0.9 };
    });
    expect(rzedy).toEqual({ wiersze: [2, 2, 2, 1], ostatniaNaCalosc: true });
    expect(await bezPrzewijaniaWBok(page)).toBe(true);

    const przed = await polozenieZakladek(page);
    await pasek.click();
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(tresc(page, 'leczenie')).toBeVisible();
    expect((await polozenieZakladek(page)).wKarcie, 'D4: pasek zakładek nie zmienia położenia w Karcie').toBe(przed.wKarcie);
    const dodaj = tresc(page, 'leczenie').getByRole('button', { name: 'Kontynuacja' });
    await expect(dodaj).toBeVisible();
    await dodaj.click();
    await expect(page.getByRole('dialog', { name: /Nowy wpis leczenia/ })).toBeVisible();
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });

  test('KLM-2 G1: pasek GH w dwóch liniach — ostatnie części wartości odpadają, tekst ≥ 12,8 px, bez pigułki', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await zapisz(page, G1);
    await karta(page, pid);
    const pasek = page.getByRole('button', { name: 'Leczony hormonem wzrostu (rhGH): otwórz zakładkę Leczenie' });
    await expect.poll(() => geometriaPaska(pasek).then((g) => g.dwieLinie)).toBe(true);
    const g = await geometriaPaska(pasek);
    expect(g).toEqual(expect.objectContaining({ pigulka: null, wylewa: false, strzalka: true, idz: false }));
    expect(g.czcionka).toBeGreaterThanOrEqual(12.8);
    expect(g.wysokosc).toBeLessThanOrEqual(82);
    // Pełne wartości to „0,033 mg/kg/d · 36 mies. · tempo 6,2 cm/rok · ΔhSDS +1,47” — na telefonie zostaje ich początek.
    const pelne = ['0,033 mg/kg/d', '36 mies.', 'tempo 6,2 cm/rok', 'ΔhSDS +1,47'];
    expect(g.wartosci).toBe(pelne.slice(0, pelne.length - g.pominiete).join(' · '));
    expect(g.pominiete).toBeLessThanOrEqual(2);
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });

  test('KLM-3 X1: dwa paski (otyłość trwająca nad zakończonym GH), wartości bez wylewania; pacjent bez leczenia: 6 zakładek, bez paska', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, X1);
    await karta(page, pid);
    await expect(paski(page)).toHaveCount(2);
    await expect(paski(page).locator('.vilda-kl-pasek-odznaka')).toHaveText(['Leczenie otyłości — Wegovy', 'Leczony hormonem wzrostu (rhGH)']);
    await expect(paski(page).locator('.vilda-kl-pasek-stan')).toHaveText(['aktywne', 'leczenie zakończone']);
    // Otyłość: dwie linie. GH zakończone: „Leczony hormonem wzrostu (rhGH)” + „leczenie zakończone” nie mieszczą się
    // w jednym wierszu 393 px — stan schodzi pod znacznik (linia 1 się zawija); linia wartości nadal się mieści.
    await expect.poll(() => geometriaPaska(paski(page).nth(0)).then((g) => g.dwieLinie)).toBe(true);
    for (let n = 0; n < 2; n += 1) {
      const g = await geometriaPaska(paski(page).nth(n));
      expect(g).toEqual(expect.objectContaining({ wylewa: false, strzalka: true, idz: false }));
      expect(g.czcionka).toBeGreaterThanOrEqual(12.8);
    }
    await expect(paski(page).nth(0).locator('.vilda-kl-pigulka')).toHaveText('⏳ oceń po 12 tyg.');
    expect(await bezPrzewijaniaWBok(page)).toBe(true);

    const bez = await zapisz(page, BEZ);
    await karta(page, bez);
    await expect(zakladki(page)).toHaveCount(6);
    await expect(page.locator('.vilda-kl-pasek, [data-tab="leczenie"]')).toHaveCount(0);
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });

  // P-GH-WZNOWIENIE, część 1: GR1 na telefonie — pasek aktywny w dwóch liniach, „kurs 2 z 2”, dwa pasy GH na siatkach.
  test('KLM-4 R1 (GR1 wznowienie): pasek „aktywne” w dwóch liniach, „kurs 2 z 2” w zakładce, dwa pasy GH, bez przewijania w bok', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, R1);
    await karta(page, pid);
    const pasek = page.getByRole('button', { name: 'Leczony hormonem wzrostu (rhGH): otwórz zakładkę Leczenie' });
    await expect.poll(() => geometriaPaska(pasek).then((g) => g.dwieLinie)).toBe(true);
    const g = await geometriaPaska(pasek);
    expect(g).toEqual(expect.objectContaining({ pigulka: null, wylewa: false, strzalka: true, idz: false }));
    expect(g.czcionka).toBeGreaterThanOrEqual(12.8);
    const pelne = ['0,033 mg/kg/d', '12 mies.', 'tempo 7 cm/rok', 'ΔhSDS +0,37'];
    expect(g.wartosci).toBe(pelne.slice(0, pelne.length - g.pominiete).join(' · '));
    expect(g.pominiete).toBeLessThanOrEqual(2);
    await expect(pasek.locator('.vilda-kl-pasek-stan')).toHaveText('aktywne');
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
    await pasek.click();
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(tresc(page, 'leczenie').locator('.vilda-gh-summary-head .vilda-gh-summary-chip')).toHaveText(['aktywne', 'kurs 2 z 2']);
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
    await page.locator('.vilda-patient-tab[data-tab="traj"]').click();
    await expect(page.locator('.vilda-siatka-charts svg.vilda-patient-chart').first()).toBeVisible();
    expect((await pasyGh(page)).height).toEqual({ pasy: 2, etykiety: 2 });
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });
});
