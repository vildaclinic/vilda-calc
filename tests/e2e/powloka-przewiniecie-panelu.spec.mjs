import { expect, test } from '../support/test-czas.mjs';
import {
  najdalej, otworzPowloke, pacjentNaStart, powrotNaStart, przejdz, przewin, ramka, sprawdzKlatki, wlaczProbnik, zapamietajWidok,
  zbierzProbki,
} from '../support/powloka-przewiniecie.mjs';

// P-PANEL-PRZEWINIECIE (decyzja właściciela 2026-10-12): panel powłoki wraca tam, gdzie go zostawiono.
//
// Zmierzone przed zmianą (Chromium, prawdziwa powłoka, ramka Start): powłoka ukrywa nieaktywny panel przez
// display:none, a to zeruje przewinięcie jego dokumentu — scrollY 679 → 0 na desktopie 1440×1000 (513 → 0 na
// telefonie); wystarcza samo hidden ramki. Po zmianie powłoka zapamiętuje przewinięcie przed ukryciem i odtwarza je
// przed pierwszą klatką. Cel nawigacji (sekcja konta) ma pierwszeństwo. Telefon, w tym przebudowa wyników nad oknem
// i dół strony: powloka-przewiniecie-panelu-mobile.spec.mjs. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PanelPrzewiniecie!26';

test('powrót na Start po zmianie panelu: strona stoi tam, gdzie ją zostawiono, od pierwszej widocznej klatki', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page, HASLO);
  await pacjentNaStart(start);
  // Pierwszy powrót po wpisaniu pacjenta zawsze odtwarza sesję w Start (Gp_p) i przebudowuje wyniki pod oknem.
  await powrotNaStart(page, start, 679, 'Start, 679 px jak w pomiarze');
});

test('cel nawigacji ma pierwszeństwo: sekcja konta zamiast zapamiętanego miejsca Ustawień; zwykły powrót odtwarza ostatnie miejsce', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzPowloke(page, HASLO);
  await przejdz(page, 'ustawienia');
  const ust = await ramka(page, 'Ustawienia');
  await ust.waitForFunction(() => window.VildaVault.isUnlocked(), null, { timeout: 30000 });
  const zapamietane = await przewin(ust, Math.round((await najdalej(ust)) / 2));
  expect(zapamietane, 'Ustawienia przewinięte przed wyjściem').toBeGreaterThan(160);
  await zapamietajWidok(ust);
  await przejdz(page, 'start');

  await wlaczProbnik(ust);
  // Ten sam cel, który wysyła awatar konta w nagłówku (powloka-konto-stan-narzedzi.spec.mjs).
  await przejdz(page, 'ustawienia', 'ustawienia.html#settings-section-account');
  const sekcja = ust.locator('#settings-section-account');
  await expect(sekcja).toHaveAttribute('open', '');
  await expect(sekcja.locator('summary')).toBeInViewport();
  const P = await zbierzProbki(ust);
  const naCelu = await ust.evaluate(() => window.scrollY);
  expect(Math.abs(naCelu - zapamietane), 'cel i zapamiętane miejsce różnią się (inaczej test niczego nie rozstrzyga)').toBeGreaterThan(50);
  expect(P.y.filter((v) => Math.abs(v - zapamietane) <= 1), 'zapamiętane miejsce nie pojawia się w żadnej widocznej klatce').toEqual([]);

  // Kontrola: bez celu panel wraca tam, gdzie go zostawiono — tu przy sekcji konta.
  await zapamietajWidok(ust);
  await przejdz(page, 'start');
  await wlaczProbnik(ust);
  await przejdz(page, 'ustawienia');
  sprawdzKlatki(await zbierzProbki(ust), naCelu, 'Ustawienia po zwykłym powrocie');
});

