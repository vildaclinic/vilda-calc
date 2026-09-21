import { expect, test } from '@playwright/test';

// P-RAPORT-PLAN — jednostronicowy raport pacjenta „Twój plan redukcji masy ciała".
//
// Testy pilnują jednej rzeczy: raport NICZEGO NIE WYMYŚLA. Każda liczba na kartce musi być
// tą samą liczbą, którą oddał generator (`dane`) albo drabinka celów, a każde zalecenie —
// punktem generatora (`dane.punkty`, rozpisanie tego samego zdania — P-RAPORT-PUNKTY).
// Dlatego asercje nie mają wpisanych wartości: budują oczekiwany napis z danych i szukają
// go w wyrenderowanym HTML.
//
// Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function'
    && !!window.VildaRaportPlan
    && typeof window.ensureDietRecommendationsElements === 'function'
    && !!(window.VildaDietRecommendations && window.VildaDietRecommendations.buildEnergyRecommendationResult));
}

const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const tekstZHtml = (h) => norm(String(h).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));

function zbuduj(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false;
    set('name', 'Jan Testowy');
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    window.ensureDietRecommendationsElements();
    ['reduceToggle', 'stabilizationToggle', 'growthEndedFlag', 'patientFacingToggle'].forEach((id) => flag(id, false));
    ['nutritionNormsFlag', 'journeyFlag', 'vitDSuppFlag', 'hydrationFlag'].forEach((id) => flag(id, s.opcje !== false));
    window.update();
    await new Promise((r) => { setTimeout(r, 180); });
    const baseResult = window.VildaDietRecommendations.buildEnergyRecommendationResult();
    const ctx = { patient: { name: 'Jan Testowy', ageLabel: s.age + ' lat', sexLabel: s.sex === 'F' ? 'żeńska' : 'męska',
                             weightLabel: s.w + ',0 kg', heightLabel: s.h + ',0 cm' }, baseResult: baseResult };
    const dane = baseResult && baseResult.dane;
    const drab = dane ? window.VildaBmi.drabinkaCelow({
      wzrostCm: dane.pacjent.wzrostCm, masaKg: dane.pacjent.masaKg, plec: dane.pacjent.plec,
      wiekMies: dane.pacjent.wiekMies, zrodlo: window.bmiSource, dorosly: !!dane.dorosly
    }) : null;
    return { html: window.VildaRaportPlan.html(ctx), dane: dane, drabinka: drab };
  }, s);
}

const przec = (v, n) => Number(v).toFixed(n).replace('.', ',');

test('dorosły z otyłością: każda liczba raportu pochodzi z danych generatora', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const w = await zbuduj(page, { age: 47, sex: 'M', w: 112, h: 167 });
  const t = tekstZHtml(w.html);
  const d = w.dane;

  expect(w.html).toContain('class="vrp"');
  expect(d.dorosly).toBe(true);

  // kafle energii — dokładnie wartości z `dane`
  expect(t).toContain(String(d.energia.podazZaokrKcal).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
  expect(t).toContain(String(d.energia.deficytKcal));
  expect(t).toContain(przec(d.energia.tempoKgTydz, 1));

  // pierwszy cel i drabinka — wartości z silnika, nie z raportu
  const pierwszy = w.drabinka.szczeble.length ? w.drabinka.szczeble[0] : w.drabinka.cel;
  expect(t).toContain('do ' + przec(pierwszy.masa, 1) + ' kg');
  expect(t).toContain('−' + przec(d.pacjent.masaKg - pierwszy.masa, 1) + ' kg');
  expect(t).toContain(przec(w.drabinka.cel.masa, 1));

  // masa docelowa z `dane` zgadza się z celem drabinki — dwa niezależne źródła jednej liczby
  expect(Math.abs(d.masa.docelowaKg - w.drabinka.cel.masa)).toBeLessThan(0.01);

  // normy żywieniowe
  expect(t).toContain(String(Math.round(d.normy.proteinPlanningGramRange[0])));
  expect(t).toContain(d.normy.zrodlo.replace(/\s+/g, ' '));
});

test('trzy kolumny cytują punkty generatora co do znaku', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  for (const s of [
    { age: 47, sex: 'M', w: 112, h: 167 },
    { age: 14, months: 6, sex: 'F', w: 75, h: 150 },
    { age: 3, sex: 'F', w: 22, h: 100 }
  ]) {
    const w = await zbuduj(page, s);
    const t = tekstZHtml(w.html);
    const z = w.dane.punkty || {};
    expect(Object.keys(z).length).toBeGreaterThan(0);
    // kolumny pokazują PUNKTY, a nie pełne zdania — ale punkty są rozpisaniem tych samych
    // zdań i podlegają P-RAPORT-PUNKTY, więc kartka nadal nie mówi nic od siebie
    Object.keys(z).forEach((rola) => {
      z[rola].forEach((zd) => {
        expect(t, 'rola ' + rola + ' u pacjenta ' + s.age + ' lat').toContain(norm(zd));
      });
    });
    expect(w.html, 'kolumny nie są listą punktów').toContain('<li>');
  }
});

test('pasma wieku docierają na kartkę: 3-latka ma 180 minut, nastolatka 60', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const male = tekstZHtml((await zbuduj(page, { age: 3, sex: 'F', w: 22, h: 100 })).html);
  const nasto = tekstZHtml((await zbuduj(page, { age: 14, months: 6, sex: 'F', w: 75, h: 150 })).html);
  expect(male).toContain('co najmniej 180 minut aktywności ruchowej dziennie, rozłożonej w ciągu dnia');
  expect(male).toContain('maksymalne ograniczenie czasu przed ekranem');
  expect(nasto).toContain('co najmniej 60 minut aktywności fizycznej każdego dnia');
  // kontrola ujemna: pasma wieku nie mogą się przemieszać na kartce
  expect(nasto).not.toContain('180 minut');
  expect(male).not.toContain('60 minut każdego dnia');
});

