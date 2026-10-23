import { expect, test } from '@playwright/test';
import { nakladka, orientacja, otworzKreator, otworzStrone, palczewskaPro, punktEkranu, wygenerujPdf } from '../support/siatka-poziomo.mjs';

// P-KREATOR-POZIOM (decyzja właściciela 2026-10-18, wariant C): przy „1 strona A4 · poziom” Kreator
// siatek PRO pokazuje i edytuje stronę A4 poziomo — tę samą, którą wygeneruje PDF. Treść adnotacji
// jest wspólna, położenie ramek osobne dla każdego układu. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

// Linie tekstu adnotacji po łamaniu co 12 znaków (otworzKreator w tests/support/siatka-poziomo.mjs).
const LINIE = ['Start terapi', 'i GH', 'Kontrola', 'Kanał MPH', 'Cel'];

/** Rejestruje fillText linii adnotacji we współrzędnych urządzenia każdej kanwy. */
async function nagrywaj(page) {
  await page.evaluate((linie) => {
    const P = CanvasRenderingContext2D.prototype;
    const fillText = P.fillText;
    const drawImage = P.drawImage;
    window.__wklejki = new Map();
    window.__teksty = [];
    P.drawImage = function (src, x, y, ...reszta) {
      if (src instanceof HTMLCanvasElement && reszta.length === 0) window.__wklejki.set(src, { x, y });
      return drawImage.call(this, src, x, y, ...reszta);
    };
    P.fillText = function (t, x, y, ...reszta) {
      if (linie.includes(String(t))) {
        const m = this.getTransform();
        window.__teksty.push({ c: this.canvas, t: String(t), x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
      }
      return fillText.call(this, t, x, y, ...reszta);
    };
  }, LINIE);
}

/** Teksty adnotacji narysowane na nakładce Kreatora (współrzędne strony). */
async function tekstyKreatora(page) {
  return nakladka(page).evaluate((c) => [...new Set(window.__teksty.filter((e) => e.c === c)
    .map((e) => `${e.t}@${e.x.toFixed(2)},${e.y.toFixed(2)}`))].sort());
}

/** Teksty adnotacji z kanw wykresów PDF przeliczone na stronę (miejsce wklejenia kolumny). */
async function tekstyPdf(page) {
  return page.evaluate(() => [...new Set(window.__teksty.filter((e) => e.c.width === 1684 && window.__wklejki.has(e.c))
    .map((e) => {
      const o = window.__wklejki.get(e.c);
      return `${e.t}@${(e.x + o.x).toFixed(2)},${(e.y + o.y).toFixed(2)}`;
    }))].sort());
}

/** Teksty adnotacji pierwszej strony pionowego PDF (siatka wzrostu): kanwa A4 pionowo spoza DOM. */
async function tekstyPdfPionWzrost(page) {
  return page.evaluate(() => {
    const kanwy = [];
    for (const e of window.__teksty) if (!e.c.isConnected && e.c.width === 2480 && !kanwy.includes(e.c)) kanwy.push(e.c);
    return [...new Set(window.__teksty.filter((e) => e.c === kanwy[0])
      .map((e) => `${e.t}@${e.x.toFixed(2)},${e.y.toFixed(2)}`))].sort();
  });
}

const generujZKreatora = () => [...document.querySelectorAll('#vilda-pub-creator-overlay button')]
  .find((b) => b.innerText.trim().startsWith('Generuj')).click();

const kreatorUi = (page) => page.locator('#vilda-pub-creator-overlay');

const magazyn = (page) => page.evaluate(() => JSON.parse(JSON.stringify({
  ...window.chartCreatorData.growth,
  posL: window.chartCreatorData.palRegular?.posL,
})));

test.describe('Kreator siatek PRO — strona A4 poziomo', () => {
  test('podgląd = strona PDF: cała strona poziomo, ramki w tych samych miejscach co w wygenerowanym PDF', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzStrone(page);
    await palczewskaPro(page);
    await nagrywaj(page);
    await otworzKreator(page);
    expect(await nakladka(page).evaluate((c) => [c.width, c.height])).toEqual([3508, 2480]);
    await expect(kreatorUi(page)).toContainText('A4 poziomo');
    await expect(kreatorUi(page).getByRole('button', { name: '1 strona · poziom' })).toHaveAttribute('aria-pressed', 'true');
    await expect(kreatorUi(page).locator('.pubc-lrow', { hasText: 'Kontrola' })).toContainText('położenie przeliczone z pionu');
    await expect(kreatorUi(page).locator('.pubc-lrow', { hasText: 'Start terapii GH' })).not.toContainText('położenie');

    const kreator = await tekstyKreatora(page);
    // Na stronie widać adnotacje obu wykresów (aktywny „Wzrost” i nieaktywna „Masa ciała”).
    expect(kreator.filter((t) => t.startsWith('Cel@'))).toHaveLength(1);
    expect(kreator.filter((t) => t.startsWith('Kontrola@'))).toHaveLength(2);

    await page.evaluate(() => { window.__teksty = []; });
    const strony = await wygenerujPdf(page, generujZKreatora);
    expect(strony.map(orientacja)).toEqual(['poziom']);
    expect(await tekstyPdf(page)).toEqual(kreator);
  });

  test('przesunięcie ramki w poziomie zapisuje własne położenie poziomu; pion i jego PDF bez zmian; reset tylko poziomu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzStrone(page);
    await palczewskaPro(page);
    await nagrywaj(page);
    await otworzKreator(page, { uklad: 'portrait' });
    expect(await nakladka(page).evaluate((c) => [c.width, c.height])).toEqual([2480, 3508]);
    const pionPrzed = await tekstyKreatora(page);
    expect(pionPrzed.map((t) => t.split('@')[0]).sort()).toEqual(['Kanał MPH', 'Kontrola', 'Start terapi', 'i GH']);

    await kreatorUi(page).getByRole('button', { name: '1 strona · poziom' }).click();
    await expect(page.locator('#palPdfLayoutLandscape')).toBeChecked();
    expect(await nakladka(page).evaluate((c) => [c.width, c.height])).toEqual([3508, 2480]);
    // Ramka „Kontrola” wykresu wzrostu (lewa kolumna strony, x < 1804).
    const [x, y] = (await tekstyKreatora(page)).filter((t) => t.startsWith('Kontrola@'))
      .map((t) => t.split('@')[1].split(',').map(Number)).find(([px]) => px < 1804);
    const start = await punktEkranu(page, x + 20, y + 10);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 70, start.y + 50, { steps: 8 });
    await page.mouse.up();

    let s = await magazyn(page);
    expect(s.posL.height.cur, 'własne położenie poziomu').toBeTruthy();
    expect(s.posL.height.cur.dx).not.toBe(Math.round(330 * 1394 / 1946));
    expect(s.layout.height.cur, 'położenie pionu bez zmian').toEqual({ dx: 330, dy: -420 });
    expect(s.posL.weight, 'druga siatka bez wpisów').toEqual({});
    await expect(kreatorUi(page).locator('.pubc-lrow', { hasText: 'Kontrola' })).toContainText('przesunięta');

    // Powrót do pionu z paska Kreatora: ta sama preferencja co pod przyciskiem, ramki pionu jak przed edycją.
    await page.evaluate(() => { window.__teksty = []; });
    await kreatorUi(page).getByRole('button', { name: '2 strony · pion' }).click();
    await expect(page.locator('#palPdfLayoutPortrait')).toBeChecked();
    expect(await page.evaluate(() => window.VildaPersistence.readPreferenceRaw('PAL_PDF_LAYOUT', null))).toBe('portrait');
    expect(await nakladka(page).evaluate((c) => [c.width, c.height])).toEqual([2480, 3508]);
    expect(await tekstyKreatora(page)).toEqual(pionPrzed);
    await page.evaluate(() => { window.__teksty = []; });
    const strony = await wygenerujPdf(page, generujZKreatora);
    expect(strony.map(orientacja)).toEqual(['pion', 'pion']);
    expect(await tekstyPdfPionWzrost(page), 'PDF w pionie = podgląd pionu sprzed edycji poziomu').toEqual(pionPrzed);

    // Reset w poziomie: ramka wraca do pozycji automatycznej tylko na stronie poziomej.
    await kreatorUi(page).getByRole('button', { name: '1 strona · poziom' }).click();
    await kreatorUi(page).getByRole('button', { name: /Przywróć układ automatyczny \(poziom\)/ }).click();
    s = await magazyn(page);
    expect(s.posL.height.cur).toEqual({});
    expect(s.layout.height.cur).toEqual({ dx: 330, dy: -420 });
    await expect(kreatorUi(page).locator('.pubc-lrow', { hasText: 'Kontrola' })).not.toContainText('przesunięta');
    await expect(kreatorUi(page).locator('.pubc-lrow', { hasText: 'Kontrola' })).not.toContainText('położenie');
  });

  test('klik w drugi wykres przełącza aktywny wykres i od razu działa jak klik w punkt', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzStrone(page);
    await palczewskaPro(page);
    // Niskie okno komputera: dopasowanie strony jest małe, ale to nie telefon — widać całą stronę.
    await page.setViewportSize({ width: 1280, height: 650 });
    await otworzKreator(page);
    await expect(kreatorUi(page)).toContainText('100%');
    expect(await nakladka(page).evaluate((c) => {
      const r = c.getBoundingClientRect();
      const o = c.closest('div[style*="overflow"]').getBoundingClientRect();
      return r.left >= o.left && r.right <= o.right && r.top >= o.top && r.bottom <= o.bottom;
    }), 'cała strona w oknie podglądu').toBe(true);
    await expect(kreatorUi(page).getByRole('tab', { name: 'Wzrost' })).toHaveAttribute('aria-selected', 'true');
    const punkt = await page.evaluate(() => {
      const g = window.VildaPublicationCreator._geomStoreL.weight;
      return {
        x: g.plotX + (60 - 12) * (g.plotW / 204),
        y: g.plotY + g.plotH - (18.6 - g.minY) * (g.plotH / (g.maxY - g.minY)),
      };
    });
    const ekran = await punktEkranu(page, punkt.x, punkt.y);
    await page.mouse.click(ekran.x, ekran.y);
    await expect(kreatorUi(page).getByRole('tab', { name: 'Masa ciała' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Treść komentarza')).toBeVisible();
    expect((await magazyn(page)).shared.a60, 'klik w punkt 5. r.ż. na wykresie masy tworzy adnotację').toBeTruthy();
    // Rezygnacja z edycji wycofuje świeżą adnotację — jak przy kliknięciu w punkt aktywnego wykresu.
    await kreatorUi(page).getByRole('button', { name: 'Anuluj' }).click();
    expect((await magazyn(page)).shared.a60).toBeUndefined();
  });

  test('skala położeń: pola wykresu pionu i poziomu takie, jak podaje generator; publikacja zostaje w pionie', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzStrone(page);
    await palczewskaPro(page);
    const g = await page.evaluate(() => {
      const PC = window.VildaPublicationCreator;
      const L = window.VildaCentileLandscape;
      const args = { sex: 'M', userAgeMonths: 120, userWeight: 33, userHeight: 141 };
      window.buildPalczewskaExtendedCanvases(args);
      L.buildPage(args);
      const pole = (o) => ({ w: o.plotW, h: o.plotH });
      return {
        ref: L.PORTRAIT_PLOT,
        pion: { height: pole(PC._geomStore.height), weight: pole(PC._geomStore.weight) },
        poziom: { height: pole(PC._geomStoreL.height), weight: pole(PC._geomStoreL.weight) },
        skala: PC._geomStoreL.height.posScale,
      };
    });
    for (const c of ['height', 'weight']) {
      expect(g.pion[c].w).toBeCloseTo(g.ref.width, 6);
      expect(g.pion[c].h).toBeCloseTo(g.ref.height, 6);
      expect(g.poziom[c]).toEqual({ w: 1394, h: 1900 });
    }
    expect(g.skala.x).toBeCloseTo(0.7163, 4);
    expect(g.skala.y).toBeCloseTo(0.6921, 4);

    // Kreator siatek do publikacji ignoruje wybór poziomu i nie ma przełącznika „Układ”.
    await page.evaluate(() => {
      window.VildaCentileLandscape.writeLayout('landscape');
      window.publicationCharts = true;
      window.calculateGrowthAdvanced = () => {};
      window.VildaPublicationCreator.open({ context: 'pub' });
    });
    await page.locator('#vilda-pub-creator-overlay').waitFor();
    expect(await nakladka(page).evaluate((c) => [c.width, c.height])).toEqual([2480, 3508]);
    await expect(kreatorUi(page).getByRole('group', { name: 'Układ PDF' })).toHaveCount(0);
  });
});

