import { expect, test } from '../support/test-czas.mjs';
import { otworzPrzelicznik, pasekHistorii, wybierzBadanie } from '../support/lab-historia-dane.mjs';

// LAB-HISTORIA PR3: pasek „Poprzednie wyniki pacjenta” w przeliczniku jednostek (lab_history_strip.js) na prawdziwym
// sejfie z fikcyjną historią (tests/support/lab-historia-dane.mjs; zegar stron 17.06.2026). Pasek jest tylko do odczytu
// (6.6), stoi za wierszem przypięcia (6.8), ukrywa się bez wyników badania (6.9), wykres ma wartość przy każdym
// punkcie bez strzałek i bez pasma norm (6.21, 6.22). Od 6.39 (makieta właściciela „wariant A”) pasek to nagłówek,
// chipy i wykres: bez podpisu z liczbą wyników, panelu szczegółów, linii różnicy i przycisku „Ukryj wykres”.
test.use({ serviceWorkers: 'block' });

const bezTwardejSpacji = (s) => String(s).replace(/\u00a0/g, ' ');
const tekst = async (locator) => bezTwardejSpacji(await locator.innerText()).replace(/\s+/g, ' ').trim();

async function tshWMiliIU(page) {
  await page.locator('#labUnit').selectOption('mIU/L');
  await page.locator('#labValue').fill('0,38');
}

test('TSH: pasek za wierszem przypięcia, chipy wg zapisu, wykres bez strzałek, bez linii różnicy; przypięcie dopisuje wynik', async ({ page }) => {
  const { patientId } = await otworzPrzelicznik(page, { wartosc: '' });
  await tshWMiliIU(page);
  const pasek = pasekHistorii(page);
  await expect(pasek).toHaveClass(/is-on/);
  await expect(page.locator('#labPinRow')).toHaveClass(/is-on/);
  // Kolejność: wynik → przypięcie → poprzednie wyniki (decyzja 6.8).
  expect(await page.evaluate(() => {
    const a = document.getElementById('labResultSection'), b = document.getElementById('labPinRow'), c = document.getElementById('labHistoryStrip');
    return a.nextElementSibling === b && b.nextElementSibling === c;
  })).toBe(true);
  await expect(pasek.locator('.lab-strip-title')).toHaveText('Poprzednie wyniki pacjenta · TSH · w mIU/L');
  await expect(pasek.locator('.lab-strip-sub')).toHaveCount(0);
  const chipy = pasek.locator('button.lab-strip-chip[data-note-id]');
  await expect(chipy).toHaveCount(4);
  await expect(chipy.locator('.lab-strip-chip-v')).toHaveText(['0,01', '0,02↓', '0,05↓', '0,12↓']);
  // Pierwszy wynik zapisany w μIU/mL: przeliczony, bez strzałki, zapis i komentarz wpisu w podpowiedzi (6.39).
  expect(bezTwardejSpacji(await chipy.first().getAttribute('title'))).toBe('zapisano: 0,01 μIU/mL · komentarz: rozpoznanie · tiamazol 30 mg');
  expect(await tekst(pasek.locator('.lab-strip-now'))).toBe('teraz 0,38');
  await expect(pasek.locator('.lab-strip-diff')).toHaveCount(0);

  const svg = pasek.locator('svg.lab-strip-svg');
  await expect(svg.locator('g.lab-strip-pt')).toHaveCount(4);
  await expect(svg.locator('line.lab-strip-drop')).toHaveCount(5);
  await expect(svg.locator('text.lab-strip-val')).toHaveText(['0,01', '0,02', '0,05', '0,12', '0,38']);
  await expect(svg.locator('text', { hasText: /[↑↓]/ })).toHaveCount(0);
  await expect(svg.locator('text.lab-strip-now-label')).toHaveText('teraz');
  await expect(pasek.locator('.vilda-trend-norm-band, .vilda-trend-norm-tag')).toHaveCount(0);
  // Etykiety osi (daty, „teraz”) nie nachodzą na siebie.
  const prostokaty = await svg.locator('text.lab-strip-date, text.lab-strip-now-label').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect(); return { l: r.left, r: r.right };
  }));
  prostokaty.sort((a, b) => a.l - b.l);
  for (let i = 1; i < prostokaty.length; i++) expect(prostokaty[i].l).toBeGreaterThanOrEqual(prostokaty[i - 1].r);

  // Klik chipa zaznacza chip i punkt (bez panelu szczegółów); komentarz wpisu w podpowiedzi; wykres bez zwijania.
  await chipy.nth(1).click();
  await expect(chipy.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(pasek.locator('.lab-strip-detail')).toHaveCount(0);
  await expect(chipy.nth(1)).toHaveAttribute('title', /komentarz: redukcja do 20 mg$/);
  await expect(pasek.locator('button.lab-strip-toggle')).toHaveCount(0);
  await expect(svg.locator('g.lab-strip-pt.is-selected')).toHaveCount(1);
  await expect(pasek.locator('.lab-strip-chart-note, .lab-strip-foot')).toHaveCount(0);
  await expect(pasek.locator('svg.lab-strip-svg')).toHaveCount(1);

  // Przypięcie: nowy wpis w pasku, bieżący wynik oznaczony jako przypięty.
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinDate').fill('2026-06-17');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  await expect(chipy).toHaveCount(5);
  await expect(chipy.last().locator('.lab-strip-chip-d')).toHaveText('17.06.26');
  // LAB-HISTORIA 6.38 (P-PRZYPIETY-WYNIK): przypięty wynik formularza to ten sam pomiar co nowy chip — bez chipu
  // „teraz”, chip notatki wyróżniony tłem (od 6.39 bez znacznika „✓ z formularza”), przycisk „✓ Przypięto”.
  await expect(pasek.locator('.lab-strip-now')).toHaveCount(0);
  await expect(chipy.last()).toHaveClass(/is-pinned/);
  await expect(chipy.last().locator('.lab-strip-chip-pin')).toHaveCount(0);
  expect(await tekst(chipy.last())).toBe('17.06.26 0,38↓');
  await expect(page.locator('#labPinSub')).toHaveText('Już w karcie · data badania 17.06.26');
  await expect(page.locator('#labPinResultBtn')).toHaveText('✓ Przypięto');
  // Pasek niczego nie zapisuje: jedyna nowa notatka to przypięcie.
  const tsh = (await page.evaluate((pid) => window.VildaVault.listPatientNotesForPatient(pid), patientId))
    .filter((n) => n.labResult && n.labResult.testKey === 'tsh' && n.labResult.valueNum != null);
  expect(tsh).toHaveLength(5);
});

