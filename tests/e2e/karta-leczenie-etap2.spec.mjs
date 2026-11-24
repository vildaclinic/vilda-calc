import { expect, test } from '../support/test-czas.mjs';
import {
  G1, O1, O2, O2_DZIENNIK, O_OSTATNI_BEZ_WZROSTU, X1, aktywna, bezPrzewijaniaWBok, karta, kartaOtylosci, opisKarty, otworz, paski, tresc, uGory, widokKarty, zakladki,
  zapisz, zapiszZDziennikiem,
} from '../support/karta-leczenie.mjs';

// P-KARTA-LECZENIE, etap 2 (makieta hybrydy zaakceptowana 2026-11-19, „zaczynaj etap 2” 2026-11-21;
// docs/KARTA_LECZENIE_PLAN.md). Karta pacjenta na PRAWDZIWEJ stronie (komputer): grupa leczenia otyłości w zakładce
// „Leczenie” jest jedną kartą leczenia z „+ Kontynuacja” w nagłówku i przełącznikiem „Przegląd | Wpisy (N) | Analiza”.
// Dane wyłącznie FIKCYJNE; sejf zakładany w teście.
test.use({ serviceWorkers: 'block', chwila: '2026-11-19T11:00:00Z' });

const O1_PRZEGLAD = [['Aktualna dawka', '2,4 mg', '1×/tydz. · od 10.11.2026'], ['Czas leczenia', '20 tyg.', 'od 23.06.2026 (17 l. 6 mies.)'],
  ['Masa', '84 kg', '−7,9 kg (−8,6%) od włączenia'], ['BMI', '34,1', '−8,6% od włączenia · próg ChPL ≥5%']];
const O1_LINIA = '⏳Przed oknem oceny — oceń po 12 tyg.Obecnie 4. tydz. stosowania dawki podtrzymującej.Szczegóły oceny';

async function leczenie(page) {
  await zakladki(page).filter({ hasText: 'Leczenie' }).click();
  await expect(kartaOtylosci(page)).toBeVisible();
}
async function kontynuacja(page, { data, masa, wzrost }) {
  await kartaOtylosci(page).getByRole('button', { name: 'Kontynuacja' }).click();
  const okno = page.getByRole('dialog', { name: /Nowy wpis leczenia/ });
  await expect(okno).toBeVisible();
  await okno.locator('#vdoDate').fill(data);
  await okno.locator('#vdoW').fill(masa);
  if (wzrost) await okno.locator('#vdoH').fill(wzrost);
  await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
  await expect(okno).toBeHidden();
}
const wpisy = (page) => page.locator('.vilda-ko-karta .vdo-list:not(.vdo-list-deleted) > .vdo-item');

