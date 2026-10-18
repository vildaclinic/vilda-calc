import { expect, test } from '../support/test-czas.mjs';
import { otworzBadania, otworzSejf, sekcjaBadan } from '../support/lab-historia-dane.mjs';

// LAB-HISTORIA PR5a: zakładka „Badania” na prawdziwym sejfie — IGF-1 z notatki leczenia GH w serii IGF-1
// (decyzje 6.24–6.25) i wpis bez klucza dołączony po dokładnej nazwie badania z listy przelicznika (6.14).
// Notatka GH ma kształt zapisu z gh_igf_therapy.js (kategoria „treatment”, dawka w mg/kg/d, termin kontroli)
// i pole IGF-1 z edytora wpisu ({ value, unit: 'ng/ml' }). Dane wyłącznie FIKCYJNE. Zegar stron: 17.06.2026.
test.use({ serviceWorkers: 'block' });

const bezTwardejSpacji = (t) => t.replace(/\u00a0/g, ' ');

async function zapiszDane(page, patientId) {
  return page.evaluate(async (pid) => {
    const V = window.VildaVault;
    const ids = {};
    ids.igf = (await V.savePatientNote({
      patientId: pid, title: 'Fikcyjne IGF-1', body: '', category: 'wynik-badania', clinicalDateISO: '2026-03-04',
      labResult: { test: 'IGF-1 (insulinopodobny czynnik wzrostu 1)', testKey: 'igf1', value: '245', valueNum: 245, unit: 'ng/mL' },
    })).id;
    ids.gh = (await V.savePatientNote({
      patientId: pid, title: 'Leczenie rhGH', body: 'Kontrola leczenia hormonem wzrostu / IGF-1.\nDawka: 0,030 mg/kg/d.', category: 'treatment',
      dueDateISO: '2026-06-01', medication: { action: 'change', doseNum: 0.03, doseUnit: 'mg/kg/d', freq: 'dzień' },
      igf1: { value: 280, unit: 'ng/ml' },
    })).id;
    ids.t1 = (await V.savePatientNote({
      patientId: pid, title: 'Fikcyjny testosteron', body: '', category: 'wynik-badania', clinicalDateISO: '2026-02-10',
      labResult: { test: 'Testosteron całkowity', testKey: 'testosterone_total', value: '0,8', valueNum: 0.8, unit: 'nmol/L' },
    })).id;
    ids.t2 = (await V.savePatientNote({
      patientId: pid, title: 'Fikcyjny testosteron (dawny wpis)', body: '', category: 'wynik-badania', clinicalDateISO: '2026-05-10',
      labResult: { test: 'Testosteron całkowity', value: '1,9 nmol/L' },
    })).id;
    return ids;
  }, patientId);
}

test('IGF-1 z notatki GH na wykresie z datą kontroli i dopiskiem źródła; wpis dopasowany po nazwie w serii badania', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszDane(page, patientId);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  await expect(badania.locator('.vilda-lab-hist-panel-h')).toHaveText(['Oś gonadalna', 'Oś GH–IGF-1']);

  const igf = badania.locator('.vilda-lab-hist-card[data-series="igf1"]');
  await expect(igf.locator('.vilda-lab-hist-value')).toHaveText('280');
  await expect(igf.locator('.vilda-lab-hist-value')).toHaveAttribute('data-note-id', ids.gh);
  await expect(igf.locator('.vilda-lab-hist-date')).toHaveText('01.06.26 (data kontroli GH)');
  await expect(igf.locator('.vilda-lab-hist-source')).toHaveText('z notatki leczenia GH');
  expect(bezTwardejSpacji(await igf.locator('.vilda-lab-hist-prev').innerText())).toBe('poprzednio 245 ng/mL (04.03.26) · różnica +35 ng/mL · po 89 dniach');
  // Dwa punkty na wykresie, bez strzałek; treść notatki GH (opis dawki) nie trafia do komentarzy wyniku.
  await expect(igf.locator('svg.vilda-lab-trend-chart')).toHaveCount(1);
  await expect(igf.locator('svg text', { hasText: /[↓↑]/ })).toHaveCount(0);
  await expect(igf.locator('.vilda-lab-hist-comments')).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-footer')).toContainText('IGF-1 z notatek leczenia GH: data badania, a gdy jej brak — termin odbytej kontroli');

  const t = badania.locator('.vilda-lab-hist-card[data-series="testosterone_total"]');
  await expect(t.locator('.vilda-lab-hist-merged')).toHaveText('W tym 1 wpis dopasowany po nazwie badania „Testosteron całkowity”.');
  await expect(badania.locator('.vilda-lab-hist-card[data-series="testosteroncalkowity"]')).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-summary')).toHaveText('4 wyniki · 2 badania · ostatnie badanie 01.06.26');

  await badania.locator('.vilda-lab-hist-segment-btn', { hasText: 'Tabela' }).click();
  const tabela = badania.locator('.vilda-lab-hist-panel[data-panel="somatotropic"] table.vilda-lab-hist-table');
  const ghCell = tabela.locator(`button.vilda-lab-hist-cell[data-note-id="${ids.gh}"]`);
  await expect(ghCell.locator('.vilda-lab-hist-mark-gh')).toHaveText('GH');
  expect(bezTwardejSpacji(await ghCell.getAttribute('title'))).toBe('IGF-1 · 01.06.26 · zapisano: 280 ng/ml · z notatki leczenia GH');
  await expect(tabela.locator('tbody tr').first()).not.toHaveClass(/is-undated/);
  await expect(badania.locator('.vilda-lab-hist-panel[data-panel="somatotropic"] .vilda-lab-hist-foot')).toContainText('GH — IGF-1 z notatki leczenia GH');
});