test('raport nigdy nie nazywa leku i zawsze mówi, czego aplikacja nie sprawdza', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const zakazane = [/saxend/i, /liraglut/i, /semaglut/i, /wegov/i, /ozempic/i, /mysimba/i, /orlistat/i, /tirzepat/i];
  const w = await zbuduj(page, { age: 47, sex: 'M', w: 112, h: 167 });
  const t = tekstZHtml(w.html);
  zakazane.forEach((re) => { expect(t).not.toMatch(re); });
  expect(t).toContain('leczenia farmakologicznego choroby otyłościowej');
  expect(t).toContain('Aplikacja nie sprawdza');
  expect(t).toContain('decyduje lekarz');
});

test('kontrola ujemna: bez wskazań do redukcji nie ma sekcji „TWOJA DROGA"', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const w = await zbuduj(page, { age: 30, sex: 'M', w: 72, h: 180 });
  const t = tekstZHtml(w.html);
  expect(w.dane.masa.docelowaKg).toBeNull();
  expect(t).not.toContain('TWOJA DROGA');
  expect(t).not.toContain('PIERWSZY CEL');
  // a przy okazji: pacjentowi w normie raport nie podsuwa bloku o farmakoterapii
  expect(t).not.toContain('leczenia farmakologicznego');
});

test('kontrola ujemna: odznaczone opcje dodatkowe znikają z kartki', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const zOpcjami = tekstZHtml((await zbuduj(page, { age: 14, months: 6, sex: 'F', w: 75, h: 150, opcje: true })).html);
  expect(zOpcjami).toContain('Normy żywieniowe');
  expect(zOpcjami).toContain('Witamina D');
  expect(zOpcjami).toContain('Płyny');

  const bez = tekstZHtml((await zbuduj(page, { age: 14, months: 6, sex: 'F', w: 75, h: 150, opcje: false })).html);
  expect(bez).not.toContain('Witamina D');
  expect(bez).not.toContain('Normy żywieniowe');
  // rdzeń planu zostaje zawsze
  expect(bez).toContain('PIERWSZY CEL');
});

test('kontrola ujemna: pacjent z niedowagą nie dostaje planu redukcji', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const w = await zbuduj(page, { age: 30, sex: 'F', w: 44, h: 170 });
  const t = tekstZHtml(w.html);

  // silnik wie, że tu chodzi o PRZYROST masy — raport nie może tego odwrócić
  expect(w.drabinka.kierunek).toBe('przyrost');
  expect(w.drabinka.cel.masa).toBeGreaterThan(w.dane.pacjent.masaKg);
  expect(t).not.toContain('PIERWSZY CEL');
  expect(t).not.toContain('TWOJA DROGA');
  expect(t).not.toContain('tempo redukcji');
  // ale zalecenia żywieniowe dla niedowagi zostają — to jest sedno tego raportu
  const z = w.dane.punkty || {};
  expect(Object.keys(z).length).toBeGreaterThan(0);
  Object.keys(z).forEach((rola) => { z[rola].forEach((zd) => { expect(t).toContain(norm(zd)); }); });
});

test('raport mieści się na jednej stronie A4 także z kompletem opcji', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  for (const s of [
    { age: 47, sex: 'M', w: 112, h: 167 },
    { age: 14, months: 6, sex: 'F', w: 75, h: 150 },
    { age: 8, months: 3, sex: 'M', w: 45, h: 130 },
    { age: 3, sex: 'F', w: 22, h: 100 }
  ]) {
    const w = await zbuduj(page, s);
    const m = await page.evaluate(async (h) => {
      document.querySelectorAll('.vrp-probna').forEach((n) => n.remove());
      const sek = document.createElement('section');
      sek.className = 'diet-pdf-page vrp-probna';
      sek.style.cssText = 'position:fixed;left:-9999px;top:0;width:1240px;height:1754px;box-sizing:border-box;padding:54px 58px 74px;overflow:hidden;';
      sek.innerHTML = h + '<footer class="diet-pdf-footer" style="position:absolute;left:58px;right:58px;bottom:26px;height:46px;"></footer>';
      document.body.appendChild(sek);
      await new Promise((r) => { requestAnimationFrame(() => { requestAnimationFrame(r); }); });
      const skala = window.VildaRaportPlan.dopasuj(sek);
      await new Promise((r) => { requestAnimationFrame(() => { requestAnimationFrame(r); }); });
      const v = sek.querySelector('.vrp');
      const st = sek.querySelector('.diet-pdf-footer');
      const wynik = { skala: skala, zapas: Math.round(st.getBoundingClientRect().top - v.getBoundingClientRect().bottom) };
      sek.remove();
      return wynik;
    }, w.html);
    // treść kończy się nad stopką (zapas dodatni) i nie trzeba było schodzić do podłogi skali
    expect(m.zapas, 'pacjent ' + s.age + ' lat wychodzi poza stronę').toBeGreaterThanOrEqual(0);
    // skala nie musiała zejść do podłogi — gdyby musiała, druk byłby na granicy czytelności
    expect(m.skala, 'pacjent ' + s.age + ' lat wymusił zjazd skali').toBeGreaterThan(0.8);
  }
});
