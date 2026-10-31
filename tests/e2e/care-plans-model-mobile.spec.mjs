import { test } from '@playwright/test';
import { legacyModelReadScenario } from '../support/care-plans-model-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care-plan model phone shell: Start, clearance, return and reload read legacy data without migration or dirty state', async ({ page }) => {
  await legacyModelReadScenario(page, { shell: true });
});
