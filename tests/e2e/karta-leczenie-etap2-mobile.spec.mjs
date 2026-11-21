import { expect, test } from '../support/test-czas.mjs';
import { O1, O2, O2_DZIENNIK, bezPrzewijaniaWBok, karta, kartaOtylosci, opisKarty, otworz, widokKarty, zakladki, zapisz, zapiszZDziennikiem } from '../support/karta-leczenie.mjs';

// P-KARTA-LECZENIE, etap 2 — telefon (projekt mobile-chromium; makieta hybrydy 2026-11-19). Nagłówek karty: znacznik
// i stan po lewej (stan pod znacznikiem), „+ Kontynuacja” 44 px po prawej; przełącznik w jednym wierszu, bez przewijania
// w bok; kafelki 2 × 2; linia oceny w kolumnie („Szczegóły oceny” pod tekstem); przyciski wpisów 44 px jak dotąd.
// Dane wyłącznie FIKCYJNE; sejf zakładany w teście.
test.use({ serviceWorkers: 'block', chwila: '2026-11-19T11:00:00Z' });

const prostokat = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height }; });

test.describe('Karta pacjenta — karta leczenia otyłości (telefon)', () => {
  test('KOM-1 O1: nagłówek z „+ Kontynuacja” 44 px po prawej, przełącznik w jednym wierszu, kafelki 2 × 2, linia oceny w kolumnie', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, O1);
    await karta(page, pid);
    await zakladki(page).filter({ hasText: 'Leczenie' }).click();
    const k = kartaOtylosci(page);
    await expect(k).toBeVisible();

    const odznaka = await prostokat(k.locator('.vilda-gh-summary-badge'));
    const stan = await prostokat(k.locator('.vilda-gh-summary-chip'));
    const dodaj = await prostokat(k.getByRole('button', { name: 'Kontynuacja' }));
    expect(dodaj.h, '„+ Kontynuacja” 44 px').toBeGreaterThanOrEqual(44);
    expect(dodaj.l, '„+ Kontynuacja” po prawej od znacznika').toBeGreaterThanOrEqual(odznaka.r);
    expect(dodaj.t, '„+ Kontynuacja” w wierszu znacznika').toBeLessThan(odznaka.b);
    expect(stan.t, 'stan pod znacznikiem').toBeGreaterThanOrEqual(odznaka.b - 1);

    const zakladkiKarty = k.locator('.vilda-ko-seg [role="tab"]');
    await expect(zakladkiKarty).toHaveText(['Przegląd', 'Wpisy (2)', 'Analiza']);
    const gory = await zakladkiKarty.evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
    expect(new Set(gory).size, 'przełącznik w jednym wierszu').toBe(1);
    const seg = await k.locator('.vilda-ko-seg').evaluate((s) => ({ w: s.scrollWidth, c: s.clientWidth, r: s.getBoundingClientRect().right, k: s.parentElement.getBoundingClientRect().right }));
    expect(seg.w).toBeLessThanOrEqual(seg.c + 1);
    expect(seg.r).toBeLessThanOrEqual(seg.k);
    expect(await bezPrzewijaniaWBok(page)).toBe(true);

    const kafelki = await k.locator('.vilda-ko-kafel').evaluateAll((ts) => ts.map((t) => { const r = t.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
    expect(new Set(kafelki.map((x) => x[1])).size, 'kafelki 2 × 2: dwa wiersze').toBe(2);
    expect(new Set(kafelki.map((x) => x[0])).size, 'kafelki 2 × 2: dwie kolumny').toBe(2);
    expect((await opisKarty(page)).kafelki).toEqual([['Aktualna dawka', '2,4 mg', '1×/tydz. · od 10.11.2026'], ['Czas leczenia', '20 tyg.', 'od 23.06.2026 (17 l. 6 mies.)'],
      ['Masa', '84 kg', '−7,9 kg (−8,6%) od włączenia'], ['BMI', '34,1', '−8,6% od włączenia · próg ChPL ≥5%']]);
    // podpis, który się nie mieści, łamie się na granicy części (bez wiszącego „·”)
    await expect(k.locator('.vilda-ko-kafel').nth(3).locator('.vilda-ko-sub')).toHaveClass(/vilda-ko-sub--stos/);
    await expect(k.locator('.vilda-ko-kafel').nth(3).locator('.vilda-ko-sep')).toBeHidden();

    const opis = await prostokat(k.locator('.vilda-ko-werdykt-d'));
    const link = k.getByRole('button', { name: 'Szczegóły oceny' });
    const l = await prostokat(link);
    expect(l.t, '„Szczegóły oceny” pod tekstem').toBeGreaterThanOrEqual(opis.b - 12);
    expect(l.h).toBeGreaterThanOrEqual(44);
    await link.click();
    await expect(widokKarty(page, 'analiza')).toHaveAttribute('aria-selected', 'true');
    await expect(k.locator('.vilda-oba-verdict')).toBeVisible();
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });

  test('KOM-2 Wpisy: „Jak działa…” rozwija akapity; przyciski wpisów 44 px; zapis wpisu z „Wpisów” zostawia „Wpisy (8)”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapiszZDziennikiem(page, O2, O2_DZIENNIK);
    await karta(page, pid);
    await zakladki(page).filter({ hasText: 'Leczenie' }).click();
    const k = kartaOtylosci(page);
    await widokKarty(page, 'wpisy').click();
    const jak = k.getByRole('button', { name: 'Jak działa dziennik leczenia' });
    expect((await prostokat(jak)).h).toBeGreaterThanOrEqual(44);
    await expect(k.locator('.vdo-intro')).toBeHidden();
    await jak.click();
    await expect(k.locator('.vdo-intro')).toBeVisible();
    await expect(k.locator('.vdo-jak-tresc .vdo-hint')).toHaveCount(2);
    for (const h of await k.locator('.vdo-row-actions .vdo-btn').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
    expect(await bezPrzewijaniaWBok(page)).toBe(true);

    await k.getByRole('button', { name: 'Kontynuacja' }).click();
    const okno = page.locator('.vdo-dialog');
    await expect(okno).toBeVisible();
    await okno.locator('#vdoDate').fill('2026-11-17');
    await okno.locator('#vdoW').fill('79,1');
    await okno.getByRole('radiogroup', { name: 'Kto zmierzył masę' }).getByRole('radio', { name: 'Pacjent' }).click();
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(okno).toBeHidden();
    await expect(widokKarty(page, 'wpisy')).toHaveText('Wpisy (8)');
    expect(await opisKarty(page)).toEqual(expect.objectContaining({ wybrany: 'Wpisy (8)', widoczne: ['wpisy'] }));
    await expect(k.locator('.vdo-jak')).toHaveAttribute('aria-expanded', 'true');
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });
});
