import { expect, test } from '../support/test-czas.mjs';
import { BEZ, G1, O1, X1, aktywna, bezPrzewijaniaWBok, karta, opisPaska, otworz, paski, polozenieZakladek, tresc, uGory, zakladki, zapisz } from '../support/karta-leczenie.mjs';

// P-KARTA-LECZENIE, etap 1 (decyzje właściciela 2026-11-19, D1–D5; docs/KARTA_LECZENIE_PLAN.md). Karta pacjenta na
// PRAWDZIWEJ stronie (komputer): bloki leczenia w zakładce „Leczenie” (druga, po „Status”), nad paskiem zakładek pasek
// leczenia — przycisk otwierający zakładkę. Pacjenci jak na zaakceptowanej makiecie: O1 (nastolatka na Wegovy, 2 punkty,
// przed oknem oceny), G1 (chłopiec na GH, 7 punktów), X1 (GH zakończone + Wegovy trwa) i pacjent bez leczenia.
// Dane wyłącznie FIKCYJNE; sejf zakładany w teście.
test.use({ serviceWorkers: 'block', chwila: '2026-11-19T11:00:00Z' });

test.describe('Karta pacjenta — zakładka „Leczenie” i pasek leczenia (komputer)', () => {
  test('KL-1 O1: Status pod zakładkami, pasek z wartościami i pigułką; klik → „Leczenie”; „+ Kontynuacja” przebudowuje grupę w zakładce i pasek', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, O1);
    await karta(page, pid);

    // Status domyślnie; siedem zakładek, „Leczenie” druga; bloki leczenia schowane w zakładce, nad zakładkami tylko pasek.
    await expect(zakladki(page)).toHaveText(['Status', 'Leczenie', 'Siatki centylowe', 'Notatki', 'Historia', 'Badania', 'Plany opieki']);
    await expect(aktywna(page)).toHaveText('Status');
    await expect(tresc(page, 'antro')).toBeVisible();
    await expect(tresc(page, 'leczenie')).toBeHidden();
    await expect(page.locator('.vdo')).toBeHidden();
    await expect(page.locator('.vilda-auth-patient-card > .vilda-gh-summary, .vilda-auth-patient-card > .vilda-ob-dz')).toHaveCount(0);
    const kolejnosc = await page.evaluate(() => [...document.querySelector('.vilda-auth-patient-card').children]
      .map((c) => c.className.split(' ')[0]).filter((c) => /hero|kl-paski|patient-tabs$/.test(c)));
    expect(kolejnosc).toEqual(['vilda-patient-hero', 'vilda-kl-paski', 'vilda-patient-tabs']);

    await expect(paski(page)).toHaveCount(1);
    const pasek = page.getByRole('button', { name: 'Leczenie otyłości — Wegovy: otwórz zakładkę Leczenie' });
    await expect(pasek).toBeVisible();
    expect(await opisPaska(pasek)).toEqual({ odznaka: 'Leczenie otyłości — Wegovy', stan: 'aktywne', wartosci: '2,4 mg · 20 tyg. · BMI −8,6%',
      pigulka: '⏳ oceń po 12 tyg.', pominiete: '0', wysokosc: expect.any(Number) });
    const opis = await opisPaska(pasek);
    expect(opis.wysokosc, 'komputer: jedna linia, ok. 52 px').toBeLessThanOrEqual(56);
    await expect(pasek.locator('.vilda-kl-pasek-idz')).toHaveText('Leczenie →');
    await expect(pasek.locator('.vilda-kl-pasek-idz')).toBeVisible();
    await expect(pasek.locator('.vilda-kl-pasek-chev')).toBeHidden();
    expect(await bezPrzewijaniaWBok(page)).toBe(true);

    // Klik paska: zakładka „Leczenie”, pasek zakładek w tym samym miejscu Karty, przewinięcie do początku zawartości.
    const przed = await polozenieZakladek(page);
    await pasek.click();
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(tresc(page, 'leczenie')).toBeVisible();
    await expect(tresc(page, 'antro')).toBeHidden();
    await expect.poll(async () => (await polozenieZakladek(page)).naEkranie, { message: 'pasek zakładek u góry widoku' }).toBeLessThan(40);
    expect((await polozenieZakladek(page)).wKarcie, 'D4: pasek zakładek nie zmienia położenia w Karcie').toBe(przed.wKarcie);
    await expect(paski(page), 'pasek leczenia zostaje nad zakładkami').toHaveCount(1);

    // Bloki działają w zakładce: podsumowanie, „Wpisy leczenia”, „Dane analityczne — otyłość” z oceną.
    const lecz = tresc(page, 'leczenie');
    await expect(lecz.locator('.vilda-gh-summary-badge')).toHaveText('Leczenie otyłości — Wegovy');
    await expect(lecz.locator('.vdo-list:not(.vdo-list-deleted) > .vdo-item')).toHaveCount(2);
    await lecz.locator('.vilda-gha-btn', { hasText: 'Dane analityczne — otyłość' }).click();
    await expect(lecz.locator('.vilda-oba-verdict .vilda-oba-vt')).toHaveText('Przed oknem oceny — oceń po 12 tyg.');

    // „+ Kontynuacja” otwiera okno; zapis wpisu przebudowuje grupę W ZAKŁADCE i odświeża pasek.
    await lecz.getByRole('button', { name: 'Kontynuacja' }).click();
    const okno = page.getByRole('dialog', { name: /Nowy wpis leczenia/ });
    await expect(okno).toBeVisible();
    await okno.locator('#vdoDate').fill('2026-11-17');
    await okno.locator('#vdoW').fill('82,5');
    await okno.locator('#vdoH').fill('157');
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(okno).toBeHidden();
    await expect(lecz.locator('.vdo-list:not(.vdo-list-deleted) > .vdo-item')).toHaveCount(3);
    await expect(page.locator('.vilda-auth-patient-card .vdo')).toHaveCount(1);
    await expect(page.locator('.vilda-auth-patient-card > .vilda-ob-dz, .vilda-auth-patient-card > .vilda-gh-summary')).toHaveCount(0);
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(paski(page)).toHaveCount(1);
    await expect(paski(page).locator('.vilda-kl-pasek-t')).toHaveText('2,4 mg · 21 tyg. · BMI −10,2%');
    await expect(paski(page).locator('.vilda-kl-pigulka')).toHaveText('⏳ oceń po 12 tyg.');
    expect((await polozenieZakladek(page)).wKarcie).toBe(przed.wKarcie);
  });

  test('KL-2 G1: pasek GH (dawka, czas od Włączenia, tempo, ΔhSDS), bez pigułki; klik → bloki GH w zakładce', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await zapisz(page, G1);
    await karta(page, pid);
    await expect(paski(page)).toHaveCount(1);
    const pasek = page.getByRole('button', { name: 'Leczony hormonem wzrostu (rhGH): otwórz zakładkę Leczenie' });
    const opis = await opisPaska(pasek);
    expect(opis).toEqual(expect.objectContaining({ odznaka: 'Leczony hormonem wzrostu (rhGH)', stan: 'aktywne',
      wartosci: '0,033 mg/kg/d · 36 mies. · tempo 6,2 cm/rok · ΔhSDS +1,47', pigulka: null, pominiete: '0' }));
    expect(opis.wysokosc).toBeLessThanOrEqual(56);
    await expect(page.locator('.vilda-gha-btn')).toBeHidden();
    await pasek.click();
    await expect(aktywna(page)).toHaveText('Leczenie');
    const lecz = tresc(page, 'leczenie');
    await expect(lecz.locator('.vilda-gh-summary-badge')).toHaveText('Leczony hormonem wzrostu (rhGH)');
    await lecz.locator('.vilda-gha-btn').click();
    const panel = lecz.locator('.vilda-gha-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Tempo wzrastania6,2 cm/rok');
    await expect(panel).toContainText('Odpowiedź (ΔhSDS)+1,47');
    // „Trend leczenia GH” zostaje w „Siatkach centylowych” (etap 3).
    await expect(lecz.getByText('Trend leczenia GH')).toHaveCount(0);
  });

  test('KL-3 X1: otyłość trwająca nad zakończonym GH — paski i bloki w tej kolejności; klik drugiego paska → jego blok', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await zapisz(page, X1);
    await karta(page, pid);
    await expect(paski(page)).toHaveCount(2);
    const [ob, gh] = [await opisPaska(paski(page).nth(0)), await opisPaska(paski(page).nth(1))];
    expect(ob).toEqual(expect.objectContaining({ odznaka: 'Leczenie otyłości — Wegovy', stan: 'aktywne', wartosci: '2,4 mg · 20 tyg. · BMI −7,4%', pigulka: '⏳ oceń po 12 tyg.' }));
    expect(gh).toEqual(expect.objectContaining({ odznaka: 'Leczony hormonem wzrostu (rhGH)', stan: 'leczenie zakończone', pigulka: null }));
    expect(gh.wartosci.startsWith('0,025 mg/kg/d · 72 mies. · tempo 6,8 cm/rok')).toBe(true);
    const bloki = tresc(page, 'leczenie').locator('.vilda-gh-summary-badge');
    await expect(bloki).toHaveText(['Leczenie otyłości — Wegovy', 'Leczony hormonem wzrostu (rhGH)']);

    await paski(page).nth(1).click();
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect.poll(() => uGory(page, () => [...document.querySelectorAll('.vilda-patient-tab-content[data-tab="leczenie"] .vilda-gh-summary')]
      .find((x) => x.textContent.includes('hormonem wzrostu'))), { message: 'podsumowanie GH u góry widoku' }).toBe(true);
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });

  test('KL-4 pacjent bez leczenia: sześć zakładek, bez paska; prośba o „leczenie” → Status', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await zapisz(page, BEZ);
    await karta(page, pid);
    await expect(zakladki(page)).toHaveText(['Status', 'Siatki centylowe', 'Notatki', 'Historia', 'Badania', 'Plany opieki']);
    await expect(page.locator('.vilda-kl-pasek, .vilda-kl-paski, [data-tab="leczenie"]')).toHaveCount(0);
    const zaNaglowkiem = await page.evaluate(() => document.querySelector('.vilda-patient-hero').nextElementSibling.className);
    expect(zaNaglowkiem).toBe('vilda-patient-tabs');
    await karta(page, pid, { activeTab: 'leczenie' });
    await expect(aktywna(page)).toHaveText('Status');
    await expect(tresc(page, 'antro')).toBeVisible();
  });

  test('KL-5 przywrócenie zakładki „Leczenie”: opcja activeTab, powrót „wstecz” i odświeżenie po synchronizacji', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, O1);
    await karta(page, pid, { activeTab: 'leczenie' });
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(tresc(page, 'leczenie').locator('.vdo')).toBeVisible();

    // Inna zakładka, potem „wstecz”: stan nawigacji Karty wraca do „Leczenie” (xa.restoreTab).
    await zakladki(page).filter({ hasText: 'Notatki' }).click();
    await expect(aktywna(page)).toHaveText('Notatki');
    await page.waitForFunction(() => Boolean(history.state && history.state.vildaNavSentinel));
    await page.goBack();
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(tresc(page, 'leczenie')).toBeVisible();

    // Synchronizacja z innego urządzenia zmienia rekord — Karta rysuje się od nowa na zakładce „Leczenie”.
    await page.evaluate(async (id) => {
      const rek = await window.VildaVault.getPatient(id);
      const payload = JSON.parse(JSON.stringify(rek.snapshots[0].payload));
      payload.obesityTherapyPoints[1].weight = 83;
      await window.VildaVault.savePatient(payload, { patientId: id, dedup: false });
      window.__klKartaPrzed = document.querySelector('.vilda-auth-patient-card');
      document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
    }, pid);
    await expect.poll(() => page.evaluate(() => {
      const k = document.querySelector('.vilda-auth-patient-card');
      return Boolean(k && k !== window.__klKartaPrzed);
    }), { message: 'Karta przebudowana po synchronizacji', timeout: 15000 }).toBe(true);
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(tresc(page, 'leczenie')).toBeVisible();
    await expect(paski(page).locator('.vilda-kl-pasek-t')).toHaveText('2,4 mg · 20 tyg. · BMI −9,7%');
  });

  test('KL-6 Notatki: „Wpisy leczenia otyłości (N) — Leczenie →” otwiera zakładkę „Leczenie” i przewija do „Wpisy leczenia”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, O1);
    // Wpis dziennika (Kontynuacja od pacjenta) zapisany jak z okna „+ Kontynuacja”.
    await page.evaluate(async (id) => {
      const D = window.VildaDziennikOtylosci;
      const migawka = (await window.VildaVault.getPatient(id)).snapshots[0].payload.obesityTherapyPoints;
      const plan = D.planNowego(await D.wczytaj(id, migawka), id, { type: 'continue', dateISO: '2026-11-17', ageYears: 17, ageMonths: 11,
        weight: 82.5, weightSource: 'pacjent', height: null, heightSource: null, drug: migawka[1].drug, substance: migawka[1].substance, dose: '2,4 mg' });
      await D.zapisz(id, plan.wersje);
    }, pid);
    await karta(page, pid);
    await zakladki(page).filter({ hasText: 'Notatki' }).click();
    const link = tresc(page, 'notes').getByRole('button', { name: /Wpisy leczenia otyłości \(\d+\) — Leczenie →/ });
    await expect(link).toBeVisible();
    await link.click();
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(tresc(page, 'leczenie').locator('.vdo')).toBeVisible();
    await expect.poll(() => uGory(page, () => document.querySelector('.vdo')), { message: '„Wpisy leczenia” u góry widoku' }).toBe(true);
    await expect(page.locator('.vdo .vdo-title')).toBeFocused();
  });
});
