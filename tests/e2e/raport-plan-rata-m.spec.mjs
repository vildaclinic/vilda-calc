import { expect, test } from '@playwright/test';

// P-RAPORT rata M (2026-09-22) — poprawki renderu planu PDF po zgłoszeniu właściciela (PC i Mac, Chrome):
//  (1) nagłówki sekcji z gołym tekstem w kontenerze flex + letter-spacing wychodziły z html2canvas
//      przestawione („T WOJAD ROGA”); teraz tekst w <span> — strażnik: host PDF bez gołego tekstu w flex/grid;
//  (2) ramka strony używała <header>/<footer>, więc globalne reguły aplikacji dla elementu header
//      (overflow:hidden, tło, position:sticky przy szerokim oknie) wchodziły do PDF — ucięte ogonki liter tytułu,
//      chip z datą bez marginesu, na Macu brak nagłówka; teraz div — strażnik: brak sticky/overflow hidden,
//      a kontrolny <header> wstawiony do hosta wciąż łapie te reguły (czyli test naprawdę coś sprawdza);
//  (3) zdania: bez „Wyliczone dla diety … PAL”, pozycje planu małą literą, „dojdziesz do celu o X wcześniej”.
//  Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.vildaEnsurePdfLibraries === 'function' && !!window.VildaRaportPlan);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.dietRecommendationsBuildPdfPackage === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportCreateRenderHost === 'function');
}

function ustawPacjenta(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) { el.checked = !!on; el.dispatchEvent(new Event('change', { bubbles: true })); } };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    set('name', 'Zofia Testowa'); set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    window.ensureDietRecommendationsElements();
    window.update();
    flag('hydrationFlag', !!s.opcje); flag('vitDSuppFlag', !!s.opcje); flag('journeyFlag', true);
    await new Promise((r) => { setTimeout(r, 250); });
    const chip = document.querySelector('#bmiJourneyMount .bmi-journey-chip[data-key="walk"]');
    if (chip && chip.getAttribute('aria-pressed') !== 'true') chip.click();
    await new Promise((r) => { setTimeout(r, 200); });
  }, s);
}

/* Audyt hosta PDF w momencie wywołania html2canvas: zwraca listę gołych węzłów tekstowych w kontenerach
   flex/grid, style ramki i próbkę kontrolną z prawdziwym <header>. */
function audytHosta(page) {
  return page.evaluate(async () => {
    await window.vildaEnsurePdfLibraries();
    const orig = window.html2canvas;
    let wynik = null;
    window.html2canvas = (el, o) => {
      const w = el.ownerDocument.defaultView;
      const gole = [];
      el.querySelectorAll('*').forEach((n) => {
        const d = w.getComputedStyle(n).display;
        if (!/flex|grid/.test(d)) return;
        const txt = Array.from(n.childNodes).filter((c) => c.nodeType === 3 && c.textContent.trim()).map((c) => c.textContent.trim()).join('|');
        if (txt) gole.push((n.className || n.tagName) + ': ' + txt.slice(0, 40));
      });
      const h = el.querySelector('.diet-pdf-header'), f = el.querySelector('.diet-pdf-footer'), h1 = el.querySelector('.diet-pdf-header h1'), d = el.querySelector('.diet-pdf-date');
      const ch = w.getComputedStyle(h), ch1 = w.getComputedStyle(h1);
      // próbka kontrolna: prawdziwy <header> w tym samym miejscu łapie globalne reguły aplikacji
      const kontrola = el.ownerDocument.createElement('header');
      kontrola.className = 'diet-pdf-header';
      h.parentNode.insertBefore(kontrola, h);
      const ck = w.getComputedStyle(kontrola);
      const kontrolaStyl = { position: ck.position, overflow: ck.overflow };
      kontrola.remove();
      const hr = h.getBoundingClientRect(), pr = el.getBoundingClientRect(), dr = d.getBoundingClientRect(), h1r = h1.getBoundingClientRect();
      const naglowki = Array.from(el.querySelectorAll('.vrp-nag-blok')).map((n) => ({ tekst: n.textContent.trim(), spanem: n.firstElementChild && n.firstElementChild.tagName === 'SPAN' && n.firstElementChild.textContent.trim() === n.textContent.trim() }));
      wynik = {
        gole,
        naglowek: { tag: h.tagName, stopka: f.tagName, position: ch.position, overflow: ch.overflow, tlo: ch.backgroundImage, kolorTytulu: ch1.color, lineHeight: parseFloat(ch1.lineHeight) / parseFloat(ch1.fontSize),
          odGoryStrony: Math.round(hr.top - pr.top), chipOdPrawej: Math.round(pr.right - dr.right), tytulWewnatrz: h1r.bottom <= hr.bottom + 0.5 },
        kontrolaStyl,
        naglowki,
        tekst: el.textContent.replace(/\s+/g, ' ')
      };
      return orig(el, o);
    };
    try {
      const p = await window.dietRecommendationsBuildPdfPackage({ mode: 'classic' });
      const glowa = await p.blob.slice(0, 5).text();
      return Object.assign({ pdf: glowa }, wynik);
    } finally { window.html2canvas = orig; }
  });
}

