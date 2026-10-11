import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';
import assert from 'node:assert/strict';

// Real converter inputs and current-patient persistence drive the production
// renderer. The educational curve must never be rebuilt from the entered value.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const note = page => panel(page).locator('[data-lifespan="comparison-note"]');
const dot = (page, id) => panel(page).locator(`[data-patient-concentration="${id}"]`);

async function patient(page, age, months = 0) {
  await page.evaluate(({ age, months }) => {
    if (!window.VildaPersistence.writeShared({ sex: 'M', age, ageMonths: months }, { force: true }))
      throw new Error('Cannot seed fictional patient');
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { age, months });
}

async function choose(page, id) {
  await page.locator('#labSubstance').click();
  await page.locator('#labSubstance').fill(id.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${id}"]`).click();
  await page.locator('#labUnit').selectOption('IU/L');
  await expect(panel(page)).toBeVisible();
}

async function open(page, id, age = 44) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const key of ['vilda-reminders-shown-v1', 'vilda-reminders-closed-v1']) localStorage.setItem(key, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime && window.VildaHormoneLifespanDisplay?.buildMaleGonadotropins);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await patient(page, age);
  await choose(page, id);
}

async function geometry(page, id) {
  await expect(panel(page).locator(`[data-stable-reference-line="${id}"]`)).toHaveCount(1);
  return panel(page).evaluate((host, id) => {
    const line = host.querySelector(`[data-stable-reference-line="${id}"]`);
    return { path: line.getAttribute('d'), divisor: Number(line.dataset.divisor), ceiling: Number(line.dataset.ceiling),
      dash: getComputedStyle(line).strokeDasharray, viewBox: line.ownerSVGElement.getAttribute('viewBox') };
  }, id);
}

async function sameGeometry(page, id, original) {
  await expect.poll(() => geometry(page, id)).toEqual(original);
  await expect(panel(page).locator(`[data-reference-line="${id}"], [data-reference-background="${id}"]`)).toHaveCount(0);
}

async function heights(page, id, ages) {
  return panel(page).evaluate((host, { id, ages }) => {
    const line = host.querySelector(`[data-stable-reference-line="${id}"]`);
    const svg = line.ownerSVGElement;
    const mini = svg.querySelector('[data-sector="mini"]');
    const puberty = svg.querySelector('[data-sector="puberty"]');
    const stages = window.VildaHormoneLifespanData.maleStages;
    const segments = [];
    let previous;
    for (const match of line.getAttribute('d').matchAll(/([MC])([^MC]*)/g)) {
      const values = match[2].trim().split(/[\s,]+/).map(Number);
      if (match[1] === 'M') previous = values;
      else { segments.push([...previous, ...values]); previous = values.slice(4); }
    }
    const cubic = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
    return ages.map(age => {
      const index = stages.findIndex(stage => age >= stage.min && age <= stage.max);
      const stage = mini ? { min: 0, max: 1 } : puberty ? { min: 8, max: 20 } : stages[index];
      const rect = mini || puberty || svg.querySelector(`[data-sector="${index}"]`);
      const x = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) * (age - stage.min) / (stage.max - stage.min);
      const segment = segments.find(part => x <= part[6]) || segments.at(-1);
      let lo = 0, hi = 1;
      for (let iteration = 0; iteration < 26; iteration++) {
        const t = (lo + hi) / 2;
        if (cubic(segment[0], segment[2], segment[4], segment[6], t) < x) lo = t; else hi = t;
      }
      const y = cubic(segment[1], segment[3], segment[5], segment[7], (lo + hi) / 2);
      return (Number(line.dataset.plotBottom) - y) / (Number(line.dataset.plotBottom) - Number(line.dataset.plotTop));
    });
  }, { id, ages });
}

