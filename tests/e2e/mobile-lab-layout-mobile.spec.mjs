import { test, expect } from '../support/test-czas.mjs';
import { createFictionalVault, shellFrame } from '../support/centile-live-fixture.mjs';
import { otworzBadania, sekcjaBadan } from '../support/lab-historia-dane.mjs';
import { pointViewport, expectSameViewport, showCharts } from '../support/lab-chart-m1.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

async function labInShell(page, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:')
    ? route.continue() : route.abort());
  const { frame, ids: patients } = await createFictionalVault(page, { shell: true });
  const ids = await frame.evaluate(async patientId => {
    const ids = {};
    for (const [key, test, value, norm, date] of [
      ['tsh1', 'TSH', '0,99', '0,5–4,3 mIU/L', '2026-04-08'],
      ['tsh2', 'TSH', '12', '0,5–4,3 mIU/L', '2026-06-13'],
      ['ft4', 'fT4', '4', '12,9–20,6 pmol/L', '2026-06-13'],
    ]) ids[key] = (await window.VildaVault.savePatientNote({
      patientId, category: 'wynik-badania', title: 'Fikcyjny wynik ' + key,
      body: '', clinicalDateISO: date,
      labResult: { test, testKey: test.toLowerCase(), value, valueNum: Number(value.replace(',', '.')),
        unit: test === 'TSH' ? 'mIU/L' : 'pmol/L', norm },
    })).id;
    return ids;
  }, patients.a);
  const notes = () => frame.evaluate(async patientId => JSON.stringify(
    (await window.VildaVault.listPatientNotesForPatient(patientId)).sort((a, b) => a.id.localeCompare(b.id))), patients.a);
  const before = await notes();
  await otworzBadania(frame, patients.a);
  const section = sekcjaBadan(frame);
  await expect(section.locator('.vilda-lab-hist-result-row')).toHaveCount(3);
  await expect(page.locator('#mobileBottomDock')).toBeVisible();
  return { frame, section, ids, before, notes };
}

async function painted(page, frame) {
  await frame.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  // The child MutationObserver projects overlay state to the parent in its
  // next frame. Wait for that real cycle before checking a dock that stays open.
  await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
}

async function controlViewport(control) {
  return control.evaluate(element => {
    const bounds = element.getBoundingClientRect(), scrolls = [];
    for (let parent = element; parent; parent = parent.parentElement) scrolls.push([parent.scrollTop, parent.scrollLeft]);
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      pageX: window.scrollX, pageY: window.scrollY, scrolls };
  });
}