test('host PDF planu: nagłówki w <span>, brak gołego tekstu w flex/grid, ramka bez globalnych reguł header', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1728, height: 1000 }); // szerokie okno jak na Macu: tu .has-vilda-chrome header dostawał position:sticky
  await page.route('**cdnjs.cloudflare.com/**', (r) => r.abort());
  await otworz(page);
  await ustawPacjenta(page, { age: 16, months: 4, sex: 'F', w: 94.8, h: 175.5, opcje: true });
  await page.evaluate(() => window.scrollTo(0, 3000));
  const a = await audytHosta(page);
  expect(a.pdf).toBe('%PDF-');
  expect(a.gole, 'goły tekst w kontenerach flex/grid hosta PDF').toEqual([]);
  expect(a.naglowki.length).toBeGreaterThanOrEqual(4);
  for (const n of a.naglowki) expect(n.spanem, n.tekst).toBe(true);
  expect(a.naglowki.map((n) => n.tekst)).toEqual(expect.arrayContaining(['TWOJA DROGA', 'KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI MASY CIAŁA', 'NORMY, PŁYNY I SUPLEMENTACJA', 'CO ROBIĆ NA CO DZIEŃ']));
  // ramka: zwykłe div-y, statyczne, bez overflow:hidden i bez tła z motywu; tytuł teal, nieucięty; chip nie przy krawędzi strony
  expect(a.naglowek.tag).toBe('DIV');
  expect(a.naglowek.stopka).toBe('DIV');
  expect(a.naglowek.position).toBe('static');
  expect(a.naglowek.overflow).toBe('visible');
  expect(a.naglowek.tlo).toBe('none');
  expect(a.naglowek.kolorTytulu).toBe('rgb(0, 131, 141)');
  expect(a.naglowek.lineHeight).toBeGreaterThan(1.1);
  expect(a.naglowek.tytulWewnatrz).toBe(true);
  expect(a.naglowek.odGoryStrony).toBeGreaterThanOrEqual(40);
  expect(a.naglowek.chipOdPrawej).toBeGreaterThanOrEqual(40);
  // próbka kontrolna: gdyby ramka wciąż była <header>, dostałaby sticky/overflow hidden z reguł aplikacji
  expect(a.kontrolaStyl.overflow === 'hidden' || a.kontrolaStyl.position === 'sticky', JSON.stringify(a.kontrolaStyl)).toBe(true);
});

test('zdania planu: bez zdania o diecie/PAL, pozycje małą literą, ruch „dojdziesz do celu o … wcześniej”', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route('**cdnjs.cloudflare.com/**', (r) => r.abort());
  await otworz(page);
  await ustawPacjenta(page, { age: 16, months: 4, sex: 'F', w: 94.8, h: 175.5, opcje: false });
  const a = await audytHosta(page);
  expect(a.tekst).not.toContain('Wyliczone dla diety');
  expect(a.tekst).not.toContain('Zmiana aktywności zmienia te liczby');
  // (zdanie o ograniczonym tempie u dzieci zależy od wybranej diety — jego obecność w źródle pilnuje test jednostkowy)
  // P-DIETA rata V pkt 1: u dziecka z planem otyłości nazwa diety niesie górną granicę dnia („dieta umiarkowana (do 2 000 kcal)”);
  // P-RAPORT rata Y: „kcal dziennie”, a suma tygodniowa nazwana jako deficyt („… kcal tygodniowo mniej, niż organizm zużywa”)
  expect(a.tekst).toMatch(/Twój zadeklarowany plan: dieta [a-ząćęłńóśźż]+ \(do [\d\s\u00A0\u202F]+ kcal dziennie\) i spacer 30 min\/d — razem to ok\. [\d\s\u00A0\u202F]+ kcal tygodniowo mniej, niż organizm zużywa\. Tempo pokazane powyżej dotyczy samej diety; z ruchem to ok\. −\d,\d[\s\u202F]kg tygodniowo\. Dzięki ruchowi dojdziesz do celu (o [^.]+ |nieco )wcześniej niż na samej diecie\./u);
  expect(a.tekst).not.toContain('szybciej niż na samej diecie');
  expect(a.tekst).not.toMatch(/ i Spacer /);
  // dorosły: pod kaflami nic (ani zdania o diecie/PAL, ani zdania o tempie u dzieci)
  await ustawPacjenta(page, { age: 47, months: 0, sex: 'M', w: 112, h: 167, opcje: false });
  const b = await audytHosta(page);
  expect(b.tekst).not.toContain('celowo ograniczone');
  expect(b.tekst).not.toContain('Wyliczone dla diety');
  expect(b.tekst).toMatch(/spodziewane tempo redukcji ?Twój zadeklarowany plan:/);
  // P-DIETA rata Z (decyzja właściciela 2026-09-23): u dorosłego nazwa diety też niesie górną granicę dnia,
  // a plan ma sekcję kontroli (dawniej: rata V tylko u dziecka)
  expect(b.tekst).toMatch(/Twój zadeklarowany plan: dieta [a-ząćęłńóśźż]+ \(do [\d\s\u00A0\u202F]+ kcal dziennie\) i /u);
  expect(b.tekst).toContain('KONTROLA ZA 6 TYGODNI');
});