test.describe('Karta pacjenta — karta leczenia otyłości z przełącznikiem (komputer)', () => {
  test('KO-1 O1: nagłówek z „+ Kontynuacja”, „Przegląd” (4 kafelki 1 × 4, linia oceny), „Szczegóły oceny” → „Analiza”, „Wpisy (2)”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, O1);
    await karta(page, pid);
    await leczenie(page);
    const k = kartaOtylosci(page);

    // Nagłówek: znacznik, stan, „+ Kontynuacja” po prawej; bez pól podsumowania (Lek, Substancja, Włączenie, …).
    await expect(k.locator('.vilda-gh-summary-head > .vilda-gh-summary-badge')).toHaveText('Leczenie otyłości — Wegovy');
    await expect(k.locator('.vilda-gh-summary-head > .vilda-gh-summary-chip')).toHaveText('aktywne');
    const dodaj = k.locator('.vilda-gh-summary-head').getByRole('button', { name: 'Kontynuacja' });
    await expect(dodaj).toBeVisible();
    await expect(k.locator('.vilda-gh-summary-grid')).toHaveCount(0);
    const uklad = await k.evaluate((el) => {
      const r = (s) => el.querySelector(s).getBoundingClientRect();
      return { karta: r(':scope > .vilda-gh-summary-head').right, przycisk: r('.vdo-add').right, odznaka: r('.vilda-gh-summary-badge').right, przyciskL: r('.vdo-add').left };
    });
    expect(uklad.karta - uklad.przycisk, '„+ Kontynuacja” przy prawej krawędzi').toBeLessThan(2);
    expect(uklad.przyciskL).toBeGreaterThan(uklad.odznaka);

    // Przełącznik i „Przegląd”.
    expect(await opisKarty(page)).toEqual({ przelacznik: ['Przegląd', 'Wpisy (2)', 'Analiza'], wybrany: 'Przegląd', widoczne: ['przeglad'],
      kafelki: O1_PRZEGLAD, linia: O1_LINIA });
    await expect(page.getByRole('tablist', { name: /Leczenie otyłości/ })).toBeVisible();
    await expect(widokKarty(page, 'przeglad')).toHaveAttribute('aria-selected', 'true');
    const kafelki = await k.locator('.vilda-ko-kafel').evaluateAll((ts) => ts.map((t) => Math.round(t.getBoundingClientRect().top)));
    expect(new Set(kafelki).size, 'komputer: kafelki 1 × 4').toBe(1);
    await expect(k.locator('.vilda-ko-werdykt')).toHaveCSS('border-top-style', 'dashed');
    await expect(k.locator('.vdo')).toBeHidden();
    await expect(k.locator('.vilda-gha-panel')).toBeHidden();

    // „Szczegóły oceny” → „Analiza”, pole oceny u góry widoku; panel bez belki „Dane analityczne — otyłość”.
    await k.getByRole('button', { name: 'Szczegóły oceny' }).click();
    await expect(widokKarty(page, 'analiza')).toHaveAttribute('aria-selected', 'true');
    const pole = k.locator('.vilda-oba-verdict');
    await expect(pole).toBeVisible();
    await expect(pole.locator('.vilda-oba-vt')).toHaveText('Przed oknem oceny — oceń po 12 tyg.');
    await expect.poll(() => uGory(page, () => document.querySelector('.vilda-ko-karta .vilda-oba-verdict')), { message: 'pole oceny u góry widoku' }).toBe(true);
    await expect(pole).toBeFocused();
    await expect(k.locator('.vilda-gha-btn')).toHaveCount(0);
    await expect(k.locator('.vilda-ko-cicha')).toHaveText('Wegovy (semaglutyd) – s.c. 1×/tydz. · Semaglutyd (agonista receptora GLP‑1) · 2 punkty kontrolne');
    await expect(k.locator('.vilda-gha-sec')).toHaveText(['Przebieg leczenia otyłościA', 'Odpowiedź na leczenieB', 'Dawka a przebieg leczeniaA']);
    await expect(k.locator('.vilda-oba-chartbox svg')).toBeVisible();
    await k.locator('.vilda-oba-seg button[data-p="bmi"]').click();
    await expect(k.locator('.vilda-oba-legend')).toContainText('BMI (kg/m²)');
    await expect(dodaj, '„+ Kontynuacja” w każdym widoku').toBeVisible();

    // „Wpisy (2)”: sekcja bez nagłówka; „Jak działa dziennik leczenia ⌄” rozwija objaśnienia.
    await widokKarty(page, 'wpisy').click();
    await expect(k.locator('.vdo')).toBeVisible();
    await expect(k.locator('.vdo-title')).toHaveCount(0);
    await expect(wpisy(page)).toHaveCount(2);
    const jak = k.getByRole('button', { name: 'Jak działa dziennik leczenia' });
    await expect(jak).toHaveAttribute('aria-expanded', 'false');
    await expect(k.locator('.vdo-intro')).toBeHidden();
    await jak.click();
    await expect(jak).toHaveAttribute('aria-expanded', 'true');
    await expect(k.locator('.vdo-intro')).toHaveText('Dziennik leczenia jest oddzielony od wizyt w gabinecie. Wpis z masą od pacjenta nie tworzy wizyty i nie zmienia jej pomiarów.');
    await expect(k.locator('.vdo-jak-tresc .vdo-hint').first()).toBeVisible();
    await expect(k.getByRole('button', { name: 'Edytuj w DocPro →' })).toBeVisible();
    await expect(dodaj).toBeVisible();
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });

  test('KO-2 zapis wpisu z „Wpisów” zostawia „Wpisy” (N + 1, Przegląd i pasek przeliczone); zapis z „Przeglądu” — „Przegląd”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, O1);
    await karta(page, pid);
    await leczenie(page);
    await widokKarty(page, 'wpisy').click();
    await kontynuacja(page, { data: '2026-11-17', masa: '82,5', wzrost: '157' });
    await expect(wpisy(page)).toHaveCount(3);
    expect(await opisKarty(page)).toEqual(expect.objectContaining({ przelacznik: ['Przegląd', 'Wpisy (3)', 'Analiza'], wybrany: 'Wpisy (3)', widoczne: ['wpisy'] }));
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(paski(page).locator('.vilda-kl-pasek-t')).toHaveText('2,4 mg · 21 tyg. · BMI −10,2%');
    await widokKarty(page, 'przeglad').click();
    expect((await opisKarty(page)).kafelki).toEqual([['Aktualna dawka', '2,4 mg', '1×/tydz. · od 10.11.2026'], ['Czas leczenia', '21 tyg.', 'od 23.06.2026 (17 l. 6 mies.)'],
      ['Masa', '82,5 kg', '−9,4 kg (−10,2%) od włączenia'], ['BMI', '33,5', '−10,2% od włączenia · próg ChPL ≥5%']]);

    // zapis z „Przeglądu” — karta zostaje na „Przeglądzie”
    await kontynuacja(page, { data: '2026-11-18', masa: '82,1', wzrost: '157' });
    await expect(widokKarty(page, 'wpisy')).toHaveText('Wpisy (4)');
    expect(await opisKarty(page)).toEqual(expect.objectContaining({ wybrany: 'Przegląd', widoczne: ['przeglad'] }));
    expect((await opisKarty(page)).kafelki[2]).toEqual(['Masa', '82,1 kg', '−9,8 kg (−10,7%) od włączenia']);
    await expect(paski(page).locator('.vilda-kl-pasek-t')).toHaveText('2,4 mg · 21 tyg. · BMI −10,7%');
  });

  test('KO-3 O2 (7 wpisów, wystarczająca): linia „✓ …”, „Wpisy (7)” z „Pokaż wszystkie wpisy (7)” — przebudowa zostawia „Wpisy”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapiszZDziennikiem(page, O2, O2_DZIENNIK);
    await karta(page, pid);
    await leczenie(page);
    const opis = await opisKarty(page);
    expect(opis.przelacznik).toEqual(['Przegląd', 'Wpisy (7)', 'Analiza']);
    expect(opis.linia).toBe('✓Odpowiedź wystarczająca — kontynuować leczenie'
      + 'Osiągnięto −14,0% (BMI) po 22 tyg. stosowania dawki podtrzymującej · próg ChPL: redukcja BMI ≥5% po 12 tyg. dawki 2,4 mg/tydz. (lub maks. tolerowanej) — inaczej odstawić i ponownie ocenić.'
      + 'Szczegóły oceny');
    expect(opis.kafelki[0]).toEqual(['Aktualna dawka', '2,4 mg', '1×/tydz. · od 09.06.2026']);
    await expect(kartaOtylosci(page).locator('.vilda-ko-werdykt')).toHaveCSS('border-top-style', 'solid');
    await widokKarty(page, 'wpisy').click();
    await expect(wpisy(page)).toHaveCount(5);
    const wiecej = kartaOtylosci(page).getByRole('button', { name: 'Pokaż wszystkie wpisy (7) ▾' });
    await wiecej.click();
    await expect(wpisy(page)).toHaveCount(7);
    expect(await opisKarty(page)).toEqual(expect.objectContaining({ wybrany: 'Wpisy (7)', widoczne: ['wpisy'] }));
  });

  test('KO-4 Notatki: „Wpisy leczenia otyłości (N) — Leczenie →” — zakładka „Leczenie”, karta na „Wpisach”, przewinięcie do karty', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapiszZDziennikiem(page, O1, [{ dateISO: '2026-11-17', weight: 82.5, dose: '2,4 mg' }]);
    await karta(page, pid);
    await zakladki(page).filter({ hasText: 'Notatki' }).click();
    const link = tresc(page, 'notes').getByRole('button', { name: /Wpisy leczenia otyłości \(\d+\) — Leczenie →/ });
    await link.click();
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(widokKarty(page, 'wpisy')).toHaveAttribute('aria-selected', 'true');
    await expect(kartaOtylosci(page).locator('.vdo')).toBeVisible();
    await expect.poll(() => uGory(page, () => document.querySelector('.vilda-ko-karta')), { message: 'karta leczenia u góry widoku' }).toBe(true);
    await expect(widokKarty(page, 'wpisy')).toBeFocused();
  });

  test('KO-5 leczenie zakończone: ta sama karta z przełącznikiem; „+ Kontynuacja” z wyjaśnieniem DZ-5 nad przełącznikiem', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, { ...O1, obesityTherapyPoints: [...O1.obesityTherapyPoints,
      { ...O1.obesityTherapyPoints[1], id: 'o1-end', type: 'end', dateISO: '2026-11-17', dose: '' }] });
    await karta(page, pid);
    await leczenie(page);
    const k = kartaOtylosci(page);
    await expect(k.locator('.vilda-gh-summary-chip')).toHaveText('leczenie zakończone');
    expect((await opisKarty(page)).przelacznik).toEqual(['Przegląd', 'Wpisy (3)', 'Analiza']);
    const dodaj = k.getByRole('button', { name: 'Kontynuacja' });
    await expect(dodaj).toHaveAttribute('aria-disabled', 'true');
    await expect(k.locator('#vdoAddWhy')).toHaveText('Brak aktywnego cyklu — nowy cykl zaczyna się od Włączenia przy wizycie.');
    await expect(k.getByRole('button', { name: 'Włączenie w DocPro →' })).toBeVisible();
    await dodaj.click({ force: true });
    const komunikat = k.locator(':scope > .vdo-msg-warn');
    await expect(komunikat).toBeVisible();
    await expect(komunikat).toContainText('nowy cykl zaczyna się od Włączenia');
    await expect(page.locator('.vdo-dialog')).toHaveCount(0);
    await expect(widokKarty(page, 'przeglad')).toHaveAttribute('aria-selected', 'true');
    expect((await opisKarty(page)).linia).toBe('⏳Cykl zakończony przed oknem ocenyCykl zakończony 17.11.2026 — ocena na dzień Zakończenia, bez zaleceń na dziś.Szczegóły oceny');
  });

  test('KO-6 dwa cykle: „Przegląd” z bieżącego cyklu, przełącznik cykli w „Analizie” (zmienia panel, nie „Przegląd”)', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const W = O1.obesityTherapyPoints[0];
    const cykl1 = [{ ...W, id: 'c1-w', dateISO: '2025-06-10', ageYears: 16, ageMonths: 6, weight: 95, height: 156 },
      { ...W, id: 'c1-k', type: 'continue', dateISO: '2025-10-14', ageYears: 16, ageMonths: 10, weight: 92, height: 156.5, dose: '1 mg' },
      { ...W, id: 'c1-z', type: 'end', dateISO: '2025-12-09', ageYears: 16, ageMonths: 11, weight: 92.5, height: 156.5, dose: '' }];
    const pid = await zapisz(page, { ...O1, obesityTherapyPoints: [...cykl1, ...O1.obesityTherapyPoints] });
    await karta(page, pid);
    await leczenie(page);
    const k = kartaOtylosci(page);
    await expect(k.locator('.vilda-gh-summary-head .vilda-gh-summary-chip')).toHaveText(['aktywne', 'cykl 2 z 2']);
    expect(await opisKarty(page)).toEqual(expect.objectContaining({ kafelki: O1_PRZEGLAD, linia: O1_LINIA }));
    await widokKarty(page, 'analiza').click();
    await expect(k.locator('.vilda-ko-cicha')).toHaveText('Wegovy (semaglutyd) – s.c. 1×/tydz. · Semaglutyd (agonista receptora GLP‑1) · 2 punkty kontrolne w cyklu (5 łącznie)');
    const cykle = k.locator('.vilda-ob-seg button');
    await expect(cykle).toHaveText(['Cykl 2 · Wegovy · bieżący', 'Cykl 1 · Wegovy']);
    await cykle.nth(1).click();
    await expect(k.locator('.vilda-oba-verdict .vilda-oba-vt')).toHaveText(/^Cykl zakończony/);
    expect(await opisKarty(page)).toEqual(expect.objectContaining({ wybrany: 'Analiza', kafelki: O1_PRZEGLAD, linia: O1_LINIA }));
    // „Szczegóły oceny” z „Przeglądu” (linia opisuje cykl 2) — panel wraca do bieżącego cyklu
    await widokKarty(page, 'przeglad').click();
    await k.getByRole('button', { name: 'Szczegóły oceny' }).click();
    await expect(widokKarty(page, 'analiza')).toHaveAttribute('aria-selected', 'true');
    await expect(cykle.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(k.locator('.vilda-oba-verdict .vilda-oba-vt')).toHaveText('Przed oknem oceny — oceń po 12 tyg.');
    await expect(k.locator('.vilda-oba-verdict')).toBeFocused();
  });

  test('KO-7 dorosły (Saxenda, ocena z masy): „próg ChPL ≥5%” w kafelku Masa; bez Włączenia — „Czas od 1. punktu”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const SAX = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };
    const pid = await zapisz(page, {
      name: 'Fikcyjny Dorosły', user: { lastName: 'Fikcyjny', firstName: 'Dorosły', sex: 'M', age: 40, ageMonths: 5, height: 170, weight: 97, dobISO: '1985-12-01' },
      obesityTherapyPoints: [{ id: 'a-w', type: 'start', dateISO: '2026-01-12', ageYears: 40, ageMonths: 1, weight: 104, height: 170, dose: '0,6 mg', ...SAX },
        { id: 'a-k', type: 'continue', dateISO: '2026-05-12', ageYears: 40, ageMonths: 5, weight: 97, height: 170, dose: '3,0 mg', ...SAX }],
    });
    await karta(page, pid);
    await leczenie(page);
    expect((await opisKarty(page)).kafelki).toEqual([['Aktualna dawka', '3,0 mg', '1×/dobę · od 12.05.2026'], ['Czas leczenia', '17 tyg.', 'od 12.01.2026 (40 l. 1 mies.)'],
      ['Masa', '97 kg', '−7,0 kg (−6,7%) od włączenia · próg ChPL ≥5%'], ['BMI', '33,6', '−6,7% od włączenia']]);

    const bez = await zapisz(page, { ...O1, name: 'Fikcyjna Bez Włączenia', obesityTherapyPoints: O1.obesityTherapyPoints.map((p) => ({ ...p, type: 'continue' })) });
    await karta(page, bez);
    await leczenie(page);
    const opis = await opisKarty(page);
    expect(opis.kafelki[1]).toEqual(['Czas od 1. punktu', '20 tyg.', null]);
    await widokKarty(page, 'analiza').click();
    await expect(kartaOtylosci(page).locator('.vilda-gha-tile', { hasText: 'Czas od 1. punktu' }).locator('.vilda-gha-v')).toHaveText('20 tyg.');
    expect(opis.linia).toBe(`ℹ️${await kartaOtylosci(page).locator('.vilda-oba-vt').textContent()}`
      + 'ChPL ocenia odpowiedź od początkowej masy ciała i od włączenia leczenia (albo od osiągnięcia dawki podtrzymującej); pierwszy zapisany punkt tego nie zastępuje.Szczegóły oceny');
  });

  test('KO-8 odświeżenie po synchronizacji zostawia „Wpisy”; nowe otwarcie Karty — „Przegląd”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, O1);
    await karta(page, pid);
    await leczenie(page);
    await widokKarty(page, 'wpisy').click();
    await page.evaluate(async (id) => {
      const rek = await window.VildaVault.getPatient(id);
      const payload = JSON.parse(JSON.stringify(rek.snapshots[0].payload));
      payload.obesityTherapyPoints[1].weight = 83;
      await window.VildaVault.savePatient(payload, { patientId: id, dedup: false });
      window.__koKartaPrzed = document.querySelector('.vilda-auth-patient-card');
      document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
    }, pid);
    await expect.poll(() => page.evaluate(() => {
      const k = document.querySelector('.vilda-auth-patient-card');
      return Boolean(k && k !== window.__koKartaPrzed);
    }), { message: 'Karta przebudowana po synchronizacji', timeout: 15000 }).toBe(true);
    await expect(aktywna(page)).toHaveText('Leczenie');
    expect(await opisKarty(page)).toEqual(expect.objectContaining({ wybrany: 'Wpisy (2)', widoczne: ['wpisy'] }));
    await expect(paski(page).locator('.vilda-kl-pasek-t')).toHaveText('2,4 mg · 20 tyg. · BMI −9,7%');
    await karta(page, pid);
    await leczenie(page);
    expect(await opisKarty(page)).toEqual(expect.objectContaining({ wybrany: 'Przegląd', widoczne: ['przeglad'] }));
  });

  // Etap 3 (zmiana zamierzona): GH ma własną kartę leczenia z przełącznikiem (.vilda-kg-karta) — dotąd bez przełącznika,
  // z polami podsumowania i belką „📊 Dane analityczne”. Karta otyłości (.vilda-ko-*) i jej przełącznik bez zmian.
  test('KO-9 GH (G1) bez karty otyłości (własna karta GH, etap 3); X1 — karta otyłości nad zakończonym GH; pasek klik → karta', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const g1 = await zapisz(page, G1);
    await karta(page, g1);
    await zakladki(page).filter({ hasText: 'Leczenie' }).click();
    await expect(tresc(page, 'leczenie').locator('.vilda-kg-karta')).toBeVisible();
    await expect(page.locator('.vilda-ko-karta, .vilda-ko-seg')).toHaveCount(0);
    await expect(tresc(page, 'leczenie').locator('.vilda-gha-btn')).toHaveCount(0);

    const x1 = await zapisz(page, X1);
    await karta(page, x1);
    await paski(page).nth(1).click(); // GH — drugi
    await expect(aktywna(page)).toHaveText('Leczenie');
    const bloki = await tresc(page, 'leczenie').evaluate((t) => [...t.children].map((c) => c.firstElementChild && c.firstElementChild.className));
    expect(bloki).toEqual(['vilda-gh-summary vilda-ko-karta', 'vilda-gh-summary vilda-kg-karta']); // etap 3: GH — karta GH (dotąd 'vilda-gh-summary')
    await expect(tresc(page, 'leczenie').locator('.vilda-gha-btn')).toHaveCount(0); // etap 3: bez belki GH (dotąd 1)
    await widokKarty(page, 'analiza').click();
    await paski(page).first().click(); // pasek leczenia: zakładka i przewinięcie, bez zmiany widoku karty
    await expect(widokKarty(page, 'analiza')).toHaveAttribute('aria-selected', 'true');
  });

  test('KO-10 ostatni wpis bez wzrostu (ocena z BMI): kafelek BMI „—” z wpisem oceny i tymi samymi liczbami co pasek', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, O_OSTATNI_BEZ_WZROSTU);
    await karta(page, pid);
    await leczenie(page);
    const opis = await opisKarty(page);
    expect(opis.kafelki[3]).toEqual(['BMI', '—', 'brak wzrostu w ostatnim wpisie · ocena: −7,4% (z wpisu 01.08.2026) · próg ChPL ≥5%']);
    await expect(paski(page).locator('.vilda-kl-pasek-t')).toContainText('BMI −7,4%');
    await widokKarty(page, 'analiza').click();
    await expect(kartaOtylosci(page).locator('.vilda-gha-tile', { hasText: 'Wzrost do oceny' }).locator('.vilda-gha-sub')).toHaveText('pomiar z 01.08.2026 · ostatni wpis bez wzrostu');
    await expect(kartaOtylosci(page).locator('.vilda-gha-tile', { hasText: 'Redukcja do oceny' }).locator('.vilda-gha-v')).toHaveText('−7,4%');
  });
});
