import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { openPatientDocuments, closePatientDocuments, DOCUMENTS_BUTTON, DOCUMENTS_DIALOG, DOCUMENTS_COPY } from '../support/patient-documents-ui.mjs';

// Real forms, source data, native report availability and real patient switching.
// Only the final download boundary is replaced in the menu-selection test; the
// report engine/PDF bytes remain covered by raport-wzrastania-tekst.spec.mjs.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const CARD = '#currentSummaryCard';
const CONTENT = '#currentSummaryContent';
const CHOICES = `${DOCUMENTS_DIALOG} input[name="patientReportPdfChoice"]`;
const GENERATE = `${DOCUMENTS_DIALOG} [data-patient-documents-generate]`;
const PREVIEW = '#vildaSummaryChartPanel svg.vilda-centile-live-preview';
const MENU = '[data-vilda-chrome-drawer]';
const TRIGGER = '[data-vilda-chrome-menu-btn]';

async function open(page, route = 'index', { shell = false } = {}) {
  await page.addInitScript(() => {
    window.__documentCopies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText(text) { window.__documentCopies.push(text); return Promise.resolve(); },
    } });
  });
  const fixture = await createFictionalVault(page, { shell });
  let frame = fixture.frame;
  if (route === 'docpro') {
    if (shell) {
      await page.evaluate(() => window.VildaShell.navigate('docpro'));
      frame = await shellFrame(page, 'DocPro');
    } else {
      await page.goto('/docpro.html', { waitUntil: 'load' });
      frame = page;
    }
    await readyForPatient(frame);
    const confirmation = frame.locator('#professionalConfirmBtn');
    if (await confirmation.isVisible()) await confirmation.click();
  }
  await frame.waitForFunction(() => window.VildaPatientDocuments && window.VildaSummaryTabs);
  return { ...fixture, frame };
}

async function fillDraft(frame, { age = 12, height = 155, weight = 44 } = {}) {
  await frame.locator('#sex').selectOption('F');
  await frame.locator('#age').fill(String(age));
  await frame.locator('#ageMonths').fill('0');
  await frame.locator('#height').fill(String(height));
  await frame.locator('#weight').fill(String(weight));
  await frame.locator('#weight').blur();
  await expect(frame.locator(CARD)).toBeVisible();
}

async function restored(frame, { long = false } = {}) {
  const record = fictionalPatient({ firstName: 'DokumentTest', sex: 'F', age: long ? 17 : 13,
    height: long ? 135 : 156, weight: long ? 25 : 44 });
  record.zscore.dataSource = 'PALCZEWSKA';
  const id = await frame.evaluate(async record => (await window.VildaVault.savePatient(record, { dedup: false })).patientId, record);
  await loadPatient(frame, id, 'restore');
  await expect(frame.locator(CARD)).toBeVisible();
  return id;
}

async function expectAligned(frame) {
  await expect(frame.locator(CARD)).toHaveClass(/vilda-summary-height-matched/);
  await expect.poll(() => frame.evaluate(() => {
    const form = document.querySelector('#userSection fieldset.user-card').getBoundingClientRect();
    const card = document.querySelector('#currentSummaryCard').getBoundingClientRect();
    return Math.abs(form.bottom - card.bottom);
  }), { message: 'the summary/chart outer bottom matches the actual form, including native status offset' }).toBeLessThanOrEqual(1);
}

