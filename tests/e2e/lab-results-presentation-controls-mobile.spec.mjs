import { test } from '../support/test-czas.mjs';
import { verifyPresentationControls } from '../support/lab-results-presentation-controls.mjs';

test.use({ serviceWorkers: 'block' });

for (const [width, height] of [[390, 844], [320, 760]]) {
  test(`wyniki ${width}: źródła, pełne punkty i daty, łączenie Klirensu i brak skoku przełącznika`, async ({ page }) => {
    await verifyPresentationControls(page, width, height);
  });
}
