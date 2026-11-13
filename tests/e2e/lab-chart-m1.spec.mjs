import { test } from '../support/test-czas.mjs';
import { verifyM1 } from '../support/lab-chart-m1.mjs';
test.use({ serviceWorkers: 'block' });
test('M1: saved values, colors, hover/focus, lifecycle and exact note', async ({ page }) => { await verifyM1(page, 1440); });
