import { expect, test } from '../support/test-czas.mjs';
import { G1, O1, X1, karta, otworz, zapisz } from '../support/karta-leczenie.mjs';
const OUT = '/tmp/claude-0/-home-user/b6a10264-3b04-5c85-b9be-671009d04141/scratchpad/kl1/shots';
test.use({ serviceWorkers: 'block', chwila: '2026-11-19T11:00:00Z' });
for (const [n, r] of [['X1', X1], ['G1', G1], ['O1', O1]]) {
  test(`shot ${n}`, async ({ page }, info) => {
    test.setTimeout(120000);
    await otworz(page);
    const pid = await zapisz(page, r);
    await karta(page, pid);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/final-${n}-${info.project.name}.png` });
    await page.locator('.vilda-kl-pasek').first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/final-${n}-${info.project.name}-leczenie.png` });
  });
}
