import { test } from '../support/test-czas.mjs';
import { saveTemplateThroughPatientCard } from '../support/care-templates-patient-card-fixture.mjs';

test.use({ chwila: '2026-10-31T10:00:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });

test('care templates: patient-card wizard keeps footer navigation and save visible in the desktop shell', async ({ page }) => {
  await saveTemplateThroughPatientCard(page);
});
