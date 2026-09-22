import { expect, test } from '@playwright/test';

// P-RAPORT rata O (2026-09-22, opcja O1 właściciela): pod „−X kg” w planie PDF stoi „do Y kg”, a pod spodem
// osobna linia prostym językiem: dziecko (próg Reinehra) — „pierwszy krok: już ta zmiana poprawia ciśnienie
// i wyniki badań krwi”; dorosły — „pierwszy krok: wyjście z otyłości II stopnia” / „… koniec otyłości”;
// cel własny — „cel własny (BMI …)”. Bez kreski „|” i bez „Reinehr 2016, doi:…” na kartce. Na osi pod progiem
// Reinehra „pierwszy krok”. Tekst zaleceń: jedno brzmienie zdania o korzyści. Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && !!window.VildaRaportPlan);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.buildEnergyRecommendationResult === 'function'));
}

function plan(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true; window.intakeHistory = null;
    set('name', 'Zofia Testowa'); set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h); set('customGoalKg', s.cel != null ? s.cel : '');
    window.ensureDietRecommendationsElements();
    ['reduceToggle', 'stabilizationToggle', 'growthEndedFlag'].forEach((id) => { const el = document.getElementById(id); if (el) el.checked = false; });
    window.update();
    await new Promise((r) => { setTimeout(r, 250); });
    const res = window.VildaDietRecommendations.buildEnergyRecommendationResult();
    const html = window.VildaRaportPlan.html({ patient: { name: 'Zofia Testowa' }, baseResult: res });
    const m = html.match(/vrp-krok-s">([^<]*)<\/div>(?:<div class="vrp-krok-o">([^<]*)<\/div>)?/);
    const os = Array.from(html.matchAll(/vrp-pd">([^<]*)</g)).map((x) => x[1]);
    return { masa: m ? m[1].replace(/\u00A0/g, ' ') : null, podpis: m ? m[2] || '' : null, os, html, tekst: String(res.textOutput || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ') };
  }, s);
}

test('etykieta pierwszego kroku: dziecko, dorosły, cel własny — prostym językiem, bez „|” i bez źródła', async ({ page }) => {
  test.setTimeout(150_000);
  await otworz(page);
  const d = await plan(page, { age: 16, months: 4, sex: 'F', w: 94.8, h: 175.5 });
  expect(d.masa).toMatch(/^do \d+,\d kg$/);
  expect(d.podpis).toBe('pierwszy krok: już ta zmiana poprawia ciśnienie i wyniki badań krwi');
  expect(d.os).toContain('pierwszy krok');
  expect(d.os).not.toContain('próg poprawy');
  expect(d.html).not.toContain('Reinehr');
  expect(d.html).not.toContain('doi:');
  expect(d.html).not.toContain('&nbsp;|&nbsp;');
  expect(d.tekst).toContain('już taka zmiana poprawia ciśnienie i wyniki badań krwi (cholesterol, trójglicerydy).');
  expect(d.tekst).not.toContain('HDL');

  const a = await plan(page, { age: 47, sex: 'M', w: 112, h: 167 });
  expect(a.masa).toMatch(/^do \d+,\d kg$/);
  // rata R (K1): przy BMI ≥ 40 szczebel BMI 35 to wyjscie z otylosci III stopnia
  expect(a.podpis).toBe('pierwszy krok: wyjście z otyłości III stopnia');
  expect(a.os).toContain('wyjście z otyłości III stopnia');
  expect(a.tekst).toContain('wyjście z otyłości III stopnia; już taka zmiana poprawia ciśnienie i wyniki badań krwi (cholesterol, trójglicerydy).');
  expect(a.tekst).not.toContain('HDL');

  const b = await plan(page, { age: 40, sex: 'F', w: 90, h: 165 });
  expect(b.podpis).toBe('pierwszy krok: koniec otyłości');

  const c = await plan(page, { age: 34, sex: 'F', w: 68, h: 169, cel: 63 });
  expect(c.masa).toBe('do 63,0 kg');
  expect(c.podpis).toMatch(/^cel własny \(BMI \d+,\d\)$/);
  expect(c.html).not.toContain('&nbsp;|&nbsp;');
});
