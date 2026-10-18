// P-PAL-POZIOM: wspólne kroki e2e dla siatki Palczewskiej 1–18 lat w układzie A4 poziomo
// (desktop: tests/e2e/siatka-palczewskiej-poziomo.spec.mjs, telefon: …-mobile.spec.mjs).
// Dane FIKCYJNE: chłopiec 10 lat, 141 cm, 33 kg.

const HASLO = 'E2e#SiatkaPoziom!26';

export async function czekajNaGenerator(page) {
  await page.waitForFunction(() => Boolean(window.VildaCentileLandscape)
    && typeof window.generatePalczewskaCentileCharts === 'function'
    && typeof window.updateCentileButtons === 'function'
    && Boolean(window.VildaProAccess));
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

/** Strona z generatorem. zKontem: fikcyjny sejf otwarty — bez niego treść aplikacji jest ukryta za ekranem logowania. */
export async function otworzStrone(page, sciezka = '/index.html', { zKontem = true } = {}) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      // Baner zgody na analitykę leży na dole ekranu i przechwytuje kliknięcia.
      window.localStorage.setItem('analyticsConsent', 'denied');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(sciezka, { waitUntil: 'load' });
  if (zKontem) {
    await page.waitForFunction(() => Boolean(window.VildaVault));
    await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
    await page.reload({ waitUntil: 'load' });
    await czekajNaOdblokowanie(page);
  }
  await czekajNaGenerator(page);
}

export async function czekajNaOdblokowanie(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

/** Palczewska wymaga wyników PRO: dostęp podmieniamy jak w innych testach, tryb włączamy jak użytkownik. */
export async function palczewskaPro(page, { lata = 10, miesiace = 0, plec = 'M', waga = 33, wzrost = 141 } = {}) {
  await page.evaluate(({ lata, miesiace, plec, waga, wzrost }) => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) { tryb.checked = true; tryb.dispatchEvent(new Event('change', { bubbles: true })); }
    const ustaw = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ustaw('age', lata); ustaw('ageMonths', miesiace); ustaw('sex', plec); ustaw('weight', waga); ustaw('height', wzrost);
    const pal = document.getElementById('sourcePalczewska');
    pal.disabled = false;
    pal.checked = true;
    pal.dispatchEvent(new Event('change', { bubbles: true }));
    window.updateCentileButtons();
  }, { lata, miesiace, plec, waga, wzrost });
}

/** Generuje PDF przyciskiem siatki Palczewskiej i zwraca strony: [{ szer, wys }] w punktach PDF. */
export async function wygenerujPdf(page, generuj = () => window.generatePalczewskaCentileCharts()) {
  await page.evaluate(() => {
    // Generator otwiera PDF w nowej karcie (window.open z adresem blob:). Przechwytujemy sam Blob.
    window.__pdfBloby = [];
    window.__pdfOtwarte = 0;
    const utworz = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { if (b && b.type === 'application/pdf') window.__pdfBloby.push(b); return utworz(b); };
    window.open = () => { window.__pdfOtwarte += 1; return null; };
  });
  await page.evaluate(generuj);
  await page.waitForFunction(() => window.__pdfOtwarte > 0 && window.__pdfBloby.length > 0, null, { timeout: 60_000 });
  const tekst = await page.evaluate(() => window.__pdfBloby[0].text());
  const strony = [...tekst.matchAll(/\/Type \/Page\b(?!s)[\s\S]*?\/MediaBox \[([^\]]+)\]/g)].map((m) => {
    const [, , szer, wys] = m[1].trim().split(/\s+/).map(Number);
    return { szer, wys };
  });
  return strony;
}

export const A4_PION = { szer: 595.28, wys: 841.89 };
export const A4_POZIOM = { szer: 841.89, wys: 595.28 };

export function orientacja(strona) {
  if (Math.abs(strona.szer - A4_POZIOM.szer) < 0.5 && Math.abs(strona.wys - A4_POZIOM.wys) < 0.5) return 'poziom';
  if (Math.abs(strona.szer - A4_PION.szer) < 0.5 && Math.abs(strona.wys - A4_PION.wys) < 0.5) return 'pion';
  return `inna ${strona.szer}×${strona.wys}`;
}

// P-KREATOR-POZIOM: Kreator siatek PRO na stronie A4 poziomo. Dane FIKCYJNE: te same pomiary chłopca
// co wyżej, adnotacje z przesunięciami ustawionymi wcześniej w pionie (ramka, etykieta, wolna strzałka).
export async function otworzKreator(page, { uklad = 'landscape' } = {}) {
  await page.evaluate((uklad) => {
    document.getElementById('name').value = 'Pacjent Testowy';
    // Kreator przelicza dane karty przy otwarciu — tu podajemy je wprost.
    window.calculateGrowthAdvanced = () => {};
    window.advancedGrowthData = {
      currentAgeMonths: 120, currentHeight: 141, currentWeight: 33, motherHeight: 164, fatherHeight: 181, targetHeight: 179,
      measurements: [
        { ageMonths: 48, height: 103.5, weight: 16.4 }, { ageMonths: 60, height: 110.8, weight: 18.6 },
        { ageMonths: 72, height: 117.2, weight: 21.0 }, { ageMonths: 84, height: 123.6, weight: 23.9 },
        { ageMonths: 96, height: 129.4, weight: 26.8 }, { ageMonths: 108, height: 135.0, weight: 29.9 },
      ],
    };
    window.chartCreatorData = {
      palRegular: {
        shared: { a84: { txt: 'Start terapii GH' }, cur: { txt: 'Kontrola' } },
        layout: { height: { cur: { dx: 330, dy: -420 } }, weight: {} },
        free: {
          height: [{ id: 1, ageMonths: 168, value: 160, txt: 'Kanał MPH', arrow: false }],
          weight: [{ id: 2, ageMonths: 150, value: 50, txt: 'Cel', arrow: true, dx: 200, dy: -100 }],
        },
      },
    };
    window.VildaCentileLandscape.writeLayout(uklad);
    window.VildaPublicationCreator.open({ context: 'palRegular' });
  }, uklad);
  await page.locator('#vilda-pub-creator-overlay').waitFor();
}

/** Nakładka aktywnego wykresu Kreatora (widoczna kanwa z adnotacjami). */
export function nakladka(page) {
  return page.locator('#vilda-pub-creator-overlay canvas:visible').nth(1);
}

/** Wejście ekranu odpowiadające punktowi kanwy nakładki (współrzędne strony). */
export async function punktEkranu(page, x, y) {
  return nakladka(page).evaluate((c, [x, y]) => {
    const r = c.getBoundingClientRect();
    return { x: r.left + x * (r.width / c.width), y: r.top + y * (r.height / c.height) };
  }, [x, y]);
}
