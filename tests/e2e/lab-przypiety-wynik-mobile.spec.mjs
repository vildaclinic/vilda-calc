import { expect, test } from '../support/test-czas.mjs';
import { otworzPrzelicznik, pasekHistorii } from '../support/lab-historia-dane.mjs';

// LAB-HISTORIA 6.38 (P-PRZYPIETY-WYNIK, decyzje właściciela 2026-11-17) na telefonie (projekt mobile-chromium,
// iPhone): po przypięciu przycisk „✓ Przypięto” zajmuje całą szerokość wiersza przypięcia, pasek „Poprzednie wyniki
// pacjenta” nie ma chipu „teraz”, a chip przypiętej notatki biegnie przez cały rząd chipów (wyróżniony tłem, z tą
// samą treścią co pozostałe — bez znacznika „✓ z formularza”, LAB-HISTORIA 6.39). Wykres w wąskim układzie mieści
// pierścień przypiętego punktu i jego wartość, a okno przypięcia z ostrzeżeniem o duplikacie mieści się na ekranie.
// Cele dotyku ≥ 44 px, bez poziomego przewijania strony.
// Prawdziwy sejf z fikcyjną historią TSH (tests/support/lab-historia-dane.mjs; zegar stron 17.06.2026).
test.use({ serviceWorkers: 'block' });

const PRZYPNIJ = '\u{1F4CC} Przypnij do wizyty';
const BLOKADA = 'Ten sam wynik z tą datą badania jest już w karcie. Zmień datę badania albo anuluj.';

async function notatkiTsh(page, pid) {
  return (await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), pid))
    .filter((n) => n.labResult && n.labResult.testKey === 'tsh' && n.labResult.valueNum === 0.38)
    .map((n) => ({ id: n.id, data: n.clinicalDateISO }));
}

// Prostokąt elementu na ekranie (px, względem okna) z prawą i dolną krawędzią.
async function prostokat(locator) {
  const b = await locator.boundingBox();
  expect(b, 'element ma prostokąt na ekranie').not.toBeNull();
  return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height, width: b.width, height: b.height };
}

