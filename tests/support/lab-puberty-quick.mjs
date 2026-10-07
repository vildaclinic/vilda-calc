import { expect } from './test-czas.mjs';

// Drive the production quick form. Optional controls are opened through their
// user-facing actions, never by unhiding DOM nodes or calling form internals.
const sections = {
  Sex: 'Patient', AgeYears: 'Patient', AgeMonths: 'Patient', BirthDate: 'Date', SampleDate: 'Date',
  Kind: 'Stage', Stage: 'Stage', ReportedRange: 'Range',
  CnsSymptoms: 'Extra', Regression: 'Extra', TesticularVolume: 'Extra', VolumeMethod: 'Extra', Preterm: 'Extra',
};

export async function quickField(ctx, name) {
  const input = ctx.locator(`#labPuberty${name}`);
  if (sections[name] && !await input.isVisible()) {
    const details = ctx.locator('#labPubertyDetails');
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
    await ctx.locator(`#labPubertyOpen${sections[name]}`).click();
  }
  const groups = input.locator('xpath=ancestor::details');
  for (let i = await groups.count() - 1; i >= 0; i -= 1) {
    const group = groups.nth(i);
    if (await group.getAttribute('open') === null) await group.locator(':scope > summary').click();
  }
  await expect(input).toBeVisible();
  return input;
}

export const quickSelect = async (ctx, name, value) => (await quickField(ctx, name)).selectOption(value);
export const quickFill = async (ctx, name, value) => (await quickField(ctx, name)).fill(value);

export async function configureProfile(ctx, analyte = 'lh') {
  const details = ctx.locator('#labPubertyMethodSettings');
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  await ctx.locator('#labPubertyConfiguredProfile').selectOption(`mayo-${analyte}-pediatric`);
  await ctx.locator('#labPubertySaveProfile').click();
  await expect(ctx.locator('#labPubertyMethodSummary')).toContainText(analyte === 'lh' ? 'AnshLite' : 'Roche');
}
