import { expect, test } from '@playwright/test';

// P-DIETA-PROG rata N (2026-09-22, decyzje właściciela: wariant A; koło W2; tabela W1 z zebrą; znaki przy kaflach).
//  (1) Dorosły z otyłością: zdanie o pierwszym celu z drabinki silnika BMI (BMI 35 przy otyłości II/III stopnia,
//      BMI 30 przy I stopnia) — te same liczby, które pokazuje karta „Droga do normy BMI” i plan PDF;
//      przy nadwadze zostaje dotychczasowe zdanie. dane.masa.pierwszyCel niesie ten szczebel.
//  (2) Plan PDF: bez turkusowego koła, etykieta „bmiSDS”, „−” przy deficycie i tempie, „+” przy nadwyżce
//      i tempie przyrostu, sama tabela norm ≤ 66 % szerokości i wyśrodkowana, komórki z odstępem, zebra.
//  Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.vildaEnsurePdfLibraries === 'function' && !!window.VildaRaportPlan && !!window.VildaBmi);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.dietRecommendationsBuildPdfPackage === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportCreateRenderHost === 'function');
}

function ustaw(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) { el.checked = !!on; el.dispatchEvent(new Event('change', { bubbles: true })); } };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.intakeHistory = null;
    set('name', 'Zofia Testowa'); set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h); set('customGoalKg', '');
    window.ensureDietRecommendationsElements();
    ['reduceToggle', 'stabilizationToggle', 'growthEndedFlag'].forEach((id) => { const el = document.getElementById(id); if (el) el.checked = false; });
    window.update();
    flag('nutritionNormsFlag', !!s.normy); flag('hydrationFlag', false); flag('vitDSuppFlag', false); flag('journeyFlag', true);
    await new Promise((r) => { setTimeout(r, 250); });
    const res = window.VildaDietRecommendations.buildEnergyRecommendationResult();
    const tekst = String(res.textOutput || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ');
    const drab = window.VildaBmi.drabinkaCelow({ wzrostCm: s.h, masaKg: s.w, plec: s.sex, wiekMies: s.age * 12, zrodlo: window.bmiSource, dorosly: s.age >= 19 });
    return { tekst, pierwszyCel: res.dane && res.dane.masa ? res.dane.masa.pierwszyCel : undefined, szczebel: drab && drab.szczeble && drab.szczeble[0] ? { masa: drab.szczeble[0].masa, bmi: drab.szczeble[0].bmi, opis: drab.szczeble[0].opis, klucz: drab.szczeble[0].klucz } : null, klucze: drab && drab.szczeble ? drab.szczeble.map((q) => q.klucz) : [], docelowaKg: res.dane && res.dane.masa ? res.dane.masa.docelowaKg : null };
  }, s);
}

const kg = (v) => v.toFixed(1).replace('.', ',') + ' kg';

