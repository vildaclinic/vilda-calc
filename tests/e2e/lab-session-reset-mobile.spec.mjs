import { test } from '../support/test-czas.mjs';
import { globalLabReset } from '../support/lab-session-reset.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
// These flows keep two clinical panes alive, visit Start and Lab, then reload the shell.
test.setTimeout(120_000);

for (const action of ['main', 'sidebar']) {
  test(`phone: Start ${action} clear also resets the loaded laboratory form`, async ({ page }) => {
    await globalLabReset(page, action);
  });
}
