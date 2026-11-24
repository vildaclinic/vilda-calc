import { expect, test } from '../support/test-czas.mjs';
import {
  G1, G2, G3, INC_PACJENT, O1, R1, W2, X1, aktywna, bezPrzewijaniaWBok, karta, kartaGh, kartaOtylosci, opisKartyGh, otworz, paski, tresc,
  trendWSiatkach, uGory, widokGh, widokKarty, zakladki, zapisz,
} from '../support/karta-leczenie.mjs';

// P-KARTA-LECZENIE, etap 3 (makieta hybrydy zaakceptowana 2026-11-19, „Etap 3, karta leczenia GH” 2026-11-21;
// docs/KARTA_LECZENIE_PLAN.md). Karta pacjenta na PRAWDZIWEJ stronie (komputer): grupa GH w zakładce „Leczenie” jest
// jedną kartą leczenia z przełącznikiem „Przegląd | Trend dawki | Analiza”; „Trend leczenia GH” przeniesiony
// z „Siatek centylowych” do karty. Dane wyłącznie FIKCYJNE; sejf zakładany w teście.
test.use({ serviceWorkers: 'block', chwila: '2026-11-19T11:00:00Z' });

const G1_PRZEGLAD = [['Preparat i dawka', '0,033 mg/kg/d', 'Genotropin 12 mg'], ['Czas leczenia', '36 mies.', 'od 7 l. 0 mies.'],
  ['Tempo wzrastania', '6,2 cm/rok', 'ost. okres (z 6 mies.)'], ['Odpowiedź (ΔhSDS)', '+1,47', 'hSDS −2,87 → −1,40']];
const ZIELONY = 'rgb(26, 143, 92)';
const CIEMNY = 'rgb(14, 42, 48)';

async function leczenie(page) {
  await zakladki(page).filter({ hasText: 'Leczenie' }).click();
  await expect(kartaGh(page)).toBeVisible();
}
/** Blok trendu w karcie GH: legenda, wiersze tabeli, odcinki dawki (% zalecanej) i ścieżka dawki (mg/kg). */
const trendKarty = (page) => kartaGh(page).locator('.vilda-kg-trend').evaluate((el) => ({
  legenda: el.firstElementChild ? el.firstElementChild.textContent.replace(/\s+/g, ' ').trim() : '',
  wiersze: [...el.querySelectorAll('tr')].map((r) => [...r.children].map((c) => c.textContent.trim())),
  odcinki: el.querySelectorAll('svg line[stroke-width="3.2"]').length,
  sciezka: [...el.querySelectorAll('svg path')].map((p) => p.getAttribute('d')),
}));

