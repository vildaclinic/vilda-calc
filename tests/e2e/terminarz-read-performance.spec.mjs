import { expect, test } from '@playwright/test';

// These fixtures exercise the real calendar lifecycle. Vault methods are an
// observable boundary here; encrypted query/result equality is covered by the
// real-vault unit tests, rather than a copied implementation of the filters.
test.use({ serviceWorkers: 'block' });
async function prepare(frame) {
  await frame.setContent('<!doctype html><html><head></head><body><div id="terminarzRoot"></div></body></html>');
  await frame.evaluate(() => {
    const now = new Date();
    localStorage.setItem('vilda-recap-' + now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'), '1');
    window.__calendarReads = { range: 0, due: 0 };
    window.VildaVault = {
      isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-calendar-lifecycle' }),
      listPatientNotesInRange: async () => { window.__calendarReads.range += 1; return []; },
      listPatientNotesDueByDate: async () => { window.__calendarReads.due += 1; return []; },
      onUnlock: callback => { window.__calendarUnlock = callback; },
      onLock: callback => { window.__calendarLock = callback; },
      onPatientNoteChanged: callback => { window.__calendarChanged = callback; },
    };
  });
  await frame.addScriptTag({ url: '/vilda_terminarz.js' });
  await expect.poll(() => frame.evaluate(() => window.__calendarReads.range)).toBe(1);
}

test('already unlocked calendar starts once instead of repeating its read from a 250ms poll', async ({ page }) => {
  await page.goto('/tests/fixtures/service-worker-runner.html');
  await prepare(page);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__calendarReads)).toEqual({ range: 1, due: 1 });
  await page.evaluate(() => window.__calendarChanged());
  await expect.poll(() => page.evaluate(() => window.__calendarReads.range)).toBe(2);
  expect(await page.evaluate(() => window.__calendarReads.due)).toBe(2);
});

test('a retained hidden shell pane keeps change signals dirty and reads once when revealed', async ({ page }) => {
  await page.goto('/tests/fixtures/service-worker-runner.html');
  await page.evaluate(() => {
    const pane = document.createElement('iframe'); pane.id = 'fictional-calendar-pane';
    pane.src = '/tests/fixtures/service-worker-runner.html'; document.body.appendChild(pane);
  });
  const pane = page.locator('#fictional-calendar-pane');
  const frame = await (await pane.elementHandle()).contentFrame();
  await frame.waitForLoadState('load');
  await prepare(frame);
  await page.evaluate(() => { document.getElementById('fictional-calendar-pane').hidden = true; });
  // CSS hiding a same-origin iframe does not mark the browser tab hidden.
  expect(await frame.evaluate(() => document.hidden)).toBe(false);
  await frame.evaluate(() => {
    window.__calendarChanged(); window.__calendarChanged();
    document.dispatchEvent(new CustomEvent('vilda:sync-merged'));
    document.dispatchEvent(new CustomEvent('vilda:auth-hidden'));
  });
  await page.waitForTimeout(400);
  expect(await frame.evaluate(() => window.__calendarReads)).toEqual({ range: 1, due: 1 });
  await page.evaluate(() => { document.getElementById('fictional-calendar-pane').hidden = false; });
  await expect.poll(() => frame.evaluate(() => window.__calendarReads.range)).toBe(2);
  await page.waitForTimeout(400);
  expect(await frame.evaluate(() => window.__calendarReads)).toEqual({ range: 2, due: 2 });
  await frame.evaluate(() => window.__calendarChanged());
  await expect.poll(() => frame.evaluate(() => window.__calendarReads.range)).toBe(3);
});