for (const width of [320, 1440]) {
  for (const [id, reference, divisor, tail] of [['lh', 3.91, 5.57, 89], ['fsh', 4.56, 8.4178, 80]]) {
    test(`${id} preserves one fixed curve and independent source point at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await open(page, id);
      await page.locator('#labValue').fill('');
      const original = await geometry(page, id);
      expect(original.divisor).toBe(divisor);
      expect(original.ceiling).toBe(1.25);
      expect(original.dash).toBe('none');
      assert.equal(original.path.match(/M/g)?.length, 1, 'one continuous illustrative path');
      assert.doesNotMatch(original.path, /NaN|Infinity/);
      await expect(panel(page).locator('.vhl-legend [aria-pressed="true"]')).toHaveCount(1);
      await expect(panel(page).locator(`[data-hormone="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(note(page)).toBeVisible();
      await expect(note(page)).toContainText('podobna wysokość linii nie oznacza takiego samego stężenia');
      await expect(panel(page).locator('[data-stage="0"]')).toHaveText('Płód · schemat');
      // Other background hormones can share the same tail age (INSL3 and
      // FSH both use 80); verify the gradient belonging to this hormone.
      await expect(panel(page).locator(`linearGradient[id$="${id}-illustrative-tail"][data-illustrative-tail-from="${tail}"]`)).toHaveCount(1);
      const sourceHeight = (await heights(page, id, [44]))[0];
      expect(Math.abs(sourceHeight - reference / divisor / 1.25)).toBeGreaterThan(.001);
      for (const value of [String(reference), '1', '100', '100000000', '', String(reference)]) {
        await page.locator('#labValue').fill(value);
        await sameGeometry(page, id, original);
        if (!value) { await expect(dot(page, id)).toHaveCount(0); continue; }
        await expect(dot(page, id)).toHaveAttribute('data-value', value);
        await expect(dot(page, id)).toHaveAttribute('data-reference-value', String(reference));
        await expect(dot(page, id)).toHaveAttribute('data-profile', `perheentupa2013-male-${id}-40-49`);
        await expect(dot(page, id)).toHaveAttribute('data-reference-statistic', 'group-median');
        await expect(panel(page).locator('[data-lifespan="source-copy"] p').filter({ hasText: 'Odniesienie dla tego wyniku:' })).toContainText('40–49 lat');
        const position = await dot(page, id).evaluate(group => ({
          divisor: Number(group.dataset.divisor), ceiling: Number(group.dataset.ceiling),
          bottom: Number(group.dataset.plotBottom), top: Number(group.dataset.plotTop),
          resultY: group.querySelector('[data-result-point]')?.getAttribute('cy'),
          sourceY: Number(group.querySelector('[data-median-point]').getAttribute('cy')),
          offscale: group.dataset.offscale,
        }));
        expect(position.divisor).toBe(divisor);
        expect(position.ceiling).toBe(1.25);
        expect((position.bottom - position.sourceY) / (position.bottom - position.top)).toBeCloseTo(reference / divisor / 1.25, 7);
        if (Number(value) > divisor * 1.25) {
          expect(position.offscale).toBe('above');
          expect(position.resultY).toBeUndefined();
          await expect(dot(page, id).locator('[data-result-overflow="above"]')).toHaveCount(1);
          await expect(dot(page, id).locator('[data-dot-label="result"]')).toContainText('↑');
        } else {
          expect(position.offscale).toBeUndefined();
          expect((position.bottom - Number(position.resultY)) / (position.bottom - position.top)).toBeCloseTo(Number(value) / divisor / 1.25, 7);
        }
      }
      const before = await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), value: document.querySelector('#labValue').value }));
      await panel(page).screenshot({ path: test.info().outputPath(`${id}-normal-${width}.png`) });
      const full = await heights(page, id, [.02, .08, .25, .5, 1, 6, 12, 14, 20, 25, 44, 60, 75, 80]);
      await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      await expect(page.locator('dialog [data-lifespan="comparison-note"]')).toBeVisible();
      const enlarged = await heights(page, id, [.02, .08, .25, .5, 1, 6, 12, 14, 20, 25, 44, 60, 75, 80]);
      enlarged.forEach((value, index) => expect(value).toBeCloseTo(full[index], 3));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${id}-fullscreen-${width}.png`) });
      await note(page).scrollIntoViewIfNeeded();
      await expect(note(page)).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath(`${id}-fullscreen-caption-${width}.png`) });
      await panel(page).getByRole('button', { name: 'Zamknij', exact: true }).click();
      await sameGeometry(page, id, original);
      expect(await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), value: document.querySelector('#labValue').value }))).toEqual(before);
      for (const [age, expected, profile, statistic] of [
        [22, 3, `laurentino2020-male-${id}-18-under25`, 'group-mean'],
        [60, id === 'lh' ? 4.73 : 5.92, `perheentupa2013-male-${id}-60-69`, 'group-median'],
        [75, id === 'lh' ? 4.44 : 7.8289, id === 'lh' ? 'yeap2007-male-lh-75-79' : 'ljubicic2020-male-fsh-75-80-approximate', id === 'lh' ? 'group-median' : 'median'],
        [90, null, null, null],
      ]) {
        await patient(page, age);
        await sameGeometry(page, id, original);
        if (expected === null) { await expect(dot(page, id)).toHaveCount(0); continue; }
        await expect(dot(page, id)).toHaveAttribute('data-profile', profile);
        await expect(dot(page, id)).toHaveAttribute('data-reference-statistic', statistic);
        await expect.poll(async () => Number(await dot(page, id).getAttribute('data-reference-value'))).toBeCloseTo(expected, 4);
        const currentSource = panel(page).locator('[data-lifespan="source-copy"] p').filter({ hasText: 'Odniesienie dla tego wyniku:' });
        await expect(currentSource).toHaveCount(1);
        await expect(currentSource).toContainText(age === 22 ? 'Laurentino' : age === 60 ? 'Perheentupa' : id === 'lh' ? 'Yeap' : 'Ljubicic');
        await expect(currentSource).toContainText(statistic === 'group-mean' ? 'średnia grupy' : statistic === 'group-median' ? 'mediana grupy' : 'mediana modelu');
        if (age === 60) await expect(currentSource).toContainText('60–69 lat');
        if (age === 22) await expect(dot(page, id).locator('[data-dot-label="median"]')).toContainText('Średnia grupy');
        if (age === 75 && id === 'fsh') await expect(dot(page, id).locator('[data-dot-label="median"]')).toHaveText('Mediana ≈7,8 IU/L');
      }
      await page.locator('#labValue').fill('');
      await sameGeometry(page, id, original);
      await expect(dot(page, id)).toHaveCount(0);
    });
  }
}

test('LH/FSH zoom and selection preserve the canonical curve and keep comparison explanations in scope', async ({ page }) => {
  await open(page, 'lh');
  for (const id of ['lh', 'fsh']) {
    await choose(page, id);
    await page.locator('#labValue').fill('4');
    const original = await geometry(page, id);
    const miniAges = [.02, .04, .1, .25, .5, .75, .98], pubertyAges = [8, 10, 12, 13, 14, 16, 18, 19.8];
    const mini = await heights(page, id, miniAges), puberty = await heights(page, id, pubertyAges);
    for (const [view, ages, expected] of [['mini', miniAges, mini], ['puberty', pubertyAges, puberty]]) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await expect(dot(page, id)).toHaveCount(0);
      const zoom = await geometry(page, id);
      expect(zoom.divisor).toBe(original.divisor);
      expect(zoom.ceiling).toBe(original.ceiling);
      (await heights(page, id, ages)).forEach((height, index) => expect(height).toBeCloseTo(expected[index], 3));
    }
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(note(page)).toBeHidden();
    // The 44-year-old is outside this puberty viewport; preserve the existing
    // no-matched-pair explanation, then check the ordinary empty comparison.
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('brak dopasowanych median obu płci');
    await page.locator('#labValue').fill('');
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('Każda płeć we własnej skali');
    await page.locator('#labValue').fill('4');
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(note(page)).toBeVisible();
    await panel(page).locator('[data-view="life"]').click();
    await sameGeometry(page, id, original);
    await panel(page).locator(`[data-hormone="${id}"]`).click();
    await expect(note(page)).toBeHidden();
    await expect(dot(page, id)).toHaveCount(0);
    await panel(page).locator('[data-hormone="amh"]').click();
    await expect(note(page)).toBeHidden();
    await panel(page).locator('[data-stage="0"]').click();
    // AMH now has its own source-informed fixed illustration too; selecting
    // it keeps prenatal provenance visible without showing the LH/FSH caption.
    await expect(panel(page).locator('[data-stage="0"]')).toHaveText('Płód · schemat');
    await expect(panel(page).locator('[data-stable-reference-line="amh"]')).toHaveAttribute('data-divisor', '1335.592934');
    await panel(page).locator(`[data-hormone="${id}"]`).click();
    await expect(note(page)).toBeVisible();
    await sameGeometry(page, id, original);
    const sources = await panel(page).locator('[data-lifespan="source-copy"]').textContent();
    expect(sources).toContain('Perheentupa');
    expect(sources).toContain('Tehrani');
    expect(sources).toContain('Linia AMH jest poglądową syntezą badań');
    expect(sources).toContain('Wang');
    await panel(page).locator('[data-hormone="amh"]').click();
  }
  await page.locator('#labSubstance').fill('Testosteron');
  await page.locator('#labSubstanceDropdown [data-id="testosterone_total"]').click();
  await expect(panel(page).locator('[data-stage="0"]')).toHaveText('Płód');
  await expect(note(page)).toBeHidden();
  await page.locator('#labSubstance').fill('AMH');
  await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
  await expect(panel(page).locator('[data-stage="0"]')).toHaveText('Płód · schemat');
  await page.evaluate(() => {
    window.VildaPersistence.writeShared({ sex: 'F', age: 12, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  });
  await expect(panel(page).locator('[data-stage="0"]')).not.toContainText('schemat');
  await expect(note(page)).toBeHidden();
  await expect(panel(page).locator('[data-stable-reference-line="amh"]')).toHaveCount(0);
});

test('known term birth and source qualification gate the infant LH/FSH point without changing the illustration', async ({ page }) => {
  await open(page, 'lh', 0);
  await patient(page, 0, 2);
  for (const id of ['lh', 'fsh']) {
    await choose(page, id);
    await page.locator('#labValue').fill('2');
    await quickSelect(page, 'Preterm', 'no');
    await closePatientEditor(page);
    const original = await geometry(page, id);
    await expect(dot(page, id)).toHaveAttribute('data-profile', `busch2022-male-${id}`);
    await quickSelect(page, 'Preterm', 'yes');
    await closePatientEditor(page);
    await expect(dot(page, id)).toHaveCount(0);
    await sameGeometry(page, id, original);
    await quickSelect(page, 'Preterm', 'no');
    await closePatientEditor(page);
    await expect(dot(page, id)).toHaveAttribute('data-profile', `busch2022-male-${id}`);
    await page.locator('#labValue').fill('<2');
    await expect(dot(page, id)).toHaveCount(0);
    await sameGeometry(page, id, original);
  }
});

test('FSH source joins retain a continuous tangent in the actual rendered SVG', async ({ page }) => {
  await open(page, 'fsh');
  const joins = await panel(page).evaluate(host => {
    const line = host.querySelector('[data-stable-reference-line="fsh"]');
    const segments = [];
    let previous;
    for (const match of line.getAttribute('d').matchAll(/([MC])([^MC]*)/g)) {
      const values = match[2].trim().split(/[\s,]+/).map(Number);
      if (match[1] === 'M') previous = values;
      else { segments.push([...previous, ...values]); previous = values.slice(4); }
    }
    return [12, 25, 80].map(age => {
      const stages = window.VildaHormoneLifespanData.maleStages;
      const index = stages.findIndex(stage => age >= stage.min && age <= stage.max);
      const stage = stages[index], rect = line.ownerSVGElement.querySelector(`[data-sector="${index}"]`);
      const x = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) * (age - stage.min) / (stage.max - stage.min);
      const beforeIndex = segments.findIndex(segment => Math.abs(segment[6] - x) < 1e-7);
      if (beforeIndex < 0 || !segments[beforeIndex + 1]) throw new Error(`Missing exact SVG join at ${age}`);
      const before = segments[beforeIndex], after = segments[beforeIndex + 1];
      // Endpoint derivatives come directly from adjacent SVG cubic handles.
      // Finite secants across a high-curvature join are not a C1 measurement.
      const incomingVector = [before[6] - before[4], before[7] - before[5]];
      const outgoingVector = [after[2] - after[0], after[3] - after[1]];
      return { age, gap: Math.hypot(before[6] - after[0], before[7] - after[1]),
        incomingVector, outgoingVector,
        incoming: incomingVector[1] / incomingVector[0],
        outgoing: outgoingVector[1] / outgoingVector[0] };
    });
  });
  for (const { age, gap, incoming, outgoing, incomingVector, outgoingVector } of joins) {
    assert.ok(gap < 1e-7, `continuous position at ${age}`);
    assert.ok(Number.isFinite(incoming) && Number.isFinite(outgoing), 'finite derivative');
    // segmentPath serializes each coordinate to four decimals. Subtracting two
    // rounded coordinates contributes at most 0.0001 px per handle component.
    // Check collinearity within that exact rounding budget; dividing short
    // handles into slopes would magnify quantization into an artificial kink.
    const [ix, iy] = incomingVector, [ox, oy] = outgoingVector, precision = .0001;
    const roundingBound = precision * (Math.abs(ix) + Math.abs(iy) + Math.abs(ox) + Math.abs(oy)) + 2 * precision ** 2;
    assert.ok(Math.abs(ix * oy - iy * ox) <= roundingBound,
      `continuous rendered tangent at ${age}: ${incoming} / ${outgoing}`);
    assert.ok(incoming <= .00001 && outgoing <= .00001, `no spurious dip at ${age}`);
    if (age === 25) assert.ok(incoming < -.001 && outgoing < -.001, 'no forced plateau at 25');
  }
});