// Przycisk otwierający Kreator ma szerokość przycisku generowania siatki przy każdej szerokości okna
// (wcześniej był wąski powyżej 600 px — pełną szerokość dawała mu tylko mobilna reguła dla wszystkich przycisków).
test('przycisk „Kreator siatek” ma szerokość i położenie przycisku generowania siatki', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzStrone(page);
  for (const zrodlo of ['OLAF', 'PALCZEWSKA']) {
    await palczewskaPro(page);
    if (zrodlo === 'OLAF') {
      await page.evaluate(() => {
        const olaf = document.getElementById('sourceOlaf');
        olaf.checked = true;
        olaf.dispatchEvent(new Event('change', { bubbles: true }));
        window.updateCentileButtons();
      });
    }
    const generuj = zrodlo === 'OLAF' ? '#generateCentileChart' : '#generatePalCentileChart';
    await expect(page.locator(generuj)).toBeVisible();
    for (const szer of [1440, 1100, 900, 700, 390]) {
      await page.setViewportSize({ width: szer, height: 1000 });
      await expect(page.locator('#openChartCreatorBtn')).toBeVisible();
      const [g, k] = await page.evaluate((sel) => [sel, '#openChartCreatorBtn'].map((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return { w: Math.round(r.width), x: Math.round(r.left) };
      }), generuj);
      expect(k, `${zrodlo}, okno ${szer} px`).toEqual(g);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});