test.describe('Karta pacjenta — karta leczenia GH z przełącznikiem (komputer)', () => {
  test('KG-1 G1: nagłówek z cichym „Program SNP · 7 punktów kontrolnych”, „Przegląd” 1 × 4, „Trend dawki” (7 wierszy), „Analiza”; Siatki bez trendu', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, G1);
    await karta(page, pid);
    await leczenie(page);
    const k = kartaGh(page);

    // Nagłówek: znacznik, stan, po prawej cichy tekst z dymkiem pełnej nazwy programu; bez pól i bez przycisków.
    await expect(k.locator('.vilda-gh-summary-head > .vilda-gh-summary-badge')).toHaveText('Leczony hormonem wzrostu (rhGH)');
    await expect(k.locator('.vilda-gh-summary-head > .vilda-gh-summary-chip')).toHaveText('aktywne');
    await expect(k.locator('.vilda-kg-cichy')).toHaveText('Program SNP · 7 punktów kontrolnych');
    await expect(k.locator('.vilda-kg-program')).toHaveAttribute('title', 'SNP — somatotropinowa niedoczynność przysadki');
    await expect(k.locator('.vilda-gh-summary-grid')).toHaveCount(0);
    await expect(k.locator('.vilda-gha-btn')).toHaveCount(0);
    await expect(k.locator('.vilda-gh-summary-head button')).toHaveCount(0);
    const uklad = await k.evaluate((el) => {
      const r = (s) => el.querySelector(s).getBoundingClientRect();
      return { glowa: r(':scope > .vilda-gh-summary-head').right, cichy: r('.vilda-kg-cichy').right, cichyT: r('.vilda-kg-cichy').top,
        odznakaT: r('.vilda-gh-summary-badge').top, odznakaB: r('.vilda-gh-summary-badge').bottom };
    });
    expect(uklad.glowa - uklad.cichy, 'cichy tekst przy prawej krawędzi').toBeLessThan(2);
    expect(uklad.cichyT, 'cichy tekst w wierszu znacznika').toBeLessThan(uklad.odznakaB);

    // Przełącznik i „Przegląd”: cztery kafelki w jednym wierszu, kolory jak kafelki panelu.
    const opis = await opisKartyGh(page);
    expect(opis).toEqual(expect.objectContaining({ przelacznik: ['Przegląd', 'Trend dawki', 'Analiza'], wybrany: 'Przegląd', widoczne: ['przeglad'],
      nad: [], kafelki: G1_PRZEGLAD }));
    expect(opis.kolory).toEqual([CIEMNY, CIEMNY, ZIELONY, ZIELONY]);
    await expect(page.getByRole('tablist', { name: 'Leczony hormonem wzrostu (rhGH) — widok karty' })).toBeVisible();
    const gory = await k.locator('.vilda-ko-kafel').evaluateAll((ts) => ts.map((t) => Math.round(t.getBoundingClientRect().top)));
    expect(new Set(gory).size, 'komputer: kafelki 1 × 4').toBe(1);
    expect(gory).toHaveLength(4);
    // pasek leczenia (etap 1) — te same liczby
    await expect(paski(page).locator('.vilda-kl-pasek-t')).toHaveText('0,033 mg/kg/d · 36 mies. · tempo 6,2 cm/rok · ΔhSDS +1,47');

    // „Trend dawki”: blok Pl w białej ramce, bez nagłówka, wykres i tabela z 7 punktami; nagłówek tabeli czytelny.
    await widokGh(page, 'trend').click();
    await expect(widokGh(page, 'trend')).toHaveAttribute('aria-selected', 'true');
    const ramka = k.locator('.vilda-kg-ramka');
    await expect(ramka).toBeVisible();
    await expect(ramka.locator('svg')).toBeVisible();
    await expect(k.getByText('Trend leczenia GH')).toHaveCount(0);
    await expect.poll(async () => (await trendKarty(page)).wiersze.length, { message: 'tabela trendu (nagłówek + 7 punktów)' }).toBe(8);
    const t = await trendKarty(page);
    expect(t.wiersze[0]).toEqual(['Wiek', 'Dawka', 'IGF-1']);
    expect(t.wiersze.slice(1).map((w) => w[0])).toEqual(['7 l. 0 mies.', '7 l. 6 mies.', '8 l. 0 mies.', '8 l. 6 mies.', '9 l. 0 mies.', '9 l. 6 mies.', '10 l. 0 mies.']);
    expect(t.legenda).toContain('Genotropin 12 mg');
    expect(t.legenda).toContain('% dawki zalecanej');
    await expect(ramka.locator('svg text', { hasText: '100% zalecana' })).toBeVisible();
    const th = ramka.locator('th').first();
    await expect(th).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(th).toHaveCSS('color', 'rgb(15, 43, 51)');
    await expect(ramka).toHaveCSS('background-image', /linear-gradient/);
    await expect(ramka).toHaveCSS('margin-top', '0px');

    // „Analiza”: panel rozwinięty, bez belki; cicha linia; dzisiejsze kafelki i sekcje.
    await widokGh(page, 'analiza').click();
    await expect(k.locator('.vilda-ko-cicha')).toHaveText('SNP — somatotropinowa niedoczynność przysadki · Genotropin 12 mg · ostatnia kontrola w wieku 10 l. 0 mies.');
    const panel = k.locator('.vilda-gha-panel');
    await expect(panel).toBeVisible();
    await expect(k.locator('.vilda-gha-sec').first()).toHaveText('WzrastanieA');
    await expect(panel).toContainText('Wzrost przy włączeniu110 cmhSDS −2,87 · 7 l. 0 mies.');
    await expect(panel).toContainText('Tempo wzrastania6,2 cm/rok');
    await expect(panel).toContainText('Odpowiedź (ΔhSDS)+1,47catch-up od włączenia');
    await expect(panel).toContainText('Warstwa A liczona z punktów terapii');
    expect(await bezPrzewijaniaWBok(page)).toBe(true);

    // „Siatki centylowe” bez „Trendu leczenia GH” (trend jest w karcie).
    await zakladki(page).filter({ hasText: 'Siatki centylowe' }).click();
    await expect(page.locator('.vilda-siatka-charts svg.vilda-patient-chart').first()).toBeVisible();
    await page.waitForTimeout(500);
    expect(await trendWSiatkach(page)).toBe(0);
  });

  test('KG-2 G2 (zmiana preparatu): „🔄 zmiana preparatu”, „Preparaty (historia)” nad przełącznikiem, legenda dwóch preparatów, „wg preparatu” w „Analizie”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, G2);
    await karta(page, pid);
    await leczenie(page);
    const k = kartaGh(page);
    await expect(k.locator('.vilda-gh-summary-head .vilda-gh-summary-chip')).toHaveText(['aktywne', '🔄 zmiana preparatu']);
    const opis = await opisKartyGh(page);
    expect(opis.nad).toHaveLength(1);
    expect(opis.nad[0]).toMatch(/^Preparaty \(historia\)Genotropin 12 mg7 l\. 0 mies\. – .*→Omnitrope 10 mg9 l\. 0 mies\. · aktualny$/);
    expect(opis.kafelki[0]).toEqual(['Preparat i dawka', '0,033 mg/kg/d', 'Omnitrope 10 mg']);
    await widokGh(page, 'trend').click();
    await expect(k.getByText('Preparaty (historia)')).toBeVisible(); // nad przełącznikiem — w każdym widoku
    await expect.poll(async () => (await trendKarty(page)).legenda).toContain('Omnitrope 10 mg');
    expect((await trendKarty(page)).legenda).toContain('Genotropin 12 mg');
    await expect(k.locator('.vilda-kg-trend svg text', { hasText: '🔄' })).toHaveCount(1);
    await widokGh(page, 'analiza').click();
    await expect(k.getByText('Preparaty (historia)')).toBeVisible();
    await expect(k.locator('.vilda-gha-sec', { hasText: 'Odpowiedź na leczenie wg preparatu' })).toBeVisible();
  });

  test('KG-3 G3 (bez Włączenia): ramka P-GH-BEZ-STARTU nad przełącznikiem; „Czas od 1. punktu”; ΔhSDS „· od 1. punktu”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, G3);
    await karta(page, pid);
    await leczenie(page);
    const opis = await opisKartyGh(page);
    expect(opis.nad).toEqual(['Brak punktu włączenia leczenia (pierwszy zapisany punkt kontrolny: w wieku 7 l. 6 mies.). Dodaj punkt „Włączenie leczenia” w monitorze terapii (także wstecznie), aby zmiany liczyły się od startu.']);
    expect(opis.cichy).toBe('Program SNP · 6 punktów kontrolnych');
    expect(opis.kafelki[1]).toEqual(['Czas od 1. punktu', '30 mies.', 'od 7 l. 6 mies.']);
    expect(opis.kafelki[3][2]).toMatch(/^hSDS −\d,\d\d → −1,40 · od 1\. punktu$/);
    await widokGh(page, 'analiza').click();
    const panel = kartaGh(page).locator('.vilda-gha-panel');
    await expect(panel).toContainText('Przyrost od 1. punktu');
    await expect(panel).toContainText('przez 30 mies.');
    await expect(panel).toContainText(`Odpowiedź (ΔhSDS)${opis.kafelki[3][1]}od 1. punktu (brak punktu włączenia)`);
  });

  test('KG-4 Increlex: znacznik IGF-1, kafelek „2 × 2,4 mg na dobę” · 0,12 mg/kg na podanie; trend w dawce na podanie', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, INC_PACJENT);
    await karta(page, pid);
    await leczenie(page);
    const k = kartaGh(page);
    await expect(k.locator('.vilda-gh-summary-badge')).toHaveText('Leczony IGF-1 (mekasermina)');
    const opis = await opisKartyGh(page);
    expect(opis.cichy).toBe('Program IGF-1 · 2 punkty kontrolne');
    expect(opis.kafelki[0]).toEqual(['Preparat i dawka', '2 × 2,4 mg na dobę', '0,12 mg/kg na podanie · Increlex 40 mg']);
    await expect(k.locator('.vilda-ko-kafel').first().locator('.vilda-ko-v small')).toHaveText('na dobę');
    await widokGh(page, 'trend').click();
    await expect.poll(async () => (await trendKarty(page)).wiersze.length).toBe(3);
    expect((await trendKarty(page)).wiersze.slice(1).map((w) => w[1])).toEqual(['2 × 0,8 mg na dobę (0,042 mg/kg na podanie)', '2 × 2,4 mg na dobę (0,12 mg/kg na podanie)']);
  });

  test('KG-5 zakończone (X1, GH Omnitrope 9–15 l.) i GH + otyłość: dwie karty (otyłość trwająca nad zakończonym GH), widoki niezależne', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, X1);
    await karta(page, pid);
    await expect(paski(page).locator('.vilda-kl-pasek-odznaka')).toHaveText(['Leczenie otyłości — Wegovy', 'Leczony hormonem wzrostu (rhGH)']);
    await leczenie(page);
    const bloki = await tresc(page, 'leczenie').evaluate((t) => [...t.children].map((c) => c.firstElementChild && c.firstElementChild.className));
    // P-ROZPOZNANIA, rata 1: pierwszym blokiem zakładki jest sekcja rozpoznań (jej pierwsze dziecko to nagłówek sekcji).
    expect(bloki).toEqual(['vilda-kr-naglowek', 'vilda-gh-summary vilda-ko-karta', 'vilda-gh-summary vilda-kg-karta']);
    const k = kartaGh(page);
    await expect(k.locator('.vilda-gh-summary-chip')).toHaveText('leczenie zakończone');
    const opis = await opisKartyGh(page);
    expect(opis.przelacznik).toEqual(['Przegląd', 'Trend dawki', 'Analiza']);
    expect(opis.cichy).toBe('Program SNP · 4 punkty kontrolne');
    expect(opis.kafelki.slice(0, 2)).toEqual([['Preparat i dawka', '0,025 mg/kg/d', 'Omnitrope 10 mg'], ['Czas leczenia', '72 mies.', 'od 9 l. 0 mies.']]);
    // widoki obu kart niezależne
    await widokGh(page, 'trend').click();
    expect((await opisKartyGh(page)).wybrany).toBe('Trend dawki');
    await expect(widokKarty(page, 'przeglad')).toHaveAttribute('aria-selected', 'true');
    await widokKarty(page, 'analiza').click();
    expect((await opisKartyGh(page)).wybrany).toBe('Trend dawki');
    // pasek GH (drugi) — zakładka i przewinięcie do karty GH, bez zmiany widoku
    await zakladki(page).filter({ hasText: 'Status' }).click();
    await paski(page).nth(1).click();
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect.poll(() => uGory(page, () => document.querySelector('.vilda-kg-karta')), { message: 'karta GH u góry widoku' }).toBe(true);
    expect((await opisKartyGh(page)).wybrany).toBe('Trend dawki');
    await expect(widokKarty(page, 'analiza')).toHaveAttribute('aria-selected', 'true');
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });

  test('KG-6 wznowienie (R1, 2 kursy): „kurs 2 z 2”, punkty w kursie, kafelki z bieżącego kursu, trend z przerwą linii; W2 — Czas „—”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, R1);
    await karta(page, pid);
    await leczenie(page);
    const k = kartaGh(page);
    await expect(k.locator('.vilda-gh-summary-head .vilda-gh-summary-chip')).toHaveText(['aktywne', 'kurs 2 z 2']);
    const opis = await opisKartyGh(page);
    expect(opis.cichy).toBe('Program SNP · 2 punkty kontrolne w kursie (5 łącznie)');
    expect(opis.kafelki).toEqual([['Preparat i dawka', '0,033 mg/kg/d', 'Genotropin 12 mg'], ['Czas leczenia', '12 mies.', 'od 10 l. 0 mies.'],
      ['Tempo wzrastania', '7 cm/rok', 'ost. okres (z 12 mies.)'], ['Odpowiedź (ΔhSDS)', '+0,37', 'hSDS −1,77 → −1,40']]);
    await widokGh(page, 'trend').click();
    await expect.poll(async () => (await trendKarty(page)).odcinki, { message: 'trend % dawki: 3 odcinki w kursach (bez odcinka przez przerwę)' }).toBe(6);
    await widokGh(page, 'analiza').click();
    await expect(k.locator('.vilda-ko-cicha')).toHaveText('SNP — somatotropinowa niedoczynność przysadki · Genotropin 12 mg · ostatnia kontrola w wieku 11 l. 0 mies.');
    await expect(k.locator('.vilda-gha-panel')).toContainText('Wzrastanie — kurs 2 z 2');

    const w2 = await zapisz(page, W2);
    await karta(page, w2);
    await leczenie(page);
    const o2 = await opisKartyGh(page);
    expect(o2.nad).toEqual(['Kontynuacja po Zakończeniu bez nowego Włączenia (Zakończenie w wieku 9 l. 0 mies., pierwszy punkt kursu: w wieku 10 l. 0 mies.). '
      + 'Dopisz punkt „Włączenie leczenia” w DocPro (monitor terapii), by liczyć czas leczenia, przyrost i ΔhSDS od wznowienia.']);
    expect(o2.cichy).toBe('Program SNP · 2 punkty kontrolne w kursie (4 łącznie)');
    expect(o2.kafelki[1]).toEqual(['Czas leczenia', '—', 'brak Włączenia po Zakończeniu']);
    expect(o2.kafelki[3]).toEqual(['Odpowiedź (ΔhSDS)', '—', 'brak Włączenia po Zakończeniu']);
  });

  test('KG-7 punkty bez dawki: przełącznik „Przegląd | Analiza”; trend z wpisów Terminarza zostaje w „Siatkach centylowych”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, { ...G1, ghTherapyPoints: G1.ghTherapyPoints.map((p) => ({ ...p, dose: null })) });
    await page.evaluate(async (id) => window.VildaVault.savePatientNote({ patientId: id, category: 'treatment', title: 'Leczenie rhGH', dueDateISO: '2026-11-02',
      body: 'Kontrola leczenia hormonem wzrostu / IGF-1.\nPreparat: Genotropin 12 mg.\nDawka: 0,033 mg/kg/d (0,98 mg/d).',
      medication: { action: 'change', doseNum: 0.033, doseUnit: 'mg/kg/d', freq: 'dzień' } }), pid);
    await karta(page, pid);
    await leczenie(page);
    expect((await opisKartyGh(page)).przelacznik).toEqual(['Przegląd', 'Analiza']);
    await expect(kartaGh(page).locator('.vilda-kg-ramka')).toHaveCount(0);
    await zakladki(page).filter({ hasText: 'Siatki centylowe' }).click();
    await expect.poll(() => trendWSiatkach(page), { message: 'trend z Terminarza w „Siatkach centylowych”' }).toBe(1);
    await expect(tresc(page, 'traj').locator('tr', { hasText: '0,033 mg/kg/d' })).toHaveCount(1);
  });

  test('KG-8 odświeżenie po synchronizacji zostawia „Trend dawki”; nowe otwarcie Karty — „Przegląd”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, G1);
    await karta(page, pid);
    await leczenie(page);
    await widokGh(page, 'trend').click();
    await page.evaluate(async (id) => {
      const rek = await window.VildaVault.getPatient(id);
      const payload = JSON.parse(JSON.stringify(rek.snapshots[0].payload));
      payload.ghTherapyPoints[6].height = 132.6;
      await window.VildaVault.savePatient(payload, { patientId: id, dedup: false });
      window.__kgKartaPrzed = document.querySelector('.vilda-auth-patient-card');
      document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
    }, pid);
    await expect.poll(() => page.evaluate(() => {
      const k = document.querySelector('.vilda-auth-patient-card');
      return Boolean(k && k !== window.__kgKartaPrzed);
    }), { message: 'Karta przebudowana po synchronizacji', timeout: 15000 }).toBe(true);
    await expect(aktywna(page)).toHaveText('Leczenie');
    expect(await opisKartyGh(page)).toEqual(expect.objectContaining({ wybrany: 'Trend dawki', widoczne: ['trend'] }));
    expect(await trendWSiatkach(page)).toBe(0);
    await karta(page, pid);
    await leczenie(page);
    expect(await opisKartyGh(page)).toEqual(expect.objectContaining({ wybrany: 'Przegląd', widoczne: ['przeglad'] }));
  });

  test('KG-9 notatka GH: „↗ Trend dawki / punkt GH” bez punktu → „Leczenie”, karta GH na „Trendzie dawki”, przewinięcie; bez karty z trendem → „Siatki centylowe”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    // GH + trwająca otyłość: karta GH (trwająca, przed otyłością) — przewinięcie do niej
    const pid = await zapisz(page, { ...G1, obesityTherapyPoints: O1.obesityTherapyPoints });
    const notatka = await page.evaluate(async (id) => {
      const w = await window.VildaVault.savePatientNote({ patientId: id, title: 'Somatropina', body: 'Dawka kontrolna.', category: 'treatment',
        medication: { name: 'Somatropina', action: 'start', doseUnit: 'mg/kg/d', doseNum: 0.033 } });
      return (await window.VildaVault.listPatientNotesForPatient(id)).find((n) => n.id === w.id);
    }, pid);
    await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({ patientId: d.pid, note: d.n }), { pid, n: notatka });
    const przycisk = page.locator('.vilda-pne button', { hasText: 'Trend dawki / punkt GH' });
    await expect(przycisk).toHaveText('↗ Trend dawki / punkt GH');
    await expect(page.locator('.vilda-pne button', { hasText: 'Siatki / punkt GH' })).toHaveCount(0);
    await przycisk.click();
    await expect(page.locator('.vilda-auth-patient-card .vilda-patient-tabs')).toBeVisible({ timeout: 15000 });
    await expect(aktywna(page)).toHaveText('Leczenie');
    expect(await opisKartyGh(page)).toEqual(expect.objectContaining({ wybrany: 'Trend dawki', widoczne: ['trend'] }));
    await expect(widokKarty(page, 'przeglad')).toHaveAttribute('aria-selected', 'true'); // karta otyłości bez zmian
    await expect.poll(() => uGory(page, () => document.querySelector('.vilda-kg-karta')), { message: 'karta GH u góry widoku' }).toBe(true);
    await expect(widokGh(page, 'trend')).toBeFocused();
    await expect(page).toHaveURL(/index\.html/);

    // pacjent bez punktów GH z dawką (sam wpis Terminarza) — jak dotąd „Siatki centylowe”
    const bez = await zapisz(page, { ...G1, name: 'Fikcyjny Bez Dawki', ghTherapyPoints: G1.ghTherapyPoints.map((p) => ({ ...p, dose: null })) });
    const n2 = await page.evaluate(async (id) => {
      const w = await window.VildaVault.savePatientNote({ patientId: id, title: 'Somatropina', body: 'Dawka kontrolna.', category: 'treatment',
        medication: { name: 'Somatropina', action: 'start', doseUnit: 'mg/kg/d', doseNum: 0.03 } });
      return (await window.VildaVault.listPatientNotesForPatient(id)).find((n) => n.id === w.id);
    }, bez);
    await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({ patientId: d.pid, note: d.n }), { pid: bez, n: n2 });
    await page.locator('.vilda-pne button', { hasText: 'Trend dawki / punkt GH' }).click();
    await expect.poll(async () => (await aktywna(page).textContent()) || '', { timeout: 15000 }).toContain('Siatki centylowe');
    await expect(page.locator('.vilda-auth-patient-card .vilda-patient-tab-content[data-tab="traj"]')).toBeVisible();
  });

  test('KG-10 notatka GH z punktem (ghPointId): „↗ Trend dawki / punkt GH” prowadzi do DocPro jak dotąd', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, G1);
    const notatka = await page.evaluate(async (id) => {
      const w = await window.VildaVault.savePatientNote({ patientId: id, title: 'Somatropina', body: 'Dawka kontrolna.', category: 'treatment', ghPointId: 'g1-c6',
        medication: { name: 'Somatropina', action: 'start', doseUnit: 'mg/kg/d', doseNum: 0.033 } });
      return (await window.VildaVault.listPatientNotesForPatient(id)).find((n) => n.id === w.id);
    }, pid);
    await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({ patientId: d.pid, note: d.n }), { pid, n: notatka });
    await page.locator('.vilda-pne button', { hasText: 'Trend dawki / punkt GH' }).click();
    await page.waitForURL(/docpro\.html/, { timeout: 15000 });
  });
});
