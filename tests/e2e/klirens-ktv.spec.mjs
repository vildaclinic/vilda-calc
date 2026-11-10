import { expect, test } from '../support/test-czas.mjs';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { applyU25, memory, saveVisible } from '../support/klirens-patient-record.mjs';
import { applySession, card, chooseVariant, collect, details, EMPTY, expectBlocked, expectResult,
  installFictionalPatient, openCalculator, readFrozen, restore, SERIES, variantButton } from '../support/klirens-ktv-browser.mjs';

test.use({ chwila: '2026-11-06T12:00:00Z', serviceWorkers: 'block', reducedMotion: 'reduce' });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const runtime = await page.evaluate(() => {
    const attempt = fn => { try { return fn(); } catch (error) { return { error: String(error), stack: error.stack }; } };
    return { active: window.ClcrUiWorkflow?.state?.activeFormulaId,
      input: attempt(() => window.VildaClcrKtv.readInputFromDocument(document)),
      outcome: attempt(() => window.evaluateClcrKtv()),
      readiness: attempt(() => window.ClcrUiWorkflow.getFormulaReadiness('KTV')),
      search: { query: document.getElementById('formulaSearch')?.value,
        expanded: document.getElementById('formulaSearch')?.getAttribute('aria-expanded'),
        activeElement: document.activeElement?.id, liveHidden: document.getElementById('formulaLive')?.hidden,
        reason: window.ClcrUiWorkflow?.state?.search?.reason,
        guidanceTarget: window.ClcrUiWorkflow?.state?.selectionGuidance?.lastTarget },
      resultHTML: document.getElementById('clcrResultReport')?.innerHTML,
      nodes: ['ktvResult', 'ektvResult', 'urrResult'].map(id => { const n = document.getElementById(id); return { id, exists: Boolean(n), visible: n?.checkVisibility(), parent: n?.parentElement?.id, className: n?.className, html: n?.innerHTML }; }),
    };
  }).catch(error => ({ diagnosticError: String(error) }));
  await info.attach('ktv-production-runtime', { body: JSON.stringify(runtime, null, 2), contentType: 'application/json' });
});

