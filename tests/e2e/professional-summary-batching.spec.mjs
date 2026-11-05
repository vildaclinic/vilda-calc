import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, readyForPatient } from '../support/centile-live-fixture.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

for (const route of ['/index.html', '/docpro.html']) {
  test(`${route}: restoration batches the real summary without changing its lines, colors or saved patient`, async ({ page }) => {
    const { ids } = await createFictionalVault(page);
    if (route !== '/index.html') {
      await page.goto(route, { waitUntil: 'load' });
      await readyForPatient(page);
    }
    await loadPatient(page, ids.a, 'restore');
    await czekajNaOdtworzenieSesji(page);
    await page.waitForFunction(() => !window.__vildaPersistRestoring && !window.VildaDobAge.restorePending());
    await expect(page.locator('#currentSummaryContent .professional-summary-main')).toBeVisible();
    const result = await page.evaluate(async patientId => {
      const summary = document.getElementById('currentSummaryContent');
      const details = summary.querySelector('.professional-summary-extras');
      details.open = true;
      const view = () => ({
        lines: window.getFormattedProfessionalSummaryLines(),
        rows: Array.from(summary.querySelectorAll('.professional-summary-row'), node => ({
          key: node.dataset.summaryKey, tone: node.dataset.tone, assessment: node.dataset.assessment,
          text: node.textContent, background: getComputedStyle(node).backgroundColor,
        })),
        detailsOpen: details.open,
      });
      const payload = () => { const data = window.collectUserData(); delete data.timestampISO; return JSON.stringify(data); };
      const savedBefore = JSON.stringify(await window.VildaVault.getPatient(patientId));
      const before = view(), payloadBefore = payload();
      const events = [];
      const listener = event => events.push({ ...event.detail, restoring: window.__vildaPersistRestoring });
      document.addEventListener('vilda:professional-summary-updated', listener);
      const observer = new MutationObserver(() => {});
      observer.observe(summary, { childList: true, subtree: true });
      const original = window.advancedGrowthData;
      let during;
      window.VildaHtml.withResultRefreshBatch(() => {
        for (let index = 0; index < 142; index++) window.advancedGrowthData = original;
        window.updateProfessionalSummaryCard();
        during = { events: events.length, mutations: observer.takeRecords().length, view: view() };
      });
      const records = observer.takeRecords();
      const committed = records.filter(record => record.target.classList?.contains('professional-summary-main')).length;
      const after = view(), batchEvents = events.length;
      // An ordinary public refresh must still complete before it returns.
      window.updateProfessionalSummaryCard();
      const ordinaryEvents = events.length - batchEvents;
      observer.disconnect();
      document.removeEventListener('vilda:professional-summary-updated', listener);
      return {
        before, after, during, committed, batchEvents, ordinaryEvents,
        payloadSame: payload() === payloadBefore,
        savedSame: JSON.stringify(await window.VildaVault.getPatient(patientId)) === savedBefore,
      };
    }, ids.a);
    expect(result.during).toEqual({ events: 0, mutations: 0, view: result.before });
    expect(result.batchEvents).toBe(1);
    expect(result.committed).toBe(1);
    expect(result.after).toEqual(result.before);
    expect(result.ordinaryEvents).toBe(1);
    expect(result.payloadSame).toBe(true);
    expect(result.savedSame).toBe(true);

    const restored = await page.evaluate(() => {
      const events = [];
      const listener = event => events.push({ ...event.detail, restoring: window.__vildaPersistRestoring });
      document.addEventListener('vilda:professional-summary-updated', listener);
      window.vildaPersistFlushNow({ force: true });
      window.vildaPersistRestoreAll();
      document.removeEventListener('vilda:professional-summary-updated', listener);
      return { events, lines: window.getFormattedProfessionalSummaryLines() };
    });
    expect(restored.events).toHaveLength(1);
    expect(restored.events.every(event => event.restoring === false)).toBe(true);
    expect(restored.lines).toEqual(result.before.lines);
    await expect(page.locator('#currentSummaryCard')).toBeVisible();
  });
}
