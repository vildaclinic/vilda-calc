import { expect, test } from '@playwright/test';

// P-CHPL na PRAWDZIWEJ stronie: zdania o ocenie odpowiedzi docierają do karty „Leczenie otyłości"
// z JEDYNEGO źródła (`obesity_response_criteria.js`), a nie z kopii w warstwie UI.
//
// Usunięcie kopii to dopiero połowa poprawki — druga połowa to dowód, że lekarz nadal widzi
// regułę. Ten test sprawdza obie strony naraz: treść na ekranie jest identyczna z tym, co oddaje
// moduł kryteriów, i nie ma na niej żadnej z trzech reguł usuniętych jako niezgodne z ChPL.
//
// Dane wyłącznie FIKCYJNE.

async function otworzKarte(page) {
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.ObesityResponseCriteria)
    && Boolean(document.getElementById('obesitySubstance'))
    && Boolean(document.getElementById('obesityInfoList')));
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      if (!e) return;
      e.value = String(v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', 40); set('weight', 110); set('height', 175);
  });
}

// Karty nie rozwijamy klikaniem: przycisk wejścia lustruje widoczność modułu antybiotyków,
// a ta jest za bramką PRO — bramka należy do sąsiedniego modułu i nie jest przedmiotem tego
// testu. Listy substancji i preparatów oraz renderowanie zaleceń działają niezależnie od tego,
// czy karta jest rozwinięta, więc jedziemy prawdziwą ścieżką renderowania i czytamy jej wynik.
async function wybierz(page, substancja, produkt) {
  await page.evaluate(([s, p]) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = String(v);
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('obesitySubstance', s);
    set('obesityBrand', p);
  }, [substancja, produkt]);
  await expect
    .poll(async () => page.locator('#obesityInfoList li').count(), { timeout: 15000 })
    .toBeGreaterThan(0);
  return page.locator('#obesityInfoList').evaluate((ul) => Array.from(ul.querySelectorAll('li')).map((li) => li.textContent.trim()));
}

test('zdanie o ocenie odpowiedzi jest na ekranie i pochodzi z modułu kryteriów', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);

  const lista = await wybierz(page, 'liraglutide', 'saxenda');
  const zModulu = await page.evaluate(() => window.ObesityResponseCriteria.zdanieGrupy('saxenda', 40));

  expect(zModulu, 'moduł kryteriów zna zdanie dla dorosłego').toBeTruthy();
  expect(lista, 'to samo zdanie stoi na ekranie').toContain(zModulu);
  // ChPL mówi „Należy przerwać leczenie" — warstwa UI łagodziła to do „Rozważyć przerwanie".
  expect(zModulu).toContain('należy przerwać');
  expect(lista.join(' ')).not.toContain('Rozważyć przerwanie');
});

test('tirzepatyd nie pokazuje reguły, której nie ma w ChPL', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);

  const lista = await wybierz(page, 'tirzepatide', 'mounjaro');
  const zModulu = await page.evaluate(() => window.ObesityResponseCriteria.zdanieGrupy('mounjaro', 40));

  expect(lista, 'zdanie o ocenie klinicznej').toContain(zModulu);
  expect(zModulu).toContain('ocena kliniczna');

  const tekst = lista.join(' ');
  expect(tekst, 'usunięta reguła 6-miesięczna').not.toContain('6 miesiącach');
  expect(tekst, 'usunięta reguła 6-miesięczna').not.toContain('6 miesięcy');
  expect(tekst, 'brak progu przypisanego ChPL').not.toMatch(/<\s*5\s*%/);
});

test('naltrekson/bupropion: nakaz odstawienia bez dorobionej reguły rocznej', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);

  const lista = await wybierz(page, 'naltrexone_bupropion', 'mysimba');
  const zModulu = await page.evaluate(() => window.ObesityResponseCriteria.zdanieGrupy('mysimba', 40));

  expect(lista).toContain(zModulu);
  expect(zModulu).toContain('16 tyg.');
  expect(zModulu, 'ChPL: weryfikacja raz w roku, bez progu utrzymania').toContain('raz w roku');
  expect(lista.join(' '), 'usunięty dorobiony próg roczny').not.toContain('nie jest utrzymana');
});

test('semaglutyd: schemat dawkowania zna dawkę 7,2 mg', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);
  await wybierz(page, 'semaglutide', 'wegovy');

  const dawkowanie = await page.locator('#obesityDoseContent').textContent();
  expect(dawkowanie, 'ChPL 14.07.2026 dopuszcza 7,2 mg u dorosłych z BMI ≥30').toContain('7,2 mg');

  const lista = await page.locator('#obesityInfoList').evaluate((ul) => Array.from(ul.querySelectorAll('li')).map((li) => li.textContent).join(' '));
  expect(lista).toContain('7,2 mg');
  expect(lista, 'u dorosłych ChPL nie podaje progu').toContain('ocena kliniczna');
});
