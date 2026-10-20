import { devices, expect, test } from '@playwright/test';

// P-POLITYKA-TABELE i P-STOPKA-DOCK (2026-10-20, znalezione przy weryfikacji P-SW-STRONY-PRAWNE).
//
// 1. Tabele polityki prywatności na telefonie były ucinane: karta ma overflow: hidden, a nazwy
//    kluczy w <code> rozpychały tabelę ponad jej szerokość. Wiersze stają się teraz kartami
//    z nazwą kolumny (data-label) nad treścią, a tabela siedzi w pojemniku z overflow-x: auto.
// 2. Przy maksymalnym przewinięciu strzałka „na górę” i dock zasłaniały linki prawne stopki.
//    Odstęp na body nie wydłużał przewijania poza iOS (body ma tam height: 100%), więc stopka
//    sama rezerwuje miejsce pod dockiem i strzałką.
// Oba tory body sprawdzamy osobno: iOS (urządzenie projektu, body z height: auto) i Android.

test.use({ viewport: { width: 390, height: 844 } });

async function otworz(page, plik) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('analyticsConsent', 'denied');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(`/${plik}`, { waitUntil: 'load' });
  await expect(page.locator('#mobileBottomDock')).toBeVisible();
}

/** Przewija jak użytkownik (kolejne kroki, nie jeden skok) do samego dołu i czeka, aż dock i strzałka staną. */
async function przewinNaDol(page) {
  await expect.poll(() => page.evaluate(() => {
    window.scrollBy({ top: 200, behavior: 'instant' });
    return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
  }), { intervals: [16], timeout: 30_000 }).toBe(true);
  let poprzednie = '';
  await expect.poll(async () => {
    const teraz = await page.evaluate(() => ['scrollTopBtn', 'mobileBottomDock']
      .map((id) => { const r = document.getElementById(id)?.getBoundingClientRect(); return r ? `${r.top},${r.bottom}` : '-'; })
      .join('|') + `|${window.scrollY}`);
    const stoi = teraz === poprzednie;
    poprzednie = teraz;
    return stoi;
  }, { intervals: [150], timeout: 10_000 }).toBe(true);
}

/** Elementy stopki, których środek nie jest klikalny albo które zachodzą na strzałkę lub dock. */
function zasloniete(page) {
  return page.evaluate(() => {
    const widoczny = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height && r.bottom > 0 && r.top < window.innerHeight ? r : null;
    };
    const nakladki = [
      ['strzałka „na górę”', widoczny(document.getElementById('scrollTopBtn'))],
      ['dock', widoczny(document.querySelector('#mobileBottomDock .mobile-bottom-dock__list'))],
    ].filter(([, r]) => r);
    const bledy = [];
    for (const el of document.querySelectorAll('.site-footer a, .site-footer__disclaimer, .site-footer__bottom > span')) {
      const r = el.getBoundingClientRect();
      const nazwa = el.textContent.trim().slice(0, 30);
      const trafiony = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!trafiony || !(trafiony === el || el.contains(trafiony))) bledy.push(`środek „${nazwa}” pod ${trafiony ? trafiony.id || trafiony.getAttribute('class') || trafiony.tagName : 'krawędzią okna'}`);
      for (const [n, o] of nakladki) {
        if (r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top) bledy.push(`„${nazwa}” zachodzi na: ${n}`);
      }
    }
    return bledy;
  });
}

function bezPoziomegoPrzewijania(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const [tor, urzadzenie] of [['iOS', null], ['Android', devices['Pixel 7']]]) {
  test.describe(`${tor}, 390 × 844`, () => {
    if (urzadzenie) test.use({ userAgent: urzadzenie.userAgent });

    test('tabele polityki prywatności mieszczą się w karcie i każda komórka ma nazwę kolumny', async ({ page }) => {
      await otworz(page, 'polityka-prywatnosci.html');
      const tabele = await page.evaluate(() => [...document.querySelectorAll('.privacy-card table')].map((tabela) => {
        const karta = tabela.closest('.privacy-card').getBoundingClientRect();
        const naglowki = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent.trim());
        const komorki = [...tabela.querySelectorAll('tbody td')];
        return {
          wPojemniku: tabela.parentElement.classList.contains('privacy-table-scroll'),
          naglowki,
          bezEtykiety: komorki.filter((td, i) => td.dataset.label !== naglowki[i % naglowki.length]).length,
          ucietych: komorki.filter((td) => { const r = td.getBoundingClientRect(); return r.left < karta.left - 0.5 || r.right > karta.right + 0.5; }).length,
          komorek: komorki.length,
        };
      }));
      expect(tabele).toHaveLength(2);
      expect(tabele.map((t) => t.naglowki)).toEqual([
        ['Mechanizm', 'Co przechowuje', 'Kiedy usuwane'],
        ['Kategoria danych', 'Okres przechowywania', 'Podstawa'],
      ]);
      for (const t of tabele) {
        expect(t.komorek).toBeGreaterThan(0);
        expect(t.ucietych, 'komórki wystające poza kartę (overflow: hidden je ucina)').toBe(0);
        expect(t.bezEtykiety, 'data-label komórki = nagłówek jej kolumny').toBe(0);
        expect(t.wPojemniku, 'tabela w pojemniku z przewijaniem w poziomie').toBe(true);
      }
      expect(await bezPoziomegoPrzewijania(page)).toBeLessThanOrEqual(1);
    });

    for (const plik of ['polityka-prywatnosci.html', 'regulamin.html', 'kontakt.html']) {
      test(`${plik}: na dole strony linki prawne stopki są klikalne, nic nie leży pod strzałką ani dockiem`, async ({ page }) => {
        await otworz(page, plik);
        await przewinNaDol(page);
        await expect(page.locator('.site-footer a[href="polityka-prywatnosci.html"]')).toBeInViewport();
        await expect(page.locator('.site-footer a[href="regulamin.html"]')).toBeInViewport();
        expect(await zasloniete(page)).toEqual([]);
        expect(await bezPoziomegoPrzewijania(page)).toBeLessThanOrEqual(1);
      });
    }
  });
}
