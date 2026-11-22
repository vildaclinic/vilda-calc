import { test } from '../support/test-czas.mjs';
import { exerciseWaitlistEditor } from '../support/terminarz-waitlist-fixture.mjs';

test('telefon: filtrowanie nie przesuwa modalu, wybór zamyka wyniki, a notatka przeżywa zmianę priorytetu', async ({ page }) => {
  await exerciseWaitlistEditor(page);
});
