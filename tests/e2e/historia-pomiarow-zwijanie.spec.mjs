import { expect, test } from '../support/test-czas.mjs';

// P-HISTORIA-ZWIJANA (decyzje właściciela 2026-09-29) — lista „Poprzednie pomiary” w karcie
// „Zaawansowane obliczenia wzrostowe” zwija się przyciskiem z licznikiem; stan jest per
// pacjent, synchronizowany, domyślnie rozwinięty. Czyste funkcje i drogę preferencji między
// urządzeniami sprawdza tests/unit/historia-pomiarow-zwijanie.test.mjs; tu jest to, co widać
// na stronie, i to, czego zwinięcie NIE może ruszyć: wyników, zbioru pomiarów, stanu zapisu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Historia!26aa';
const NBSP = ' ';

const SZESC = [
  ['4', '0', '101.5', '15.8'],
  ['5', '0', '107.9', '17.6'],
  ['6', '0', '113.8', '19.9'],
  ['7', '0', '119.4', '22.1'],
  ['8', '0', '124.6', '24.6'],
  ['9', '0', '129.1', '27.0'],
];

async function otworz(page) {
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(() => Boolean(window.VildaAdvHistoryCollapse));
}

// Zapis i wczytanie zwijają kartę zaawansowaną — przed klikaniem w nią trzeba ją odsłonić.
// Karta bywa zwijana z opóźnieniem po otwarciu (odtwarzanie stanu kart), więc odsłanianie
// jest ponawiane, aż karta zostanie widoczna.
async function pokazKarte(page) {
  await expect.poll(() => page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (f && getComputedStyle(f).display === 'none' && t) { t.disabled = false; t.click(); }
    return Boolean(f) && f.getClientRects().length > 0;
  }), { message: 'karta zaawansowana odsłonięta' }).toBe(true);
}

// Karta zaawansowana podpina uchwyt przycisku LENIWIE i dopiero wtedy tworzy pierwszy wiersz —
// czekamy na znacznik, który aplikacja sama stawia w DOM (wzór: hv-sds-trzy-miejsca.spec.mjs).
async function pacjent(page, { nazwisko, imie, pomiary }) {
  await page.fill('#lastName', nazwisko);
  await page.fill('#firstName', imie);
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '10'); set('ageMonths', '0'); set('sex', 'F');
    set('height', '135'); set('weight', '30');
    if (typeof window.update === 'function') window.update();
  });
  await page.evaluate(() => new Promise((r) => { requestAnimationFrame(() => { requestAnimationFrame(r); }); }));
  await page.waitForSelector(
    '#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]',
    { state: 'attached' },
  );
  await pokazKarte(page);
  await page.waitForSelector('#advMeasurements .measure-row');
  // Wiersze dokłada prawdziwy przycisk: dodaje parę wierszy (karta zaawansowana + karta
  // spożycia). Samo window.addAdvMeasurementRow() zostawia wiersz bez pary, a synchronizacja
  // kart usuwa go przy pierwszym wpisie — tak jest też na gałęzi bazowej, bez tego modułu.
  const wiersze = page.locator('#advMeasurements > .measure-row');
  for (let i = 0; i < pomiary.length; i++) {
    if (i > 0) await page.locator('#advAddMeasurementBtn').click();
    await expect(wiersze).toHaveCount(i + 1);
    const w = wiersze.nth(i);
    await w.locator('.adv-age-years').fill(pomiary[i][0]);
    await w.locator('.adv-age-months').fill(pomiary[i][1]);
    await w.locator('.adv-height').fill(pomiary[i][2]);
    await w.locator('.adv-weight').fill(pomiary[i][3]);
  }
  await page.evaluate(() => window.calculateGrowthAdvanced());
  if (pomiary.length) {
    await expect(page.locator('#advHistoryCount')).toHaveText(new RegExp(`^${pomiary.length} pomiar`));
  }
}

