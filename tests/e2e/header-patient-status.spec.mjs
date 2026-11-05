import { devices, expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, fixturePreferences, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const STATUS = '#vildaHeaderSaveStatus';
const LABELS = { saved: 'Zapisano', dirty: 'Niezapisane', new: 'Nowy pacjent', saving: 'Zapisywanie…', error: 'Błąd zapisu' };

async function emptySyntheticAccount(page, shell) {
  await fixturePreferences(page);
  await page.goto(shell ? '/app.html#/start' : '/index.html', { waitUntil: 'load' });
  let owner = shell ? await shellFrame(page) : page;
  await owner.waitForFunction(() => Boolean(window.VildaVault));
  await owner.evaluate(() => window.VildaVault.createUser('E2e#PustyNaglowek!2026', {
    label: 'Fikcyjne puste konto statusu nagłówka', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  owner = shell ? await shellFrame(page) : page;
  await readyForPatient(owner);
  return owner;
}

async function expectState(page, state, visible = true) {
  const status = page.locator(STATUS);
  await expect(status).toHaveAttribute('data-save-state', state);
  if (state === 'hidden') {
    await expect(status).toBeHidden();
    await expect(status).toHaveAttribute('hidden', '');
    await expect(status).toHaveAttribute('aria-hidden', 'true');
    return;
  }
  await expect(status.locator('[data-header-save-label]')).toHaveText(LABELS[state]);
  if (visible) await expect(status).toBeVisible();
  else await expect(status).toBeHidden();
}

async function anchorGeometry(page) {
  await page.mouse.move(0, 0);
  return page.evaluate(() => {
    const pane = document.querySelector('iframe.app-pane:not([hidden])');
    const owner = pane?.contentDocument || document;
    const box = node => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const form = owner.querySelector('#userSection fieldset.user-card');
    return {
      header: box(document.querySelector('body > header')),
      search: box(document.querySelector('#vildaHeaderSearchBtn')),
      bell: box(document.querySelector('#vildaRemindersBtn')),
      form: { x: form.getBoundingClientRect().x, y: form.getBoundingClientRect().y + owner.defaultView.scrollY },
    };
  });
}

async function expectStable(page, baseline) {
  await expect.poll(() => anchorGeometry(page), { message: 'changing patient status preserves the header actions and first form position' }).toEqual(baseline);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

async function expectPopover(page, title) {
  const status = page.locator(STATUS);
  await status.click();
  const popover = page.locator('.vilda-save-popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('.vsp-hero-title')).toHaveText(title);
  await expect(status).toHaveAttribute('aria-expanded', 'true');
  expect(await popover.evaluate(node => {
    const r = node.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
  }), 'the existing status explanation remains inside the viewport').toBe(true);
  await status.click();
  await expect(popover).toBeHidden();
  await expect(status).toHaveAttribute('aria-expanded', 'false');
}

for (const shell of [false, true]) test(`${shell ? 'shell' : 'standalone'}: inline patient status follows real edits, save outcomes, clear and the 992px breakpoint`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 852 });
  const owner = await emptySyntheticAccount(page, shell);
  await expectState(page, 'hidden');
  const empty = await anchorGeometry(page);
  await owner.locator('#firstName').fill('Fikcyjny Szkic Nagłówka');
  await expectState(page, 'new');
  await expectStable(page, empty);
  await expectPopover(page, 'Nowy pacjent');
  await owner.evaluate(() => window.clearAllData());
  await expectState(page, 'hidden');
  await expectStable(page, empty);

  const patientId = await owner.evaluate(async payload => (await window.VildaVault.savePatient(payload, { dedup: false })).patientId, fictionalPatient());
  await loadPatient(owner, patientId, 'restore', { clear: true });
  await expectState(page, 'saved');
  for (const width of [320, 390, 860, 991, 992, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await owner.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    const mobile = width < 992;
    await expectState(page, 'saved', mobile);
    const baseline = await anchorGeometry(page);
    await owner.locator('#height').fill('159');
    await expectState(page, 'dirty', mobile);
    await expectStable(page, baseline);
    if (mobile) {
      const actions = page.locator('[data-vilda-chrome-menu-btn], #vildaHeaderSearchBtn, #vildaRemindersBtn');
      for (const action of await actions.all()) await expect(action).toBeVisible();
      const status = await page.locator(STATUS).boundingBox();
      const search = await page.locator('#vildaHeaderSearchBtn').boundingBox();
      expect(status.x + status.width, `${width}px: the status leaves the lupa usable`).toBeLessThanOrEqual(search.x);
    } else {
      const menu = page.locator('aside.sidebar-v2 .sidebar-inner');
      await expect(menu).toBeVisible();
      await expect(menu.locator('[data-menu-save-status]')).toHaveAttribute('data-save-state', 'dirty');
      await expect(menu.locator('[data-menu-save-status]')).toHaveText('Niezapisane zmiany');
    }
    await owner.locator('#height').fill('158');
    await expectState(page, 'saved', mobile);
    await expectStable(page, baseline);
  }

  await page.setViewportSize({ width: 390, height: 852 });
  await expectState(page, 'saved');
  await expectPopover(page, 'Zapisano');
  const saved = await anchorGeometry(page);
  await owner.locator('#height').fill('159');
  await expectState(page, 'dirty');
  await expectPopover(page, 'Niezapisane zmiany');
  // Delay only the real synthetic vault's write; production save and status
  // publication run unchanged, including their normal failure handling.
  await owner.evaluate(() => {
    window.__headerRealSave = window.VildaVault.savePatient;
    window.VildaVault.savePatient = () => new Promise((resolve, reject) => { window.__headerRejectSave = reject; });
  });
  await (await visibleChromeMenu(page)).locator('.chrome-menu-save').click();
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saving');
  await expectState(page, 'saving');
  await expectStable(page, saved);
  await expectPopover(page, 'Zapisywanie…');
  await owner.evaluate(() => {
    window.__headerRejectSave(new Error('Fikcyjny błąd zapisu statusu nagłówka'));
    window.VildaVault.savePatient = window.__headerRealSave;
  });
  await expectState(page, 'error');
  await expectStable(page, saved);
  await expectPopover(page, 'Błąd zapisu');
  await expect(owner.locator('#height')).toHaveValue('159');
  await owner.evaluate(() => window.saveUserData());
  await expectState(page, 'saved');
  await expectStable(page, saved);
  await owner.evaluate(() => window.clearAllData());
  await expectState(page, 'hidden');
  await expectStable(page, saved);
});

test('shell: a delayed failure in the hidden Start cannot overwrite active DocPro status or its popover', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 852 });
  const { frame: start, ids } = await createFictionalVault(page, { shell: true });
  await loadPatient(start, ids.a, 'restore', { clear: true });
  await start.locator('#height').fill('159');
  await expectState(page, 'dirty');
  await start.evaluate(() => {
    window.VildaVault.savePatient = () => new Promise((resolve, reject) => { window.__headerRejectHiddenSave = reject; });
  });
  await (await visibleChromeMenu(page)).locator('.chrome-menu-save').click();
  await expect.poll(() => start.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saving');
  await expectState(page, 'saving');
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await docpro.locator('#height').fill('160');
  await expect.poll(() => docpro.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('dirty');
  await expectState(page, 'dirty');
  const activeGeometry = await anchorGeometry(page);
  await start.evaluate(() => {
    window.__headerRejectHiddenSave(new Error('Fikcyjny spóźniony błąd ukrytego Startu'));
  });
  await expectState(page, 'dirty');
  await expectStable(page, activeGeometry);
  await expectPopover(page, 'Niezapisane zmiany');
  await expect(docpro.locator('#height')).toHaveValue('160');
  await expect(page.locator('#vildaSaveFeedback')).toBeHidden();
});

test.describe('physical iPhone inline status', () => {
  const phone = devices['iPhone 15 Pro'];
  test.use({ userAgent: phone.userAgent, deviceScaleFactor: phone.deviceScaleFactor,
    isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

  test('shell: empty, first entry and clear keep the lupa and bell reachable on the real phone layout', async ({ page }) => {
    const owner = await emptySyntheticAccount(page, true);
    await expect(page.locator('html')).toHaveClass(/\bvilda-phone\b/);
    await expectState(page, 'hidden');
    const actions = page.locator('[data-vilda-chrome-menu-btn], #vildaHeaderSearchBtn, #vildaRemindersBtn');
    const expectActions = async () => {
      await expect(actions).toHaveCount(3);
      for (const action of await actions.all()) {
        await expect(action).toBeVisible();
        await expect.poll(() => action.evaluate(node => {
          const r = node.getBoundingClientRect();
          return r.width >= 44 && r.height >= 44 && node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }), { message: 'each real phone header action remains a reachable 44px target' }).toBe(true);
      }
    };
    await expectActions();
    const empty = await anchorGeometry(page);
    await owner.locator('#firstName').fill('Fikcyjny Szkic Telefonu');
    await expectState(page, 'new');
    await expectStable(page, empty);
    await expectActions();
    await expectPopover(page, 'Nowy pacjent');
    await owner.evaluate(() => window.clearAllData());
    await expectState(page, 'hidden');
    await expectStable(page, empty);
    await expectActions();
    await expect(page.locator('body > header input')).toHaveCount(0);
  });
});