async function geometry(scope, width) {
  await czekajNaUstabilizowanyUklad(scope);
  const value = await scope.evaluate(() => {
    const box = node => { const b = node.getBoundingClientRect(); return { x: b.x, right: b.right, width: b.width, top: b.top + scrollY, bottom: b.bottom + scrollY, height: b.height }; };
    const get = selector => box(document.querySelector(selector));
    const inputs = [...document.querySelectorAll('#ktvInputCard input,#ktvInputCard select')].filter(n => n.checkVisibility({ checkOpacity: true }));
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: get('#clcrForm'), active: get('#clcrActivePanel'), inputCard: get('#ktvInputCard'), clear: get('#clearBtn'), report: get('#clcrResultReport'),
      inputs: inputs.map(n => { const label = n.labels?.[0] || n.closest('label'); return { id: n.id, ...box(n), font: parseFloat(getComputedStyle(n).fontSize), label: label?.innerText, labelVisible: label?.checkVisibility({ checkOpacity: true }) }; }),
      tabs: [...document.querySelectorAll('button[data-clcr-ktv-variant]')].map(box),
      save: ['#clcrVisitDate', '#clcrVisitSaveBtn'].map(selector => { const n = document.querySelector(selector); return n.checkVisibility() ? box(n) : null; }),
    };
  });
  expect(value.overflow).toBeLessThanOrEqual(1);
  for (const field of value.inputs) {
    expect(field.height, field.id).toBeGreaterThanOrEqual(48); expect(field.font, field.id).toBeGreaterThanOrEqual(16);
    expect(field.labelVisible, field.id).toBe(true); expect(field.label, field.id).toBeTruthy();
    expect(field.x, field.id).toBeGreaterThanOrEqual(0); expect(field.right, field.id).toBeLessThanOrEqual(width + 1);
  }
  expect(value.tabs).toHaveLength(3);
  expect(Math.max(...value.tabs.map(n => n.width)) - Math.min(...value.tabs.map(n => n.width))).toBeLessThanOrEqual(1);
  expect(Math.max(...value.tabs.map(n => n.height)) - Math.min(...value.tabs.map(n => n.height))).toBeLessThanOrEqual(1);
  expect(Math.abs(value.inputCard.width - value.form.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(value.inputCard.width - value.clear.width)).toBeLessThanOrEqual(1);
  if (width < 980) expect(value.report.top - value.clear.bottom).toBeGreaterThanOrEqual(20);
  else {
    expect(Math.abs(value.report.top - value.active.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(value.report.width - value.active.width)).toBeLessThanOrEqual(1);
  }
  expect(Boolean(value.save[0])).toBe(Boolean(value.save[1]));
  if (value.save.every(Boolean)) {
    expect(Math.abs(value.save[0].x - value.save[1].x)).toBeLessThanOrEqual(1);
    expect(Math.abs(value.save[0].width - value.save[1].width)).toBeLessThanOrEqual(1);
  }
  return value;
}

function sameWidths(before, after) {
  for (const key of ['form', 'inputCard', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

for (const width of [1440, 390, 320]) {
  test(`Kt/V: 7/8/2 rzeczywistych pól, jeden wynik i stała geometria ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await openCalculator(page, width); await restore(page, EMPTY);
    await expect(page.locator('#ktvRequiredCount')).toHaveText('0/7'); await expectBlocked(page);
    const empty = await geometry(page, width); expect(empty.inputs).toHaveLength(7);
    for (const id of ['age', 'ageMonths', 'sex', 'height', 'weight', 'ktvToggle', 'ktvModality', 'ktvUreaAnalyte', 'ktvUreaUnit',
      'ktvPostMethod', 'ktvSameSession', 'ktvPreBeforeDialysis', 'ktvPreNoDilution', 'ktvKru', 'ktvKruMeasuredAt', 'ktvTreatmentsDelivered']) await expect(page.locator('#' + id)).toBeHidden();
    // Actual user interactions, rather than assigning values to a mock model.
    for (const [id, value] of [['UreaPre', '20'], ['UreaPost', '6'], ['ktvDurationMinutes', '240'], ['ktvUF', '2'], ['ktvW', '70']]) await page.locator('#' + id).fill(value);
    await page.locator('#ktvSessionsPerWeek').selectOption('3'); await page.locator('#ktvPidiDays').selectOption('2');
    await expectResult(page); await expect(page.locator('#ktvRequiredCount')).toHaveText('7/7');
    await expect(card(page)).toContainText('spKt/V'); await expect(card(page)).toContainText('1,4');
    await expect(card(page)).not.toContainText(/Norma dla wieku|Do pełnej interpretacji|Pełna interpretacja jest ograniczona|Kru/);
    const colors = await card(page).evaluate(n => ({ value: getComputedStyle(n.querySelector('.clcr-result-value')).color,
      reference: getComputedStyle(n.querySelector('.ktv-reference-value')).color }));
    sameWidths(empty, await geometry(page, width));
    await chooseVariant(page, 'ektv'); await expectBlocked(page); await expect(page.locator('#ktvRequiredCount')).toHaveText('7/8');
    await page.locator('#ktvAccessType').selectOption('AVF'); await expectResult(page, { variant: 'ektv', raw: 1.2227380474970133 });
    await expect(page.locator('#ktvRequiredCount')).toHaveText('8/8'); expect((await geometry(page, width)).inputs).toHaveLength(8);
    sameWidths(empty, await geometry(page, width));
    await chooseVariant(page, 'urr'); await expectResult(page, { variant: 'urr', raw: 70 });
    await expect(page.locator('#ktvRequiredCount')).toHaveText('2/2'); expect((await geometry(page, width)).inputs).toHaveLength(2);
    sameWidths(empty, await geometry(page, width));
    await chooseVariant(page, 'spktv'); await page.locator('#UreaPost').fill('9');
    await expectResult(page, { raw: 0.941559560743095, status: 'below-minimum', tone: 'danger' });
    const red = await card(page).evaluate(n => ({ value: getComputedStyle(n.querySelector('.clcr-result-value')).color,
      reference: getComputedStyle(n.querySelector('.ktv-reference-value')).color }));
    expect(red.value).not.toBe(colors.value); expect(red.reference).toBe(colors.reference); expect(red.value).not.toBe(red.reference);
    await kliknij(details(page).locator(':scope > summary')); await expect(details(page)).toContainText('Daugirdas');
    sameWidths(empty, await geometry(page, width));
    const png = testInfo.outputPath(`ktv-red-${width}.png`); await page.locator('#clcrWorkspace').screenshot({ path: png });
    await testInfo.attach(`ktv-red-${width}`, { path: png, contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn')); await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expectBlocked(page); await expect(page.locator('#ktvRequiredCount')).toHaveText('0/7');
    await expect(page.locator('#ktvSessionsPerWeek')).toHaveValue(''); await expect(page.locator('#ktvPidiDays')).toHaveValue('');
    sameWidths(empty, await geometry(page, width)); expect(errors).toEqual([]);
  });
}

test('Kt/V: źródłowy przykład, niezależne cele sp/e i pomocnicze URR', async ({ page }) => {
  await openCalculator(page); await restore(page);
  const sp = await expectResult(page); await expect(card(page)).toContainText(/1,4/);
  await chooseVariant(page, 'ektv'); const e = await expectResult(page, { variant: 'ektv', raw: 1.2227380474970133 });
  await expect(card(page)).toContainText(/1,2/); await expect(card(page)).not.toContainText(/1,4/);
  await kliknij(details(page).locator(':scope > summary')); await expect(details(page)).toContainText(/Tattersall|UKKA|Ashby/);
  await page.locator('#ktvAccessType').selectOption('CVC'); await expectResult(page, { variant: 'ektv', raw: 1.2834082559606057 });
  await chooseVariant(page, 'urr'); const urr = await expectResult(page, { variant: 'urr', raw: 70 });
  await expect(card(page)).toContainText('70'); await expect(card(page)).toContainText('65');
  expect(new Set([sp.reference, e.reference, urr.reference].map(value => JSON.stringify(value))).size).toBe(3);
  await chooseVariant(page, 'spktv'); await page.locator('#UreaPost').fill('6.7');
  await expectResult(page, { raw: null, status: 'below-target', tone: 'warning' });
  await expect(card(page)).toContainText('Minimum osiągnięte');
});

test('Kt/V: wiek kwalifikuje właściwy cel, ale nie blokuje niezależnego URR', async ({ page }) => {
  await openCalculator(page);
  for (const age of ['2', '17']) {
    await restore(page, { age }); const model = await expectResult(page);
    await expect(card(page)).toContainText('Minimum'); await expect(card(page).locator('.ktv-reference-value')).toHaveText('≥1,2');
    expect(model.reference.target).toBeNull();
    await chooseVariant(page, 'ektv'); await expectBlocked(page); await expect(page.locator('#clcrResultReport')).toContainText(/dziec/);
    await chooseVariant(page, 'urr'); await expectResult(page, { variant: 'urr', raw: 70, status: 'unassessed', tone: 'neutral', reference: false });
  }
  await restore(page, { age: '10', ktvPidiDays: '3' }); await expectResult(page, { raw: null, status: 'unassessed', tone: 'neutral', reference: false });
  await restore(page, { age: '18' }); await expectResult(page); await expect(card(page)).toContainText('1,4');
  await restore(page, { age: '', ageMonths: '' }); await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  await expect(card(page)).toContainText(/wiek/i); await chooseVariant(page, 'ektv');
  await expectResult(page, { variant: 'ektv', raw: 1.2227380474970133, status: 'unassessed', tone: 'neutral', reference: false });
  await expect(card(page)).toContainText(/dorosł/);
  await restore(page, { age: '1' }); await expectBlocked(page); await expect(page.locator('#clcrResultReport')).toContainText(/2.*lat|2.*roku/);
  await chooseVariant(page, 'ektv'); await expectBlocked(page);
  await chooseVariant(page, 'urr'); await expectResult(page, { variant: 'urr', raw: 70, status: 'unassessed', tone: 'neutral', reference: false });
});

test('URR: dwa stężenia wystarczają, nieprawidłowy opcjonalny czas nie tworzy celu', async ({ page }) => {
  await openCalculator(page); await restore(page, { ...EMPTY, ktvVariant: 'urr', UreaPre: '20', UreaPost: '6', age: '', ageMonths: '' });
  await expectResult(page, { variant: 'urr', raw: 70, status: 'unassessed', tone: 'neutral', reference: false });
  await expect(page.locator('#ktvRequiredCount')).toHaveText('2/2');
  // The existing saved context may include an irrelevant invalid Kru; it is not an input to the ratio.
  await restore(page, { ktvVariant: 'urr', ktvKru: '-1', ktvKruMeasuredAt: '2000-01-01', ktvTreatmentsDelivered: false });
  await expectResult(page, { variant: 'urr', raw: 70 });
  await kliknij(page.locator('#ktvUrrContext > summary'));
  for (const value of ['', '0', '300']) {
    await page.locator('#ktvUrrDurationMinutes').fill(value);
    await expectResult(page, { variant: 'urr', raw: 70, status: 'unassessed', tone: 'neutral', reference: false });
  }
  await page.locator('#ktvUrrDurationMinutes').fill('240'); await expectResult(page, { variant: 'urr', raw: 70 });
});

test('Kt/V: znane sprzeczności nie znikają po usunięciu pytań z formularza', async ({ page }) => {
  await openCalculator(page);
  const invalid = [
    { ui_ktvSameSession_answer: 'no', ktvSameSession: false },
    { ui_ktvPreBeforeDialysis_answer: 'no', ktvPreBeforeDialysis: false },
    { ktvPreUnit: 'mg/dL', ktvPostUnit: 'mmol/L' },
    { ktvPreAnalyte: 'BUN', ktvPostAnalyte: 'urea' },
    { ktvPostMethod: 'other' }, { ktvModality: 'PD' }, { ktvModality: 'CRRT' },
  ];
  for (const facts of invalid) {
    await restore(page, facts); await expectBlocked(page);
    await expect(page.locator('#UreaPre')).toHaveValue('20'); await expect(page.locator('#UreaPost')).toHaveValue('6');
    await chooseVariant(page, 'urr'); await expectBlocked(page);
    expect(await page.evaluate(() => window.evaluateClcrKtv().referenceActive)).toBe(false);
    await expect(page.locator('#clcrResultReport [data-clcr-series^="KTV_"]')).toHaveCount(0);
    await expect(page.locator('#clcrResultReport .ktv-reference-value:visible')).toHaveCount(0);
  }
  await restore(page, { ktvPostMethod: 'equilibrated_30_60min' }); await expectBlocked(page);
  await chooseVariant(page, 'ektv'); await expectBlocked(page);
  await chooseVariant(page, 'urr'); const urr = await expectResult(page, { variant: 'urr', raw: 70, status: 'unassessed', tone: 'neutral', reference: false });
  expect(urr.input.knownFacts.ktvPostMethod).toBe('equilibrated_30_60min');
  await kliknij(page.locator('#clearBtn')); await page.waitForFunction(() => window.clcrIsResetting !== true);
  await expect(page.locator('#ktvVariant')).toHaveValue('urr'); await expectBlocked(page);
  await page.locator('#UreaPre').fill('20'); await page.locator('#UreaPost').fill('6');
  const fresh = await expectResult(page, { variant: 'urr', raw: 70, status: 'unassessed', tone: 'neutral', reference: false });
  expect(fresh.input.knownFacts.ktvPostMethod).toBeUndefined();
});

test('Kt/V: guardy stosowalności nie usuwają poprawnie obliczalnego URR', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ UreaPost: '2' }, { UreaPost: '3', ktvDurationMinutes: '480' },
    { ktvDurationMinutes: '360', ktvSessionsPerWeek: '5', ktvPidiDays: '1' }]) {
    await restore(page, fields); await expectBlocked(page); await chooseVariant(page, 'ektv'); await expectBlocked(page);
    await chooseVariant(page, 'urr'); await expectResult(page, { variant: 'urr', raw: fields.UreaPost === '2' ? 90 : fields.UreaPost === '3' ? 85 : 70,
      status: fields.UreaPost === '2' ? 'within' : 'unassessed', tone: fields.UreaPost === '2' ? 'normal' : 'neutral', reference: fields.UreaPost === '2' });
  }
  await restore(page, { ktvSessionsPerWeek: '7', ktvPidiDays: '2' });
  await expectResult(page, { raw: null, status: 'unassessed', tone: 'neutral', reference: false });
});

test('Kt/V: raw poniżej progów nie zmienia się w granicę przy zapisie i odczycie', async ({ page }) => {
  await openCalculator(page); await installFictionalPatient(page);
  // Fixed synthetic boundary inputs from the accepted audit, not a copy of the production equation.
  const cases = [
    { variant: 'spktv', post: '7.15591984000858', raw: 1.19999, status: 'below-minimum', tone: 'danger', limit: 1.2 },
    { variant: 'spktv', post: '6.005557057916116', raw: 1.39999, status: 'below-target', tone: 'warning', limit: 1.4 },
    { variant: 'ektv', post: '6.137759516405619', raw: 1.19999, status: 'below-minimum', tone: 'danger', limit: 1.2 },
    { variant: 'urr', post: '7.000002', raw: 64.99999, status: 'below-minimum', tone: 'danger', limit: 65 },
    { variant: 'urr', post: '6.000002', raw: 69.99999, status: 'below-target', tone: 'warning', limit: 70 },
  ];
  for (const [index, item] of cases.entries()) {
    await restore(page, { ktvVariant: item.variant, UreaPost: item.post });
    await page.locator('#clcrVisitDate').fill(`2026-11-0${index + 1}`);
    const model = await expectResult(page, item);
    const visible = await card(page).locator('.clcr-result-value').innerText();
    const displayed = Number(visible.replace(/[<≈%\s]/g, '').replace(',', '.'));
    expect(displayed < item.limit || visible.includes('<'), visible).toBe(true);
    const [note] = await saveVisible(page, `2026-11-0${index + 1}`);
    expect(note.labResult.valueNum).toBe(model.rawValue); expect(note.labResult.valueNum).toBeLessThan(item.limit);
    expect(note.labResult.testKey).toBe(({ spktv: 'spktv', ektv: 'ektv', urr: 'urrwskaznikredukcjimocznika' })[item.variant]);
    const frozen = await readFrozen(page, note); expect(frozen.rawValue).toBe(model.rawValue); expect(frozen.outOfRange).toBe(true);
    const projected = await page.evaluate(value => window.ClcrSavedResults.projectPatientNotes([value]).measurements[0], note);
    expect(projected).toMatchObject({ parameterKey: `clcr:${SERIES[item.variant]}`, valueNum: model.rawValue, outOfRange: true });
  }
  const state = await memory(page); expect(state.notes).toHaveLength(5); expect(state.originalsLocked).toBe(true);
  const projectedWithoutRecalculation = await page.evaluate(notes => {
    const engine = window.VildaClcrKtv;
    window.VildaClcrKtv = new Proxy(engine, { get(target, key) { return key === 'evaluate' ? () => { throw new Error('Odczyt historii nie może przeliczać Kt/V'); } : target[key]; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; }
    finally { window.VildaClcrKtv = engine; }
  }, state.notes);
  expect(projectedWithoutRecalculation.map(point => point.valueNum)).toEqual(state.notes.map(note => note.labResult.valueNum));
  expect(projectedWithoutRecalculation.every(point => point.outOfRange === true)).toBe(true);
});

test('Kt/V: błędny wpis usuwa poprzedni wynik, a nowa sesja nie dziedziczy wariantu', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ UreaPre: '0' }, { UreaPost: '20' }, { UreaPost: '21' }, { ktvUF: '-1' }, { ktvW: '' }, { ktvDurationMinutes: '0' }]) {
    await restore(page); await expectResult(page); await restore(page, fields); await expectBlocked(page);
  }
  await restore(page, { ktvVariant: 'urr' }); await expectResult(page, { variant: 'urr', raw: 70 });
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'KTV', inputs: { currentVersion: 'pro', formulaPicker: 'KTV' } });
  await expectBlocked(page); await expect(page.locator('#ktvVariant')).toHaveValue('spktv');
  await expect(page.locator('#UreaPre')).toHaveValue(''); await expect(page.locator('#ktvSessionsPerWeek')).toHaveValue('');
});

test('Kt/V: rzeczywisty wybór formuły przewija i wskazuje brakujące pola bez pytań o wiek', async ({ page }) => {
  await openCalculator(page, 390); await restore(page, EMPTY);
  const previous = await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount);
  await page.locator('#formulaSearch').fill('hemodializ');
  await page.locator('.clcr-search-result[data-formula-id="KTV"]').click();
  await expect.poll(() => page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount)).toBe(previous + 1);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.lastTarget)).toBe('UreaPre');
  await expect(page.locator('#UreaPre')).toHaveClass(/clcr-missing-input/); await expect(page.locator('#age')).toBeHidden();
  await expect.poll(() => page.locator('#UreaPre').evaluate(n => { const b = n.getBoundingClientRect(); return b.top >= 40 && b.bottom <= innerHeight - 40; })).toBe(true);
  await page.locator('#UreaPre').focus(); await expect(page.locator('#UreaPre')).toBeFocused();
  await expect(variantButton(page, 'spktv')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page)).toHaveCount(0); expect(await collect(page)).toEqual([]);
});

test('Kt/V: fakty o HD i jego układ nie zmieniają źródeł pH ani CKiD U25', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { ktvModality: 'PD', pH24: '5.2', U_pH: '8.1', PH24_sampleType: '', PH24_preservative: '',
    PH24_infection: '', Cl24DurationHours: '', Cl24DurationSource: '', collectionStartAt: '', collectionEndAt: '' });
  await expectBlocked(page);
  const choose = async (id, query) => {
    await czekajNaUstabilizowanyUklad(page);
    await kliknij(page.locator('#formulaSearch'));
    await page.locator('#formulaSearch').fill(query);
    const option = page.locator(`.clcr-search-result[data-formula-id="${id}"]`);
    await expect(option).toBeVisible(); await kliknij(option);
    await page.waitForFunction(value => window.ClcrUiWorkflow.state.activeFormulaId === value && window.clcrIsResetting !== true, id);
    await czekajNaUstabilizowanyUklad(page);
  };
  await choose('pH24', 'pH dobowej');
  const dzmCard = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="pH24"]');
  await expect(dzmCard).toBeVisible();
  const dzm = await dzmCard.evaluate(n => JSON.parse(n.getAttribute('data-clcr-ph-dzm-snapshot')));
  expect(dzm.rawValue).toBe(5.2); expect(dzm.referenceActive).toBe(true); expect(dzm.policy.id).toContain('PH_DZM');
  await expect(page.locator('#ktvInputCard')).toBeHidden(); await expect(page.locator('#phDzmInputCard')).toBeVisible();
  await choose('pH_spot', 'pH moczu');
  const spotCard = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="pH_spot"]');
  await expect(spotCard).toBeVisible();
  const spot = await spotCard.evaluate(n => JSON.parse(n.getAttribute('data-clcr-ph-snapshot')));
  expect(spot.rawValue).toBe(8.1); expect(spot.policy.id).not.toBe(dzm.policy.id);
  await applyU25(page);
  const u25 = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="ckid_u25"]');
  const before = await u25.getAttribute('data-clcr-value'); expect(Number(before)).toBeGreaterThan(0);
  for (const id of ['age', 'sex', 'height', 'Scr']) await expect(page.locator('#' + id)).toBeVisible();
  await expect(page.locator('#ktvInputCard')).toBeHidden(); await expect(card(page)).toHaveCount(0);
  await choose('KTV', 'hemodializ'); await expectBlocked(page);
  await choose('ckid_u25', 'CKiD U25');
  await expect(u25).toHaveAttribute('data-clcr-value', before);
  await expect(page.locator('#U_pH')).toHaveValue('8.1'); await expect(page.locator('#pH24')).toHaveValue('5.2');
});
