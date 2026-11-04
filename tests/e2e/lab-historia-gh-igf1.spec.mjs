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
  await badania.getByRole('button', { name: 'Wykresy', exact: true }).click();
  const igf = badania.locator('.vilda-lab-hist-card[data-series="igf1"]');
  await expect(igf.locator('.vilda-lab-hist-value.tone-neutral')).toHaveText('280');
  await expect(igf.locator('.vilda-lab-hist-latest')).toHaveAttribute('data-note-id', ids.gh);
  await expect(igf.locator('.vilda-lab-hist-date')).toHaveText('01.06.26 · data kontroli GH');
  await expect(igf.locator('.vilda-lab-hist-result-norm')).toHaveText('—');
  // Oba dokładne punkty zachowują ID i neutralny kolor; wpis GH nie staje się normą ani komentarzem.
  await expect(igf.locator('.vilda-lab-result-chart-point')).toHaveCount(2);
  await expect(igf.locator('.vilda-lab-result-chart-point[data-tone="neutral"]')).toHaveCount(2);
  await expect(igf.locator(`.vilda-lab-result-chart-point[data-note-id="${ids.igf}"]`)).toHaveAttribute('data-value', '245');
  await expect(igf.locator(`.vilda-lab-result-chart-point[data-note-id="${ids.gh}"]`)).toHaveAttribute('data-value', '280');
  await expect(igf.locator('.vilda-lab-result-chart-band')).toHaveCount(0);
  await expect(igf.locator('.vilda-lab-hist-comments')).toHaveCount(0);
  await igf.locator('.vilda-lab-hist-latest').click();
  const details = badania.locator(`.vilda-lab-hist-result-details[data-note-id="${ids.gh}"]`);
  await expect(details).toContainText('z notatki leczenia GH');
  expect(bezTwardejSpacji(await details.innerText())).toContain('Zmiana: +35 ng/mL · po 89 dniach');
  await expect(details).not.toContainText('Dawka: 0,030');
  await details.locator('.vilda-lab-hist-details-close').click();
  await badania.locator('.vilda-lab-hist-footer > summary').click();
  await expect(badania.locator('.vilda-lab-hist-footer')).toContainText('IGF-1 z notatek leczenia GH: data badania, a gdy jej brak — termin odbytej kontroli');

  const t = badania.locator('.vilda-lab-hist-card[data-series="testosterone_total"]');
  await expect(t.locator('.vilda-lab-result-chart-point')).toHaveCount(2);
  await expect(t.locator(`.vilda-lab-result-chart-point[data-note-id="${ids.t1}"]`)).toHaveAttribute('data-value', '0.8');
  await expect(t.locator(`.vilda-lab-result-chart-point[data-note-id="${ids.t2}"]`)).toHaveAttribute('data-value', '1.9');
  await expect(badania.locator('.vilda-lab-hist-card[data-series="testosteroncalkowity"]')).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-result-chart-point[data-note-id]')).toHaveCount(4);
  expect(await badania.locator('.vilda-lab-hist-card').evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('data-series')).sort()))
    .toEqual(['igf1', 'testosterone_total']);

  await badania.getByRole('button', { name: 'Tabela', exact: true }).click();
  const grupa = badania.locator('.vilda-lab-hist-date-group[data-date-iso="2026-06-01"]');
  await expect(grupa.locator('.vilda-lab-hist-date-heading')).toHaveText('01.06.26 · data kontroli GH');
  const ghCell = grupa.locator(`.vilda-lab-hist-result-row[data-note-id="${ids.gh}"]`);
  await expect(ghCell.locator('.vilda-lab-hist-source')).toHaveText('GH');
  await expect(ghCell.locator('.vilda-lab-hist-cell-value.tone-neutral')).toHaveText('280');
  await expect(ghCell.locator('.vilda-lab-hist-result-norm')).toHaveText('—');
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(4);
  await expect(badania).not.toContainText('Kontrola leczenia hormonem wzrostu / IGF-1.');
});
