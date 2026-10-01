import { expect, test } from '@playwright/test';

// P-DS-18 (decyzja właściciela 2026-10-01, „Tylko BMI”) — PRAWDZIWA strona, dane FIKCYJNE.
// Pacjent z zespołem Downa w wieku 18,0–19,99: BMI na siatce DS (decyzja D3) w karcie głównej, podsumowaniu,
// raporcie i przy sugestii WHR — tak samo jak w zaleceniach i „Drodze do normy”. Dotąd ta sama dziewczyna 18;6
// (150 cm, 68 kg, ok. 56. centyla DS) była na jednej stronie jednocześnie „Otyłość I stopnia wg BMI… zredukować
// 12 kg” i „Twoje BMI jest już w normie”. Populacja ogólna bez zmian. Liczby silnika: tests/unit/ds-bmi-dorosly-wg-pacjenta.test.mjs.
test.use({ serviceWorkers: 'block' });

async function otworz(page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && !!window.VildaBmi && typeof window.VildaBmi.doroslyWgPacjenta === 'function'
    && !!window.VildaDsSource && typeof window.patientReportBuildModel === 'function');
  await page.evaluate(() => { document.documentElement.classList.remove('vilda-auth-locked'); });
}

async function policz(page, s) {
  await page.evaluate((s) => {
    if (s.ds) window.VildaDsSource.zapamietaj({ clinical: { downSyndrome: true } }); else window.VildaDsSource.zapomnij();
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && tgl.checked !== !!s.pro) { tgl.checked = !!s.pro; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = !!s.pro;
  }, s);
  await page.selectOption('#sex', s.sex);
  for (const [id, v] of [['age', s.age], ['ageMonths', s.months || 0], ['height', s.h], ['weight', s.w]]) await page.locator(`#${id}`).fill(String(v));
  await page.waitForTimeout(1300);
  return page.evaluate(() => {
    window.update();
    const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const m = window.patientReportBuildModel();
    const karty = window.patientReportBuildMetricCards().cards;
    const bmi = karty.find((c) => c.key === 'BMI') || {};
    const masa = karty.find((c) => c.key === 'WT') || {};
    const ws = document.getElementById('whrSuggest');
    return {
      glowna: norm(document.getElementById('bmiCard').textContent),
      podsumowanie: norm(document.getElementById('currentSummaryContent').textContent),
      droga: norm((document.getElementById('toNormInfo') || {}).textContent),
      raportNaglowek: m.headline, raportLinie: (m.summaryLines || []).map(norm),
      kartaBmi: { badge: bmi.badge, percentile: bmi.percentile, tone: bmi.tone, note: norm(bmi.note), tabelaDoroslego: !!bmi.extraHtml },
      kartaMasy: { badge: masa.badge, tone: masa.tone },
      whrSugestia: !!ws && ws.style.display !== 'none',
    };
  });
}

test.describe('P-DS-18 — zespół Downa 18,0–19,99: BMI na siatce DS na całej stronie', () => {
  test('dz. z DS 18;6, 150 cm / 68 kg: karta główna, podsumowanie, raport i „Droga do normy” mówią to samo — masa prawidłowa (ok. 56. centyl DS)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await policz(page, { ds: true, pro: true, sex: 'F', age: 18, months: 6, w: 68, h: 150 });
    // liczba BMI w karcie głównej jest animowana (odliczanie) — sprawdzamy centyl, kategorię i siatkę
    expect(r.glowna).toMatch(/BMI: [\d,]+ kg\/m² – 56 centyl \(bmiSDS \+0,14\) \(Prawidłowe\) wg siatki dla zespołu Downa \(Zemel 2015\)/);
    expect(r.glowna).not.toContain('Otyłość I stopnia wg BMI');
    expect(r.podsumowanie).toContain('BMI: 30,2 kg/m² – 56 centyl (bmiSDS +0,14) wg siatki dla zespołu Downa (Zemel 2015)');
    expect(r.podsumowanie).toContain('Wskaźnik Cole’a: 103,3 %');
    expect(r.podsumowanie).not.toMatch(/otyłość I stopnia|zakresu prawidłowego dla dorosłych/);
    expect(r.droga).toContain('Twoje BMI jest już w normie!');
    expect(r.raportNaglowek.badge).toBe('Prawidłowe');
    expect(r.raportNaglowek.tone).toBe('normal');
    expect(r.raportLinie).toContain('BMI: 30,2 kg/m² – 56 centyl (bmiSDS +0,14) wg siatki dla zespołu Downa (Zemel 2015)');
    expect(r.kartaBmi.badge).toBe('Prawidłowe');
    expect(r.kartaBmi.percentile).toBeCloseTo(55.66, 1);
    expect(r.kartaBmi.tabelaDoroslego).toBe(false);
    expect(r.kartaBmi.note).toContain('wg siatki dla zespołu Downa (Zemel 2015)');
    expect(r.kartaMasy.badge).toBe('Prawidłowe');
    expect(r.kartaMasy.tone).toBe('normal');
    expect(r.whrSugestia).toBe(false);
  });

  test('dz. z DS 19;3, 150 cm / 88 kg (nadwaga wg siatki DS): karta główna ostrzega o nadwadze z siatki DS, nie o otyłości II stopnia dorosłego', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await policz(page, { ds: true, pro: false, sex: 'F', age: 19, months: 3, w: 88, h: 150 });
    expect(r.glowna).toContain('Nadwaga wg BMI – zalecana konsultacja dietetyczna.');
    expect(r.glowna).not.toMatch(/Otyłość (I|II) stopnia wg BMI/);
    expect(r.raportNaglowek.badge).toBe('Nadwaga');
    expect(r.kartaBmi.tabelaDoroslego).toBe(false);
    expect(r.whrSugestia).toBe(true);
  });

  test('od 20 lat pacjent z DS i każdy 18-latek z populacji ogólnej — progi dorosłego, jak dotąd', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const ds20 = await policz(page, { ds: true, pro: false, sex: 'F', age: 20, months: 0, w: 68, h: 150 });
    expect(ds20.glowna).toContain('Otyłość I stopnia wg BMI.');
    expect(ds20.raportNaglowek.badge).toBe('Otyłość I stopnia');
    expect(ds20.kartaBmi.tabelaDoroslego).toBe(true);
    const og = await policz(page, { ds: false, pro: false, sex: 'F', age: 18, months: 6, w: 68, h: 150 });
    expect(og.glowna).toContain('Otyłość I stopnia wg BMI.');
    // podsumowanie wyników pokazuje tryb profesjonalny
    const ogPro = await policz(page, { ds: false, pro: true, sex: 'F', age: 18, months: 6, w: 68, h: 150 });
    expect(ogPro.podsumowanie).toContain('BMI: 30,2 kg/m² – otyłość I stopnia, aby BMI wróciło do zakresu prawidłowego dla dorosłych, należałoby zredukować masę ciała o ok. 12,0 kg');
    expect(og.raportNaglowek.badge).toBe('Otyłość I stopnia');
    expect(og.raportNaglowek.tone).toBe('danger');
    expect(og.kartaBmi.tabelaDoroslego).toBe(true);
    expect(og.whrSugestia).toBe(true);
  });
});
