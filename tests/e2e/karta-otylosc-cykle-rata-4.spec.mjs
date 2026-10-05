import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-CYKLE rata 4, Karta pacjenta (decyzje właściciela 2026-09-30: D3 „zmiana substancji czynnej zaczyna nowy
// cykl” = R6; D5 „stary zapis łamiący reguły nie jest poprawiany sam — werdykt ChPL tego cyklu wstrzymany”).
// Moduł cykli oznacza przejście substancji czynnej w obrębie cyklu niezgodnością `zmiana-substancji`. Karta pacjenta:
//  - nota „Zapis … wymaga uporządkowania” mówi, co jest nie tak: lek i data po obu stronach przejścia;
//  - werdykt ChPL wstrzymany ze zdaniem o różnych progach i oknach ChPL dla każdej substancji;
//  - bez kafelków „Redukcja do oceny” i „Próg ChPL” — kryterium wybrane po leku ostatniego punktu nie jest
//    kryterium tego cyklu (dotąd zostawał kafelek progu innego leku, np. „Wegovy dorośli”).
// Ten sam zapis z jednym lekiem — werdykt jak dotąd.
//
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#CykleRata4K!26';
// Leki zapisane tak, jak zapisuje je monitor: tekst opcji leku i etykieta substancji (z U+2011).
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)', dose: '3,0 mg / dobę' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)', dose: '2,4 mg / tydz.' };

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

