import { expect, test } from '@playwright/test';

// Przycisk „Kopiuj ściągę B.64" w karcie SGA (decyzja właściciela co do miejsca).
//
// Test sprawdza to, czego jednostkowy nie widzi: że przycisk naprawdę wstaje w tej karcie,
// obok pozostałych akcji, że kliknięcie składa zestawienie z prawdziwych pól strony i kładzie
// je do schowka — a na stronie nic nie pokazuje.
test.use({ serviceWorkers: 'block' });

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
    const writeText = (t) => { window.__schowek = t; return Promise.resolve(); };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaB64Checklist) && Boolean(window.VildaB64ChecklistUI));
}

// Kliknięcie przycisku. Karta SGA żyje w module lekarskim, który w domyślnym stanie strony
// jest zwinięty — jego rozwinięcie to osobna ścieżka UI, nie przedmiot tego testu. Klikamy
// więc element bezpośrednio: zdarzenie i tak przechodzi przez delegację na `document`,
// czyli przez tę samą obsługę, którą uruchamia kliknięcie lekarza. Sam fakt, że przycisk
// stoi we właściwym miejscu karty, sprawdza pierwszy test.
async function klik(page) {
  await page.evaluate(() => document.getElementById('copyB64ChecklistBtn').click());
  await page.waitForFunction(() => typeof window.__schowek === 'string' && window.__schowek.length > 0);
  return page.evaluate(() => window.__schowek);
}

test('przycisk stoi w karcie SGA, obok pozostałych akcji', async ({ page }) => {
  await otworz(page);
  const gdzie = await page.evaluate(() => {
    const b = document.getElementById('copyB64ChecklistBtn');
    if (!b) return null;
    const reset = document.getElementById('resetSgaBirth');
    return {
      tekst: b.textContent.trim(),
      wTejSamejGrupie: Boolean(reset && reset.parentNode === b.parentNode),
      wKarcie: Boolean(document.getElementById('sgaBirthCard').contains(b)),
      poResecie: Boolean(reset && (reset.compareDocumentPosition(b)
        & Node.DOCUMENT_POSITION_FOLLOWING)),
    };
  });
  expect(gdzie, 'przycisk istnieje').not.toBeNull();
  expect(gdzie.tekst).toBe('Kopiuj ściągę B.64');
  expect(gdzie.wKarcie).toBe(true);
  expect(gdzie.wTejSamejGrupie).toBe(true);
  expect(gdzie.poResecie).toBe(true);
});

test('kliknięcie kopiuje zestawienie do schowka i nie pokazuje go na stronie', async ({ page }) => {
  await otworz(page);
  const dlugoscPrzed = await page.evaluate(() => document.body.innerText.length);
  const t = await klik(page);

  // Wszystkie osiem pozycji i stopka, która mówi, kto naprawdę kwalifikuje.
  for (let nr = 1; nr <= 8; nr += 1) expect(t).toMatch(new RegExp(`\\n${nr}\\. `));
  expect(t).toMatch(/Aplikacja nie kwalifikuje do programu/);
  expect(t).toMatch(/Zespół Koordynacyjny/);
  expect(t).toMatch(/muszą być spełnione łącznie/);

  // Na stronie zestawienia nie ma — rośnie tylko o toast.
  const dlugoscPo = await page.evaluate(() => document.body.innerText.length);
  expect(dlugoscPo - dlugoscPrzed).toBeLessThan(120);
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('Zespół Koordynacyjny');
});

test('dane z karty urodzeniowej realnie trafiają do zestawienia', async ({ page }) => {
  await otworz(page);
  await page.evaluate(() => {
    document.querySelector('input[name="sgaBirthSex"][value="male"]').checked = true;
    document.getElementById('sgaBirthWeeks').value = '34';
    document.getElementById('sgaBirthDays').value = '2';
    document.getElementById('sgaBirthWeight').value = '1850';
    document.getElementById('sgaBirthLength').value = '43';
  });
  const t = await klik(page);

  expect(t).toMatch(/1\. Masa lub długość urodzeniowa < −2 SD[^\n]*— SPEŁNIONE/);
  expect(t).toMatch(/34\+2 tc/);
  expect(t).toMatch(/wg Niklasson/);
  // Kryteria spoza aplikacji zostają nazwane wprost, a nie jako brak danych.
  expect(t).toMatch(/6\. Wykluczenie innych[^\n]*— POZA APLIKACJĄ/);
  expect(t).toMatch(/8\. Brak przeciwwskazań[^\n]*— POZA APLIKACJĄ/);
});

test('bez danych zestawienie nadal powstaje i uczciwie mówi „brak danych"', async ({ page }) => {
  await otworz(page);
  const t = await klik(page);
  expect(t).toMatch(/1\.[^\n]*— BRAK DANYCH/);
  expect(t).toMatch(/3\.[^\n]*— BRAK DANYCH/);
  // Kontrola negatywna: pusta karta nie może produkować „SPEŁNIONE".
  expect(t).not.toMatch(/1\.[^\n]*— SPEŁNIONE/);
});
