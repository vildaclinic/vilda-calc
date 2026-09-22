import { expect, test } from '@playwright/test';

// P-RAPORT rata 5 (2026-09-22) — raporty PDF bez CDN.
//
// Do tej raty jsPDF i html2canvas przychodziły z cdnjs, więc offline (i tu, gdzie cdnjs jest
// zablokowany) przycisk PDF kończył się toastem o braku bibliotek — i nie dało się tego testować.
// Teraz: (1) z zablokowanym cdnjs biblioteki ładują się z plików aplikacji, a raport zaleceń
// dietetycznych składa prawdziwy PDF (Blob); (2) gdy plik lokalny nie odpowiada, ładowarka bierze
// CDN; (3) bez żadnego źródła obietnica jest odrzucana, a nie wisi. Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.vildaEnsurePdfLibraries === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.dietRecommendationsBuildPdfPackage === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportCreateRenderHost === 'function');
}

function ustawDoroslego(page) {
  return page.evaluate(async () => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    set('name', 'Jan Testowy'); set('age', 42); set('ageMonths', 0); set('sex', 'M'); set('weight', 108); set('height', 178);
    window.ensureDietRecommendationsElements();
    window.update();
    await new Promise((r) => { setTimeout(r, 200); });
  });
}

const zrodla = (page) => page.evaluate(() => Array.from(document.querySelectorAll('script[data-vilda-pdf-lib]')).map((s) => [s.getAttribute('data-vilda-pdf-lib'), s.getAttribute('data-vilda-pdf-src'), new URL(s.src).host]));

test('z zablokowanym cdnjs biblioteki idą z plików aplikacji, a raport zaleceń składa PDF', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route('**cdnjs.cloudflare.com/**', (r) => r.abort());
  await otworz(page);
  await ustawDoroslego(page);
  const lib = await page.evaluate(async () => {
    await window.vildaEnsurePdfLibraries();
    return { jspdf: typeof (window.jspdf && window.jspdf.jsPDF), h2c: typeof window.html2canvas };
  });
  expect(lib).toEqual({ jspdf: 'function', h2c: 'function' });
  const z = await zrodla(page);
  expect(z.map((x) => x[0]).sort()).toEqual(['html2canvas', 'jspdf']);
  for (const [, skad, host] of z) { expect(skad).toBe('local'); expect(host).toBe('127.0.0.1:4173'); }

  const pdf = await page.evaluate(async () => {
    const p = await window.dietRecommendationsBuildPdfPackage({ mode: 'classic' });
    const glowa = await p.blob.slice(0, 5).text();
    return { jestBlob: p.blob instanceof Blob, rozmiar: p.blob.size, nazwa: p.filename, typ: p.blob.type, glowa };
  });
  expect(pdf.jestBlob).toBe(true);
  expect(pdf.rozmiar).toBeGreaterThan(5000);
  expect(pdf.nazwa).toMatch(/\.pdf$/u);
  expect(pdf.glowa).toBe('%PDF-');
});

test('gdy plik lokalny nie odpowiada, ładowarka bierze CDN (ten sam podpis SRI)', async ({ page }) => {
  test.setTimeout(120_000);
  // lokalne pliki „znikają”, a CDN odpowiada treścią tych samych plików z repozytorium
  await page.route('**/jspdf.umd.min.js*', (r) => r.abort());
  await page.route('**/html2canvas.min.js*', (r) => r.abort());
  await page.route('**cdnjs.cloudflare.com/ajax/libs/jspdf/**', (r) => r.fulfill({ path: 'jspdf.umd.min.js', contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**cdnjs.cloudflare.com/ajax/libs/html2canvas/**', (r) => r.fulfill({ path: 'html2canvas.min.js', contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await otworz(page);
  const lib = await page.evaluate(async () => {
    await window.vildaEnsurePdfLibraries();
    return { jspdf: typeof (window.jspdf && window.jspdf.jsPDF), h2c: typeof window.html2canvas };
  });
  expect(lib).toEqual({ jspdf: 'function', h2c: 'function' });
  const z = await zrodla(page);
  expect(z.length).toBe(2);
  for (const [, skad, host] of z) { expect(skad).toBe('cdn'); expect(host).toBe('cdnjs.cloudflare.com'); }
});

test('bez żadnego źródła obietnica jest odrzucana z komunikatem, a nie wisi', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('**/jspdf.umd.min.js*', (r) => r.abort());
  await page.route('**/html2canvas.min.js*', (r) => r.abort());
  await page.route('**cdnjs.cloudflare.com/**', (r) => r.abort());
  await otworz(page);
  const wynik = await page.evaluate(async () => {
    try { await window.vildaEnsurePdfLibraries(); return { ok: true }; } catch (e) { return { ok: false, msg: String(e && e.message || e) }; }
  });
  expect(wynik.ok).toBe(false);
  expect(wynik.msg).toMatch(/Nie udało się załadować|Błąd ładowania/u);
});
