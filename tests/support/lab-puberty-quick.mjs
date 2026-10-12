import { expect } from './test-czas.mjs';

// Drive the production quick form. Optional controls are opened through their
// user-facing actions, never by unhiding DOM nodes or calling form internals.
const sections = {
  Sex: 'Patient', AgeYears: 'Patient', AgeMonths: 'Patient', Preterm: 'Patient',
  Kind: 'Stage', Stage: 'Stage',
};

export async function quickField(ctx, name) {
  const input = ctx.locator(`#labPuberty${name}`);
  if (sections[name] && !await input.isVisible()) {
    await ctx.locator(sections[name] === 'Patient' ? '#labPubertyEditPatient' : '#labPubertyRefineStage').click();
  }
  await expect(input).toBeVisible();
  return input;
}

export async function closePatientEditor(ctx) {
  for (const id of ['labPubertyEditPatient', 'labPubertyRefineStage']) {
    const button = ctx.locator(`#${id}`);
    if (await button.isVisible() && await button.textContent() === 'Gotowe') await button.click();
  }
}

export const quickSelect = async (ctx, name, value) => (await quickField(ctx, name)).selectOption(value);
export const quickFill = async (ctx, name, value) => (await quickField(ctx, name)).fill(value);

// This helper only verifies the production auto mode; it never configures a method.
export async function expectAutomaticReference(ctx) {
  await expect(ctx.locator('#labPubertyConfiguredProfile, #labPubertySaveProfile, #labPubertyUnknownMethod, #labPubertyEditMethod, #labPubertyMethodSettings')).toHaveCount(0);
  await expect(ctx.locator('#labStep4')).toBeHidden();
  const input = await ctx.locator('#labPubertyPanel').evaluate(() => window.VildaLabPubertyRuntime.getAssessment()?.evaluation?.input);
  expect(input).toMatchObject({ referenceSelection: 'automatic', specimen: 'unknown', assay: { confirmation: 'unknown' } });
  expect(input.assay.profileId).toBeFalsy();
  expect(input.assay.methodId).toBeFalsy();
}