async function sprawdzPrzypiety(page) {
  const { patientId } = await otworzPrzelicznik(page, { wartosc: '' });
  await page.locator('#labUnit').selectOption('mIU/L');
  await page.locator('#labValue').fill('0,38');
  const przycisk = page.locator('#labPinResultBtn'), podpis = page.locator('#labPinSub');
  const pasek = pasekHistorii(page), svg = pasek.locator('svg.lab-strip-svg'), rzad = pasek.locator('.lab-strip-chips');
  await expect(pasek).toHaveClass(/is-on/);
  await expect(przycisk).toHaveText(PRZYPNIJ);
  await expect(przycisk).not.toHaveClass(/is-pinned/);
  await expect(podpis).toHaveText('Jeszcze nie w karcie');

  // Przed przypięciem: chip „teraz” na całą szerokość rzędu chipów.
  await expect(pasek.locator('.lab-strip-now .lab-strip-chip-d')).toHaveText('teraz');
  await expect(pasek.locator('button.lab-strip-chip.is-pinned')).toHaveCount(0);
  const teraz = await prostokat(pasek.locator('.lab-strip-now')), rzadPrzed = await prostokat(rzad);
  expect(Math.abs(teraz.width - rzadPrzed.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(teraz.left - rzadPrzed.left)).toBeLessThanOrEqual(1);

  // Przypięcie dotykiem z proponowaną datą (dziś).
  await przycisk.tap();
  await expect(page.locator('#labPinDate')).toHaveValue('2026-06-17');
  await expect(page.locator('#labPinDuplicate')).toBeHidden();
  await expect(page.locator('#labPinSave')).toHaveText('Zapisz do karty');
  await page.locator('#labPinSave').tap();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const zapisane = await notatkiTsh(page, patientId);
  expect(zapisane.map((n) => n.data)).toEqual(['2026-06-17']);

  // Przycisk i podpis wiersza: wynik jest w karcie.
  await expect(przycisk).toHaveText('✓ Przypięto');
  await expect(przycisk).toHaveClass(/is-pinned/);
  await expect(przycisk).toHaveAttribute('title', /już w karcie/);
  await expect(podpis).toHaveText('Już w karcie · data badania 17.06.26');

  // Pasek: bez chipu „teraz”, jeden chip przypiętej notatki (bez znacznika); wykres w wąskim układzie.
  await expect(pasek.locator('.lab-strip-now')).toHaveCount(0);
  await expect(pasek.locator('.lab-strip-sep')).toHaveCount(0);
  const przypiety = pasek.locator('button.lab-strip-chip.is-pinned');
  await expect(przypiety).toHaveCount(1);
  await expect(przypiety).toHaveAttribute('data-note-id', zapisane[0].id);
  await expect(przypiety.locator('.lab-strip-chip-d')).toHaveText('17.06.26');
  await expect(przypiety.locator('.lab-strip-chip-pin')).toHaveCount(0);
  await expect(svg).toHaveClass(/is-narrow/);
  await expect(svg.locator('rect.lab-strip-lane')).toHaveCount(0);
  await expect(svg.locator('circle.lab-strip-pin-ring')).toHaveCount(1);
  await expect(svg.locator('text.lab-strip-pin-sub')).toHaveCount(0);

  // „✓ Przypięto” na całą szerokość wiersza przypięcia i z celem dotyku ≥ 44 px; strona bez poziomego przewijania.
  const strona = await page.evaluate(() => {
    const row = document.getElementById('labPinRow'), css = getComputedStyle(row), root = document.documentElement;
    return {
      wierszWnetrze: row.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight),
      scroll: root.scrollWidth,
      szer: root.clientWidth,
      chipy: [...document.querySelectorAll('#labHistoryStrip button.lab-strip-chip')].map((b) => b.getBoundingClientRect().height),
    };
  });
  const btn = await prostokat(przycisk);
  expect(btn.width).toBeGreaterThanOrEqual(0.9 * strona.wierszWnetrze);
  expect(btn.height).toBeGreaterThanOrEqual(44);
  expect(strona.scroll).toBeLessThanOrEqual(strona.szer);

  // Chip przypiętej notatki przez cały rząd chipów (jak wcześniej „teraz”), ≥ 44 px wysokości.
  const chip = await prostokat(przypiety), rzadPo = await prostokat(rzad);
  expect(Math.abs(chip.width - rzadPo.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(chip.left - rzadPo.left)).toBeLessThanOrEqual(1);
  expect(chip.height).toBeGreaterThanOrEqual(44);
  // Treść jak w pozostałych chipach: data, pod nią wartość, obie w chipie.
  const data = await prostokat(przypiety.locator('.lab-strip-chip-d'));
  const wartosc = await prostokat(przypiety.locator('.lab-strip-chip-v'));
  expect(data.left).toBeGreaterThanOrEqual(chip.left);
  expect(data.right).toBeLessThanOrEqual(chip.right);
  expect(wartosc.right).toBeLessThanOrEqual(chip.right);
  expect(wartosc.top).toBeGreaterThanOrEqual(data.bottom - 1);
  // Każdy chip paska jest celem dotyku ≥ 44 px.
  expect(strona.chipy.length).toBeGreaterThanOrEqual(2);
  expect(Math.min(...strona.chipy)).toBeGreaterThanOrEqual(44);

  // Wartość przypiętego punktu (nad pierścieniem) i pierścień mieszczą się w wykresie.
  const wykres = await prostokat(svg);
  const podpisPunktu = await prostokat(svg.locator('text.lab-strip-val', { hasText: '0,38' }));
  const pierscien = await prostokat(svg.locator('circle.lab-strip-pin-ring'));
  expect(podpisPunktu.left).toBeGreaterThanOrEqual(wykres.left - 0.5);
  expect(podpisPunktu.right).toBeLessThanOrEqual(wykres.right + 0.5);
  expect(podpisPunktu.top).toBeGreaterThanOrEqual(wykres.top - 0.5);
  expect(podpisPunktu.bottom).toBeLessThanOrEqual(wykres.bottom + 0.5);
  expect(pierscien.left).toBeGreaterThanOrEqual(wykres.left - 0.5);
  expect(pierscien.right).toBeLessThanOrEqual(wykres.right + 0.5);

  // „✓ Przypięto” otwiera okno z ostrzeżeniem; ta sama data badania — zapis zablokowany.
  // Po zamknięciu okna wraca stały dock. Przewinięcie do środka ekranu odsłania przycisk
  // przed rzeczywistym dotknięciem; automatyczny nearest-scroll nie uwzględnia nakładki fixed.
  await przycisk.evaluate(button => button.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await przycisk.tap();
  const nakladka = page.locator('#labPinOverlay');
  await expect(nakladka).toHaveCount(1);
  const ostrzezenie = page.locator('#labPinDuplicate');
  await expect(ostrzezenie).toBeVisible();
  await expect(ostrzezenie.locator('.lab-pin-duplicate-title')).toHaveText('Ten wynik jest już w karcie');
  await expect(ostrzezenie.locator('.lab-pin-duplicate-text')).toHaveText(/^TSH 0,38 mIU\/L · badanie 17\.06\.26 · przypięty dziś o \d\d:\d\d\. Zapisz drugi raz tylko wtedy, gdy to osobne badanie z inną datą\.$/);
  await expect(page.locator('#labPinDuplicateDate')).toBeVisible();
  await expect(page.locator('#labPinDuplicateDate')).toHaveText(BLOKADA);
  await expect(page.locator('#labPinDate')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#labPinSave')).toBeDisabled();
  await expect(page.locator('#labPinSave')).toHaveText('Zapisz jako osobne badanie');

  // Okno mieści się na ekranie (może się przewijać w pionie), nad dolnym paskiem i bez przewijania w poziomie.
  const okno = await prostokat(nakladka.locator(':scope > div').first());
  const tlo = await prostokat(nakladka);
  const ekran = await page.evaluate(() => {
    const dialog = document.getElementById('labPinOverlay').firstElementChild;
    return { szer: window.innerWidth, wys: window.innerHeight, scroll: dialog.scrollWidth, wnetrze: dialog.clientWidth };
  });
  expect(okno.left).toBeGreaterThanOrEqual(0);
  expect(okno.top).toBeGreaterThanOrEqual(0);
  expect(okno.right).toBeLessThanOrEqual(ekran.szer);
  expect(okno.bottom).toBeLessThanOrEqual(ekran.wys);
  expect(okno.bottom).toBeLessThanOrEqual(tlo.bottom + 0.5);
  expect(ekran.scroll).toBeLessThanOrEqual(ekran.wnetrze);
  const ramka = await prostokat(ostrzezenie);
  expect(ramka.left).toBeGreaterThanOrEqual(okno.left);
  expect(ramka.right).toBeLessThanOrEqual(okno.right);

  // Inna data badania: osobne badanie można zapisać; „Anuluj” zamyka okno bez zapisu.
  await page.locator('#labPinDate').fill('2026-06-10');
  await expect(page.locator('#labPinDuplicateDate')).toBeHidden();
  await expect(page.locator('#labPinDate')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#labPinSave')).toBeEnabled();
  await expect(page.locator('#labPinSave')).toHaveText('Zapisz jako osobne badanie');
  await page.locator('#labPinCancel').tap();
  await expect(nakladka).toHaveCount(0);
  expect(await notatkiTsh(page, patientId)).toHaveLength(1);
  await expect(przycisk).toHaveText('✓ Przypięto');
}

test('telefon: „✓ Przypięto” na całą szerokość, chip przypiętej notatki w całym rzędzie, okno duplikatu na ekranie', async ({ page }) => {
  await sprawdzPrzypiety(page);
});

test('320 px: ten sam układ przypiętego wyniku na najwęższym ekranie', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await sprawdzPrzypiety(page);
});
