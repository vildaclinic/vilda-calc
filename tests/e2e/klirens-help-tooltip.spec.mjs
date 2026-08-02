import { expect, test } from '@playwright/test';

// Dymek pomocy pola („i") — pływający tooltip (position:fixed) pozycjonowany
// przy przycisku. Regresja: „szkło" powłoki (backdrop-filter na #patientSet)
// czyni fieldset blokiem zawierającym dla position:fixed, więc JS musi
// przeliczać współrzędne OKNA na układ tego bloku — inaczej dymek ląduje
// kilkaset px poniżej. Ten test pilnuje, że dymek jest TUŻ przy swoim „i".

async function openGuest(page) {
  await page.addInitScript(() => {
    window.__CLCR_TEST_LEGACY_BROAD = true;
  });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Korzystaj bez logowania', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      typeof window.clcrUpdate === 'function' &&
      Boolean(window.ClcrUiWorkflow) &&
      typeof window.applyVersion === 'function',
  );
  await page.evaluate(() => {
    window.applyVersion('basic');
    window.ClcrUiWorkflow.selectFormula('egfr');
  });
  await page.waitForTimeout(80);
}

test('dymek „i" jest pływający (fixed) i przyklejony do swojego przycisku', async ({
  page,
}) => {
  await openGuest(page);

  const geo = await page.evaluate(() => {
    const btn = document.querySelector(
      '.clcr-field[data-clcr-field-id="age"] .clcr-info-button',
    );
    btn.click();
    const panel = document.getElementById('clcr-help-age');
    const cs = getComputedStyle(panel);
    const b = btn.getBoundingClientRect();
    const r = panel.getBoundingClientRect();
    const arrowVpX =
      r.left + parseFloat(cs.getPropertyValue('--clcr-arrow-x'));
    return {
      hidden: panel.hidden,
      position: cs.position,
      pointerEvents: cs.pointerEvents,
      hasText: panel.textContent.trim().length > 0,
      gapBelow: r.top - b.bottom, // dymek pod przyciskiem
      gapAbove: b.top - r.bottom, // lub nad przyciskiem (wariant --above)
      arrowOffset: Math.abs(arrowVpX - (b.left + b.width / 2)),
      ariaExpanded: btn.getAttribute('aria-expanded'),
    };
  });

  expect(geo.hidden).toBe(false);
  expect(geo.position).toBe('fixed');
  expect(geo.pointerEvents).toBe('none'); // klik „przez" dymek go zamyka
  expect(geo.hasText).toBe(true);
  expect(geo.ariaExpanded).toBe('true');
  // Dymek przylega do przycisku od góry LUB dołu (odstęp ~10 px) — nie dryfuje
  // w dół przez blok zawierający „szkła".
  const adjacent =
    (geo.gapBelow >= 0 && geo.gapBelow < 40) ||
    (geo.gapAbove >= 0 && geo.gapAbove < 40);
  expect(adjacent).toBe(true);
  // Strzałka celuje w środek przycisku „i".
  expect(geo.arrowOffset).toBeLessThan(28);
});

test('dymek „i" zamyka się kliknięciem poza nim, Esc i przy otwarciu innego', async ({
  page,
}) => {
  await openGuest(page);

  const r = await page.evaluate(() => {
    const out = {};
    const ageBtn = document.querySelector(
      '.clcr-field[data-clcr-field-id="age"] .clcr-info-button',
    );
    const agePanel = document.getElementById('clcr-help-age');
    ageBtn.click();
    out.opened = !agePanel.hidden;
    document.body.click();
    out.closesOnOutsideClick = agePanel.hidden;
    ageBtn.click();
    const reopened = !agePanel.hidden;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    out.closesOnEscape = reopened && agePanel.hidden;
    ageBtn.click();
    const sexBtn = document.querySelector(
      '.clcr-field[data-clcr-field-id="sex"] .clcr-info-button',
    );
    const sexPanel = document.getElementById('clcr-help-sex');
    sexBtn.click();
    out.onlyOneOpen = !sexPanel.hidden && agePanel.hidden;
    return out;
  });

  expect(r.opened).toBe(true);
  expect(r.closesOnOutsideClick).toBe(true);
  expect(r.closesOnEscape).toBe(true);
  expect(r.onlyOneOpen).toBe(true);
});
