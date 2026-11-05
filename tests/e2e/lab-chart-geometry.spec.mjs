import { test } from '../support/test-czas.mjs';
import { verifyLabChartGeometry } from '../support/lab-chart-geometry.mjs';

test.use({ serviceWorkers: 'block' });

test('punkty 1440: rzeczywista geometria zera, UAG i różnych skal oraz każdy oryginalny zapis', async ({ page }) => {
  await verifyLabChartGeometry(page, 1440, 1000);
});
