import { expect, test } from '@playwright/test';

// Regresja układu strony głównej (naprawa awaryjna 2026-08-11): długa,
// niezawijana etykieta w kompaktowej karcie „Przypomnienia" (#remindersInline,
// prawa kolumna gridu #calcForm) rozpychała kolumnę gridu do min-content
// (~812 px), ściskając formularz i wypychając stronę poza viewport.
// Poprawka: #calcForm .half{min-width:0} — kolumna trzyma udział 1fr,
// a etykieta dostaje wielokropek. Test wstrzykuje produkcyjny markup karty z FIKCYJNYMI danymi (AGENTS §5)
// (sam widget jest za bramką PRO/vault) i mierzy realny grid na index.html.
test('REM-LAYOUT: długa etykieta przypomnienia nie rozpycha kolumn formularza', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/index.html', { waitUntil: 'load' });
  const out = await page.evaluate(() => {
    const host = document.getElementById('remindersInline');
    if (!host) return { error: 'brak #remindersInline' };
    const LONG = 'Obserwacja — Testowska Przykładosława przyjdzie napisać wniosek testowy — wyniki były robione w Przykładowie 11:30';
    host.style.display = 'flex';
    host.innerHTML = `
      <div class="vild-rem-card"><div class="vild-rem-body"><div class="vild-rem-sec">
        <div class="vild-rem-row">
          <div class="vild-rem-av">W</div>
          <div class="vild-rem-meta"><div class="vild-rem-nm">Testowska Przykładosława</div>
            <div class="vild-rem-cat"><span class="vild-rem-dot"></span>${LONG}</div></div>
          <div class="vild-rem-when w-over">2 dni</div>
        </div></div></div></div>`;
    const half = host.parentElement;
    const form = document.getElementById('calcForm');
    const cat = host.querySelector('.vild-rem-cat');
    return {
      halfW: half.getBoundingClientRect().width,
      formW: form.getBoundingClientRect().width,
      formOverflow: form.scrollWidth - form.clientWidth,
      catEllipsized: cat.scrollWidth > cat.clientWidth,
    };
  });
  expect(out.error).toBeUndefined();
  // Kolumna trzyma się udziału gridu (ok. połowa formularza), nie min-content treści:
  expect(out.halfW).toBeLessThan(out.formW * 0.6);
  // Formularz się nie przepełnia, a etykieta jest przycięta wielokropkiem:
  expect(out.formOverflow).toBeLessThanOrEqual(1);
  expect(out.catEllipsized).toBe(true);
});