test('zmiana #labUnit: wyniki przeliczone bez ↑/↓ (K26); badanie bez wyników — pasek ukryty (6.9)', async ({ page }) => {
  await otworzPrzelicznik(page, { wartosc: '' });
  await page.locator('#labUnit').selectOption('μIU/mL');
  await page.locator('#labValue').fill('0,38');
  const pasek = pasekHistorii(page);
  await expect(pasek.locator('.lab-strip-title')).toHaveText('Poprzednie wyniki pacjenta · TSH · w μIU/mL');
  await expect(pasek.locator('button.lab-strip-chip[data-note-id]')).toHaveCount(4);
  await expect(pasek.locator('.lab-strip-flag')).toHaveCount(0);
  await expect(pasek.locator('svg text', { hasText: /[↑↓]/ })).toHaveCount(0);

  await wybierzBadanie(page, 'ft3', 'fT3');
  await expect(pasek.locator('.lab-strip-title')).toHaveText(/fT3/);
  await wybierzBadanie(page, 'cortisol', 'Kortyzol');
  await expect(pasek).not.toHaveClass(/is-on/);
  await expect(pasek).toBeHidden();
});

test('LH: wynik z operatorem bez punktu, zapisana ocena w podpowiedzi chipu; kolejność przed wykresem hormonów; „Wyczyść” bez śladu w układzie', async ({ page }) => {
  await otworzPrzelicznik(page, { badanie: null });
  // Pusty formularz → wynik LH → „Wyczyść”: dół treści panelu wyniku wraca dokładnie na swoje miejsce (pasek nie
  // zostawia odstępu). Mierzymy treść panelu, nie przycisk „Wyczyść”: od warsztatu na szerokim ekranie przycisk stoi
  // w panelu formularza, przed wynikiem.
  const dolWyniku = () => page.evaluate(() => {
    const karta = document.getElementById('labResultsCard').getBoundingClientRect().top;
    const dzieci = [...document.getElementById('labResultPane').children]
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 || r.height > 0);
    return Math.max(...dzieci.map((r) => r.bottom)) - karta;
  });
  const przed = await dolWyniku();
  await wybierzBadanie(page, 'lh', 'LH');
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill('3,1');
  const pasek = pasekHistorii(page);
  await expect(pasek).toHaveClass(/is-on/);
  await expect(page.locator('#labHormoneLifespan')).toBeVisible();
  // Wynik → przypięcie → poprzednie wyniki → wykres hormonów (6.8); pasek nie zasila punktu pacjenta na krzywej.
  expect(await page.evaluate(() => {
    const ids = ['labResultSection', 'labPinRow', 'labHistoryStrip', 'labHormoneLifespan'].map((id) => document.getElementById(id));
    return ids.every((el, i) => i === 0 || (ids[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  const chipy = pasek.locator('button.lab-strip-chip[data-note-id]');
  await expect(chipy.locator('.lab-strip-chip-v')).toHaveText(['<0,1', '1,8', '2,4']);
  await expect(pasek.locator('svg g.lab-strip-pt')).toHaveCount(2);
  // Zapisana ocena cytowana dosłownie w podpowiedzi chipu (6.39: bez panelu szczegółów), z komentarzem wpisu.
  await chipy.nth(1).click();
  await expect(pasek.locator('.lab-strip-assessment .vilda-lab-assessment')).toHaveCount(0);
  await expect(chipy.nth(1)).toHaveAttribute('title', /ocena zapisana z wynikiem: „[^”]+” · komentarz: Fikcyjny komentarz LH$/);

  await page.locator('#labClearBtn').click();
  await expect(pasek).toBeHidden();
  const po = await dolWyniku();
  expect(Math.abs(po - przed)).toBeLessThanOrEqual(1);
});

test('„Badania w karcie →” poza powłoką otwiera kartę pacjenta na zakładce „Badania”; zmiana pacjenta przeładowuje pasek', async ({ page }) => {
  const { patientId } = await otworzPrzelicznik(page, { wartosc: '' });
  await tshWMiliIU(page);
  const pasek = pasekHistorii(page);
  await expect(pasek).toHaveClass(/is-on/);

  // Drugi fikcyjny pacjent bez wyników TSH: pasek znika; pacjent z wynikiem — jego dane z sejfu.
  const drugi = await page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjny Drugi', user: { name: 'Fikcyjny Drugi', sex: 'M', age: 9, ageMonths: 0, height: 130, weight: 28 },
  }, { dedup: false })).patientId);
  const ustawPacjenta = (pid) => page.evaluate((id) => {
    sessionStorage.setItem('vildaCurrentPatientId', id);
    window.dispatchEvent(new StorageEvent('storage', { key: 'vildaCurrentPatientId' }));
  }, pid);
  await ustawPacjenta(drugi);
  await expect(pasek).not.toHaveClass(/is-on/);
  await page.evaluate((pid) => window.VildaVault.savePatientNote({
    patientId: pid, title: 'Fikcyjne TSH', body: '', category: 'wynik-badania', clinicalDateISO: '2026-05-20',
    labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '3,1', valueNum: 3.1, unit: 'mIU/L' },
  }), drugi);
  await expect(pasek.locator('button.lab-strip-chip[data-note-id] .lab-strip-chip-d')).toHaveText(['20.05.26']);
  await ustawPacjenta(patientId);
  await expect(pasek.locator('button.lab-strip-chip[data-note-id] .lab-strip-chip-d')).toHaveText(['14.01.26', '25.02.26', '08.04.26', '02.06.26']);

  await pasek.locator('.lab-strip-head button.lab-strip-link').click();
  await expect(page.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/active/);
  const badania = page.locator('.vilda-lab-hist');
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(14);
  expect(await badania.locator('.vilda-lab-hist-result-row').evaluateAll((rows) =>
    [...new Set(rows.map((row) => row.getAttribute('data-series')))].sort()))
    .toEqual(['ft3', 'ft4', 'lh', 'prolactin', 'tsh']);
  await expect(badania.locator('.vilda-lab-hist-date-group').first()).toHaveAttribute('data-date-iso', '2026-06-02');
});
