import { test } from '../support/test-czas.mjs';
import { verifyM1 } from '../support/lab-chart-m1.mjs';
test.use({ serviceWorkers: 'block' });
for (const width of [390, 320]) test(`M1 ${width}: touch preview, exact values, viewport and unchanged records`, async ({ page }) => { await verifyM1(page, width); });
