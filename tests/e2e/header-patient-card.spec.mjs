import { devices, expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { openMenuPatient } from '../support/chrome-menu-fixture.mjs';
import { expectHeaderAlignment } from '../support/header-layout-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

async function openPatient(page, shell) {
  const created = await createFictionalVault(page, { shell });
  await loadPatient(created.frame, created.ids.a, 'restore');
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const record = await created.frame.evaluate(id => window.VildaVault.getPatient(id), created.ids.a);
  let source = created.frame;
  if (shell) {
    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    source = await shellFrame(page, 'DocPro');
    await readyForPatient(source);
  }
  await openMenuPatient(page);
  await expect(created.frame.locator('.vilda-auth-patient-card')).toBeVisible();
  return { ...created, source, record };
}

async function headerCardGeometry(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('iframe.app-pane:not([hidden])');
    const owner = frame ? frame.contentDocument : document;
    const origin = frame ? frame.getBoundingClientRect() : { x: 0, y: 0 };
    const box = (node, child = false) => {
      const r = node.getBoundingClientRect(), x = r.x + (child ? origin.x : 0), y = r.y + (child ? origin.y : 0);
      return { x, y, right: x + r.width, bottom: y + r.height, width: r.width, height: r.height };
    };
    const hit = node => {
      const r = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    };
    const brand = document.querySelector('.chrome-brand');
    return {
      card: box(owner.querySelector('.vilda-auth-card'), true),
      search: box(document.querySelector('#vildaHeaderSearch')),
      bell: box(document.querySelector('#vildaRemindersBtn')),
      brand: box(brand), brandHit: hit(brand),
      searchHit: hit(document.querySelector('#vildaHeaderSearch input')),
      bellHit: hit(document.querySelector('#vildaRemindersBtn')),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

async function expectPatientHeader(page) {
  await expect.poll(async () => {
    const g = await headerCardGeometry(page);
    return {
      left: Math.round(g.search.x - Math.max(g.card.x, g.brand.right + 12)),
      right: Math.round(g.card.right - g.search.right),
      bell: Math.round(g.card.right - g.bell.right),
      sameRow: Math.round(g.bell.y - g.search.y),
      brandHit: g.brandHit, searchHit: g.searchHit, bellHit: g.bellHit,
    };
  }, { message: 'patient header follows the visible card and keeps the real logo, Search and bell usable' })
    .toEqual({ left: 0, right: 108, bell: 0, sameRow: 0, brandHit: true, searchHit: true, bellHit: true });
  expect((await headerCardGeometry(page)).overflow).toBeLessThanOrEqual(1);
}

test('shell: patient card owns header geometry through desktop resizing, tabs, card replacement and return', async ({ page }, testInfo) => {
  const { frame, source, ids, record } = await openPatient(page, true);
  const proof = [];
  for (const width of [1440, 1024, 992, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectPatientHeader(page);
    for (const tab of ['Notatki', 'Historia', 'Status']) {
      await frame.locator('.vilda-auth-patient-card').getByRole('button', { name: tab, exact: true }).click();
      await expectPatientHeader(page);
    }
    proof.push(await headerCardGeometry(page));
  }
  await frame.getByRole('button', { name: 'Edytuj dane pacjenta', exact: true }).click();
  await expect(frame.locator('.vilda-auth-title')).toHaveText('Edycja pacjenta');
  await expectPatientHeader(page);
  await frame.getByRole('button', { name: '‹ Karta pacjenta', exact: true }).click();
  await expect(frame.locator('.vilda-auth-title')).toHaveText('Karta pacjenta');
  await expectPatientHeader(page);
  await page.screenshot({ path: testInfo.outputPath('patient-header-desktop.png') });
  await frame.getByRole('button', { name: '← DocPro', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/\bvilda-pane-auth-open\b/);
  await expectHeaderAlignment(page);
  await expect(source.locator('#lastName')).toHaveValue('Fikcyjny');
  expect(await source.evaluate(id => window.VildaVault.getPatient(id), ids.a)).toEqual(record);
  await testInfo.attach('patient-header-geometry.json', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
});

test.describe('phone patient card', () => {
  const phone = devices['iPhone 15 Pro'];
  test.use({ userAgent: phone.userAgent, deviceScaleFactor: phone.deviceScaleFactor, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  for (const shell of [false, true]) test(`${shell ? 'shell' : 'standalone'}: internal patient header and controls stay inside the card at 390px`, async ({ page }) => {
    const { frame, source, ids, record } = await openPatient(page, shell);
    const card = frame.locator('.vilda-auth-patient-card');
    await expect(card.locator('.vilda-patient-hero-name')).toHaveText('Fikcyjny Antoni');
    await expect.poll(() => card.evaluate(node => {
      const cardBox = node.getBoundingClientRect();
      return [...node.querySelectorAll('.vilda-auth-title, .vilda-patient-hero, .vilda-patient-hero-name, .vilda-patient-hero-actions button')].every(item => {
        const r = item.getBoundingClientRect(); return r.width > 0 && r.left >= cardBox.left - 1 && r.right <= cardBox.right + 1;
      }) && document.documentElement.scrollWidth <= innerWidth + 1;
    })).toBe(true);
    for (const tab of ['Notatki', 'Historia', 'Status']) {
      await card.getByRole('button', { name: tab, exact: true }).click();
      await expect(card.locator('.vilda-patient-hero-name')).toHaveText('Fikcyjny Antoni');
    }
    if (shell) {
      await expect(page.locator('#vildaHeaderSearch')).toBeHidden();
      for (const selector of ['[data-vilda-chrome-menu-btn]', '#vildaHeaderSearchBtn', '#vildaRemindersBtn']) {
        const control = page.locator(selector);
        await expect(control).toBeVisible();
        await expect.poll(() => control.evaluate(node => {
          const r = node.getBoundingClientRect(); return r.width >= 44 && r.height >= 44
            && node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        })).toBe(true);
      }
      await card.getByRole('button', { name: '← DocPro', exact: true }).click();
      await expect(page.locator('html')).not.toHaveClass(/\bvilda-pane-auth-open\b/);
      await expect(source.locator('#lastName')).toHaveValue('Fikcyjny');
    }
    expect(await source.evaluate(id => window.VildaVault.getPatient(id), ids.a)).toEqual(record);
  });
});
