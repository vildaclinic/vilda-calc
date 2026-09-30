import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-CYKLE rata 3 (decyzja właściciela 2026-09-30: rekomendacje D1–D8 projektu „Cykle leczenia
// otyłości” przyjęte; „ruszaj z ratą 3”). Karta pacjenta liczy leczenie otyłości w CYKLACH ze wspólnego
// modułu vilda_cykle_leczenia.js: karta pokazuje bieżący cykl, znacznik „cykl N z M” i poprzednie cykle;
// panel „Dane analityczne — otyłość” ma przełącznik cykli, a kafelki, werdykt i wykres liczą wybrany cykl.
// Zapis cyklu łamiący reguły (np. dwa Włączenia bez Zakończenia) — werdykt ChPL wstrzymany (D5).
// Zakończony cykl — ta sama ocena, ale na dzień Zakończenia, bez zaleceń na dziś.
//
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#CykleRata3!26';
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'liraglutide', dose: '3,0 mg / dobę' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'semaglutide', dose: '2,4 mg / tydz.' };

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.ObesityResponseCriteria) && Boolean(window.VildaCykleLeczenia));
}

/** Pacjent: dorosły 40 l., 170 cm; punkty [typ, dataISO, masa, lek]. */
async function pacjent(page, imie, punkty) {
  return page.evaluate(async (d) => {
    const pts = d.punkty.map(([type, dateISO, weight, lek], i) => ({
      id: `${type}-${dateISO}-${i}`, type, ageYears: 40, ageMonths: 0, weight, height: 170,
      bmi: +(weight / 2.89).toFixed(1), dose: lek.dose, dateISO, drug: lek.drug, substance: lek.substance,
    }));
    const ost = pts[pts.length - 1];
    const wynik = await window.VildaVault.savePatient({
      name: `Testowy ${d.imie}`,
      user: { lastName: 'Testowy', firstName: d.imie, sex: 'M', age: 40, ageMonths: 0, height: 170, weight: ost.weight },
      obesityTherapyPoints: pts,
    }, { dedup: false });
    return wynik.patientId;
  }, { imie, punkty });
}

const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();

async function karta(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  const podsumowanie = page.locator('.vilda-gh-summary', { hasText: 'Leczenie otyłości' }).first();
  await expect(podsumowanie).toBeVisible({ timeout: 15000 });
  await page.locator('.vilda-gha-btn', { hasText: 'otyłość' }).click();
  const panel = page.locator('.vilda-gha-panel', { has: page.locator('.vilda-oba-verdict') }).first();
  await expect(panel).toBeVisible();
  return { podsumowanie, panel };
}

const werdykt = (panel) => panel.evaluate((el) => {
  const v = el.querySelector('.vilda-oba-verdict');
  return { klasa: v.className, tytul: (v.querySelector('.vilda-oba-vt') || {}).textContent || '', opis: (v.querySelector('.vilda-oba-vd') || {}).textContent || '' };
});

const DWA_CYKLE = [
  ['start', '2024-01-12', 104, SAXENDA], ['continue', '2024-04-12', 99, SAXENDA], ['end', '2024-10-15', 97.5, SAXENDA],
  ['start', '2024-11-12', 98.5, WEGOVY], ['continue', '2025-02-12', 95.5, WEGOVY], ['continue', '2025-05-10', 93, WEGOVY],
];

test('dwa cykle: karta pokazuje bieżący cykl i poprzednie, panel przełącza cykle', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  const pid = await pacjent(page, 'Cykle-Dwa', DWA_CYKLE);
  const { podsumowanie, panel } = await karta(page, pid);

  const k = norm(await podsumowanie.textContent());
  expect(k).toContain('Leczenie otyłości — Wegovy');
  expect(k).toContain('aktywne');
  expect(k).toContain('cykl 2 z 2');
  expect(k).toContain('Włączeniew wieku 40 l. 0 mies. (12.11.2024)');
  expect(k).toContain('Punkty kontrolne3 w cyklu (6 łącznie)');
  expect(k).toContain('Poprzednie cykleCykl 1 · Saxenda · 12.01.2024 – 15.10.2024 · 39,6 tyg. · −6,3% masy');

  const przelacznik = panel.locator('.vilda-ob-seg button');
  await expect(przelacznik).toHaveText(['Cykl 2 · Wegovy · bieżący', 'Cykl 1 · Saxenda']);
  await expect(przelacznik.nth(0)).toHaveAttribute('aria-selected', 'true');
  expect(norm(await panel.textContent())).toContain('Masa przy włączeniu98,5 kg');
  const w2 = await werdykt(panel);
  expect(w2.tytul).toContain('Ocena kliniczna');
  expect(w2.opis).toContain('Obecnie: −5,6% masy');

  // Cykl 1 (zakończony): liczby od jego Włączenia, ocena na dzień Zakończenia.
  await przelacznik.nth(1).click();
  await expect(przelacznik.nth(1)).toHaveAttribute('aria-selected', 'true');
  const p1 = norm(await panel.textContent());
  expect(p1).toContain('Masa przy włączeniu104 kg');
  expect(p1).toContain('Masa ostatnia97,5 kg');
  const w1 = await werdykt(panel);
  expect(w1.tytul).toMatch(/^Cykl zakończony/);
  expect(w1.opis.startsWith('Cykl zakończony 15.10.2024 — ocena na dzień Zakończenia, bez zaleceń na dziś.')).toBe(true);
  expect(w1.tytul).not.toContain('kontynuować');
});

