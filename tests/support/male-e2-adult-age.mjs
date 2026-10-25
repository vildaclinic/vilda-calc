import { expect } from './test-czas.mjs';
import {
  prepare as prepareMaleE2, choose,
  host, card, median, sources, curve, patientPoint, sourcePoint, overflowPoint, runtimeState,
} from './male-e2-age.mjs';

// Independently read Figure 3a values. These are audit precision for regression
// assertions, not the precision shown to a clinician by the production card.
export const ADULT_P50_40 = 88.16623312463493;
export const ADULT_P50_55 = 87.38540878379439;
export { host, card, median, sources, curve, patientPoint, sourcePoint, overflowPoint, runtimeState, choose };
export {
  initializeStorage, ready, setCurrentPatient, loadPatient, setQuickAge, setQuickSex,
  expectNoMedian, expectNoPatientPoint, laboratoryFacts, expectFits,
} from './male-e2-age.mjs';

export async function prepare(page, options = {}) {
  const id = await prepareMaleE2(page, { age: 40, months: '', ...options });
  await choose(page, '125');
  return id;
}

export async function expectAdultMedian(page, expected = ADULT_P50_40) {
  await expect(card(page)).toBeVisible();
  await expect.poll(async () => Number(await median(page).getAttribute('data-source-value'))).toBeCloseTo(expected, 10);
  await expect(median(page)).toHaveAttribute('data-source-unit', 'pmol/L');
  await expect(sourcePoint(page)).toHaveCount(1);
  await expect(curve(page)).toHaveCount(1);
  const state = await runtimeState(page);
  expect(state.result.source.url).toBe('https://doi.org/10.1210/clinem/dgz196');
  expect(state.result.source.id).toMatch(/frederiksen/i);
  expect(state.result.plot).toMatchObject({ ageMin: 31.4, ageMax: 60.9, independentOfPatient: true });
  expect(state.result.policy.plot.valueMax).toBe(200);
  await expect(card(page)).toContainText(/Frederiksen/);
}

export async function expectChildMedian(page, expected = 6.129050070456699) {
  await expect(card(page)).toBeVisible();
  await expect.poll(async () => Number(await median(page).getAttribute('data-source-value'))).toBeCloseTo(expected, 11);
  await expect(sourcePoint(page)).toHaveCount(1);
  const state = await runtimeState(page);
  expect(state.result.source.url).toBe('https://doi.org/10.1210/clinem/dgac155');
  expect(state.result.policy.plot.valueMax).toBe(100);
  await expect(card(page)).toContainText('Madsen');
}

export async function plotGeometry(page) {
  return curve(page).evaluate(path => ({
    coordinates: (path.getAttribute('d').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/ig) || []).map(Number),
    viewBox: path.ownerSVGElement.getAttribute('viewBox'),
    sourceTicks: [...path.ownerSVGElement.querySelectorAll('[data-male-e2-age-axis="y"]')]
      .map(tick => Number(tick.getAttribute('data-source-axis-value'))),
  }));
}

export function expectSameGeometry(actual, expected) {
  expect(actual.viewBox).toBe(expected.viewBox);
  expect(actual.sourceTicks).toEqual(expected.sourceTicks);
  expect(actual.coordinates).toHaveLength(expected.coordinates.length);
  const maximumPixelDifference = Math.max(0, ...actual.coordinates.map((value, index) => Math.abs(value - expected.coordinates[index])));
  expect(maximumPixelDifference).toBeLessThanOrEqual(.0025);
}
