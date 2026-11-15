import { test } from '../support/test-czas.mjs';
import { exerciseReadOnlyHistory } from '../support/visit-identity-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

test('telefon: Historia wizyt mieści się na ekranie i wybór wizyty nie zmienia formularza ani sejfu', async ({ page }) => {
  await exerciseReadOnlyHistory(page, { screenshotPath: test.info().outputPath('historia-wizyt-mobile.png') });
});