async function expectDocumentsCentered(page) {
  const geometry = await page.locator(DOCUMENTS_DIALOG).evaluate(dialog => {
    const rect = dialog.getBoundingClientRect();
    const css = getComputedStyle(dialog);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const probeStyle = getComputedStyle(probe), gap = parseFloat(css.getPropertyValue('--documents-gap'));
    const inset = name => Math.max(gap, parseFloat(probeStyle[name]) || 0);
    const safe = { top: inset('paddingTop'), right: inset('paddingRight'), bottom: inset('paddingBottom'), left: inset('paddingLeft') };
    probe.remove();
    // The dialog stays centered in the physical viewport even when a stable
    // scrollbar gutter makes its fixed containing block slightly narrower.
    const width = innerWidth, height = innerHeight;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, safe,
      centerX: (safe.left + width - safe.right) / 2,
      centerY: (safe.top + height - safe.bottom) / 2,
      viewportWidth: width, viewportHeight: height,
      horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1 };
  });
  expect(Math.abs(geometry.x + geometry.width / 2 - geometry.centerX), 'dialog centered in the safe viewport, with stable gutter retained').toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.y + geometry.height / 2 - geometry.centerY), 'dialog centered vertically instead of pinned to the top edge').toBeLessThanOrEqual(1);
  expect(geometry.x).toBeGreaterThanOrEqual(geometry.safe.left - 1);
  expect(geometry.x + geometry.width).toBeLessThanOrEqual(geometry.viewportWidth - geometry.safe.right + 1);
  expect(geometry.y).toBeGreaterThanOrEqual(geometry.safe.top - 1);
  expect(geometry.y + geometry.height).toBeLessThanOrEqual(geometry.viewportHeight - geometry.safe.bottom + 1);
  expect(geometry.horizontalOverflow).toBe(false);
  await expect(page.locator(`${DOCUMENTS_DIALOG} [data-patient-documents-close]`)).toBeInViewport();
  await expect(page.locator(GENERATE)).toBeInViewport();
}

for (const route of ['index', 'docpro']) {
  test(`${route}: Dokumenty w menu zachowują cztery natywne opcje i przekazują wybrany pakiet`, async ({ page }) => {
    const { frame } = await open(page, route);
    await restored(frame);
    await openPatientDocuments(page);
    await expectDocumentsCentered(page);
    await expect(page.locator(CHOICES)).toHaveCount(4);
    expect(await page.locator(CHOICES).evaluateAll(inputs => inputs.map(input => input.value)))
      .toEqual(['visit', 'diet', 'centile', 'growth']);
    const native = await frame.evaluate(() => window.patientReportGetPdfChoiceOptions().map(option => option.value));
    expect(await page.locator(`${CHOICES}:enabled`).evaluateAll(inputs => inputs.map(input => input.value))).toEqual(native);
    expect(native).toContain('visit');
    expect(native).toContain('centile');
    expect(native).toContain('growth');
    await expect(page.locator(`${CHOICES}[value="visit"]`)).toBeChecked();
    await expect(page.locator(DOCUMENTS_COPY)).toBeEnabled();
    await expect(frame.locator('.current-summary-actions')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`${route}-documents-desktop.png`) });

    // Capture only the native generation entry. The DOM controls and availability
    // use production data; no local copy of the report composition is exercised.
    await frame.evaluate(() => {
      window.__documentPackages = [];
      window.generatePatientSelectedPdfPackage = async (_button, selected, options) => {
        window.__documentPackages.push({ selected, current: options.isCurrent() });
      };
    });
    for (const value of native) await page.locator(`${CHOICES}[value="${value}"]`).uncheck();
    await expect(page.locator(GENERATE)).toBeDisabled();
    for (const value of ['visit', 'centile', 'growth']) await page.locator(`${CHOICES}[value="${value}"]`).check();
    await page.locator(GENERATE).click();
    await expect.poll(() => frame.evaluate(() => window.__documentPackages)).toEqual([
      { selected: ['visit', 'centile', 'growth'], current: true },
    ]);
  });

  test(`${route}: równe karty, wszystkie wyniki i przewijane dodatkowe parametry bez zmiany formularza`, async ({ page }) => {
    const { frame } = await open(page, route);
    await restored(frame, { long: true });
    await expectAligned(frame);
    const formHeight = await frame.locator('#userSection fieldset.user-card').evaluate(el => el.getBoundingClientRect().height);
    await expect(frame.locator(`${CONTENT} .professional-summary-main [data-summary-key]`)).toHaveCount(10);
    expect(await frame.locator(`${CONTENT} [data-summary-key="weight"]`).evaluate(el => getComputedStyle(el).fontSize)).toBe('15px');
    await frame.locator(`${CONTENT} .professional-summary-extras > summary`).click();
    await expect(frame.locator(`${CONTENT} .professional-summary-extra-body`)).toBeVisible();
    await expectAligned(frame);
    const scroll = frame.locator(CONTENT);
    await expect(scroll).toHaveAttribute('tabindex', '0');
    expect(await scroll.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await scroll.focus();
    await scroll.press('End');
    await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(frame.locator(`${CONTENT} [data-summary-key="bsa"]`)).toBeInViewport();
    await frame.getByRole('tab', { name: 'Siatka centylowa', exact: true }).click();
    await expect(frame.locator(PREVIEW)).toBeVisible({ timeout: 30_000 });
    await expectAligned(frame);
    await frame.getByRole('tab', { name: 'Podsumowanie', exact: true }).click();
    await expectAligned(frame);
    expect(await frame.locator('#userSection fieldset.user-card').evaluate(el => el.getBoundingClientRect().height)).toBeCloseTo(formHeight, 1);
    await expect(frame.locator('.current-summary-actions')).toHaveCount(0);
    await frame.locator(CARD).screenshot({ path: test.info().outputPath(`${route}-equal-summary.png`) });
  });
}

