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

const selectedAxes = new WeakMap();
export const quickSelect = async (ctx, name, value) => {
  if (name === 'Sex') selectedAxes.delete(ctx);
  const common = ctx.locator('#labPubertySharedEditor');
  if (['Kind', 'Stage'].includes(name) && await common.count() && await common.evaluate(node => !node.hidden)) {
    if (!await common.isVisible()) await ctx.locator('#labPubertyRefineStage').click();
    const sex = await ctx.locator('#labPubertySex').inputValue();
    const axis = name === 'Kind' ? value : selectedAxes.get(ctx) || (sex === 'F' ? 'Th' : 'G');
    selectedAxes.set(ctx, axis);
    if (!['G', 'Th', 'P'].includes(axis)) throw new Error(`The shared editor does not offer ${axis}`);
    const stage = name === 'Stage' ? value : await ctx.locator('#labPubertyStage').inputValue();
    if (name === 'Stage' || /^[1-5]$/.test(stage)) {
      await common.locator(`.vpa-segments [data-puberty-axis="${axis}"][data-puberty-stage="${stage}"]`).click();
    }
    return;
  }
  return (await quickField(ctx, name)).selectOption(value);
};
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