// P-USTAWIENIA-CEL (2026-10-13): Ustawienia otwierały sekcję celu dopiero w setTimeout(0) po doręczeniu
// vilda:shell-navigate-target. Każda klatka namalowana wcześniej pokazywała panel tam, gdzie właśnie był:
// w Chromium 141 na górze strony, a w CI (Chromium 149) w miejscu sprzed wyjścia. Test wyżej łapał to tylko pod
// obciążeniem: padał w CI na #643, #652 i #653, lokalnie nigdy. Tu zadania ramki są celowo opóźnione, jak na
// zajętym procesorze, więc wyścig zachodzi za każdym razem. Od pierwszej widocznej klatki panel ma pokazywać
// otwartą sekcję konta.
test('cel nawigacji przy zajętej ramce: sekcja konta w każdej widocznej klatce, od pierwszej', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzPowloke(page, HASLO);
  await przejdz(page, 'ustawienia');
  const ust = await ramka(page, 'Ustawienia');
  await ust.waitForFunction(() => window.VildaVault.isUnlocked(), null, { timeout: 30000 });
  const zapamietane = await przewin(ust, Math.round((await najdalej(ust)) / 2));
  expect(zapamietane, 'Ustawienia przewinięte przed wyjściem').toBeGreaterThan(160);
  await przejdz(page, 'start');

  await ust.evaluate(() => {
    // Zajęty procesor: zadania z setTimeout w ramce Ustawień ruszają najwcześniej po 250 ms, czyli po kilku klatkach.
    const zwykly = window.setTimeout;
    window.setTimeout = (fn, ms, ...reszta) => zwykly(fn, Math.max(Number(ms) || 0, 250), ...reszta);
    // Próbnik: w każdej klatce, w której ramka jest widoczna, czy sekcja konta jest otwarta i jej nagłówek w oknie.
    const P = { klatki: [], stop: false };
    window.__przewCel = P;
    const krok = () => {
      if (P.stop) return;
      if (!window.frameElement.hidden) {
        const sekcja = document.getElementById('settings-section-account');
        const r = sekcja.querySelector('summary').getBoundingClientRect();
        P.klatki.push({ y: window.scrollY, otwarta: sekcja.open, wOknie: r.top >= 0 && r.bottom <= window.innerHeight });
      }
      requestAnimationFrame(krok);
    };
    requestAnimationFrame(krok);
  });
  await przejdz(page, 'ustawienia', 'ustawienia.html#settings-section-account');
  await ust.waitForFunction(() => window.__przewCel.klatki.length >= 6, null, { timeout: 30000 });
  const klatki = await ust.evaluate(() => { window.__przewCel.stop = true; return window.__przewCel.klatki; });
  const zle = klatki.map((k, i) => ({ klatka: i, ...k })).filter((k) => !k.otwarta || !k.wOknie);
  expect(zle, 'każda widoczna klatka, od pierwszej, pokazuje otwartą sekcję konta').toEqual([]);
  expect(klatki.filter((k) => Math.abs(k.y - zapamietane) <= 1), 'zapamiętane miejsce nie pojawia się w żadnej klatce').toEqual([]);
});

test('lista pacjentów otwierana z innego panelu: Start pod listą i po jej zamknięciu stoi tam, gdzie go zostawiono', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page, HASLO);
  await pacjentNaStart(start);
  const zapamietane = await przewin(start, 679);
  await przejdz(page, 'docpro');
  await ramka(page, 'DocPro');
  await page.evaluate(() => window.VildaShell.openPatientsInStart());
  await start.waitForFunction(() => {
    const lista = document.querySelector('.vilda-auth-root');
    return Boolean(lista && getComputedStyle(lista).display !== 'none' && !window.frameElement.hidden);
  }, null, { timeout: 30000 });
  // Po oknie powrotu: odtworzenie sesji przy pokazaniu może na chwilę przebudować wyniki nad oknem.
  await start.waitForFunction(() => !document.documentElement.classList.contains('vilda-panel-powrot'), null, { timeout: 30000 });
  expect(Math.abs((await start.evaluate(() => window.scrollY)) - zapamietane), 'Start pod listą pacjentów').toBeLessThanOrEqual(1);
  await start.evaluate(() => window.VildaAuthUI.hide());
  await start.waitForFunction(() => getComputedStyle(document.querySelector('.vilda-auth-root')).display === 'none');
  expect(Math.abs((await start.evaluate(() => window.scrollY)) - zapamietane), 'Start po zamknięciu listy').toBeLessThanOrEqual(1);
});
