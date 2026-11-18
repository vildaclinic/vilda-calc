import { expect } from '@playwright/test';

// The main patient card uses the common results presentation. The calculator's
// independent #clcrPatientCard still uses ClcrSavedResultsView and its old DOM.
export const badania = scope => scope.locator('.vilda-lab-hist');
export const clcrRows = scope => badania(scope).locator('.vilda-lab-hist-result-row[data-source="clcr"]');
export const clcrRow = (scope, id) => badania(scope).locator(`.vilda-lab-hist-result-row[data-source="clcr"][data-note-id="${id}"]`);
export const clcrResult = clcrRow;
export const clcrCards = scope => badania(scope).locator('.vilda-lab-hist-card[data-source="clcr"]');
export const clcrPoints = scope => clcrCards(scope).locator('.vilda-lab-result-chart-point');
export const clcrPoint = (scope, id) => clcrCards(scope).locator(`.vilda-lab-result-chart-point[data-note-id="${id}"]`);
export const clcrValue = (scope, id) => clcrResult(scope, id).locator('.vilda-lab-hist-result-value');
export const clcrNorm = (scope, id) => clcrResult(scope, id).locator('.vilda-lab-hist-result-norm');

export async function showBadaniaView(scope, view) {
  // The common details viewer is outside the chart/table and modal. Return to
  // the list before operating its view switch, just as a clinician does.
  if (await scope.locator('#detailsDialog[open]').count()) await closeClcrDetails(scope);
  const labDetails = scope.locator('#labResultDetailsDialog[open]');
  if (await labDetails.count()) await labDetails.locator('.vilda-lab-hist-details-close').click();
  const label = view === 'charts' ? 'Wykresy' : 'Tabela';
  const control = badania(scope).getByRole('button', { name: label, exact: true });
  await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  return badania(scope);
}

export async function showClcrResults(scope, view = 'table') {
  if (await scope.locator('#detailsDialog[open]').count()) await closeClcrDetails(scope);
  const labDetails = scope.locator('#labResultDetailsDialog[open]');
  if (await labDetails.count()) await labDetails.locator('.vilda-lab-hist-details-close').click();
  await expect(badania(scope)).toHaveAttribute('aria-busy', 'false');
  await badania(scope).locator('.vilda-lab-hist-panel-select').selectOption('renal');
  return showBadaniaView(scope, view);
}

export async function openClcrDetails(scope, id, { keyboard = false, chart = false } = {}) {
  await showClcrResults(scope, chart ? 'charts' : 'table');
  const row = chart ? clcrPoint(scope, id) : clcrResult(scope, id);
  if (chart && await row.count() === 0) {
    // Different canonical records can share one exact date/value coordinate.
    // Select the real record from the chart's actual chooser, without jitter.
    const groups = await clcrCards(scope).locator('.vilda-lab-result-chart-point[data-count]').all();
    let selected = false;
    for (const group of groups) {
      await group.click();
      const choice = scope.locator(`#labResultDetailsDialog .vilda-lab-result-chart-choice[data-note-id="${id}"]`);
      if (await choice.isVisible()) { await choice.click(); selected = true; break; }
      await scope.locator('#labResultDetailsDialog .vilda-lab-hist-details-close').click();
    }
    expect(selected, 'coincident chart chooser contains the requested canonical record').toBe(true);
  } else if (keyboard) {
    await row.focus(); await row.press('Enter');
  } else await row.click();
  await expect(scope.locator('#detailsDialog')).toBeVisible();
  await expect(scope.locator('#calculationDetails')).toHaveAttribute('data-note-id', id);
}

export async function closeClcrDetails(scope) {
  await scope.locator('#detailsDialog [data-clcr-close="detailsDialog"]').first().click();
  await expect(scope.locator('#detailsDialog')).toBeHidden();
}

// P-KLIRENS-NOTATKI (decyzja właściciela 2026-11-15: Notatki nie są miejscem na wyniki Klirensu). Wynik Klirensu
// nie ma karty w Notatkach: zakładka pokazuje tylko linię z liczbą wyników, która prowadzi do Badań, a techniczny
// zapis obliczenia nie pojawia się w jej treści. Zwraca sekcję Notatek do dalszych sprawdzeń.
// legacyCards: liczba zapisów „wynik-klirens” bez pola wyniku — te zostają w Notatkach ze zwartą kartą.
export async function expectClcrOutsideNotes(scope, count, { legacyCards = 0 } = {}) {
  await scope.locator('button[data-tab="notes"]').click();
  const notes = scope.locator('.vilda-patient-notes-section');
  await expect(notes.locator('.vilda-wb-notes-link')).toHaveText(`Wyniki badań (${count}) są w zakładce Badania →`);
  await expect(notes.locator('.vilda-clcr-note')).toHaveCount(legacyCards);
  for (const key of ['VILDA_CLCR', 'engineVersion', 'exactMain', '[tekst]']) await expect(notes).not.toContainText(key);
  return notes;
}

// Szczegóły zapisanego obliczenia z karty pacjenta: zakładka „Badania”, panel „Klirens”, wiersz tego zapisu.
export async function openClcrDetailsInCard(scope, id, options) {
  await scope.locator('button[data-tab="lab"]').click();
  await openClcrDetails(scope, id, options);
}