for (const width of [390, 320]) {
  test(`${width}px shell: M1 keeps the dock interactive; full Details still hides it and returns to the same chart`, async ({ page }) => {
    const { frame, section, ids, before, notes } = await labInShell(page, width);
    await showCharts(section, { tap: true });
    const point = section.locator(`.vilda-lab-result-chart-point[data-note-id="${ids.tsh1}"]`);
    await point.scrollIntoViewIfNeeded();
    const position = await pointViewport(point);
    await point.tap();
    await expect(frame.locator('.vilda-lab-point-preview-bubble strong')).toHaveText('0,99');
    await expect(point).toHaveAttribute('aria-pressed', 'true');
    await expect(frame.locator('dialog.vilda-result-details-dialog[open]')).toHaveCount(0);
    await painted(page, frame);
    await expect(page.locator('html')).not.toHaveClass(/vilda-pane-modal-open/);
    await expect(page.locator('#mobileBottomDock')).toBeVisible();
    expectSameViewport(position, await pointViewport(point));
    expect(await page.locator('#mobileBottomDock').evaluate(dock => {
      const bounds = dock.getBoundingClientRect();
      return dock.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    }), 'the native hit target at the dock is the dock, not the frame').toBe(true);

    await point.locator('xpath=ancestor::article[1]').locator('.vilda-lab-hist-chart-details').tap();
    await expect(frame.locator('#labResultDetailsDialog')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/vilda-pane-modal-open/);
    await expect(page.locator('#mobileBottomDock')).toBeHidden();
    await frame.locator('#labResultDetailsDialog .vilda-lab-hist-details-close').tap();
    await expect(page.locator('html')).not.toHaveClass(/vilda-pane-modal-open/);
    await expect(page.locator('#mobileBottomDock')).toBeVisible();
    expectSameViewport(position, await pointViewport(point));
    expect(await notes()).toBe(before);

    // An actual dock navigation must also work while the small preview is open.
    await point.tap();
    await expect(frame.locator('.vilda-lab-point-preview-bubble')).toBeVisible();
    await painted(page, frame);
    await page.locator('#mobileBottomDock').getByText('DocPro', { exact: true }).tap();
    const docpro = await shellFrame(page, 'DocPro');
    await expect(page).toHaveURL(/#\/docpro$/);
    await expect(docpro.locator('html')).toBeVisible();
  });

  test(`${width}px shell: search clear has a real inset touch target and clears the filter`, async ({ page }) => {
    const { frame, section, before, notes } = await labInShell(page, width);
    const input = section.locator('.vilda-lab-hist-search-input');
    const clear = section.locator('.vilda-lab-hist-search-clear');
    await input.fill('TSH');
    await expect(section.locator('.vilda-lab-hist-result-row')).toHaveCount(2);
    const measured = await clear.evaluate(button => {
      const input = button.parentElement.querySelector('input');
      const b = button.getBoundingClientRect(), i = input.getBoundingClientRect();
      return { width: b.width, height: b.height, rightInset: i.right - b.right,
        inside: b.left >= i.left && b.right <= i.right && b.top >= i.top - 1 && b.bottom <= i.bottom + 1,
        hit: button.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)) };
    });
    expect(measured.width, 'clear target width').toBeGreaterThanOrEqual(44);
    expect(measured.height, 'clear target height').toBeGreaterThanOrEqual(44);
    expect(measured.rightInset, 'the target is inset from the field edge').toBeGreaterThanOrEqual(4);
    expect(measured.inside, 'the whole target is inside the field').toBe(true);
    expect(measured.hit, 'the X is the actual native pointer target').toBe(true);
    await clear.tap();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(clear).toBeHidden();
    await expect(section.locator('.vilda-lab-hist-result-row')).toHaveCount(3);
    expect(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await notes()).toBe(before);
  });

  test(`${width}px shell: sparse results end next to their footer and table/chart switches keep the toolbar in place`, async ({ page }) => {
    const { frame, section, before, notes } = await labInShell(page, width);
    const query = section.locator('.vilda-lab-hist-search-input');
    await query.fill('TSH');
    await expect(section.locator('.vilda-lab-hist-date-group')).toHaveCount(2);
    const measured = await section.evaluate(section => {
      const groups = section.querySelectorAll('.vilda-lab-hist-date-group');
      const last = groups[groups.length - 1].getBoundingClientRect();
      const summary = section.querySelector('.vilda-lab-hist-footer > summary').getBoundingClientRect();
      return { gap: summary.top - last.bottom };
    });
    expect(measured.gap, 'no viewport-sized empty spacer before the results explanation').toBeLessThanOrEqual(48);
    expect(measured.gap, 'the footer does not overlap the final result').toBeGreaterThanOrEqual(0);

    const toolbar = section.locator('.vilda-lab-hist-toolbar');
    const charts = section.locator('[data-view="charts"]');
    const table = section.locator('[data-view="table"]');
    // A single short series makes the table genuinely shorter than its chart.
    // Dismiss the keyboard before comparing their natural scroll ranges.
    await query.fill('fT4');
    await expect(section.locator('.vilda-lab-hist-result-row')).toHaveCount(1);
    await query.evaluate(input => input.blur());
    await painted(page, frame);
    await expect(page.locator('#mobileBottomDock')).toBeVisible();
    const tableRange = await toolbar.evaluate(element => {
      const root = element.closest('.vilda-auth-root');
      return root.scrollHeight - root.clientHeight;
    });
    await charts.tap();
    await painted(page, frame);
    const scrolled = await toolbar.evaluate((element, tableRange) => {
      const root = element.closest('.vilda-auth-root');
      const chartRange = root.scrollHeight - root.clientHeight;
      root.scrollTop = tableRange + Math.min(20, (chartRange - tableRange) / 2);
      return { chartRange, scrollTop: root.scrollTop };
    }, tableRange);
    expect(scrolled.chartRange, 'this fixture really has a shorter table').toBeGreaterThan(tableRange + 2);
    expect(scrolled.scrollTop, 'the chart is scrolled beyond the natural table range').toBeGreaterThan(tableRange + 1);
    await painted(page, frame);
    await expect(table).toBeInViewport({ ratio: 1 });
    const position = await controlViewport(toolbar);
    await table.tap();
    await expect(table).toHaveAttribute('aria-pressed', 'true');
    await painted(page, frame);
    expectSameViewport(position, await controlViewport(toolbar));
    expect(await section.evaluate(section => {
      const group = section.querySelector('.vilda-lab-hist-date-group').getBoundingClientRect();
      return section.querySelector('.vilda-lab-hist-footer > summary').getBoundingClientRect().top - group.bottom;
    }), 'the scroll reserve does not become a gap before the footer').toBeLessThanOrEqual(48);
    await charts.tap();
    await expect(charts).toHaveAttribute('aria-pressed', 'true');
    await painted(page, frame);
    expectSameViewport(position, await controlViewport(toolbar));
    expect(await notes()).toBe(before);
  });
}
