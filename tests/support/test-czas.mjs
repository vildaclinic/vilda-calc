import { test as bazowy, expect } from '@playwright/test';
import { CHWILA } from './czas.mjs';

/**
 * `test` z zegarem strony ustawionym na wspólną chwilę (patrz tests/support/czas.mjs).
 *
 * Fikstura jest AUTOMATYCZNA — wystarczy zaimportować `test` stąd zamiast z '@playwright/test'
 * i każdy test w pliku startuje z ustalonej chwili, bez pamiętania o niczym w treści testu.
 * Zegar instaluje się PRZED nawigacją (fikstury wykonują się przed ciałem testu), więc skrypty
 * strony widzą właściwy czas już przy pierwszym uruchomieniu.
 *
 * Pojedynczy blok może wziąć inną chwilę:
 *   test.use({ chwila: CHWILE.przed_polnoca })
 */
export const test = bazowy.extend({
  chwila: [CHWILA, { option: true }],
  zegarStrony: [async ({ page, chwila }, uzyj) => {
    await page.clock.install({ time: new Date(chwila) });
    // `install` sam zatrzymuje czas. Aplikacja używa timerów (dławik odświeżania odznaki),
    // animacji i requestAnimationFrame, więc zamrożony zegar zmieniłby jej zachowanie zamiast
    // je tylko ustabilizować. Ustalamy punkt startu, nie bieg czasu.
    await page.clock.resume();
    await uzyj(chwila);
  }, { auto: true }],
});

export { expect };