test('stary zapis z dwoma Włączeniami w bieżącym cyklu: werdykt ChPL wstrzymany, nota na karcie', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  const pid = await pacjent(page, 'Cykle-DwaStarty', [
    ['start', '2024-01-12', 104, SAXENDA], ['continue', '2024-04-12', 99, SAXENDA],
    ['start', '2024-05-03', 99, SAXENDA], ['continue', '2024-09-01', 96, SAXENDA],
  ]);
  const { podsumowanie, panel } = await karta(page, pid);
  const k = norm(await podsumowanie.textContent());
  expect(k).toContain('Zapis bieżącego cyklu wymaga uporządkowania: dwa punkty „Włączenie” (12.01.2024 i 03.05.2024) bez Zakończenia między nimi. Popraw go w monitorze DocPro — do tego czasu ocena odpowiedzi wg ChPL jest wstrzymana.');
  expect(k).not.toContain('cykl 1 z 1');
  const w = await werdykt(panel);
  expect(w.klasa).toContain('wait');
  expect(w.tytul).toBe('Zapis cyklu wymaga uporządkowania — ocena wg ChPL wstrzymana');
  expect(w.opis).toContain('dwa punkty „Włączenie” (12.01.2024 i 03.05.2024)');
  // Dotąd: werdykt od pierwszego Włączenia (104 kg). Teraz bez kafelka „Redukcja do oceny”.
  expect(norm(await panel.textContent())).not.toContain('Redukcja do oceny');
  await expect(panel.locator('.vilda-ob-seg')).toHaveCount(0);
});

test('jeden zakończony cykl: bez przełącznika, ocena na dzień Zakończenia', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  const pid = await pacjent(page, 'Cykle-Zakonczony', DWA_CYKLE.slice(0, 3));
  const { podsumowanie, panel } = await karta(page, pid);
  const k = norm(await podsumowanie.textContent());
  expect(k).toContain('leczenie zakończone');
  expect(k).not.toContain('Poprzednie cykle');
  expect(k).toContain('Punkty kontrolne3');
  await expect(panel.locator('.vilda-ob-seg')).toHaveCount(0);
  const w = await werdykt(panel);
  expect(w.tytul).toMatch(/^Cykl zakończony/);
  expect(w.opis.startsWith('Cykl zakończony 15.10.2024 — ocena na dzień Zakończenia, bez zaleceń na dziś.')).toBe(true);
});

test('zakończony cykl bez odpowiedzi i przed oknem: tytuł mówi o zakończonym cyklu, nie zaleca odstawienia', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  // Saxenda: okno oceny 16 tyg. od Włączenia (4 tyg. zwiększania dawki + 12 tyg.). Z po 17 tyg.: −2,9% (< 5%).
  const bezOdp = await pacjent(page, 'Cykle-BezOdpowiedzi', [
    ['start', '2024-01-12', 104, SAXENDA], ['continue', '2024-03-12', 102, SAXENDA], ['end', '2024-05-10', 101, SAXENDA],
  ]);
  let { panel } = await karta(page, bezOdp);
  let w = await werdykt(panel);
  expect(w.klasa).toContain('bad');
  expect(w.tytul).toBe('Cykl zakończony — odpowiedź była niewystarczająca wg ChPL');
  expect(w.opis.startsWith('Cykl zakończony 10.05.2024 — ocena na dzień Zakończenia, bez zaleceń na dziś.')).toBe(true);
  // Z po 6 tyg. — przed oknem oceny.
  const przedOknem = await pacjent(page, 'Cykle-PrzedOknem', [
    ['start', '2024-01-12', 104, SAXENDA], ['end', '2024-02-23', 102, SAXENDA],
  ]);
  ({ panel } = await karta(page, przedOknem));
  w = await werdykt(panel);
  expect(w.tytul).toBe('Cykl zakończony przed oknem oceny');
  expect(w.opis.startsWith('Cykl zakończony 23.02.2024 — ocena na dzień Zakończenia, bez zaleceń na dziś.')).toBe(true);
});

test('telefon (390 px): karta z historią cykli i przełącznik bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await otworzZKontem(page);
  const pid = await pacjent(page, 'Cykle-Telefon', DWA_CYKLE);
  const { panel } = await karta(page, pid);
  const seg = panel.locator('.vilda-ob-seg');
  await seg.scrollIntoViewIfNeeded();
  const pomiar = await page.evaluate(() => {
    const s = document.querySelector('.vilda-ob-seg').getBoundingClientRect();
    const h = document.querySelector('.vilda-ob-hist').getBoundingClientRect();
    return {
      przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      prawo: Math.max(s.right, h.right),
      szerokoscOkna: window.innerWidth,
    };
  });
  expect(pomiar.przewijanie).toBeLessThanOrEqual(0);
  expect(pomiar.prawo).toBeLessThanOrEqual(pomiar.szerokoscOkna);
});