test('pojedynczy pomiar: opis ma przyczynę niedostępności, raporty zachowują natywne bramki', async ({ page }) => {
  await open(page);
  await fillDraft(page);
  await openPatientDocuments(page);
  await expect(page.locator(DOCUMENTS_COPY)).toBeDisabled();
  await expect(page.locator('[data-patient-documents-copy-reason]')).toContainText('co najmniej dwóch pomiarów');
  const native = await page.evaluate(() => window.patientReportGetPdfChoiceOptions().map(option => option.value));
  expect(await page.locator(`${CHOICES}:enabled`).evaluateAll(inputs => inputs.map(input => input.value))).toEqual(native);
  expect(await page.evaluate(() => window.__documentCopies)).toEqual([]);
  await closePatientDocuments(page);
  await expect(page.locator(DOCUMENTS_BUTTON)).toBeFocused();
});

for (const shell of [false, true]) {
  test(`telefon ${shell ? 'app.html' : 'standalone'}: naturalna wysokość, zamknięcie menu i dostępny dialog`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { frame } = await open(page, 'docpro', { shell });
    await restored(frame, { long: true });
    await expect(frame.locator(CARD)).not.toHaveClass(/vilda-summary-height-matched/);
    await frame.locator(`${CONTENT} .professional-summary-extras > summary`).click();
    const shape = await frame.evaluate(() => {
      const card = document.querySelector('#currentSummaryCard');
      const content = document.querySelector('#currentSummaryContent');
      const form = document.querySelector('#userSection fieldset.user-card');
      return { bottom: form.getBoundingClientRect().bottom, top: card.getBoundingClientRect().top,
        internalOverflow: content.scrollHeight > content.clientHeight + 1,
        width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
    });
    expect(shape.top).toBeGreaterThanOrEqual(shape.bottom - 1);
    expect(shape.internalOverflow).toBe(false);
    expect(shape.scroll).toBeLessThanOrEqual(shape.width + 1);
    const scrollPolicy = () => page.evaluate(() => [document.documentElement, document.body]
      .map(node => ({ overflowY: getComputedStyle(node).overflowY, inline: node.style.overflow })));
    const beforeDialog = await scrollPolicy();
    await openPatientDocuments(page);
    expect((await scrollPolicy()).map(node => node.overflowY)).toEqual(['hidden', 'hidden']);
    // The lock must not replace pre-existing inline scroll settings.
    expect((await scrollPolicy()).map(node => node.inline)).toEqual(beforeDialog.map(node => node.inline));
    await expect(page.locator(MENU)).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator(DOCUMENTS_DIALOG)).toHaveAttribute('aria-modal', 'true');
    if (shell) await expect(frame.locator(DOCUMENTS_DIALOG)).toHaveCount(0);
    await expect.poll(() => page.locator(DOCUMENTS_DIALOG).evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
    const dialogBox = await page.locator(DOCUMENTS_DIALOG).boundingBox();
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(391);
    await expectDocumentsCentered(page);
    for (const key of ['Tab', 'Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      await expect.poll(() => page.locator(DOCUMENTS_DIALOG).evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath(`phone-documents-${shell ? 'shell' : 'standalone'}.png`) });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 21, left: 62 } });
    await page.setViewportSize({ width: 844, height: 390 });
    await expectDocumentsCentered(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 62, bottom: 21, left: 0 } });
    await expectDocumentsCentered(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 0, left: 0 } });
    await page.setViewportSize({ width: 390, height: 844 });
    await expectDocumentsCentered(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(DOCUMENTS_DIALOG)).toBeHidden();
    await expect(page.locator(TRIGGER)).toBeFocused();
    await expect.poll(scrollPolicy).toEqual(beforeDialog);
    await expect(page.locator(MENU)).toHaveAttribute('aria-hidden', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
}

test('app.html: aktywna strona obsługuje dokumenty, ukryta ramka nie obsługuje obcych narzędzi', async ({ page }) => {
  const { frame: start } = await open(page, 'index', { shell: true });
  await fillDraft(start);
  await openPatientDocuments(page);
  await expectDocumentsCentered(page);
  await expect(start.locator(DOCUMENTS_DIALOG)).toHaveCount(0);
  await closePatientDocuments(page);
  await start.evaluate(() => window.vildaPersistFlushNow({ force: true }));
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirm = docpro.locator('#professionalConfirmBtn');
  if (await confirm.isVisible()) await confirm.click();
  await openPatientDocuments(page);
  await expect(docpro.locator(DOCUMENTS_DIALOG)).toHaveCount(0);
  await closePatientDocuments(page);
  await page.evaluate(() => window.VildaShell.navigate('homa'));
  await expect(page.locator('iframe.app-pane[title="HOMA-IR"]')).toBeVisible();
  await expect(page.locator(DOCUMENTS_BUTTON)).toHaveAttribute('aria-disabled', 'true');
  await page.locator(DOCUMENTS_BUTTON).click({ force: true });
  await expect(page.locator(DOCUMENTS_DIALOG)).toBeHidden();
});

for (const outcome of ['open', 'patient-switch', 'route-switch']) {
  test(`opóźniony moduł Start: ${outcome} nie gubi kliknięcia ani kontekstu`, async ({ page }) => {
    const { ids } = await open(page);
    let release;
    let requests = 0;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/vilda_patient_report.js*', async route => {
      if (/\/index\.html(?:\?|$)/.test(route.request().frame().url())) {
        requests++;
        await gate;
      }
      await route.continue();
    });
    try {
      await page.goto('/app.html#/start', { waitUntil: 'load' });
      const start = await shellFrame(page, 'Start');
      await readyForPatient(start);
      await start.waitForFunction(() => Boolean(window.VildaPatientDocuments));
      await loadPatient(start, ids.a, 'restore');
      await expect(page.locator(DOCUMENTS_BUTTON)).toBeEnabled();
      await page.locator(DOCUMENTS_BUTTON).click();
      await expect.poll(() => requests).toBe(1);
      await expect.poll(() => start.evaluate(() => window.VildaPatientDocuments.getState().busy)).toBe(true);
      await expect(page.locator(DOCUMENTS_DIALOG)).toBeHidden();
      if (outcome === 'patient-switch') {
        await loadPatient(start, ids.b, 'restore');
      } else if (outcome === 'route-switch') {
        await page.evaluate(() => window.VildaShell.navigate('docpro'));
        const docpro = await shellFrame(page, 'DocPro');
        await readyForPatient(docpro);
        const confirm = docpro.locator('#professionalConfirmBtn');
        if (await confirm.isVisible()) await confirm.click();
      }
      release();
      await start.waitForFunction(() => typeof window.patientReportGetPdfChoiceOptions === 'function');
      await expect.poll(() => start.evaluate(() => window.VildaPatientDocuments.getState().busy)).toBe(false);
      if (outcome === 'open') {
        await expect(page.locator(DOCUMENTS_DIALOG), 'pierwsze kliknięcie czeka na prawdziwy loader').toBeVisible();
      } else {
        await expect(page.locator(DOCUMENTS_DIALOG), 'spóźnione żądanie nie otwiera dokumentów poprzedniego kontekstu').toBeHidden();
        await openPatientDocuments(page);
        if (outcome === 'patient-switch') {
          // Native clipboard output also applies the existing HIS/Windows-1250 conversion.
          const expected = await start.evaluate(() => window.VildaSchowek.dlaSystemuSzpitalnego(window.VildaPatientNarrativeUI.describeCurrent().text));
          expect(expected).toBeTruthy();
          await page.locator(DOCUMENTS_COPY).click();
          await expect.poll(() => start.evaluate(() => window.__documentCopies.at(-1))).toBe(expected);
          expect(await start.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(ids.b);
        }
      }
      await expect(page.locator(DOCUMENTS_DIALOG)).toHaveCount(1);
    } finally {
      release();
    }
  });
}