test('dorosły z otyłością: zdanie o pierwszym celu z drabinki silnika; przy nadwadze bez zmian', async ({ page }) => {
  test.setTimeout(150_000);
  await otworz(page);
  // P-DIETA rata Z2 (2026-09-24): otyłość III stopnia → pierwszy szczebel −5 % masy (Wing 2011), dalej BMI 35
  // („wyjście z otyłości III stopnia”, rata R K1) i BMI 30
  const a = await ustaw(page, { age: 47, sex: 'M', w: 112, h: 167 });
  expect(a.szczebel && a.szczebel.klucz).toBe('wing');
  expect(a.klucze).toEqual(['wing', 'otylosc-2', 'otylosc-1']);
  expect(a.tekst).toContain('BMI wynosi 40,2 (otyłość III stopnia). Pierwszy cel to ok. ' + kg(a.szczebel.masa) + ' (5 % masy ciała), czyli około ' + kg(112 - a.szczebel.masa) + ' mniej; już taka zmiana poprawia ciśnienie i wyniki badań krwi (cholesterol, trójglicerydy). Górna granica normy (BMI 24,9) odpowiada masie ok. ' + kg(a.docelowaKg) + ', do której dochodzi się stopniowo, etapami.');
  expect(a.tekst).not.toContain('Do uzyskania zakresu prawidłowego BMI');
  expect(a.pierwszyCel).toBeTruthy();
  expect(a.pierwszyCel.klucz).toBe('wing');
  expect(Math.abs(a.pierwszyCel.masaKg - a.szczebel.masa)).toBeLessThan(0.01);
  expect(Math.abs(a.pierwszyCel.doRedukcjiKg - (112 - a.szczebel.masa))).toBeLessThan(0.01);
  expect(a.pierwszyCel.opis).toBe('próg poprawy: ciśnienie, trójglicerydy, HDL');
  // otyłość I stopnia (BMI 33,1) → także −5 % przed BMI 30
  const b = await ustaw(page, { age: 40, sex: 'F', w: 90, h: 165 });
  expect(b.klucze).toEqual(['wing', 'otylosc-1']);
  expect(b.tekst).toContain('BMI wynosi 33,1 (otyłość I stopnia). Pierwszy cel to ok. ' + kg(b.szczebel.masa) + ' (5 % masy ciała), czyli około ' + kg(90 - b.szczebel.masa) + ' mniej; już taka zmiana');
  expect(b.pierwszyCel && b.pierwszyCel.klucz).toBe('wing');
  // tuż nad BMI 30 (BMI 31,2) → pierwszy BMI 30, −5 % wskazane osobno
  const b2 = await ustaw(page, { age: 62, sex: 'F', w: 78, h: 158 });
  expect(b2.klucze).toEqual(['otylosc-1', 'wing']);
  expect(b2.tekst).toContain('Pierwszy cel to ok. ' + kg(b2.szczebel.masa) + ' (BMI 30), czyli około ' + kg(78 - b2.szczebel.masa) + ' mniej – koniec otyłości; już ok. 5 % masy (ok. 74,1 kg) poprawia ciśnienie i wyniki badań krwi (cholesterol, trójglicerydy).');
  // nadwaga BMI 27,2 → −5 % jedynym krokiem
  const c0 = await ustaw(page, { age: 40, sex: 'F', w: 74, h: 165 });
  expect(c0.klucze).toEqual(['wing']);
  expect(c0.tekst).toContain('BMI wynosi 27,2 (nadwaga). Pierwszy cel to ok. ' + kg(74 * 0.95) + ' (5 % masy ciała)');
  // nadwaga BMI 25,5 → −5 % za celem: brak szczebla, dotychczasowe zdanie
  const c = await ustaw(page, { age: 40, sex: 'F', w: 69.4, h: 165 });
  expect(c.szczebel).toBeNull();
  expect(c.tekst).toContain('BMI wynosi 25,5 (nadwaga). Do uzyskania zakresu prawidłowego BMI dla dorosłych potrzebna byłaby redukcja masy ciała o ok.');
  expect(c.tekst).not.toContain('Pierwszy cel');
  expect(c.pierwszyCel).toBeNull();
  // dziecko (rata J): pierwszyCel w danych też z opisem szczebla
  const d = await ustaw(page, { age: 16, months: 4, sex: 'F', w: 94.8, h: 175.5 });
  expect(d.tekst).toContain('Pierwszy cel to ok.');
  expect(d.pierwszyCel && d.pierwszyCel.opis).toBe('próg poprawy: ciśnienie, trójglicerydy, HDL');
});

