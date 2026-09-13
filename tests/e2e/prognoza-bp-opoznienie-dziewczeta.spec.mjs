import { expect, test } from '@playwright/test';

// GROWTH-PRED-BP-DZIEWCZETA — ostrzeżenie o prognozie Bayleya-Pinneau przy opóźnieniu wieku
// kostnego ≥ 2 lata przez PRAWDZIWY adapter karty zaawansowanej na index.html. U dziewcząt to
// komunikat (bez korekty liczbowej), u chłopców nazywa zastosowaną korektę −2,0 cm. Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function' && Boolean(window.VildaGrowthCardC));
}

function policz(page, { lata, miesiace, wzrost, masa, ba, plec }) {
  return page.evaluate(({ lata, miesiace, wzrost, masa, ba, plec }) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    window.professionalMode = true;
    set('age', lata); set('ageMonths', miesiace); set('sex', plec);
    set('height', wzrost); set('weight', masa);
    set('advMotherHeight', 165); set('advFatherHeight', 185); set('advBoneAge', ba);
    const t = document.getElementById('toggleAdvancedGrowth'); const f = document.getElementById('advancedGrowthForm');
    if (t && f && getComputedStyle(f).display === 'none') { t.disabled = false; t.click(); }
    window.calculateGrowthAdvanced();
    const d = window.advancedGrowthData || {};
    const card = document.querySelector('.vgcc');
    const hint = card ? Array.from(card.querySelectorAll('.vgcc-hint')).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()) : [];
    const details = card ? card.querySelector('details.vgcc-det') : null;
    return {
      fhp: d.finalHeightPrediction || null,
      hint,
      // ostrzeżenie ma być POZA rozwijanymi szczegółami
      hintWDetalach: Boolean(details && details.querySelector('.vgcc-hint')),
    };
  }, { lata, miesiace, wzrost, masa, ba, plec });
}

test('dziewczynka 13 l, wiek kostny 10,5: widoczne ostrzeżenie o Bayleyu-Pinneau bez korekty liczbowej', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { lata: 13, miesiace: 0, wzrost: 140, masa: 34, ba: 10.5, plec: 'F' });
  expect(r.fhp).not.toBeNull();
  expect(r.fhp.deltaMonths).toBe(-30);
  const bp = r.fhp.methods.filter((m) => m.key === 'bp')[0];
  expect(bp).toBeTruthy();
  expect(bp.biasCm).toBe(0);
  const tekst = r.hint.join(' | ');
  expect(tekst).toContain('wiek kostny opóźniony o 30 mies.');
  expect(tekst).toContain('Korekty liczbowej u dziewcząt nie zastosowano');
  expect(tekst).toContain('Brämswig 1990');
  expect(tekst).not.toContain('zawyża u dziewcząt');
  expect(r.hintWDetalach).toBe(false);
  expect(r.fhp.bpDelayCaution).toContain('Bayleya-Pinneau');
});

test('chłopiec 14 l, wiek kostny 11,5: ostrzeżenie nazywa zastosowaną korektę −2,0 cm', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { lata: 14, miesiace: 0, wzrost: 148, masa: 38, ba: 11.5, plec: 'M' });
  expect(r.fhp.deltaMonths).toBe(-30);
  const bp = r.fhp.methods.filter((m) => m.key === 'bp')[0];
  expect(bp.biasCm).toBeCloseTo(-2.0, 3);
  const tekst = r.hint.join(' | ');
  expect(tekst).toContain('zawyża u chłopców');
  expect(tekst).toContain('skorygowano o −2,0 cm');
});

test('dziewczynka z opóźnieniem 23 mies. nie dostaje ostrzeżenia (próg to 24 mies.)', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { lata: 13, miesiace: 0, wzrost: 140, masa: 34, ba: 11.1, plec: 'F' });
  expect(r.fhp.deltaMonths).toBe(-23);
  expect(r.hint.join(' | ')).not.toContain('Bayleya-Pinneau');
  expect(r.fhp.bpDelayCaution).toBe('');
});
