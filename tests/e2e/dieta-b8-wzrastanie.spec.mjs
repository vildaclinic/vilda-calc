import { expect, test } from '@playwright/test';

// P-DIETA-B8 (decyzje właściciela 2026-09-30: model B′ — wzrastanie wg mediany siatki; nagłówek stabilizacji S1 — masa stała;
// koniec wzrastania = koniec siatki) — PRAWDZIWA strona, dane FIKCYJNE. Liczby silnika sprawdza
// tests/unit/dieta-b8-wzrastanie-mediana.test.mjs; tu brzmienie w karcie planu, „Drodze do normy” i zaleceniach.
test.use({ serviceWorkers: 'block' });

async function otworz(page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && typeof window.energyZdanieStabS2 === 'function' && !!window.VildaSdsWzrostu);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const jf = document.getElementById('journeyFlag');
    if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); }
  });
}

async function wpisz(page, { sex, age, months = 0, weight, height }) {
  await page.selectOption('#sex', sex).catch(() => {});
  for (const [id, v] of [['age', age], ['ageMonths', months], ['height', height], ['weight', weight]]) await page.locator(`#${id}`).fill(String(v));
  await page.waitForTimeout(1500);
}

async function stabilizacja(page) {
  await page.evaluate(() => {
    window.__vildaDietStrategyTouched = true;
    const rt = document.getElementById('reduceToggle'), sb = document.getElementById('stabilizationToggle');
    if (rt) rt.checked = false;
    if (sb) { sb.checked = true; sb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(800);
}

const karty = (page) => page.evaluate(() => {
  window.update();
  const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
  const br = window.buildDietEnergyRecommendationResult();
  return {
    plan: norm((document.getElementById('planResults') || {}).textContent),
    droga: norm((document.getElementById('bmiJourneyMount') || {}).textContent),
    tekst: norm(br && br.textOutput),
  };
});

test.describe('P-DIETA-B8 — czas do normy przy stabilizacji: S1 (masa stała) i S2, wzrastanie wg mediany siatki', () => {
  test('dz. 12;0, 153,8 cm, 58,7 kg: S1 18,5 mies. w nagłówku, S2 „nie przed ukończeniem 18 lat”; opis wzrastania bez stałego „cm/rok”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 12, weight: 58.7, height: 153.8 });
    await stabilizacja(page);
    const r = await karty(page);
    expect(r.plan).toContain('Bez deficytu — przy utrzymaniu obecnej masy ciała — BMI może wejść w górną granicę normy');
    expect(r.plan).toContain('(za ok. 18,5 miesiąca)');
    expect(r.plan).toContain('Jeżeli masa będzie rosła do górnej granicy planu (ok. 0,2 kg/mies.), BMI prawdopodobnie nie zejdzie poniżej 85. centyla przed ukończeniem 18 lat (potem obowiązuje kryterium dorosłych: BMI 24,9).');
    expect(r.plan).toContain('uwzględnia dalsze wzrastanie: w najbliższym roku ok. 5,3 cm, potem coraz wolniej, jak mediana wzrostu (siatka OLAF)');
    expect(r.plan).not.toMatch(/wzrastanie \(ok\. [\d,]+ cm\/rok\)/);
    expect(r.droga).toContain('18,5 mies.');
    expect(r.droga).toContain('uwzględnia dalsze wzrastanie: w najbliższym roku ok. 5,3 cm');
    expect(r.droga).toContain('Jeżeli masa będzie rosła do górnej granicy planu');
    expect(r.tekst).toContain('Przy utrzymaniu obecnej masy ciała i dalszym wzrastaniu — w najbliższym roku ok. 5,3 cm, potem coraz wolniej, jak mediana wzrostu (siatka OLAF) — BMI może wejść w górną granicę normy orientacyjnie za');
    expect(r.tekst).toContain('Przykładowy przebieg BMI przy stałej masie: za 3 mies. ok.');
    expect(r.tekst).not.toContain('przy wzroście ok.');
    expect(r.tekst).toContain('Czas policzono dla przeciętnego przebiegu dojrzewania');
  });

  test('chł. 12;0, 150 cm, 58 kg: S2 z czasem — „za ok. 51 miesięcy”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 12, weight: 58, height: 150 });
    await stabilizacja(page);
    const r = await karty(page);
    expect(r.plan).toContain('(za ok. 17,5 miesiąca)');
    expect(r.plan).toContain('Jeżeli masa będzie rosła do górnej granicy planu (ok. 0,3 kg/mies.) — za ok. 51 miesięcy.');
    expect(r.tekst).toContain('Jeżeli masa będzie rosła do górnej granicy planu (ok. 0,3 kg/mies.) — za ok. 51 miesięcy.');
  });

  test('dz. 12;0, 153,8 cm, 77,1 kg, stabilizacja: bez czasu — „prawdopodobnie nie obniży BMI … przed ukończeniem 18 lat”, nie „praktycznie zakończone wzrastanie”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 12, weight: 77.1, height: 153.8 });
    await stabilizacja(page);
    const r = await karty(page);
    expect(r.plan).toContain('Samo utrzymanie obecnej masy ciała prawdopodobnie nie obniży BMI poniżej 85. centyla przed ukończeniem 18 lat (potem obowiązuje kryterium dorosłych: BMI 24,9).');
    expect(r.plan).not.toContain('Przy praktycznie zakończonym wzrastaniu');
    expect(r.droga).toContain('samo utrzymanie masy prawdopodobnie nie obniży BMI poniżej 85. centyla przed ukończeniem 18 lat');
    expect(r.droga).not.toContain('przy praktycznie zakończonym wzrastaniu');
    expect(r.tekst).toContain('Samo utrzymanie obecnej masy ciała prawdopodobnie nie obniży BMI poniżej 85. centyla przed ukończeniem 18 lat');
  });
});