function stan(page) {
  return page.evaluate(() => {
    const t = document.getElementById('advHistoryToggle');
    const pods = document.getElementById('advHistorySummary');
    const rows = [...document.querySelectorAll('#advMeasurements > .measure-row')];
    return {
      przelacznik: !t.hidden,
      rozwiniete: t.getAttribute('aria-expanded'),
      licznik: document.getElementById('advHistoryCount').textContent,
      akcja: document.getElementById('advHistoryAction').textContent,
      podsumowanie: pods.hidden ? null : pods.textContent,
      naglowek: !document.getElementById('advHistoryHeading').hidden,
      dolny: !document.getElementById('advHistoryCollapseBottom').hidden,
      wiersze: rows.length,
      widoczne: rows.filter((r) => getComputedStyle(r).display !== 'none').length,
    };
  });
}

const mapa = (page) => page.evaluate(
  () => window.VildaPersistence.readPreferenceJSON('advHistoryCollapsed', {}),
);

async function zapisz(page, poprzedni) {
  await page.locator('#saveDataBtnSidebar').click();
  let id = null;
  await expect.poll(async () => {
    id = await page.evaluate(() => window._vildaCurrentPatientId || null);
    return Boolean(id) && id !== poprzedni;
  }, { message: 'zapis nadał identyfikator pacjenta' }).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.VildaSaveStatusIndicator.getState()),
    { message: 'wskaźnik zapisu uspokojony po zapisie' },
  ).toBe('saved');
  await pokazKarte(page);
  return id;
}

// Wczytanie tak, jak robi to powłoka: karta pacjenta z uchwytem, potem „Wczytaj tego pacjenta”.
async function wczytaj(page, id) {
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, (rekord) => {
    if (rekord) window.applyLoadedData(rekord);
  }, null), id);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await page.waitForFunction(() => !document.querySelector('.vilda-auth-screen'));
  await expect.poll(() => page.evaluate(() => window._vildaCurrentPatientId)).toBe(id);
  // Karta zostaje schowana (wczytanie nie wypełnia dzisiejszego pomiaru) — stan listy czytamy
  // z atrybutów i stylów obliczonych, które od widoczności karty nie zależą.
}

