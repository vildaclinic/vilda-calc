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
  const label = view === 'charts' ? 'Wykresy' : 'Tabela';
  const control = badania(scope).getByRole('button', { name: label, exact: true });
  await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  return badania(scope);
}

export async function showClcrResults(scope, view = 'table') {
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
      const choice = clcrCards(scope).locator(`.vilda-lab-result-chart-choice[data-note-id="${id}"]`);
      if (await choice.isVisible()) { await choice.click(); selected = true; break; }
      await group.click();
    }
    expect(selected, 'coincident chart chooser contains the requested canonical record').toBe(true);
  } else if (keyboard) {
    await row.focus(); await row.press('Enter');
  } else await row.click();
  await expect(scope.locator('#detailsDialog')).toBeVisible();
  await expect(scope.locator('#calculationDetails')).toHaveAttribute('data-note-id', id);
}

export async function closeClcrDetails(scope) {
  await scope.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(scope.locator('#detailsDialog')).toBeHidden();
}
