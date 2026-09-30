import { expect, test } from '../support/test-czas.mjs';

// P-RETENCJA-NAGROBKI (decyzja właściciela 2026-09-30): opis retencji pod listą wersji w historii wersji mówi, jak
// retencja naprawdę działa (dotąd „dojdzie w kolejnym etapie”). Warstwę sejfu — nagrobki retencji w synchronizacji,
// przypięte, blokada — sprawdza tests/unit/retencja-nagrobki.test.mjs na prawdziwym sejfie.
//
// Własne, fikcyjne konto sejfu; osoba fikcyjna „Testowa Zofia”.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#RetencjaNagrobki!26a';
const OPIS = 'Gdy karta ma co najmniej 10 wersji, zapis przerzedza starsze na wszystkich urządzeniach: z ostatnich 24 h '
  + 'zostają wszystkie, do 30 dni — ostatnia z każdego dnia, starsze — ostatnia z miesiąca (najwyżej 40). '
  + 'Przypięte zostają zawsze.';

async function otworzHistorie(page) {
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('analyticsConsent', 'denied');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked') && Boolean(window.VildaVersionHistory));
  const pid = await page.evaluate(async () => {
    const zofia = { name: 'Testowa Zofia', user: { lastName: 'Testowa', firstName: 'Zofia', dobISO: '2015-04-20', sex: 'F', height: 128, weight: 26, age: 11, ageMonths: 5 } };
    const a = await window.VildaVault.savePatient(zofia, { dedup: false });
    await window.VildaVault.savePatient({ ...zofia, user: { ...zofia.user, weight: 26.3 } }, { dedup: false, patientId: a.patientId });
    return a.patientId;
  });
  await page.evaluate((id) => window.VildaVersionHistory.open(id, { patientName: 'Testowa Zofia' }), pid);
  const opis = page.locator('.vvh-ret').filter({ hasText: 'Gdy karta ma co najmniej 10 wersji' });
  await expect(opis).toBeVisible();
  return opis;
}

test.describe('P-RETENCJA-NAGROBKI: opis retencji w historii wersji', () => {
  test('desktop: opis zgodny z regułami retencji', async ({ page }) => {
    const opis = await otworzHistorie(page);
    await expect(opis).toHaveText(OPIS);
    await expect(page.getByText('dojdzie w kolejnym etapie')).toHaveCount(0);
  });

  test('telefon 390 px: opis się zawija, bez poziomego przewijania', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const opis = await otworzHistorie(page);
    await expect(opis).toHaveText(OPIS);
    const uklad = await opis.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        wlasne: el.scrollWidth - el.clientWidth,
        prawa: Math.round(r.right),
        szerokosc: window.innerWidth,
      };
    });
    expect(uklad.przewijanie).toBeLessThanOrEqual(0);
    expect(uklad.wlasne, 'tekst nie wystaje z własnego pudełka').toBeLessThanOrEqual(0);
    expect(uklad.prawa).toBeLessThanOrEqual(uklad.szerokosc);
  });
});
