import { test } from '../support/test-czas.mjs';
import { verifyLabChartGeometry } from '../support/lab-chart-geometry.mjs';

test.use({ serviceWorkers: 'block' });

for (const [width, height] of [[390, 844], [320, 760]]) {
  test(`punkty ${width}: zero na linii zera, ujemne UAG i pełna historia po dotknięciu`, async ({ page }) => {
    await verifyLabChartGeometry(page, width, height);
  });
}
