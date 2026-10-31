import { expect } from '@playwright/test';
import * as upper from './female-tt-infant-upper.mjs';

// Reuse the real, current-patient form flow. This helper changes no clinical
// state to manufacture a reference; reported assay facts are separate module inputs.
export const initializeStorage = upper.initializeStorage;
export const choose = upper.choose;
export const laboratoryFacts = upper.laboratoryFacts;
export const host = page => page.locator('#labFemaleTtInfantMedian');
export const card = page => host(page).locator('.vilda-female-tt-infant-median');
export const rows = page => card(page).locator('[data-female-tt-infant-median-row]');
export const sources = page => card(page).locator('[data-female-tt-infant-median="sources"]');
export const patientPoint = page => card(page).locator('[data-female-tt-infant-median-marker="patient"]');
export const overflowPoint = page => card(page).locator('[data-female-tt-infant-median-marker="overflow"]');
export const gauge = page => card(page).locator('[data-female-tt-infant-median="gauge"]');
export const runtimeState = page => page.evaluate(() => window.VildaFemaleTTInfantMedianRuntime.getState());

export async function ready(page) {
  await upper.ready(page);
  await page.waitForFunction(() => window.VildaFemaleTTInfantMedianRuntime && window.VildaFemaleTTInfantMedian);
}

export async function start(page, options = {}) {
  await upper.start(page, options);
  await ready(page);
}

export async function mainPatient(page, { pnaDays, ...options } = {}) {
  const age = pnaDays == null ? options : { ...options, months: 0, days: pnaDays };
  const id = await upper.mainPatient(page, age);
  await ready(page);
  return id;
}

export async function prepare(page, options = {}) {
  await start(page, options);
  const id = await mainPatient(page, options);
  await choose(page, '0,14');
  return id;
}

export async function expectFits(page) {
  expect(await host(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

export async function expectNoPatientPoint(page) {
  await expect(patientPoint(page)).toHaveCount(0);
  await expect(overflowPoint(page)).toHaveCount(0);
}

export async function expectMedian(page, value = .13, mode = 'source-info') {
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-mode', mode);
  await expect(rows(page)).toHaveCount(1);
  await expect(card(page)).toContainText('Mediana grupy wieku');
  expect((await runtimeState(page)).median.sourceMedian).toBe(value);
  await expect(card(page).locator('input, select, textarea')).toHaveCount(0);
}

// Unknown material/method in the ordinary form remain unknown. This qualified
// renderer contract supplies only explicit synthetic sample facts to the real
// module update, keeping identity, PNA, calendar age and result from production.
export async function supplyReportedSample(page, changes = {}, { includeUpper = false } = {}) {
  return page.evaluate(({ changes, includeUpper }) => {
    const runtime = window.VildaFemaleTTInfantMedianRuntime;
    const current = runtime.getState();
    if (!current?.ageContext || !current.identityKey || !current.postnatalDays) {
      throw new Error('No current production infant calendar/PNA context');
    }
    const assessment = window.VildaLabPubertyRuntime.getAssessment()?.evaluation;
    const source = window.VildaPubertySource.kontekstPacjenta(current.identityKey);
    const gestation = source?.neonatalAge?.gestationalDays;
    const ga = gestation && gestation.lower === gestation.upper ? gestation.lower : null;
    const context = {
      sourceStatus: 'ready', analyte: 'testosterone_total', sex: 'female',
      identityKey: current.identityKey, currentIdentityKey: sessionStorage.getItem('vildaCurrentPatientId'),
      contextBasis: 'current-patient', ageYears: current.ageContext.lowerYears,
      ageUpperYears: current.ageContext.upperYears, ageUpperInclusive: current.ageContext.upperInclusive,
      postnatalDays: current.postnatalDays,
      gestationalAgeDays: ga, gestationalAgeUpperDays: ga,
      gestationalAgeUpperInclusive: ga !== null ? true : undefined,
      specimen: 'serum', assayMethodId: 'lc-ms/ms', treatment: {},
      measurement: assessment?.measurement, displayUnit: document.getElementById('labUnitTarget').value,
      ...changes,
    };
    const result = runtime.update(context);
    // Exercise the combined presentation with the same explicitly reported
    // facts, without a second assessment read resetting either live preview.
    if (includeUpper) window.VildaFemaleTTInfantUpperRuntime.update(context);
    return result;
  }, { changes, includeUpper });
}