/* Audyt hosta PDF w chwili wywołania html2canvas. */
function audyt(page) {
  return page.evaluate(async () => {
    await window.vildaEnsurePdfLibraries();
    const orig = window.html2canvas;
    let w = null;
    window.html2canvas = (el, o) => {
      const win = el.ownerDocument.defaultView;
      const strona = el.closest ? el : el;
      const przed = win.getComputedStyle(strona, '::before');
      const po = win.getComputedStyle(strona, '::after');
      const bmi = el.querySelector('.vrp-bmi');
      const kafle = Array.from(el.querySelectorAll('.vrp-kafel')).map((k) => Array.from(k.children).map((c) => c.textContent.trim()).join(' '));
      const blok = el.querySelector('.vrp-dod-normy');
      let normy = null;
      if (blok) {
        const dod = blok.parentElement, dr = dod.getBoundingClientRect(), br = blok.getBoundingClientRect();
        const td = blok.querySelectorAll('td');
        const cs1 = win.getComputedStyle(td[0]);
        const wiersze = Array.from(blok.querySelectorAll('tr')).map((tr) => win.getComputedStyle(tr.querySelector('td')).backgroundColor);
        normy = { udzial: br.width / dr.width, lewy: (br.left - dr.left) / dr.width, prawy: (dr.right - br.right) / dr.width, paddingLewy: parseFloat(cs1.paddingLeft), paddingGora: parseFloat(cs1.paddingTop), tla: wiersze, kolumny: dod.className };
      }
      w = { kolo: przed.content, koloDol: po.content, bmiTekst: bmi ? bmi.textContent.replace(/\s+/g, ' ').trim() : '', kafle, normy };
      return orig(el, o);
    };
    try { await window.dietRecommendationsBuildPdfPackage({ mode: 'classic' }); return w; } finally { window.html2canvas = orig; }
  });
}

test('plan PDF: bez koła, bmiSDS, znaki przy kaflach, tabela norm wąska z zebrą', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route('**cdnjs.cloudflare.com/**', (r) => r.abort());
  await otworz(page);
  await ustaw(page, { age: 16, months: 4, sex: 'F', w: 94.8, h: 175.5, normy: true });
  const a = await audyt(page);
  expect(a.kolo).toBe('none');
  expect(a.koloDol).not.toBe('none');
  expect(a.bmiTekst).toMatch(/bmiSDS \+2,32/);
  expect(a.bmiTekst).not.toContain('z-score');
  expect(a.kafle.find((k) => k.includes('deficyt energetyczny'))).toMatch(/^−\d+ kcal na dobę/);
  expect(a.kafle.find((k) => k.includes('tempo redukcji'))).toMatch(/^−\d,\d kg tygodniowo/);
  // P-DIETA rata V pkt 1: u dziecka z planem otyłości kaloryczność to górna granica dnia — „≤”, bez znaku +/−
  // P-RAPORT rata Y: w kaflach twarda spacja („≤\u00A02\u202F050”), żeby html2canvas jej nie zjadał
  expect(a.kafle.find((k) => k.includes('górna granica dnia'))).toMatch(/^≤\u00A0\d/);
  expect(a.kafle.some((k) => k.includes('zalecana kaloryczność'))).toBe(false);
  expect(a.normy).toBeTruthy();
  expect(a.normy.kolumny).toContain('vrp-dod-1');
  expect(a.normy.udzial).toBeGreaterThan(0.55);
  expect(a.normy.udzial).toBeLessThan(0.66);
  expect(Math.abs(a.normy.lewy - a.normy.prawy)).toBeLessThan(0.02);
  expect(a.normy.paddingLewy).toBeGreaterThanOrEqual(8);
  expect(a.normy.paddingGora).toBeGreaterThanOrEqual(3);
  expect(a.normy.tla.length).toBe(3);
  expect(a.normy.tla[0]).toBe('rgb(255, 255, 255)');
  expect(a.normy.tla[1]).toBe('rgb(246, 250, 250)');
  expect(a.normy.tla[2]).toBe('rgb(255, 255, 255)');
  // przyrost: „+” przy nadwyżce i tempie przyrostu
  await ustaw(page, { age: 28, sex: 'F', w: 50, h: 168, normy: true });
  const b = await audyt(page);
  expect(b.kafle.find((k) => k.includes('nadwyżka energetyczna'))).toMatch(/^\+\d+–\d+ kcal na dobę/);
  expect(b.kafle.find((k) => k.includes('tempo przyrostu'))).toMatch(/^\+\d,\d–\d,\d kg tygodniowo/);
  expect(b.kafle.find((k) => k.includes('zapotrzebowanie energetyczne'))).toMatch(/^\d/);
});