test('Start: wyłączenie PRO blokuje wejście i zamyka dokumenty poprzedniego trybu', async ({ page }) => {
  await open(page);
  await fillDraft(page);
  await openPatientDocuments(page);
  await page.evaluate(() => {
    const input = document.getElementById('resultsModeToggle');
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator(DOCUMENTS_DIALOG)).toBeHidden();
  await expect(page.locator(DOCUMENTS_BUTTON)).toHaveAttribute('aria-disabled', 'true');
  expect(await page.evaluate(() => window.VildaPatientDocuments.getState().reason)).toContain('PRO');
});

test('Start: nieudane pobranie raportu pozwala ponowić pierwszą akcję z menu', async ({ page }) => {
  const { ids } = await open(page);
  let allow = false, blocked = 0;
  await page.route('**/vilda_patient_report.js*', route => {
    if (!allow && /\/index\.html(?:\?|$)/.test(route.request().frame().url())) {
      blocked++;
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  const start = await shellFrame(page);
  await readyForPatient(start);
  // The summary renderer is in the failed resource; restore complete native
  // input data without waiting for that deliberately unavailable card.
  await loadPatient(start, ids.a, 'restore');
  await page.locator(DOCUMENTS_BUTTON).click();
  await expect.poll(() => blocked).toBeGreaterThan(0);
  await expect.poll(() => start.evaluate(() => window.VildaPatientDocuments.getState().busy)).toBe(false);
  await expect(page.locator(DOCUMENTS_DIALOG)).toBeHidden();
  await expect(page.locator(DOCUMENTS_BUTTON)).toBeEnabled();
  allow = true;
  await openPatientDocuments(page);
  await expect(page.locator(CHOICES)).toHaveCount(4);
  await page.screenshot({ path: test.info().outputPath('index-documents-desktop.png') });
});

test('app.html: odmowa Clipboard API kopiuje natywny tekst przez pole wewnątrz dialogu hosta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { frame } = await open(page, 'docpro', { shell: true });
  await restored(frame);
  const expected = await frame.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText() { return Promise.reject(new Error('NotAllowedError')); } } });
    return window.VildaSchowek.dlaSystemuSzpitalnego(window.VildaPatientNarrativeUI.describeCurrent().text);
  });
  expect(expected).toBeTruthy();
  await page.evaluate(() => {
    window.__fallbackCopies = [];
    document.execCommand = command => {
      const active = document.activeElement;
      window.__fallbackCopies.push({ command, value: active?.value,
        hosted: active?.closest('#patientDocumentsDialog')?.ownerDocument === document,
        selected: active?.selectionStart === 0 && active?.selectionEnd === active?.value?.length });
      return true;
    };
  });
  await openPatientDocuments(page);
  await page.locator(DOCUMENTS_COPY).click();
  await expect(page.locator(`${DOCUMENTS_DIALOG} [data-patient-documents-status]`)).toContainText('skopiowano do schowka');
  expect(await page.evaluate(() => window.__fallbackCopies)).toEqual([
    { command: 'copy', value: expected, hosted: true, selected: true },
  ]);
  await expect(page.locator(`${DOCUMENTS_DIALOG} textarea`)).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('phone-documents-shell.png') });
});