test.describe('Poprzednie pomiary — zwijanie z licznikiem', () => {
  test('zwinięcie chowa wiersze, a zbiór pomiarów i wyniki karty zostają te same', async ({ page }) => {
    await otworz(page);
    await pacjent(page, { nazwisko: 'Testowa', imie: 'Anna', pomiary: SZESC });

    let s = await stan(page);
    expect(s).toMatchObject({
      przelacznik: true, rozwiniete: 'true', licznik: '6 pomiarów', akcja: 'Zwiń',
      podsumowanie: null, naglowek: false, dolny: true, wiersze: 6, widoczne: 6,
    });
    const przed = await page.evaluate(() => {
      window.calculateGrowthAdvanced();
      return {
        zbior: JSON.stringify(window.collectAdvancedMeasurements()),
        wyniki: document.getElementById('advResults').innerText,
      };
    });
    expect(przed.wyniki.length, 'karta coś policzyła — inaczej porównanie jest puste').toBeGreaterThan(50);

    await page.locator('#advHistoryToggle').click();
    s = await stan(page);
    expect(s).toMatchObject({ rozwiniete: 'false', akcja: 'Rozwiń', dolny: false, wiersze: 6, widoczne: 0 });
    expect(s.podsumowanie).toBe(`wiek 4${NBSP}l. – 9${NBSP}l. · najnowszy: 129,1${NBSP}cm · 27,0${NBSP}kg`);

    const po = await page.evaluate(() => {
      window.calculateGrowthAdvanced();
      return {
        zbior: JSON.stringify(window.collectAdvancedMeasurements()),
        wyniki: document.getElementById('advResults').innerText,
      };
    });
    expect(po.zbior, 'obliczenia czytają także zwinięte wiersze').toBe(przed.zbior);
    expect(po.wyniki, 'wynik karty bez zmian').toBe(przed.wyniki);

    await page.locator('#advHistoryToggle').click();
    expect(await stan(page)).toMatchObject({ rozwiniete: 'true', widoczne: 6, podsumowanie: null });
  });

  test('przełączanie listy nie oznacza pacjenta jako zmienionego', async ({ page }) => {
    await otworz(page);
    await pacjent(page, { nazwisko: 'Testowa', imie: 'Anna', pomiary: SZESC.slice(0, 3) });
    await zapisz(page, null);

    for (let i = 0; i < 3; i++) await page.locator('#advHistoryToggle').click();
    expect((await stan(page)).rozwiniete).toBe('false');
    // Wskaźnik zapisu przelicza stan z opóźnieniem 400 ms — dajemy mu wyraźnie więcej.
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
  });

  test('stan jest per pacjent, przeżywa wczytanie i F5 i jedzie w payloadzie synchronizacji', async ({ page }) => {
    await otworz(page);
    await pacjent(page, { nazwisko: 'Testowa', imie: 'Anna', pomiary: SZESC.slice(0, 3) });
    const anna = await zapisz(page, null);
    await page.locator('#advHistoryToggle').click();
    expect(await mapa(page)).toEqual({ [anna]: 1 });

    const wPayloadzie = await page.evaluate(async () => {
      const pl = await window.VildaVault.exportSyncPayload();
      return (pl.userPreferences || {}).advHistoryCollapsed || null;
    });
    expect(wPayloadzie, 'stan listy jest w payloadzie synchronizacji').toBeTruthy();
    expect(JSON.parse(wPayloadzie.value)).toEqual({ [anna]: 1 });

    // Drugi pacjent zaczyna od stanu domyślnego (rozwinięta lista).
    await page.evaluate(() => window.clearAllData());
    await pacjent(page, { nazwisko: 'Próbny', imie: 'Jan', pomiary: SZESC.slice(0, 2) });
    expect((await stan(page)).rozwiniete, 'nowy pacjent — domyślnie rozwinięte').toBe('true');
    const jan = await zapisz(page, anna);
    expect(await mapa(page), 'rozwinięta lista nie zostawia wpisu').toEqual({ [anna]: 1 });

    await wczytaj(page, anna);
    await expect.poll(async () => (await stan(page)).rozwiniete).toBe('false');
    expect(await stan(page)).toMatchObject({ licznik: '3 pomiary', widoczne: 0 });

    await wczytaj(page, jan);
    await expect.poll(async () => (await stan(page)).rozwiniete).toBe('true');
    expect(await stan(page)).toMatchObject({ licznik: '2 pomiary', widoczne: 2 });

    await wczytaj(page, anna);
    await expect.poll(async () => (await stan(page)).rozwiniete).toBe('false');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaAdvHistoryCollapse));
    await expect.poll(async () => {
      const x = await stan(page);
      return `${x.licznik}|${x.rozwiniete}|${x.widoczne}`;
    }, { message: 'po F5 lista Anny nadal zwinięta' }).toBe('3 pomiary|false|0');
  });

  test('pacjent niezapisany: stan w pamięci strony, przy zapisie przechodzi pod nadany identyfikator', async ({ page }) => {
    await otworz(page);
    await pacjent(page, { nazwisko: 'Testowa', imie: 'Ewa', pomiary: SZESC.slice(0, 3) });
    await page.locator('#advHistoryToggle').click();
    expect((await stan(page)).rozwiniete).toBe('false');
    expect(await mapa(page), 'bez identyfikatora nic nie trafia do preferencji konta').toEqual({});

    const ewa = await zapisz(page, null);
    expect(await mapa(page)).toEqual({ [ewa]: 1 });
    expect((await stan(page)).rozwiniete, 'zapis nie przestawia listy').toBe('false');
  });

  test('pomiar dopisany przy zwiniętej liście zostaje widoczny z etykietą „Nowy pomiar”', async ({ page }) => {
    await otworz(page);
    await pacjent(page, { nazwisko: 'Testowa', imie: 'Anna', pomiary: SZESC.slice(0, 3) });
    await page.locator('#advHistoryToggle').click();
    await page.locator('#advAddMeasurementBtn').click();

    let s = await stan(page);
    expect(s).toMatchObject({ wiersze: 4, widoczne: 1, licznik: '3 pomiary' });
    expect(s.podsumowanie).toMatch(/ · nowy pomiar poniżej$/);
    const etykieta = await page.evaluate(() => {
      const r = document.querySelector('#advMeasurements > .measure-row[data-adv-history="nowy"]');
      return r ? getComputedStyle(r, '::before').content : null;
    });
    expect(etykieta).toBe('"Nowy pomiar"');

    const nowy = page.locator('#advMeasurements > .measure-row[data-adv-history="nowy"]');
    await nowy.locator('.adv-age-years').fill('10');
    await nowy.locator('.adv-height').fill('135');
    await expect(page.locator('#advHistoryCount')).toHaveText('4 pomiary');
    expect((await stan(page)).widoczne, 'wpisywany pomiar nie znika spod ręki').toBe(1);
    expect(await page.evaluate(() => window.collectAdvancedMeasurements().length)).toBe(4);

    await page.locator('#advHistoryToggle').click();
    await page.locator('#advHistoryToggle').click();
    expect(await stan(page), 'kolejne zwinięcie chowa także nowy pomiar')
      .toMatchObject({ rozwiniete: 'false', widoczne: 0 });
  });

  test('pole poza zakresem w ukrytym wierszu daje znacznik „Do poprawy”', async ({ page }) => {
    await otworz(page);
    await pacjent(page, { nazwisko: 'Testowa', imie: 'Anna', pomiary: SZESC.slice(0, 3) });
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#advMeasurements > .measure-row');
      rows[1].querySelector('.adv-height').value = '1138';
      // Krok pola to 0,1 — dwie cyfry po przecinku nie są błędem i nie mogą dawać znacznika.
      rows[2].querySelector('.adv-height').value = '113.85';
    });
    await page.locator('#advHistoryToggle').click();
    await expect(page.locator('#advHistoryInvalid')).toBeVisible();
    await expect(page.locator('#advHistoryInvalidText')).toHaveText('Do poprawy: 1');

    await page.locator('#advHistoryToggle').click();
    await expect(page.locator('#advHistoryInvalid'), 'po rozwinięciu wiersz widać, znacznik zbędny').toBeHidden();
  });

  test('dolny przycisk zwija długą listę i oddaje fokus nagłówkowi', async ({ page }) => {
    await otworz(page);
    await pacjent(page, { nazwisko: 'Testowa', imie: 'Anna', pomiary: SZESC.slice(0, 2) });
    expect((await stan(page)).dolny, 'przy dwóch pomiarach drugi przycisk jest zbędny').toBe(false);
    await page.locator('#advAddMeasurementBtn').click();
    const rows = page.locator('#advMeasurements > .measure-row');
    await rows.nth(2).locator('.adv-age-years').fill('6');
    await rows.nth(2).locator('.adv-height').fill('113.8');
    await expect(page.locator('#advHistoryCollapseBottom')).toBeVisible();

    await page.locator('#advHistoryCollapseBottom').click();
    expect(await stan(page)).toMatchObject({ rozwiniete: 'false', widoczne: 0, dolny: false });
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id))
      .toBe('advHistoryToggle');
  });

  test('bez pomiarów zostaje dotychczasowy nagłówek, bez przełącznika', async ({ page }) => {
    await otworz(page);
    await pacjent(page, { nazwisko: 'Testowa', imie: 'Anna', pomiary: [] });
    await expect(page.locator('#advHistoryHeading')).toBeVisible();
    await expect(page.locator('#advHistoryHeading')).toHaveText('Wprowadź poprzednie pomiary');
    await expect(page.locator('#advHistoryToggle')).toBeHidden();
  });
});

test.describe('Poprzednie pomiary — telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('nagłówek mieści się w szerokości ekranu w obu stanach', async ({ page }) => {
    await otworz(page);
    await pacjent(page, { nazwisko: 'Testowa', imie: 'Anna', pomiary: SZESC });
    const miesci = () => page.evaluate(() => {
      const t = document.getElementById('advHistoryToggle');
      const r = t.getBoundingClientRect();
      return {
        wEkranie: r.left >= 0 && r.right <= document.documentElement.clientWidth,
        bezPrzewijania: t.scrollWidth <= t.clientWidth + 1,
        wysokosc: Math.round(r.height),
      };
    });
    expect(await miesci()).toMatchObject({ wEkranie: true, bezPrzewijania: true });
    await page.locator('#advHistoryToggle').click();
    const z = await miesci();
    expect(z).toMatchObject({ wEkranie: true, bezPrzewijania: true });
    expect(z.wysokosc, 'cel dotykowy').toBeGreaterThanOrEqual(44);
  });
});
