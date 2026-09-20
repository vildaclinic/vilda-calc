import { expect, test } from '@playwright/test';

// P-FARMAKOTERAPIA — moduł kwalifikacji musi być realnie wczytany na stronach, które
// generują zalecenia. Bez tego raport po cichu pominąłby blok o leczeniu farmakologicznym,
// a nic by się nie zepsuło w sposób widoczny. Dane FIKCYJNE.

for (const strona of ['/index.html', '/docpro.html']) {
  test(`moduł kwalifikacji jest wczytany na ${strona} i liczy na prawdziwym silniku BMI`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(strona, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.VildaFarmakoterapia && window.VildaBmi));

    const wynik = await page.evaluate(() => {
      const F = window.VildaFarmakoterapia;
      return {
        dorosly: F.ocen({ wiekMies: 480, plec: 'M', wzrostCm: 178, masaKg: 108 }),
        pasmo: F.ocen({ wiekMies: 480, plec: 'F', wzrostCm: 162, masaKg: 74 }),
        norma: F.ocen({ wiekMies: 360, plec: 'M', wzrostCm: 180, masaKg: 72 }),
        dziecko: F.ocen({ wiekMies: 108, plec: 'F', wzrostCm: 140, masaKg: 50 })
      };
    });

    expect(wynik.dorosly.wynik).toBe('spelnione');
    expect(wynik.dorosly.komunikat).toContain('leczenia farmakologicznego choroby otyłościowej');
    expect(wynik.pasmo.wynik).toBe('warunkowe');
    expect(wynik.pasmo.komunikat).toContain('decyduje obecność chorób współistniejących');
    expect(wynik.norma.wynik).toBe('niespelnione');

    // dziecko liczy się na prawdziwej siatce wczytanej przez stronę, nie na atrapie
    expect(wynik.dziecko.szczegoly.centyl).toBeGreaterThan(0);
    expect(wynik.dziecko.szczegoly.siatka).toBeTruthy();

    // ostrożność jedzie z każdym wynikiem
    for (const r of Object.values(wynik)) {
      expect(r.czegoNieSprawdza.length).toBeGreaterThanOrEqual(5);
      expect(r.zdanieLekarz).toContain('decyduje lekarz');
    }
  });
}
