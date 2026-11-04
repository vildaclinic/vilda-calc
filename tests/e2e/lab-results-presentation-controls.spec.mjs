import { test } from '../support/test-czas.mjs';
import { verifyPresentationControls } from '../support/lab-results-presentation-controls.mjs';

test.use({ serviceWorkers: 'block' });

test('wyniki 1440: źródła, pełne punkty i daty, wspólne łączenie oraz stałe położenie przełącznika', async ({ page }) => {
  await verifyPresentationControls(page, 1440, 900);
});
