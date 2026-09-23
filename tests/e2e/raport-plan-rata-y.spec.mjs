import { expect, test } from '@playwright/test';

// P-RAPORT rata Y (decyzje właściciela 2026-09-23): plan PDF — zdanie „Twój zadeklarowany plan” bez mylącej sumy
// (deficyt tygodniowy nazwany wprost, przy samej diecie pominięty), ciągły łącznik etykiety drugiego rzędu osi
// z kółkiem, twarde spacje i letter-spacing w kaflach. PRAWDZIWA strona, dane FIKCYJNE.

async function plan(page, { spacer }) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaRaportPlan && window.VildaRaportPlan.version >= 11 && !!window.VildaBmiJourney);
  return page.evaluate(async ({ spacer }) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    window.professionalMode = true;
    set('name', 'Testowy Fikcyjny'); set('sex', 'M'); set('age', 15); set('ageMonths', 3); set('weight', 102.5); set('height', 186.7);
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    const jf = document.getElementById('journeyFlag'); if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); }
    window.update();
    await new Promise((r) => { setTimeout(r, 700); });
    const walk = document.querySelector('#bmiJourneyMount [data-journey="move"][data-key="walk"]');
    if (walk && (walk.getAttribute('aria-pressed') === 'true') !== spacer) { walk.click(); await new Promise((r) => { setTimeout(r, 300); }); }
    const br = window.buildDietEnergyRecommendationResult();
    const html = window.VildaRaportPlan.html({ patient: { name: 'Testowy Fikcyjny', ageLabel: '15 lat 3 mies.', sexLabel: 'męska', weightLabel: '102,5 kg', heightLabel: '186,7 cm' }, baseResult: br });
    const host = document.createElement('section');
    host.className = 'diet-pdf-page';
    host.style.cssText = 'position:absolute;left:0;top:0;width:1124px;background:#fff;z-index:99999';
    host.innerHTML = html;
    document.body.appendChild(host);
    await new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); });
    const R = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, x: (b.left + b.right) / 2 }; };
    const dol = host.querySelector('.vrp-zn-dol');
    const gora = Array.from(host.querySelectorAll('.vrp-zn:not(.vrp-zn-dol)'));
    const out = {
      zdanie: (host.querySelector('.vrp-ruchdek') || {}).textContent || '',
      kafle: Array.from(host.querySelectorAll('.vrp-kafel b')).map((b) => ({ t: b.textContent, ls: getComputedStyle(b).letterSpacing, h: b.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(b).fontSize) })),
      laczniki: host.querySelectorAll('.vrp-lacz').length,
    };
    if (dol) {
      const kr = R(dol.querySelector('.vrp-kr')), lacz = R(dol.querySelector('.vrp-lacz')), kg = R(dol.querySelector('.vrp-kg'));
      out.geo = { kr, lacz, kg, kolor: getComputedStyle(dol.querySelector('.vrp-lacz')).backgroundColor, szer: lacz.r - lacz.l };
      out.goraPodkladki = gora.map((z) => getComputedStyle(z.querySelector('.vrp-kg')).backgroundColor);
    }
    host.remove();
    return out;
  }, { spacer });
}

test.describe('P-RAPORT rata Y — zdanie planu, łącznik osi, spacje w kaflach', () => {
  test('RY-1: chłopiec 15;3 — sama dieta: zdanie bez sumy tygodniowej; łącznik od kółka 96,4 kg do jego opisu; kafle z twardymi spacjami', async ({ page }) => {
    test.setTimeout(120_000);
    const a = await plan(page, { spacer: false });
    expect(a.zdanie.replace(/[\u00A0\u202F]/g, ' ').trim()).toBe('Twój zadeklarowany plan: dieta umiarkowana (do 2 700 kcal dziennie).');
    expect(a.laczniki).toBe(1);
    const g = a.geo;
    // pionowa linia w osi kółka, od jego dołu do góry opisu, bez nachodzenia na tekst
    expect(Math.abs(g.lacz.x - g.kr.x)).toBeLessThan(1);
    expect(Math.abs(g.lacz.x - g.kg.x)).toBeLessThan(1);
    expect(g.lacz.t).toBeGreaterThanOrEqual(g.kr.b - 0.5);
    expect(g.lacz.t - g.kr.b).toBeLessThan(4);
    expect(g.lacz.b).toBeLessThanOrEqual(g.kg.t + 0.5);
    expect(g.kg.t - g.lacz.b).toBeLessThan(6);
    expect(g.szer).toBeGreaterThan(1); expect(g.szer).toBeLessThan(2.5);
    expect(g.kolor).toBe('rgb(157, 185, 187)');
    expect(a.goraPodkladki.every((c) => c === 'rgb(255, 255, 255)')).toBe(true);
    // kafle: bez zwykłej spacji, letter-spacing ≠ normal/0 (html2canvas rysuje znak po znaku), jedna linia
    const wartosci = a.kafle.map((k) => k.t);
    expect(wartosci.slice(0, 3)).toEqual(['≤\u00A02\u202F700', '−379', '−0,3']);
    expect(wartosci[3]).toMatch(/^\d{1,2}\u00A0[IVX]+$/); // termin kontroli zależy od dzisiejszej daty
    expect(wartosci.slice(4)).toEqual(['ok.\u00A0100,7\u00A0kg', '≥\u00A0101,7\u00A0kg']);
    for (const k of a.kafle) {
      expect(k.t).not.toContain(' ');
      expect(parseFloat(k.ls)).toBeGreaterThan(0);
      expect(k.h).toBeLessThan(k.fs * 1.6);
    }
  });

  test('RY-2: dieta + spacer — suma tygodniowa nazwana jako deficyt i zaokrąglona do 50 kcal', async ({ page }) => {
    test.setTimeout(120_000);
    const a = await plan(page, { spacer: true });
    expect(a.zdanie.replace(/[\u00A0\u202F]/g, ' ')).toMatch(/^Twój zadeklarowany plan: dieta umiarkowana \(do 2 700 kcal dziennie\) i spacer 30 min\/d — razem to ok\. 3 800 kcal tygodniowo mniej, niż organizm zużywa\. Tempo pokazane powyżej dotyczy samej diety; z ruchem to ok\. −0,5 kg tygodniowo\./);
    expect(a.zdanie).not.toMatch(/3.783/);
  });
});