/** Pacjent: dorosły, 170 cm; punkty [typ, dataISO, lata, mies., masa, lek] — wiek realny wg dat. */
async function pacjent(page, imie, punkty) {
  return page.evaluate(async (d) => {
    const pts = d.punkty.map(([type, dateISO, ageYears, ageMonths, weight, lek], i) => ({
      id: `${type}-${dateISO}-${i}`, type, ageYears, ageMonths, weight, height: 170,
      bmi: +(weight / 2.89).toFixed(1), dose: lek.dose, dateISO, drug: lek.drug, substance: lek.substance,
    }));
    const ost = pts[pts.length - 1];
    const wynik = await window.VildaVault.savePatient({
      name: `Testowy ${d.imie}`,
      user: { lastName: 'Testowy', firstName: d.imie, sex: 'M', age: ost.ageYears, ageMonths: ost.ageMonths, height: 170, weight: ost.weight },
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

/** Werdykt i etykiety kafelków wybranego cyklu (ciało panelu pod przełącznikiem cykli). */
const odczyt = (panel) => panel.evaluate((el) => {
  const cialo = el.querySelector('.vilda-ob-cbody') || el;
  const v = cialo.querySelector('.vilda-oba-verdict');
  return {
    klasa: v.className,
    tytul: (v.querySelector('.vilda-oba-vt') || {}).textContent || '',
    opis: (v.querySelector('.vilda-oba-vd') || {}).textContent || '',
    kafelki: Array.from(cialo.querySelectorAll('.vilda-gha-tile .vilda-gha-k')).map((k) => k.textContent.trim()),
  };
});

// Stary zapis (sprzed R6): W i K z Saxendą, potem dwie K z Wegovy — bez Zakończenia między lekami.
const STARY_ZAPIS = [
  ['start', '2024-01-12', 40, 1, 104, SAXENDA], ['continue', '2024-04-12', 40, 4, 99, SAXENDA],
  ['continue', '2024-07-12', 40, 7, 97, WEGOVY], ['continue', '2024-10-12', 40, 10, 95, WEGOVY],
];
const OPIS_R6 = 'zmiana substancji czynnej w trakcie cyklu (Saxenda do 12.04.2024 → Wegovy od 12.07.2024) bez Zakończenia między nimi.';
const ZDANIE_R6 = 'Progi i okna oceny wg ChPL są różne dla każdej substancji, więc nie wiadomo, według którego leku i od którego punktu liczyć odpowiedź.';
const TYTUL_WSTRZYMANY = 'Zapis cyklu wymaga uporządkowania — ocena wg ChPL wstrzymana';
const KAFELKI_KRYTERIUM = ['Redukcja do oceny', 'Próg ChPL'];

test('stary zapis ze zmianą substancji w cyklu: nota mówi o przejściu, werdykt wstrzymany, bez kafelków kryterium', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  const pid = await pacjent(page, 'R6-Stary', STARY_ZAPIS);
  const { podsumowanie, panel } = await karta(page, pid);

  const k = norm(await podsumowanie.textContent());
  // Dotąd: „…wymaga uporządkowania: zapis nie spełnia reguł cykli leczenia. Popraw go…”.
  expect(k).toContain(`Zapis bieżącego cyklu wymaga uporządkowania: ${OPIS_R6} Popraw go w monitorze DocPro — do tego czasu ocena odpowiedzi wg ChPL jest wstrzymana.`);
  expect(k).not.toContain('zapis nie spełnia reguł cykli leczenia');

  const w = await odczyt(panel);
  expect(w.klasa).toContain('wait');
  expect(w.tytul).toBe(TYTUL_WSTRZYMANY);
  expect(w.opis).toBe(`W tym cyklu: ${OPIS_R6} ${ZDANIE_R6} Popraw zapis w monitorze DocPro (baner „Zapis wymaga uporządkowania”).`);
  expect(w.opis).not.toContain('Nie wiadomo, od którego punktu liczyć odpowiedź.');
  // Dotąd zostawał kafelek „Próg ChPL” z kryterium leku ostatniego punktu („Wegovy dorośli”).
  for (const kafelek of KAFELKI_KRYTERIUM) expect(w.kafelki).not.toContain(kafelek);
  expect(norm(await panel.textContent())).not.toContain('Wegovy dorośli');
  // Liczby przebiegu (część A) zostają — to pomiary, nie ocena wg ChPL.
  expect(w.kafelki).toContain('Masa przy włączeniu');
  expect(w.kafelki).toContain('Redukcja masy');
});

test('kontrola: ten sam zapis z jednym lekiem — werdykt i kafelki kryterium jak dotąd', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  const pid = await pacjent(page, 'R6-JedenLek', STARY_ZAPIS.map((p) => [...p.slice(0, 5), SAXENDA]));
  const { podsumowanie, panel } = await karta(page, pid);
  const k = norm(await podsumowanie.textContent());
  expect(k).not.toContain('wymaga uporządkowania');
  const w = await odczyt(panel);
  // Saxenda, dorosły: −8,7% masy po 39 tyg. (okno 12 tyg. dawki podtrzymującej minęło) — odpowiedź wystarczająca.
  expect(w.klasa).toContain('good');
  expect(w.tytul).toBe('Odpowiedź wystarczająca — kontynuować leczenie');
  for (const kafelek of KAFELKI_KRYTERIUM) expect(w.kafelki).toContain(kafelek);
  expect(norm(await panel.textContent())).toContain('Saxenda dorośli');
});

test('zakończony cykl ze zmianą substancji i czysty cykl bieżący: wstrzymany tylko cykl 1, kafelki wracają w cyklu 2', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  const pid = await pacjent(page, 'R6-DwaCykle', [
    ['start', '2024-01-12', 40, 1, 104, SAXENDA], ['continue', '2024-04-12', 40, 4, 99, SAXENDA],
    ['continue', '2024-07-12', 40, 7, 97, WEGOVY], ['end', '2024-10-15', 40, 10, 97.5, SAXENDA],
    ['start', '2024-11-12', 40, 11, 98.5, WEGOVY], ['continue', '2025-02-12', 41, 2, 95.5, WEGOVY],
  ]);
  const { podsumowanie, panel } = await karta(page, pid);
  const k = norm(await podsumowanie.textContent());
  expect(k).toContain('cykl 2 z 2');
  expect(k).toContain('Poprzednie cykleCykl 1 · Saxenda · 12.01.2024 – 15.10.2024');
  expect(k).toContain('· do uporządkowania');
  // Nota na karcie dotyczy tylko bieżącego cyklu — ten jest czysty.
  expect(k).not.toContain('wymaga uporządkowania:');

  const przelacznik = panel.locator('.vilda-ob-seg button');
  await expect(przelacznik).toHaveText(['Cykl 2 · Wegovy · bieżący', 'Cykl 1 · Saxenda']);
  const w2 = await odczyt(panel);
  expect(w2.tytul).toContain('Ocena kliniczna');
  expect(w2.kafelki).toEqual(expect.arrayContaining(KAFELKI_KRYTERIUM));

  await przelacznik.nth(1).click();
  await expect(przelacznik.nth(1)).toHaveAttribute('aria-selected', 'true');
  const w1 = await odczyt(panel);
  expect(w1.klasa).toContain('wait');
  expect(w1.tytul).toBe(TYTUL_WSTRZYMANY);
  expect(w1.opis).toBe('Cykl zakończony 15.10.2024 — ocena na dzień Zakończenia, bez zaleceń na dziś. '
    + `W tym cyklu: ${OPIS_R6} ${ZDANIE_R6} Popraw zapis w monitorze DocPro (baner „Zapis wymaga uporządkowania”).`);
  for (const kafelek of KAFELKI_KRYTERIUM) expect(w1.kafelki).not.toContain(kafelek);

  await przelacznik.nth(0).click();
  await expect(przelacznik.nth(0)).toHaveAttribute('aria-selected', 'true');
  expect((await odczyt(panel)).kafelki).toEqual(expect.arrayContaining(KAFELKI_KRYTERIUM));
});

test('telefon (390 px): nota R6 i wstrzymany werdykt bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await otworzZKontem(page);
  const pid = await pacjent(page, 'R6-Telefon', STARY_ZAPIS);
  const { panel } = await karta(page, pid);
  const nota = page.locator('.vilda-ob-note', { hasText: 'zmiana substancji czynnej' });
  await expect(nota).toBeVisible();
  const werdykt = panel.locator('.vilda-oba-verdict');
  await werdykt.scrollIntoViewIfNeeded();
  await expect(werdykt).toBeVisible();
  const pomiar = await page.evaluate(() => {
    const n = document.querySelector('.vilda-ob-note').getBoundingClientRect();
    const v = document.querySelector('.vilda-oba-verdict').getBoundingClientRect();
    return {
      przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      prawo: Math.max(n.right, v.right),
      lewo: Math.min(n.left, v.left),
      szerokoscOkna: window.innerWidth,
    };
  });
  expect(pomiar.przewijanie).toBeLessThanOrEqual(0);
  expect(pomiar.prawo).toBeLessThanOrEqual(pomiar.szerokoscOkna);
  expect(pomiar.lewo).toBeGreaterThanOrEqual(0);
});
