import { devices } from '@playwright/test';
import { expect, test } from '../support/test-czas.mjs';
import { shellFrame } from '../support/centile-live-fixture.mjs';
import { emulatePhone } from '../support/telefon-poziomo.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const TITLE = 'Fikcyjny szablon podglądu — żółć';
const BODY = [
  'Fikcyjna treść szablonu, bez danych pacjenta.',
  '<b>To pozostaje zwykłym tekstem</b> & znaki: < >.',
  '',
  ...Array.from({ length: 35 }, (_, i) => `Wiersz ${i + 1}: fikcyjny opis do sprawdzenia długiego podglądu.`),
  'Ostatni wiersz pełnej notatki.',
].join('\n');

async function openNotebook(page, { shell, mobile }) {
  if (mobile) await emulatePhone(page, { width: 390, height: 844 });
  await page.route('**/*', route => {
    const url = route.request().url();
    return url.startsWith('http://127.0.0.1:') || url.startsWith('data:') || url.startsWith('blob:')
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('analyticsConsent', 'denied');
    localStorage.setItem('pwzNumber', '0000000');
    const allowFictionalPro = () => {
      const access = window.VildaProAccess;
      if (!access) return;
      access.__setTokenModeForTest(false);
      access.setPlan('pro', '2099-12-31T23:59:59.000Z');
    };
    document.addEventListener('DOMContentLoaded', allowFictionalPro, { once: true });
    document.addEventListener('vilda:session-changed', allowFictionalPro);
  });
  await page.goto(shell ? '/app.html#/notatki' : '/notatki.html', { waitUntil: 'load' });
  const frame = shell ? await shellFrame(page, 'Notatnik') : page;
  await frame.waitForFunction(() => Boolean(window.VildaVault));
  await frame.evaluate(() => window.VildaVault.createUser('E2e#FikcyjnyNotatnik!2026', {
    label: 'Fikcyjny sejf podglądu Notatnika', iterations: 10000,
  }));
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  // The fixture creates its synthetic account through the real vault API;
  // dismiss the previous setup screen before using native pointer actions.
  await frame.evaluate(() => window.VildaAuthUI.hide());
  if (shell) await page.evaluate(() => window.VildaAuthUI?.hide());
  await expect(frame.locator('#vilda-auth-ui-root')).toBeHidden();
  await frame.evaluate(() => {
    window.VildaProAccess.__setTokenModeForTest(false);
    window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z');
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await frame.evaluate(async ({ title, body }) => {
    await window.VildaVault.saveNote({ title, body, category: 'wlasne', pinned: true });
  }, { title: TITLE, body: BODY });
  await expect(frame.locator('.note-card')).toHaveCount(1);
  await expect(frame.locator('#notesSearch')).toBeVisible();
  const before = await frame.evaluate(async () => {
    const vault = window.VildaVault;
    const notes = await vault.listNotes();
    window.__notebookPreviewWrites = 0;
    const save = vault.saveNote;
    // Observe the production write without replacing storage or its result.
    vault.saveNote = function (...args) {
      window.__notebookPreviewWrites += 1;
      return Reflect.apply(save, this, args);
    };
    return notes;
  });
  return { frame, before };
}

async function scales(page, frame) {
  const read = () => ({ scale: visualViewport?.scale ?? 1, width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth });
  return { host: await page.evaluate(read), owner: await frame.evaluate(read) };
}

async function activate(locator, mobile) {
  if (mobile) await locator.tap();
  else await locator.click();
}

async function checkNotebook(page, options) {
  const { frame, before } = await openNotebook(page, options);
  const { mobile } = options;
  const search = frame.locator('#notesSearch');
  const initial = await scales(page, frame);
  if (mobile) {
    expect(initial.host.width, 'rzeczywisty viewport telefonu, także w powłoce').toBe(390);
    expect(initial.owner.width, 'ramka Notatnika używa szerokości telefonu').toBe(390);
    // Chromium does not reproduce native iOS focus zoom. The >=16 px contract
    // detects its CSS trigger without disabling the user's pinch zoom.
    expect(await search.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  }
  await activate(search, mobile);
  await expect(search).toBeFocused();
  await search.pressSequentially('zolc');
  await expect(frame.locator('.note-card')).toHaveCount(1);
  await search.fill('fikcyjny-brak-takiej-notatki');
  await expect(frame.locator('.note-card')).toHaveCount(0);
  await search.fill('');
  await expect(frame.locator('.note-card')).toHaveCount(1);
  await expect(search).toBeFocused();
  const afterSearch = await scales(page, frame);
  expect(afterSearch.host.scale).toBeCloseTo(initial.host.scale, 5);
  expect(afterSearch.owner.scale).toBeCloseTo(initial.owner.scale, 5);
  expect(afterSearch.host.overflow).toBeLessThanOrEqual(1);
  expect(afterSearch.owner.overflow).toBeLessThanOrEqual(1);

  const previewButton = frame.locator('.note-act--preview');
  await expect(previewButton).toHaveText('Podgląd');
  await activate(previewButton, mobile);
  const preview = frame.locator('dialog#notePreview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('open', '');
  await expect(preview).toHaveAttribute('aria-labelledby', 'notePreviewTitle');
  await expect(frame.locator('#notePreviewTitle')).toHaveText(TITLE);
  expect(await frame.locator('#notePreviewBody').textContent()).toBe(BODY);
  await expect(frame.locator('#notePreviewBody b')).toHaveCount(0);
  await expect(preview.locator('input, textarea, select, [contenteditable="true"]')).toHaveCount(0);
  await expect(frame.locator('#noteEditorOverlay')).toBeHidden();
  const close = frame.locator('#notePreviewClose');
  await expect(close).toHaveText('Zamknij');
  await expect(close).toBeFocused();
  if (mobile) {
    await frame.locator('#notePreviewBody').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await expect.poll(() => frame.locator('#notePreviewBody').evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  }
  await expect(close).toBeInViewport();
  await activate(close, mobile);
  await expect(preview).toBeHidden();
  await expect(previewButton).toBeFocused();
  const afterPreview = await scales(page, frame);
  expect(afterPreview.host.scale).toBeCloseTo(initial.host.scale, 5);
  expect(afterPreview.owner.scale).toBeCloseTo(initial.owner.scale, 5);

  // The separate existing edit action still opens the editor, without turning
  // reading into an edit or writing merely because the editor was cancelled.
  await activate(frame.locator('.note-card').getByRole('button', { name: 'Edytuj', exact: true }), mobile);
  await expect(frame.locator('#noteEditorOverlay')).toBeVisible();
  await expect(frame.locator('#noteFieldTitle')).toHaveValue(TITLE);
  await expect(frame.locator('#noteFieldBody')).toHaveValue(BODY);
  await activate(frame.locator('#noteEditorCancel'), mobile);
  await expect(frame.locator('#noteEditorOverlay')).toBeHidden();
  const after = await frame.evaluate(async () => ({ notes: await window.VildaVault.listNotes(), writes: window.__notebookPreviewWrites }));
  expect(after.notes).toEqual(before);
  expect(after.writes, 'podgląd, wyszukiwanie i anulowanie edycji nie zapisują notatki').toBe(0);

  await activate(previewButton, mobile);
  await expect(preview).toBeVisible();
  if (!mobile) {
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await expect(previewButton).toBeFocused();
    await activate(previewButton, mobile);
    await expect(preview).toBeVisible();
  }
  if (options.shell) {
    await page.evaluate(() => { location.hash = '/start'; });
    await expect(page).toHaveURL(/#\/start$/);
    // Visibility alone would pass when the shell hides its parent iframe;
    // the native dialog must close and release the rendered plaintext.
    await expect.poll(() => frame.evaluate(() => ({
      open: document.getElementById('notePreview').open,
      title: document.getElementById('notePreviewTitle').textContent,
      body: document.getElementById('notePreviewBody').textContent,
    }))).toEqual({ open: false, title: '', body: '' });
  } else {
    // Standalone auth navigates to Start after locking. Observe the old DOM
    // after the production onLock handlers and retain only this test witness.
    await frame.evaluate(() => window.VildaVault.onLock(() => {
      sessionStorage.setItem('__notebookPreviewAtLock', JSON.stringify({
        open: document.getElementById('notePreview').open,
        title: document.getElementById('notePreviewTitle').textContent,
        body: document.getElementById('notePreviewBody').textContent,
      }));
    }));
    await Promise.all([
      page.waitForURL(url => url.pathname.endsWith('/index.html'), { waitUntil: 'load' }),
      frame.evaluate(() => window.VildaVault.lock()),
    ]);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('__notebookPreviewAtLock'))))
      .toEqual({ open: false, title: '', body: '' });
  }
  if (options.shell) {
    await page.evaluate(() => { location.hash = '/notatki'; });
    await expect(page).toHaveURL(/#\/notatki$/);
    await expect(preview).toBeHidden();
    await expect(frame.locator('.note-card')).toHaveCount(1);
    await activate(previewButton, mobile);
    await expect(preview).toBeVisible();
    expect(await frame.locator('#notePreviewBody').textContent()).toBe(BODY);
    await activate(close, mobile);
    expect(await frame.evaluate(() => window.__notebookPreviewWrites)).toBe(0);
  }
}

test('Notatnik desktop: pełny podgląd bez edycji i zapisu, powrót fokusu i wyszukiwanie', async ({ page }) => {
  await checkNotebook(page, { shell: false, mobile: false });
});

test.describe('Notatnik na telefonie', () => {
  const phone = devices['iPhone 15 Pro'];
  test.use({
    viewport: phone.viewport, screen: phone.screen, userAgent: phone.userAgent,
    deviceScaleFactor: phone.deviceScaleFactor, isMobile: true, hasTouch: true,
  });
  for (const shell of [false, true]) {
    test(`${shell ? 'powłoka' : 'samodzielny'}: wyszukiwanie bez zmiany skali i podgląd przez dotyk`, async ({ page }) => {
      await checkNotebook(page, { shell, mobile: true });
    });
  }
});
